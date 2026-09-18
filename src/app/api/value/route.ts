import { NextResponse } from 'next/server';
import { valueSummary } from '@/lib/store';
import { resolveHousehold, resolveMember, can } from '@/lib/auth';

// Always reflect live store state, never a build-time snapshot.
export const dynamic = 'force-dynamic';

// Value tracker — running "GiGi has saved you X and handled Y tasks".
export async function GET() {
  if (!can((await resolveMember()).role, 'viewFinances')) {
    return NextResponse.json({ error: 'Not visible on this account.' }, { status: 403 });
  }
  const hh = await resolveHousehold();
  return NextResponse.json(await valueSummary(hh.id));
}
