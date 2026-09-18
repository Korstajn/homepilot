// Bringing a household's Google calendar into GiGi.
//
// One direction, always: Google is the source of truth and GiGi keeps a
// read-only reflection. Nothing here can change what is in somebody's calendar,
// and nothing should ever be added that can — "keeping both sides in step" is
// how a sync deletes a dentist appointment because our copy was stale.
//
// WHY A WINDOW RECONCILE RATHER THAN INCREMENTAL SYNC TOKENS
// Google offers `syncToken`, which returns only what changed. It is cheaper,
// and it is a state machine: the token expires (410), a missed page silently
// skips a change, and a bug leaves a calendar permanently wrong with nothing to
// notice it. This asks for a window and makes the local copy match it. Every
// sync is a full repair of that window, so any drift — from a bug, a failed
// run, a clock skew — is gone on the next one. At a few hundred events per
// account that costs one request per calendar, which is the right price for a
// thing that cannot quietly rot.
//
// THE MAPPING IS WHERE THE BUGS LIVE
// All-day versus timed, an end date Google counts exclusively, an invitation
// somebody declined, an event with no title because the calendar is shared as
// busy-only. Each of those is a wrong row on a parent's screen, so each is
// handled explicitly below and covered by a test against a stub API.

import type { CalendarEvent, GoogleCalendar } from './types';
import { CalendarApiError, type CalendarApi, type GoogleEvent } from './google-calendar';
import {
  listGoogleCalendars,
  recordGoogleCalendarError,
  replaceGoogleEvents,
  syncGoogleCalendarList,
} from './store';

/**
 * How much of the calendar GiGi mirrors.
 *
 * Backwards far enough that "what was that appointment last week" still works,
 * forwards far enough to cover the school year's fixed dates. Not unbounded:
 * every day of window is rows stored and events fetched, and nothing in the
 * product looks more than a few months ahead.
 */
export const SYNC_PAST_DAYS = 14;
export const SYNC_FUTURE_DAYS = 180;

/** A calendar shared as busy-only has no title. Saying so beats an empty row. */
const UNTITLED = '(Busy)';
const MAX_SUMMARY = 200;
const MAX_DESCRIPTION = 500;
const MAX_LOCATION = 200;

export interface SyncResult {
  calendars: number;
  imported: number;
  removed: number;
  /** Per-calendar failures, named. One bad calendar must not abandon the rest. */
  errors: Array<{ calendarId: string; summary: string; message: string }>;
  /** True when Google refused for a reason only reconnecting fixes. */
  needsReconnect: boolean;
}

