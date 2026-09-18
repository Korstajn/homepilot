import { NextResponse } from 'next/server';
import { rotateCalendarToken, track } from '@/lib/store';
import { resolveMember, can } from '@/lib/auth';
import { requireSession } from '@/lib/require-session';

export const dynamic = 'force-dynamic';

// Revoke the current subscription link and mint a new one. Parents only.
export async function POST() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const me = auth.session.member;
  if (!can(me.role, 'viewFinances')) {
    return NextResponse.json({ error: 'Only a parent can manage the calendar link.' }, { status: 403 });
  }
  const token = await rotateCalendarToken(me.householdId);
  await track('calendar_link_rotated', me.householdId, {});
  return NextResponse.json({ ok: true, token });
}
