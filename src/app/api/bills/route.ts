import { NextResponse } from 'next/server';
import { addBill, listBills, regenerateDigest, track } from '@/lib/store';
import { resolveHousehold, resolveMember, can } from '@/lib/auth';
import type { BillType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const BILL_TYPES: BillType[] = ['broadband', 'energy', 'mobile', 'tv', 'insurance', 'other'];

export async function GET() {
  if (!can(resolveMember().role, 'viewFinances')) {
    return NextResponse.json({ error: 'Bills are not visible on this account.' }, { status: 403 });
  }
  const hh = resolveHousehold();
  const bills = listBills(hh.id);
  const total = bills
    .filter((b) => b.confirmed && b.amount !== null)
    .reduce((sum, b) => sum + (b.amount ?? 0), 0);
  return NextResponse.json({ bills, monthlyTotal: total, currency: hh.currency });
}

// Manual add bill — P0 in this build (the plan had it as P1; see docs/DECISIONS.md).
export async function POST(req: Request) {
  if (!can(resolveMember().role, 'manageBills')) {
    return NextResponse.json({ error: 'Only a parent can add bills.' }, { status: 403 });
  }
  const hh = resolveHousehold();
  const body = await req.json().catch(() => ({}));

  const provider = String(body.provider ?? '').trim();
  const type: BillType = BILL_TYPES.includes(body.type) ? body.type : 'other';
  const amount = body.amount === '' || body.amount == null ? null : Number(body.amount);
  const renewalDate = body.renewalDate ? String(body.renewalDate) : null;

  if (!provider) {
    return NextResponse.json({ error: 'Provider is required.' }, { status: 400 });
  }
  if (amount !== null && (Number.isNaN(amount) || amount < 0)) {
    return NextResponse.json({ error: 'Amount must be a positive number.' }, { status: 400 });
  }

  const bill = addBill({
    householdId: hh.id,
    provider,
    type,
    amount,
    currency: hh.currency,
    renewalDate,
    priceIncreaseFlag: Boolean(body.priceIncreaseFlag),
    source: 'manual',
    confirmed: true,
  });

  regenerateDigest(hh.id);
  track('bill_added_manually', hh.id, { type });
  return NextResponse.json({ ok: true, bill });
}
