import { NextResponse } from 'next/server';
import { removeMember, track } from '@/lib/store';
import { resolveMember, can } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Remove a family member. Owner only; the owner cannot be removed.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const me = resolveMember();
  if (!can(me.role, 'manageMembers')) {
    return NextResponse.json({ error: 'Only the account owner can remove family members.' }, { status: 403 });
  }
  const ok = removeMember(me.householdId, params.id);
  if (!ok) return NextResponse.json({ error: 'Could not remove that member.' }, { status: 400 });
  track('member_removed', me.householdId, {});
  return NextResponse.json({ ok: true });
}
