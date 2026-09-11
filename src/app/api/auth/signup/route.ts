import { NextResponse } from 'next/server';
import { createHousehold, findIdentityByEmail, createSession, track } from '@/lib/store';
import { hashPassword, generateRecoveryCode, hashRecovery, SESSION_COOKIE, COOKIE_OPTS } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ownerName = String(body.name ?? '').trim();
  const emailRaw = String(body.email ?? '').trim();
  const email = emailRaw || undefined; // email is optional (anonymous-friendly)
  const password = String(body.password ?? '');

  if (!ownerName) return NextResponse.json({ error: 'Enter your first name.' }, { status: 400 });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
  }
  if (email && findIdentityByEmail(email)) {
    return NextResponse.json({ error: 'An account with that email already exists. Try logging in.' }, { status: 409 });
  }

  // Always mint a one-time recovery code (the only way back in for email-free
  // accounts). Stored as a hash; shown to the user exactly once.
  const recoveryCode = generateRecoveryCode();
  const { household, member } = createHousehold({
    ownerName,
    email,
    passwordHash: hashPassword(password),
    recoveryHash: hashRecovery(recoveryCode),
  });
  track('signup', household.id, { emailless: !email });

  const res = NextResponse.json({ ok: true, recoveryCode, household: { id: household.id, ownerName } });
  res.cookies.set(SESSION_COOKIE, createSession(member.id), COOKIE_OPTS);
  return res;
}
