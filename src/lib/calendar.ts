import type { Bill, CalendarEvent, Child } from './types';

// The GiGi calendar is the union of:
//  - manual events the user added
//  - derived events generated from other GiGi data (bill renewals, passport
//    expiries) — so the calendar stays in sync with the rest of the app
//
// Derived events use deterministic ids so re-generating them keeps a stable
// iCal UID (clients update in place rather than duplicating).
//
// This module is deliberately PURE: it takes the rows and returns events,
// importing nothing from the store. That is what lets the store build a
// household's calendar (to feed the digest) without a circular import, and it
// makes the union testable without a database.

export interface CalendarInput {
  householdId: string;
  bills: Bill[];
  children: Child[];
  manualEvents: CalendarEvent[];
  /** Bill renewals are finance; a teen account must not see them. */
  includeFinance?: boolean;
  /**
   * How far back to keep showing things. A renewal that happened last month is
   * not "the week ahead" — the previous build returned every event ever, so
   * passed dates accumulated at the top of the screen forever.
   */
  pastDays?: number;
  /** How far ahead to look. The MVP's horizon is eight weeks. */
  futureDays?: number;
}

const DAY = 86_400_000;

function dayOffset(iso: string, now: Date): number {
  const target = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return Math.round((target.getTime() - today.getTime()) / DAY);
}

export function buildCalendar(input: CalendarInput, now: Date = new Date()): CalendarEvent[] {
  const {
    householdId,
    bills,
    children,
    manualEvents,
    includeFinance = true,
    pastDays = 7,
    futureDays = 365,
  } = input;

  const events: CalendarEvent[] = [...manualEvents];

  if (includeFinance) {
    for (const b of bills) {
      if (b.confirmed && b.renewalDate) {
        events.push({
          id: `bill-${b.id}`,
          householdId,
          summary: `${b.provider} renews`,
          description: `${b.type} contract renewal. GiGi will look for a better deal.`,
          category: 'bill',
          start: b.renewalDate,
          allDay: true,
          source: 'derived',
          alarmMinutesBefore: 24 * 60,
          createdAt: b.createdAt,
        });
      }
    }
  }

  for (const c of children) {
    if (c.passportExpiry) {
      events.push({
        id: `passport-${c.id}`,
        householdId,
        summary: `${c.name}'s passport expires`,
        description: 'Renew in good time before any trip.',
        category: 'travel',
        start: c.passportExpiry,
        allDay: true,
        source: 'derived',
        relatedChildId: c.id,
        createdAt: c.createdAt,
      });
    }
  }

  return events
    .filter((e) => {
      const offset = dayOffset(e.start, now);
      return offset >= -pastDays && offset <= futureDays;
    })
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

export function findCalendarEvent(input: CalendarInput, id: string): CalendarEvent | undefined {
  // Look across the whole range, not the display window: a link to a specific
  // event must keep working even once the event has scrolled out of view.
  return buildCalendar({ ...input, pastDays: 3650, futureDays: 3650 }).find((e) => e.id === id);
}

const DAY_NAMES: Record<string, string> = {
  MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun',
};

/** Turn an RRULE back into something a person would say. */
export function describeRrule(rrule: string): string {
  const freq = rrule.match(/FREQ=(\w+)/)?.[1] ?? '';
  const byDay = rrule.match(/BYDAY=([A-Z,]+)/)?.[1];
  const days = byDay?.split(',').map((d) => DAY_NAMES[d] ?? d).join(', ');
  if (freq === 'WEEKLY') return days ? `Every ${days}` : 'Every week';
  if (freq === 'DAILY') return 'Every day';
  if (freq === 'MONTHLY') return 'Every month';
  if (freq === 'YEARLY') return 'Every year';
  return 'Repeats';
}
