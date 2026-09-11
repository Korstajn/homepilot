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

function utcStamp(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function eventLines(e: CalendarEvent, domain: string): string[] {
  const lines: string[] = ['BEGIN:VEVENT'];
  lines.push(`UID:${e.id}@${domain}`);
  lines.push(`DTSTAMP:${utcStamp(new Date().toISOString())}`);
  if (e.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.start)}`);
    // For all-day, DTEND is exclusive; default to next day if no end.
    const end = e.end ? dateOnly(e.end) : dateOnly(addDays(e.start, 1));
    lines.push(`DTEND;VALUE=DATE:${end}`);
  } else {
    lines.push(`DTSTART:${utcStamp(e.start)}`);
    lines.push(`DTEND:${utcStamp(e.end ?? e.start)}`);
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
