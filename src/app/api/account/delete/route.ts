import { NextResponse } from 'next/server';
import { deleteHouseholdData, track } from '@/lib/store';
import { resolveHousehold } from '@/lib/auth';

// Right to erasure. Clears the household's content-bearing data and records the
// deletion in the trust log. In production this is confirmed by email within 30
// days; here it takes effect immediately.
export async function POST() {
  const hh = resolveHousehold();
  deleteHouseholdData(hh.id);
  track('data_deletion_executed', hh.id, {});
  return NextResponse.json({ ok: true });
}
