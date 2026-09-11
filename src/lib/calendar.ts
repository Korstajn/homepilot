import type { CalendarEvent } from './types';
import { listBills, listChildren, listManualEvents } from './store';

// The GiGi calendar is the union of:
//  - manual events the user added
//  - derived events generated from other GiGi data (bill renewals, passport
//    expiries) — so the calendar stays in sync with the rest of the app
// Derived events use deterministic ids so re-generating them keeps a stable
// iCal UID (clients update in place rather than duplicating).
export function buildCalendar(householdId: string, includeFinance = true): CalendarEvent[] {
  const events: CalendarEvent[] = [...listManualEvents(householdId)];

  if (includeFinance) {
    for (const b of listBills(householdId)) {
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

  for (const c of listChildren(householdId)) {
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

  return events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

export function findCalendarEvent(householdId: string, id: string): CalendarEvent | undefined {
  return buildCalendar(householdId).find((e) => e.id === id);
}
