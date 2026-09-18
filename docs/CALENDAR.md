# Calendar & sync

The GiGi calendar is the union of manual events plus events **derived** from the
rest of the app (bill renewals, passport expiries) so it stays in sync with no
duplication. Events are modelled **iCalendar-compatible (RFC 5545)** so every
sync path is clean.

## The calendar is a signal source, not a screen (P0 — built)

`buildDigest` takes the household's events and children alongside its bills, so
the calendar feeds the 07:00 digest. Until it did, the `school` and `travel`
categories in the digest contract had no code path that could produce them and
vertical 3 did not exist. The rules are **lead times**, not reminders — the point
is to surface a thing while there is still time to act on it:

| Signal | Lead time | Becomes |
| --- | --- | --- |
| A trip, against each child's passport expiry | 90 days | `travel` — renew before the trip |
| An evening event with children in the house | 7 days | `home` — arrange cover |
| Anything else on the calendar | 2 days | its own category |
| A passport expiring with no trip booked | 120 days | `travel` |

Adding or editing an event regenerates the digest immediately rather than
waiting for the nightly run, so the screen and the digest never disagree.

## School email into the calendar (P0 — built)

`/app/kids` → **Find school dates in an email** runs the school extractor
(`src/lib/school.ts`) over either a pasted email or the connected Gmail, and
shows its working before it writes anything:

- what it read, and whether the AI or the server read it
- which child it matched, and how many lines about other families' children it
  ignored
- every date it would create, the reason, and the exact sentence behind it
- what it found but could not place, rather than dropping it silently

The household ticks what is right; only then are events created. Re-scanning the
same message creates nothing twice — each event records the message it came from
(`sourceRef`).

The paste path exists so this is testable with no OAuth, no verification and no
waiting: the same pipeline, a different way in.

## What the model holds

Events carry a time (not only a date), an optional `rrule` for the recurring
shape of school life, a link to a child, a location, and an `updatedAt`. The
add-event form can express all of it, and events can be edited rather than only
added and deleted. Recurrence is accepted **only** in shapes the feed can vouch
for — it is published to other people's calendar clients, so it is validated
against an allow-list rather than passed through.

Any household member can manage the calendar (`manageCalendar`), including a
teen. Only the `bill` category stays behind the finance capability. Gating the
whole calendar on `viewFinances`, as it was, meant a teen could not put their
own football practice into the household calendar at all.

The display window is bounded — a week back, a year forward — so a renewal that
happened last month stops sitting at the top of "the week ahead" forever.

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

### Feed hygiene

- **`DTSTAMP` is the event's own timestamp**, not "now". It used to be
  regenerated on every fetch, so each poll looked to a subscriber like every
  event had just changed. An unchanged feed now serialises byte for byte
  identically between polls, and `LAST-MODIFIED` marks a real edit.
- **`ETag` + `304`.** Because the body is stable, a conditional request turns
  almost every poll into an empty 304, and a subscriber that gets one leaves the
  user's existing events alone instead of rewriting them. `Cache-Control` is
  `private, no-cache` — `no-store` would forbid the conditional request that
  makes this work.
- **Timed events resolve through the household's zone.** A naive local string
  plus an IANA zone handed to `new Date()` is read in the SERVER's zone, so a
  London 08:20 pickup published from a UTC box came out an hour early all
  summer. The offset is resolved against the zone, twice, so it is right across
  a DST boundary. An event with no end gets an hour rather than zero length.

## Google Calendar → GiGi (P1 — built)

The ICS feed above sends GiGi's events OUT. This brings a household's own
calendar IN, which is the other half of "everything in one place".

**One direction, always.** Google is the source of truth and GiGi holds a
read-only reflection. There is no write path in `src/lib/google-calendar.ts` and
none may be added: a sync that "keeps both sides in step" is a sync that can
delete somebody's dentist appointment because our copy was stale.

- **Its own permissions.** `gmail.readonly` does not grant calendar access; see
  `docs/GMAIL_OAUTH.md` for the two scopes and for how an older connection is
  detected and offered a reconnect.
- **Nothing until it is ticked.** A Google account carries holidays, birthdays
  and whatever anyone has ever shared with it. Calendars arrive listed and
  unselected, and the household says what each one IS — school, travel,
  appointment, other — because the digest ranks by category and GiGi does not
  guess that a calendar called "Skola" is the school one.
- **Window reconcile, not sync tokens** (`src/lib/calendar-sync.ts`). Each run
  fetches −14/+180 days with `singleEvents=true` (recurrences expanded, because
  nothing downstream expands an RRULE) and makes the local window match. Drift
  from a bug or a failed run is repaired by the next sync rather than persisting
  invisibly. Sync tokens are cheaper and are a state machine that can go quietly
  wrong; this cannot.
- **Deletion is scoped to the calendar AND the window.** An event outside it was
  simply not in this response, and reading that as "Google no longer has this"
  is how a trip booked for next year vanishes.
- **What never arrives:** a cancelled occurrence, an invitation this household
  declined, an event with no start at all. Each would put something on a
  parent's screen that is not theirs to do.
- **Imported rows are not editable**, enforced in the store (`source = 'manual'`
  in the update and delete clauses) as well as the UI. An edit would be
  overwritten on the next sync; a delete would reappear.
- **Untick a calendar and its events are deleted**, not hidden. "Stop syncing
  this" means the contents leave our database.
- **When it runs:** on opening the calendar screen if the copy is older than 30
  minutes, and on "Sync now". Not in the background — the refresh token lives in
  an encrypted cookie in the user's browser, not on our server, so the 02:00
  digest uses whatever the last visit brought in. Changing that means holding a
  live credential per household in the database.

`scripts/test-calendar-sync.mjs` drives all of the above against a stub Google
and a real Postgres (`npm run test:calendar-sync`).

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
