import { NextResponse } from 'next/server';
import { deleteHouseholdData, track } from '@/lib/store';
import { requireSession } from '@/lib/require-session';

// Right to erasure. Clears the household's content-bearing data and records the
// deletion in the trust log. In production this is confirmed by email within 30
// days; here it takes effect immediately.
export async function POST() {
  // Erasure is the most destructive thing this app can do, so it is the last
  // place a fallback to the demo household belongs: without a real session this
  // used to wipe the shared demo for everyone.
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const hh = auth.session.household;
  await deleteHouseholdData(hh.id);
  await track('data_deletion_executed', hh.id, {});
  return NextResponse.json({ ok: true });
}
