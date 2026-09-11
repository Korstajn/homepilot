import { NextResponse } from 'next/server';
import { rotateCalendarToken, track } from '@/lib/store';
import { resolveMember, can } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Revoke the current subscription link and mint a new one. Parents only.
export async function POST() {
  const me = resolveMember();
  if (!can(me.role, 'viewFinances')) {
    return NextResponse.json({ error: 'Only a parent can manage the calendar link.' }, { status: 403 });
  }
  const token = rotateCalendarToken(me.householdId);
  track('calendar_link_rotated', me.householdId, {});
  return NextResponse.json({ ok: true, token });
}
