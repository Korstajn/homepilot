import { NextResponse } from 'next/server';
import { getDefaultHousehold, ownerMember, createSession, track } from '@/lib/store';
import { SESSION_COOKIE, COOKIE_OPTS } from '@/lib/auth';

// "Try the demo" — open an opaque session for the demo household's owner member.
export async function POST() {
  const hh = getDefaultHousehold();
  const owner = ownerMember(hh.id)!;
  track('demo_started', hh.id, {});
  const res = NextResponse.json({ ok: true, member: { name: owner.name, role: owner.role } });
  res.cookies.set(SESSION_COOKIE, createSession(owner.id), COOKIE_OPTS);
  return res;
}
