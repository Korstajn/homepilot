import { NextResponse } from 'next/server';
import { resolveMember, resolveHousehold, currentMember, capabilitiesFor, sessionState } from '@/lib/auth';
import { getDefaultHousehold, displayFor } from '@/lib/store';
import { isPublicSite } from '@/lib/beta';

export const dynamic = 'force-dynamic';

export async function GET() {
  const member = await resolveMember();
  const hh = await resolveHousehold();
  const sessionMember = await currentMember();
  const display = await displayFor(member);
  return NextResponse.json({
    loggedIn: sessionMember !== null,
    // 'stale' means a session cookie we signed no longer resolves to a member —
    // the account was deleted, or the member was removed. The UI must say "log
    // in again" rather than quietly showing the demo household's data as if it
    // were theirs.
    session: await sessionState(),
    isDemo: hh.id === (await getDefaultHousehold()).id,
    household: { id: hh.id, ownerName: hh.ownerName },
    member: { name: display.name, role: member.role, email: display.email ?? null },
    capabilities: capabilitiesFor(member.role),
    // Whether this deployment is the public site. The app's internal affordances
    // — the founder metrics and eval links — are client-rendered, and
    // GIGI_SITE_ENV is a server-only variable they cannot read for themselves.
    publicSite: isPublicSite(),
  });
}
