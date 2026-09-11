import { NextResponse } from 'next/server';
import { addFeedback, listFeedback, track } from '@/lib/store';
import { resolveHousehold } from '@/lib/auth';

// In-app feedback channel — beta users' reports of wrong extraction are the
// training data (P0 gap the plan missed).
export async function POST(req: Request) {
  const hh = resolveHousehold();
  const body = await req.json().catch(() => ({}));
  const message = String(body.message ?? '').trim();
  const kind = body.kind === 'wrong_extraction' ? 'wrong_extraction' : 'general';

  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });

  const fb = addFeedback({
    householdId: hh.id,
    kind,
    message,
    relatedBillId: body.relatedBillId ? String(body.relatedBillId) : undefined,
  });
  track('feedback_submitted', hh.id, { kind });
  return NextResponse.json({ ok: true, id: fb.id });
}

export async function GET() {
  return NextResponse.json({ feedback: listFeedback() });
}
