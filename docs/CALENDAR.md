# Calendar & sync

The GiGi calendar is the union of manual events plus events **derived** from the
rest of the app (bill renewals, passport expiries) so it stays in sync with no
duplication. Events are modelled **iCalendar-compatible (RFC 5545)** so every
sync path is clean.

## How it syncs with "everything" (P0 — built)

A per-household **secret ICS subscription feed**: `/api/ics/<token>`.
- The token is an unguessable, revocable capability (rotate to revoke — old
  subscriptions stop updating). Keyed to the household; no cookies, so a phone's
  calendar client can fetch it.
- **iPhone / Apple Calendar:** open the `webcal://…` link (one tap).
- **Google / Outlook:** "Add calendar → From URL" with the `https://…` link.
- Read-only (GiGi → your calendar). Refresh hint: `X-PUBLISHED-TTL: PT1H`.

**Honesty:** subscribing means your calendar provider (Apple/Google) fetches the
feed, so the events reach that provider. This is stated on the screen, recorded
in the trust log (`calendar_shared`), and the provider is listed in the
subprocessor registry. Reset the link any time to revoke.

## Add a single event (P1 — web form, built)

Every event has **"+ Add to calendar"** → `/api/calendar/event?id=…` returns a
single-VEVENT `.ics` with `Content-Disposition: attachment`. On a phone, opening
it prompts to add the event to the device calendar (which then syncs to the
user's own accounts). This is the web-app form of the native device write.

## P1 native (real Expo app)

In the React Native app, use **`expo-calendar`** (EventKit / CalendarContract)
for one-tap "Add to my calendar" with `Calendar.createEventAsync(...)`, gated by
`Calendar.requestCalendarPermissionsAsync()` — approve-to-execute, no OAuth. The
event fields map 1:1 from `CalendarEvent`. Sketch:

```ts
const { status } = await Calendar.requestCalendarPermissionsAsync();
if (status === 'granted') {
  const cal = (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT))
    .find(c => c.allowsModifications);
  await Calendar.createEventAsync(cal.id, {
    title: ev.summary, startDate: new Date(ev.start), endDate: new Date(ev.end ?? ev.start),
    allDay: ev.allDay, timeZone: ev.tzid, notes: ev.description, location: ev.location,
    alarms: ev.alarmMinutesBefore != null ? [{ relativeOffset: -ev.alarmMinutesBefore }] : [],
  });
}
```

## P2 (two-way, later)

Reading the user's *existing* calendar, or writing back changes, needs either a
**CalDAV** server (RFC 4791, two-way, universal, heavy to run) or the **Google/
Microsoft Graph** APIs (two-way, but OAuth + app verification — the same cost and
traps as the Gmail critique, so deferred). The iCalendar-native model here makes
either a straightforward addition.

## Data model & pitfalls handled

`CalendarEvent` mirrors iCal: stable `id` (UID), `summary`, `start`/`end`,
`allDay`, `tzid`, optional `rrule` (recurrence, reserved), `alarmMinutesBefore`.
All-day events emit `VALUE=DATE`; timed events emit UTC (`…Z`) so no `VTIMEZONE`
block is needed and Apple/Google/Outlook all parse them. Deterministic UIDs for
derived events mean clients update in place rather than duplicating.
