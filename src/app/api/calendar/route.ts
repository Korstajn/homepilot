import { NextResponse } from 'next/server';
import { addCalendarEvent, deleteCalendarEvent, calendarToken, track } from '@/lib/store';
import { buildCalendar } from '@/lib/calendar';
import { resolveHousehold, resolveMember, can } from '@/lib/auth';
import type { CalendarEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

function origin(req: Request): { https: string; host: string } {
  const h = req.headers;
  const host = h.get('x-forwarded-host') || h.get('host') || new URL(req.url).host;
  const proto = h.get('x-forwarded-proto') || 'https';
  return { https: `${proto}://${host}`, host };
}

export async function GET(req: Request) {
  const hh = resolveHousehold();
  const finance = can(resolveMember().role, 'viewFinances');
  const events = buildCalendar(hh.id, finance);
  const token = calendarToken(hh.id);
  const { https, host } = origin(req);
  return NextResponse.json({
    events,
    subscribe: {
      https: `${https}/api/ics/${token}`,
      webcal: `webcal://${host}/api/ics/${token}`,
    },
  });
}

// Add a manual event. Parents only.
export async function POST(req: Request) {
  const hh = resolveHousehold();
  if (!can(resolveMember().role, 'viewFinances')) {
    return NextResponse.json({ error: 'Only a parent can add events.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const summary = String(body.summary ?? '').trim();
  const start = String(body.start ?? '').trim();
  if (!summary || !start) return NextResponse.json({ error: 'Add a title and a date.' }, { status: 400 });

  const allDay = body.allDay !== false && !start.includes('T');
  const ev: Omit<CalendarEvent, 'id' | 'createdAt' | 'source'> = {
    householdId: hh.id,
    summary,
    category: ['school', 'travel', 'bill', 'appointment', 'other'].includes(body.category) ? body.category : 'other',
    start,
    end: body.end ? String(body.end) : undefined,
    allDay,
    tzid: allDay ? undefined : (hh.timezone || 'Europe/London'),
    alarmMinutesBefore: allDay ? 24 * 60 : 60,
  };
  const created = addCalendarEvent(ev);
  track('calendar_event_added', hh.id, { category: created.category });
  return NextResponse.json({ ok: true, event: created });
}

export async function DELETE(req: Request) {
  const hh = resolveHousehold();
  if (!can(resolveMember().role, 'viewFinances')) {
    return NextResponse.json({ error: 'Only a parent can remove events.' }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const ok = deleteCalendarEvent(hh.id, id);
  return NextResponse.json({ ok });
}
