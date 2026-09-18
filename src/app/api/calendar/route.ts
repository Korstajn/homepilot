import { NextResponse } from 'next/server';
import {
  addCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  calendarToken,
  householdCalendar,
  regenerateDigest,
  track,
} from '@/lib/store';
import { resolveHousehold, resolveMember, can } from '@/lib/auth';
import type { CalendarEvent } from '@/lib/types';
import { requireSession } from '@/lib/require-session';

export const dynamic = 'force-dynamic';

const CATEGORIES: CalendarEvent['category'][] = ['school', 'travel', 'bill', 'appointment', 'other'];

/**
 * Recurrence, validated rather than trusted.
 *
 * `rrule` was reserved in the model but never produced, which made weekly school
 * life (swimming every Tuesday, football every Wednesday) either thirty manual
 * rows or invisible. It goes straight into an ICS feed other people's calendar
 * clients parse, so it is accepted only in the shapes we can vouch for.
 */
const RRULE = /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;INTERVAL=\d{1,2})?(;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*)?(;COUNT=\d{1,3})?(;UNTIL=\d{8}T\d{6}Z)?$/;

function origin(req: Request): { https: string; host: string } {
  const h = req.headers;
  const host = h.get('x-forwarded-host') || h.get('host') || new URL(req.url).host;
  const proto = h.get('x-forwarded-proto') || 'https';
  return { https: `${proto}://${host}`, host };
}

export async function GET(req: Request) {
  const hh = await resolveHousehold();
  const finance = can((await resolveMember()).role, 'viewFinances');
  const events = await householdCalendar(hh.id, finance);
  const token = await calendarToken(hh.id);
  const { https, host } = origin(req);
  return NextResponse.json({
    events,
    canManage: can((await resolveMember()).role, 'manageCalendar'),
    subscribe: {
      https: `${https}/api/ics/${token}`,
      webcal: `webcal://${host}/api/ics/${token}`,
    },
  });
}

/** Read one event's fields out of a request body, or say what is wrong. */
function readEvent(body: Record<string, unknown>, timezone: string):
  | { ok: true; value: Omit<CalendarEvent, 'id' | 'createdAt' | 'source' | 'householdId'> }
  | { ok: false; error: string } {
  const summary = String(body.summary ?? '').trim();
  const start = String(body.start ?? '').trim();
  if (!summary || !start) return { ok: false, error: 'Add a title and a date.' };

  // A date alone is all-day; a date with a time is not. The previous form
  // hard-coded allDay, so a 15:00 pickup and a week-long holiday were the same
  // kind of thing.
  const allDay = body.allDay === true || (body.allDay !== false && !start.includes('T'));
  if (!allDay && !start.includes('T')) {
    return { ok: false, error: 'A timed event needs a time as well as a date.' };
  }

  const rrule = body.rrule ? String(body.rrule).trim().toUpperCase() : undefined;
  if (rrule && !RRULE.test(rrule)) {
    return { ok: false, error: 'That repeat rule is not one GiGi can publish.' };
  }

  const category = CATEGORIES.includes(body.category as CalendarEvent['category'])
    ? (body.category as CalendarEvent['category'])
    : 'other';

  const alarm = body.alarmMinutesBefore;
  const alarmMinutesBefore =
    typeof alarm === 'number' && alarm >= 0 && alarm <= 60 * 24 * 14
      ? Math.round(alarm)
      : allDay ? 24 * 60 : 60;

  return {
    ok: true,
    value: {
      summary,
      description: body.description ? String(body.description).slice(0, 500) : undefined,
      location: body.location ? String(body.location).slice(0, 200) : undefined,
      category,
      start,
      end: body.end ? String(body.end) : undefined,
      allDay,
      tzid: allDay ? undefined : timezone || 'Europe/London',
      rrule,
      relatedChildId: body.relatedChildId ? String(body.relatedChildId) : undefined,
      alarmMinutesBefore,
    },
  };
}

// Add a manual event. Any member of the household — the calendar is shared.
export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { household: hh, member: me } = auth.session;
  if (!can(me.role, 'manageCalendar')) {
    return NextResponse.json({ error: 'Your account cannot add events.' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // The one category that IS financial stays behind the finance capability.
  if (body.category === 'bill' && !can(me.role, 'viewFinances')) {
    return NextResponse.json({ error: 'Only a parent can add a bill event.' }, { status: 403 });
  }

  const parsed = readEvent(body, hh.timezone);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const created = await addCalendarEvent({ householdId: hh.id, ...parsed.value });
  // A new event is a new signal; the digest should know about it now rather
  // than at 02:00 tomorrow.
  await regenerateDigest(hh.id);
  await track('calendar_event_added', hh.id, { category: created.category, recurring: Boolean(created.rrule) });
  return NextResponse.json({ ok: true, event: created });
}

// Edit an existing manual event.
export async function PATCH(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { household: hh, member: me } = auth.session;
  if (!can(me.role, 'manageCalendar')) {
    return NextResponse.json({ error: 'Your account cannot edit events.' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'Which event?' }, { status: 400 });

  const parsed = readEvent(body, hh.timezone);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const updated = await updateCalendarEvent(hh.id, id, parsed.value);
  if (!updated) {
    // Derived events (a renewal, a passport) are not editable here: they are a
    // view of the bill or the child, and editing them would drift from it.
    return NextResponse.json({ error: 'That event cannot be edited here.' }, { status: 404 });
  }
  await regenerateDigest(hh.id);
  await track('calendar_event_edited', hh.id, { category: updated.category });
  return NextResponse.json({ ok: true, event: updated });
}

export async function DELETE(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { household: hh, member: me } = auth.session;
  if (!can(me.role, 'manageCalendar')) {
    return NextResponse.json({ error: 'Your account cannot remove events.' }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const ok = await deleteCalendarEvent(hh.id, id);
  if (ok) await regenerateDigest(hh.id);
  return NextResponse.json({ ok });
}
