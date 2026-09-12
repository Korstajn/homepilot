import { createHash } from 'crypto';
import { getHouseholdByCalendarToken, householdCalendar } from '@/lib/store';
import { toICS } from '@/lib/ics';

export const dynamic = 'force-dynamic';

// Public, read-only iCalendar feed. Auth is the unguessable token in the URL
// (a capability URL) — no cookies, so the user's calendar app (Apple/Google/
// Outlook) can subscribe. Revoke by rotating the token.
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const token = params.token.replace(/\.ics$/, '');
  const hh = getHouseholdByCalendarToken(token);
  if (!hh) {
    return new Response('Not found', { status: 404 });
  }
  // Full calendar including finance — the token holder is the household.
  const ics = toICS(householdCalendar(hh.id, true), `${hh.ownerName ? hh.ownerName + '’s ' : ''}GiGi`);

  // Calendar clients poll this URL on their own schedule, forever. With stable
  // DTSTAMPs the body is byte-identical between polls when nothing changed, so
  // an ETag turns almost every one of those into a 304 — and a subscriber that
  // gets a 304 leaves the user's existing events alone instead of rewriting
  // them. `no-cache` (revalidate every time) rather than `no-store`, because
  // no-store forbids the conditional request that makes this work.
  const etag = `"${createHash('sha256').update(ics).digest('base64url').slice(0, 27)}"`;
  const headers = {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': 'private, no-cache',
    ETag: etag,
  };

  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(ics, { status: 200, headers });
}
