import { NextResponse } from 'next/server';
import { listMembers, listChildren, inviteMember, findMemberByEmail, displayFor, track } from '@/lib/store';
import { resolveMember, can } from '@/lib/auth';
import type { MemberRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

// List the household's family: adults/teens (members) + children (profiles).
export async function GET() {
  const me = resolveMember();
  const members = listMembers(me.householdId).map((m) => ({
    id: m.id,
    name: m.name,
    email: displayFor(m).email ?? null,
    role: m.role,
    status: m.status,
    isYou: m.id === me.id,
    // Owner sees the pending invite link so it can be shared.
    inviteToken: can(me.role, 'manageMembers') && m.status === 'invited' ? m.inviteToken : undefined,
  }));
  return NextResponse.json({ members, children: listChildren(me.householdId), canManage: can(me.role, 'manageMembers') });
}

// Invite a co-parent (adult) or teen. Owner only.
export async function POST(req: Request) {
  const me = resolveMember();
  if (!can(me.role, 'manageMembers')) {
    return NextResponse.json({ error: 'Only the account owner can add family members.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim();
  const role: MemberRole = body.role === 'teen' ? 'teen' : 'adult';

  if (!name) return NextResponse.json({ error: 'Enter their name.' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  }
  if (findMemberByEmail(email)) {
    return NextResponse.json({ error: 'Someone with that email is already in a household.' }, { status: 409 });
  }

  const member = inviteMember(me.householdId, name, email, role);
  track('member_invited', me.householdId, { role });
  return NextResponse.json({ ok: true, member: { id: member.id, name, role: member.role }, inviteToken: member.inviteToken });
}
