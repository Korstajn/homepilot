import { NextResponse } from 'next/server';
import { addChild, listChildren, removeChild, track } from '@/lib/store';
import { resolveMember, can } from '@/lib/auth';
import { requireSession } from '@/lib/require-session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const me = await resolveMember();
  return NextResponse.json({ children: await listChildren(me.householdId) });
}

// Add a child profile (no login). Adults/owner only.
export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const me = auth.session.member;
  if (!can(me.role, 'manageBills')) {
    return NextResponse.json({ error: 'Only a parent can add a child.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Enter the child’s name.' }, { status: 400 });
  const child = await addChild(me.householdId, {
    name,
    yearGroup: body.yearGroup ? String(body.yearGroup) : undefined,
    passportExpiry: body.passportExpiry ? String(body.passportExpiry) : undefined,
  });
  await track('child_added', me.householdId, {});
  return NextResponse.json({ ok: true, child });
}

export async function DELETE(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const me = auth.session.member;
  if (!can(me.role, 'manageBills')) {
    return NextResponse.json({ error: 'Only a parent can remove a child.' }, { status: 403 });
  }
  const childId = new URL(req.url).searchParams.get('id') ?? '';
  const ok = await removeChild(me.householdId, childId);
  if (!ok) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
