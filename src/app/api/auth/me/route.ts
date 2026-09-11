import { NextResponse } from 'next/server';
import { resolveMember, resolveHousehold, currentMember, capabilitiesFor } from '@/lib/auth';
import { getDefaultHousehold, displayFor } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const member = resolveMember();
  const hh = resolveHousehold();
  const sessionMember = currentMember();
  const display = displayFor(member);
  return NextResponse.json({
    loggedIn: sessionMember !== null,
    isDemo: hh.id === getDefaultHousehold().id,
    household: { id: hh.id, ownerName: hh.ownerName },
    member: { name: display.name, role: member.role, email: display.email ?? null },
    capabilities: capabilitiesFor(member.role),
  });
}
