import { NextResponse } from 'next/server';
import { resolveMember, resolveHousehold, currentMember, capabilitiesFor, sessionState } from '@/lib/auth';
import { getDefaultHousehold, displayFor } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const member = resolveMember();
  const hh = resolveHousehold();
  const sessionMember = currentMember();
  const display = displayFor(member);
  return NextResponse.json({
    loggedIn: sessionMember !== null,
    // 'stale' means a session cookie we signed no longer resolves to a member:
    // the account lived only in another serverless instance's memory. The UI
    // must say "log in again" rather than quietly showing the demo household's
    // data as if it were theirs. Goes away with the Postgres swap.
    session: sessionState(),
    isDemo: hh.id === getDefaultHousehold().id,
    household: { id: hh.id, ownerName: hh.ownerName },
    member: { name: display.name, role: member.role, email: display.email ?? null },
    capabilities: capabilitiesFor(member.role),
  });
}
