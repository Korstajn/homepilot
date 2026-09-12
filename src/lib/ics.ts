import type { CalendarEvent } from './types';

// Minimal, correct RFC 5545 serializer. All-day events use VALUE=DATE; timed
// events are emitted in UTC (…Z) so we don't have to ship VTIMEZONE blocks —
// universally parsed by Apple Calendar, Google Calendar and Outlook.

function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// Fold lines at 75 octets per spec (a courtesy; most clients tolerate long lines).
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let s = line;
  parts.push(s.slice(0, 75));
  s = s.slice(75);
  while (s.length > 74) { parts.push(' ' + s.slice(0, 74)); s = s.slice(74); }
  if (s.length) parts.push(' ' + s);
  return parts.join('\r\n');
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '');
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function utcStamp(iso: string): string {
  return stamp(new Date(iso));
}

/** How far the given zone is from UTC at that instant, in ms. */
function zoneOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // `hour` comes back as 24 at midnight under hour12:false in some runtimes.
  const hour = get('hour') % 24;
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asUTC - at.getTime();
}

/**
 * A wall-clock time in a named zone, as a real instant.
 *
 * Timed events are stored as a naive local string plus the household's IANA
 * zone. Handing that string to `new Date()` reads it in the SERVER's zone, so a
 * London 08:20 pickup published from a UTC box came out as 08:20Z — an hour
 * early all summer. A school run that lands in someone's phone at the wrong
 * time is worse than no calendar at all, so the offset is resolved properly,
 * twice, which is what makes it correct across a DST boundary too.
 */
function zonedToUTC(naiveISO: string, tz: string): Date {
  const guess = new Date(naiveISO.replace(/Z$/, '') + 'Z');
  if (Number.isNaN(guess.getTime())) return new Date(naiveISO);
  const first = new Date(guess.getTime() - zoneOffsetMs(guess, tz));
  return new Date(guess.getTime() - zoneOffsetMs(first, tz));
}

/** A timed event's instant: zone-aware when we know the zone, as written otherwise. */
function instant(iso: string, tzid?: string): Date {
  const hasExplicitZone = /Z$|[+-]\d{2}:?\d{2}$/.test(iso);
  if (hasExplicitZone || !tzid) return new Date(iso);
  try {
    return zonedToUTC(iso, tzid);
  } catch {
    return new Date(iso);
  }
}

function eventLines(e: CalendarEvent, domain: string): string[] {
  const lines: string[] = ['BEGIN:VEVENT'];
  lines.push(`UID:${e.id}@${domain}`);
  // DTSTAMP used to be "now", regenerated on every fetch — so each poll looked
  // like every event had just changed. It is a property of the EVENT, so it is
  // the event's own timestamp, and an unchanged feed now serialises identically
  // byte for byte (which is also what makes the ETag below meaningful).
  lines.push(`DTSTAMP:${utcStamp(e.createdAt)}`);
  if (e.updatedAt && e.updatedAt !== e.createdAt) {
    lines.push(`LAST-MODIFIED:${utcStamp(e.updatedAt)}`);
  }
  if (e.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.start)}`);
    // For all-day, DTEND is exclusive; default to next day if no end.
    const end = e.end ? dateOnly(e.end) : dateOnly(addDays(e.start, 1));
    lines.push(`DTEND;VALUE=DATE:${end}`);
  } else {
    const start = instant(e.start, e.tzid);
    // A zero-length event renders as a bare marker in most clients. An hour is
    // the honest default for "something is happening then".
    const end = e.end ? instant(e.end, e.tzid) : new Date(start.getTime() + 60 * 60 * 1000);
    lines.push(`DTSTART:${stamp(start)}`);
    lines.push(`DTEND:${stamp(end)}`);
  }
  if (e.rrule) lines.push(`RRULE:${e.rrule}`);
  lines.push(`SUMMARY:${esc(e.summary)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  lines.push(`CATEGORIES:${e.category.toUpperCase()}`);
  if (e.alarmMinutesBefore != null) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-PT${e.alarmMinutesBefore}M`, `DESCRIPTION:${esc(e.summary)}`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function toICS(events: CalendarEvent[], calName: string, domain = 'getgigiapp.com'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GiGi//Household Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`,
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  for (const e of events) lines.push(...eventLines(e, domain));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
