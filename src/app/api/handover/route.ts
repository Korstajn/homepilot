import { NextResponse } from 'next/server';
import { getHandover, setHandover, track } from '@/lib/store';
import { resolveHousehold, resolveMember, can } from '@/lib/auth';
import { HANDOVER_CATEGORIES } from '@/lib/handover';

export const dynamic = 'force-dynamic';

export async function GET() {
  const hh = resolveHousehold();
  const live = getHandover(hh.id);
  return NextResponse.json({
    categories: HANDOVER_CATEGORIES.map((c) => ({ ...c, live: live.includes(c.id) })),
    liveCount: HANDOVER_CATEGORIES.filter((c) => live.includes(c.id)).length,
    total: HANDOVER_CATEGORIES.length,
    canManage: can(resolveMember().role, 'viewFinances'),
  });
}

export async function POST(req: Request) {
  const me = resolveMember();
  if (!can(me.role, 'viewFinances')) {
    return NextResponse.json({ error: 'Only a parent can change what GiGi manages.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const category = String(body.category ?? '');
  const on = Boolean(body.on);
  if (!HANDOVER_CATEGORIES.some((c) => c.id === category)) {
    return NextResponse.json({ error: 'Unknown category.' }, { status: 400 });
  }
  const live = setHandover(me.householdId, category, on);
  track('handover_changed', me.householdId, { category, on });
  return NextResponse.json({ ok: true, live });
}
