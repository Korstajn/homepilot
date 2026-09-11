import { NextResponse } from 'next/server';
import { deleteBill, getBill, regenerateDigest, track, updateBill } from '@/lib/store';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const bill = getBill(params.id);
  if (!bill) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const key of ['provider', 'type', 'renewalDate', 'priceIncreaseFlag', 'confirmed'] as const) {
    if (key in body) patch[key] = body[key];
  }
  if ('amount' in body) {
    patch.amount = body.amount === '' || body.amount == null ? null : Number(body.amount);
  }

  const updated = updateBill(params.id, patch);
  regenerateDigest(bill.householdId);
  track('bill_confirmed', bill.householdId, { billId: bill.id, confirmed: patch.confirmed });
  return NextResponse.json({ ok: true, bill: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const bill = getBill(params.id);
  if (!bill) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  deleteBill(params.id);
  regenerateDigest(bill.householdId);
  track('bill_deleted', bill.householdId, { billId: bill.id });
  return NextResponse.json({ ok: true });
}
