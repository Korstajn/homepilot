import { NextResponse } from 'next/server';
import { createHousehold, findIdentityByEmail, track } from '@/lib/store';
import { hashPassword, generateRecoveryCode, hashRecovery, newSessionToken, SESSION_COOKIE, COOKIE_OPTS } from '@/lib/auth';
import { inviteMode, isValidInviteCode } from '@/lib/invite';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ownerName = String(body.name ?? '').trim();
  const emailRaw = String(body.email ?? '').trim();
  const email = emailRaw || undefined; // email is optional (anonymous-friendly)
  const password = String(body.password ?? '');
  const inviteCode = String(body.inviteCode ?? '');

  // The invite is checked BEFORE anything else, and deliberately so. The
  // validation below reports whether an email is already registered, which is
  // a fact about someone else's account; only a caller who has been invited
  // gets to learn it. Checking the invite first means an uninvited caller
  // cannot use this route to test addresses.
  const mode = inviteMode();
  if (mode === 'closed') {
    return NextResponse.json(
      { error: 'Sign-ups are closed right now. Join the waitlist and we’ll send you an invite.', code: 'signup_closed' },
      { status: 403 },
    );
  }
  if (mode === 'required') {
    if (!inviteCode.trim()) {
      return NextResponse.json(
        { error: 'Enter your invite code.', code: 'invite_required' },
        { status: 400 },
      );
    }
    if (!isValidInviteCode(inviteCode)) {
      return NextResponse.json(
        { error: 'That invite code isn’t valid. Check it against the one we emailed you.', code: 'invite_invalid' },
        { status: 403 },
      );
    }
  }

  if (!ownerName) return NextResponse.json({ error: 'Enter your first name.' }, { status: 400 });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
  }
  if (email && (await findIdentityByEmail(email))) {
    return NextResponse.json({ error: 'An account with that email already exists. Try logging in.' }, { status: 409 });
  }

  // Always mint a one-time recovery code (the only way back in for email-free
  // accounts). Stored as a hash; shown to the user exactly once.
  const recoveryCode = generateRecoveryCode();
  const { household, member } = await createHousehold({
    ownerName,
    email,
    passwordHash: hashPassword(password),
    recoveryHash: hashRecovery(recoveryCode),
  });
  // Whether an invite was required, never which code was used: the code is a
  // shared secret and the event log is not the place for it.
  await track('signup', household.id, { emailless: !email, invited: mode === 'required' });

  const res = NextResponse.json({ ok: true, recoveryCode, household: { id: household.id, ownerName } });
  res.cookies.set(SESSION_COOKIE, newSessionToken(member.id), COOKIE_OPTS);
  return res;
}
