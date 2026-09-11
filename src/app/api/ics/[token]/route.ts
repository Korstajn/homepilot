import { getHouseholdByCalendarToken } from '@/lib/store';
import { buildCalendar } from '@/lib/calendar';
import { toICS } from '@/lib/ics';

export const dynamic = 'force-dynamic';

// Public, read-only iCalendar feed. Auth is the unguessable token in the URL
// (a capability URL) — no cookies, so the user's calendar app (Apple/Google/
// Outlook) can subscribe. Revoke by rotating the token.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = params.token.replace(/\.ics$/, '');
  const hh = getHouseholdByCalendarToken(token);
  if (!hh) {
    return new Response('Not found', { status: 404 });
  }
  // Full calendar including finance — the token holder is the household.
  const ics = toICS(buildCalendar(hh.id, true), `${hh.ownerName ? hh.ownerName + '’s ' : ''}GiGi`);
  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
