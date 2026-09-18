import { NextResponse } from 'next/server';
import { logProcessing, track } from '@/lib/store';
import { resolveMember } from '@/lib/auth';
import { requireSession } from '@/lib/require-session';

export const dynamic = 'force-dynamic';

// Called when the user subscribes their external calendar. Subscribing means a
// third-party calendar service (e.g. Apple/Google) will fetch the feed, so the
// events leave to that provider — record it plainly in the trust log.
export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const me = auth.session.member;
  const provider = String((await req.json().catch(() => ({}))).provider ?? 'a calendar app');
  await logProcessing(
    me.householdId, 'calendar_shared', 'account', 'you',
    `You subscribed ${provider} to your GiGi calendar`,
    'Show GiGi’s events in your own calendar',
    'Consent — note: your calendar provider fetches these events',
    'Depends on your provider',
  );
  await track('calendar_subscribed', me.householdId, {});
  return NextResponse.json({ ok: true });
}
