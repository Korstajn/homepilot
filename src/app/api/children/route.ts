import { NextResponse } from 'next/server';
import { addChild, listChildren, removeChild, track } from '@/lib/store';
import { resolveMember, can } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const me = resolveMember();
  return NextResponse.json({ children: listChildren(me.householdId) });
}

// Add a child profile (no login). Adults/owner only.
export async function POST(req: Request) {
  const me = resolveMember();
  if (!can(me.role, 'manageBills')) {
    return NextResponse.json({ error: 'Only a parent can add a child.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Enter the child’s name.' }, { status: 400 });
  const child = addChild(me.householdId, {
    name,
    yearGroup: body.yearGroup ? String(body.yearGroup) : undefined,
    passportExpiry: body.passportExpiry ? String(body.passportExpiry) : undefined,
  });
  track('child_added', me.householdId, {});
  return NextResponse.json({ ok: true, child });
}

export async function DELETE(req: Request) {
  const me = resolveMember();
  if (!can(me.role, 'manageBills')) {
    return NextResponse.json({ error: 'Only a parent can remove a child.' }, { status: 403 });
  }
  const childId = new URL(req.url).searchParams.get('id') ?? '';
  const ok = removeChild(me.householdId, childId);
  if (!ok) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
