import { NextResponse } from 'next/server';
import { resolveHousehold, resolveMember, can } from '@/lib/auth';
import { ingestEmail } from '@/lib/ingest';
import { requireSession } from '@/lib/require-session';

export const dynamic = 'force-dynamic';

// In-app "try forwarding now" tester. Runs the same extraction pipeline as the
// real webhook, but against the logged-in household — zero email setup needed.
export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const household = auth.session.household;
  if (!can(auth.session.member.role, 'forward')) {
    return NextResponse.json({ error: 'Not available on this account.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const from = String(body.from ?? '').trim();
  const subject = String(body.subject ?? '').trim();
  const text = String(body.text ?? '').trim();

  if (!subject && !text) {
    return NextResponse.json({ error: 'Paste a bill email (subject or body).' }, { status: 400 });
  }

  const { engine, extracted, bill } = await ingestEmail(household, { from, subject, text });
  return NextResponse.json({ ok: true, engine, extracted, billId: bill.id });
}
