import { NextResponse } from 'next/server';
import { getMemberByInvite, activateMember, createSession, displayFor, track } from '@/lib/store';
import { hashPassword, generateRecoveryCode, hashRecovery, SESSION_COOKIE, COOKIE_OPTS } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Look up an invite (to show who invited them / their role) without accepting.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const m = getMemberByInvite(token);
  if (!m) return NextResponse.json({ valid: false }, { status: 404 });
  return NextResponse.json({ valid: true, name: m.name, role: m.role, email: displayFor(m).email });
}

// Accept an invite: set a password, activate, and open an opaque session.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? '');
  const name = String(body.name ?? '').trim();
  const password = String(body.password ?? '');

  const invite = getMemberByInvite(token);
  if (!invite) return NextResponse.json({ error: 'This invite is invalid or already used.' }, { status: 404 });
  if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });

  const recoveryCode = generateRecoveryCode();
  const member = activateMember(token, name, hashPassword(password), hashRecovery(recoveryCode));
  if (!member) return NextResponse.json({ error: 'Could not accept the invite.' }, { status: 400 });
  track('member_joined', member.householdId, { role: member.role });

  const res = NextResponse.json({ ok: true, recoveryCode, member: { name: member.name, role: member.role } });
  res.cookies.set(SESSION_COOKIE, createSession(member.id), COOKIE_OPTS);
  return res;
}
