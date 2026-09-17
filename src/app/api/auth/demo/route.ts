import { NextResponse } from 'next/server';
import { getDefaultHousehold, ownerMember, track } from '@/lib/store';
import { newSessionToken, SESSION_COOKIE, COOKIE_OPTS } from '@/lib/auth';
import { guardNonPublic } from '@/lib/internal';

/**
 * "Try the demo" — open an opaque session for the demo household's owner member.
 *
 * Dev builds only. The demo household is seeded fixture data belonging to a
 * person who does not exist, and handing a visitor a session on it from the
 * public site would mean the product's front door opens onto someone else's
 * bills. There is no longer a link to this anywhere in the UI; it stays for
 * working on the build.
 */
export async function POST() {
  const denied = guardNonPublic();
  if (denied) return denied;

  const hh = getDefaultHousehold();
  const owner = ownerMember(hh.id)!;
  track('demo_started', hh.id, {});
  const res = NextResponse.json({ ok: true, member: { name: owner.name, role: owner.role } });
  res.cookies.set(SESSION_COOKIE, newSessionToken(owner.id), COOKIE_OPTS);
  return res;
}
