import { NextResponse } from 'next/server';
import { findIdentityByEmail, findIdentityByRecoveryHash, memberForSubject, createSession, track } from '@/lib/store';
import { verifyPassword, hashRecovery, SESSION_COOKIE, COOKIE_OPTS } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim();
  const password = String(body.password ?? '');
  const recoveryCode = String(body.recoveryCode ?? '').trim();

  // Two ways in: email + password, or a one-time recovery code (email-free).
  let subjectId: string | undefined;
  if (recoveryCode) {
    const identity = findIdentityByRecoveryHash(hashRecovery(recoveryCode));
    if (identity) subjectId = identity.subjectId;
  } else {
    const identity = findIdentityByEmail(email);
    if (identity && verifyPassword(password, identity.passwordHash)) subjectId = identity.subjectId;
  }

  const member = subjectId ? memberForSubject(subjectId) : undefined;
  if (!member) {
    return NextResponse.json({ error: recoveryCode ? 'That recovery code is not valid.' : 'Wrong email or password.' }, { status: 401 });
  }

  track('login', member.householdId, { role: member.role, method: recoveryCode ? 'recovery' : 'password' });
  const res = NextResponse.json({ ok: true, member: { name: member.name, role: member.role } });
  res.cookies.set(SESSION_COOKIE, createSession(member.id), COOKIE_OPTS);
  return res;
}
