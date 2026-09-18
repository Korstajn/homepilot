import { NextResponse } from 'next/server';
import { deleteBill, getBill, regenerateDigest, track, updateBill } from '@/lib/store';
import { can } from '@/lib/auth';
import { requireSession } from '@/lib/require-session';
import type { Bill, BillType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const BILL_TYPES: BillType[] = ['broadband', 'energy', 'mobile', 'tv', 'insurance', 'other'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One bill, by id.
 *
 * The bill is looked up and then CHECKED AGAINST THE CALLER'S HOUSEHOLD. It
 * used to be neither: any caller who knew (or guessed) a bill id could patch or
 * delete it, whoever it belonged to. With the store in one instance's memory
 * that was already wrong; against one shared database it is a way to edit
 * another household's money. The 404 is deliberate for both cases — "not yours"
 * and "does not exist" must be indistinguishable, or the endpoint becomes a way
 * to discover which ids are real.
 */
async function ownBill(id: string) {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false as const, response: auth.response };

  const bill = await getBill(id);
  if (!bill || bill.householdId !== auth.session.household.id) {
    return { ok: false as const, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  if (!can(auth.session.member.role, 'manageBills')) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Only a parent can change bills.' }, { status: 403 }),
    };
  }
  return { ok: true as const, bill };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const found = await ownBill(params.id);
  if (!found.ok) return found.response;
  const { bill } = found;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<Bill> = {};

  if ('provider' in body) {
    const provider = String(body.provider ?? '').trim().slice(0, 80);
    if (!provider) return NextResponse.json({ error: 'Enter a provider.' }, { status: 400 });
    patch.provider = provider;
  }
  if ('type' in body) {
    if (!BILL_TYPES.includes(body.type as BillType)) {
      return NextResponse.json({ error: 'Unknown bill type.' }, { status: 400 });
    }
    patch.type = body.type as BillType;
  }
  if ('renewalDate' in body) {
    const raw = body.renewalDate == null ? '' : String(body.renewalDate).trim();
    // Clearing a date is a real edit — "we could not read it" has to be
    // expressible — but a malformed one is a 400, not a database error.
    if (raw && !ISO_DATE.test(raw)) {
      return NextResponse.json({ error: 'Renewal date must be YYYY-MM-DD.' }, { status: 400 });
    }
    patch.renewalDate = raw || null;
  }
  if ('priceIncreaseFlag' in body) {
    patch.priceIncreaseFlag = Boolean(body.priceIncreaseFlag);
  }
  if ('confirmed' in body) {
    patch.confirmed = Boolean(body.confirmed);
  }
  if ('amount' in body) {
    if (body.amount === '' || body.amount == null) {
      patch.amount = null;
    } else {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json({ error: 'Amount must be a positive number.' }, { status: 400 });
      }
      patch.amount = amount;
    }
  }

  const updated = await updateBill(bill.id, patch);
  await regenerateDigest(bill.householdId);
  await track('bill_confirmed', bill.householdId, { billId: bill.id, confirmed: patch.confirmed ?? null });
  return NextResponse.json({ ok: true, bill: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const found = await ownBill(params.id);
  if (!found.ok) return found.response;
  const { bill } = found;

  await deleteBill(bill.id);
  await regenerateDigest(bill.householdId);
  await track('bill_deleted', bill.householdId, { billId: bill.id });
  return NextResponse.json({ ok: true });
}