export function syncWindow(now: Date = new Date()): { from: string; to: string } {
  const from = new Date(now.getTime() - SYNC_PAST_DAYS * 86_400_000);
  const to = new Date(now.getTime() + SYNC_FUTURE_DAYS * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * Should this event exist in GiGi at all?
 *
 * Three noes, each of which would otherwise put something on a parent's screen
 * that is not theirs to do:
 *
 *   - CANCELLED. The reconcile removes it anyway by omission, but an explicitly
 *     cancelled occurrence can still arrive in a page; it is not a plan.
 *   - DECLINED. An invitation the household said no to is not on their plate,
 *     and showing it is the opposite of reducing what someone has to hold.
 *   - NO START. An event with neither a date nor a datetime cannot be placed.
 *     Null over guessing applies here exactly as it does to a bill.
 */
export function shouldImport(event: GoogleEvent): boolean {
  if (event.status === 'cancelled') return false;
  if (!event.start?.date && !event.start?.dateTime) return false;
  const self = event.attendees?.find((a) => a.self);
  if (self?.responseStatus === 'declined') return false;
  return true;
}

/**
 * One Google event, as a GiGi calendar row.
 *
 * `sourceRef` is what makes a sync idempotent: the same Google event maps to the
 * same row every time, so a second run updates rather than duplicates. It
 * carries the calendar id as well as the event id because the same event can be
 * on two calendars a household syncs, and they are two entries, not one.
 */
export function mapEvent(
  event: GoogleEvent,
  calendar: Pick<GoogleCalendar, 'calendarId' | 'category' | 'timeZone'>,
): Omit<CalendarEvent, 'id' | 'householdId' | 'createdAt' | 'source'> | null {
  if (!shouldImport(event)) return null;

  const allDay = Boolean(event.start?.date);
  const start = allDay ? event.start!.date! : event.start!.dateTime!;
  // Google's all-day `end.date` is EXCLUSIVE, and so is DTEND in the ICS feed
  // GiGi publishes (src/lib/ics.ts), so it copies across untouched. Converting
  // it to an inclusive date "to be helpful" is how a one-day event becomes two.
  const end = allDay ? event.end?.date : event.end?.dateTime;

  return {
    summary: (event.summary ?? '').trim().slice(0, MAX_SUMMARY) || UNTITLED,
    // Truncated rather than stored whole: a calendar description routinely
    // carries a conference bridge, a wall of boilerplate and someone's phone
    // number, none of which GiGi needs and all of which it would then hold.
    description: event.description?.trim().slice(0, MAX_DESCRIPTION) || undefined,
    location: event.location?.trim().slice(0, MAX_LOCATION) || undefined,
    category: calendar.category,
    start,
    end: end || undefined,
    allDay,
    // A timed event's own zone wins over the calendar's; without one, a 9am
    // meeting renders at whatever the reader's clock says, which is the same
    // class of error as resolving a school date against the wrong day.
    tzid: allDay ? undefined : event.start?.timeZone || calendar.timeZone || undefined,
    sourceRef: `gcal:${calendar.calendarId}:${event.id}`,
  };
}

/**
 * Refresh the list of calendars the account has.
 *
 * Separate from syncing their contents because they are separate questions: one
 * asks what exists, the other reads it. The picker needs the first without
 * paying for the second.
 */
export async function refreshCalendarList(
  api: CalendarApi,
  householdId: string,
): Promise<GoogleCalendar[]> {
  const calendars = await api.listCalendars();
  return syncGoogleCalendarList(
    householdId,
    calendars.map((c) => ({
      calendarId: c.id,
      summary: c.summary || c.id,
      timeZone: c.timeZone,
      isPrimary: c.primary,
      backgroundColor: c.backgroundColor,
    })),
  );
}

/**
 * Read every selected calendar and make the window match.
 *
 * One calendar's failure is recorded against that calendar and the rest still
 * run: a household with a shared calendar that has been revoked should not lose
 * their own. An auth failure is different — it means the grant itself no longer
 * carries calendar access, so there is nothing to retry and the caller is told
 * to ask for a reconnect.
 */
export async function syncGoogleCalendars(
  api: CalendarApi,
  householdId: string,
  now: Date = new Date(),
): Promise<SyncResult> {
  const window = syncWindow(now);
  const all = await listGoogleCalendars(householdId);
  const selected = all.filter((c) => c.selected);

  const result: SyncResult = {
    calendars: selected.length,
    imported: 0,
    removed: 0,
    errors: [],
    needsReconnect: false,
  };

  for (const calendar of selected) {
    try {
      const events = await api.listEvents(calendar.calendarId, {
        timeMin: window.from,
        timeMax: window.to,
      });
      const mapped = events
        .map((e) => mapEvent(e, calendar))
        .filter((e): e is NonNullable<typeof e> => e !== null);
      // The same occurrence can appear twice in a paged response around a
      // recurrence boundary. The insert is an upsert so it would survive, but
      // deduping here keeps the reported count honest.
      const unique = new Map(mapped.map((e) => [e.sourceRef!, e]));

      const written = await replaceGoogleEvents(
        householdId,
        calendar.calendarId,
        window,
        [...unique.values()],
      );
      result.imported += written.imported;
      result.removed += written.removed;
    } catch (e) {
      const message =
        e instanceof CalendarApiError ? e.message : String((e as Error)?.message ?? e).slice(0, 200);
      if (e instanceof CalendarApiError && e.kind === 'auth') result.needsReconnect = true;
      result.errors.push({ calendarId: calendar.calendarId, summary: calendar.summary, message });
      await recordGoogleCalendarError(householdId, calendar.calendarId, message);
    }
  }

  return result;
}

/**
 * Is a sync worth running right now?
 *
 * The calendar page asks on load, which is the moment a household actually
 * cares whether it is current — but "on load" cannot mean "on every load", or
 * opening the app four times before breakfast is four round trips to Google and
 * four rounds of writes for a calendar that has not changed.
 */
export const SYNC_STALE_AFTER_MS = 30 * 60 * 1000;

export function isStale(calendars: GoogleCalendar[], now: Date = new Date()): boolean {
  const selected = calendars.filter((c) => c.selected);
  if (selected.length === 0) return false;
  return selected.some(
    (c) => !c.lastSyncedAt || now.getTime() - Date.parse(c.lastSyncedAt) > SYNC_STALE_AFTER_MS,
  );
}
