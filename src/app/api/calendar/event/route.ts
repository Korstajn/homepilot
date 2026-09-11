import { findCalendarEvent } from '@/lib/calendar';
import { resolveHousehold, resolveMember, can } from '@/lib/auth';
import { toICS } from '@/lib/ics';

export const dynamic = 'force-dynamic';

// Single-event .ics download → "Add to my calendar". On a phone, opening the
// file prompts to add the event to the device calendar (which then syncs to the
// user's own accounts). This is the web-app form of the native device write;
// see docs/CALENDAR.md for the Expo Calendar (EventKit) implementation.
export async function GET(req: Request) {
  const hh = resolveHousehold();
  const finance = can(resolveMember().role, 'viewFinances');
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const ev = findCalendarEvent(hh.id, id);
  if (!ev || (!finance && ev.category === 'bill')) {
    return new Response('Not found', { status: 404 });
  }
  const ics = toICS([ev], 'GiGi');
  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="gigi-event.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}
