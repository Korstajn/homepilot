import { NextResponse } from 'next/server';
import { addFeedback, listFeedback, track } from '@/lib/store';
import { requireSession } from '@/lib/require-session';
import { guardInternal } from '@/lib/internal';

// In-app feedback channel — beta users' reports of wrong extraction are the
// training data (P0 gap the plan missed).
export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const hh = auth.session.household;
  const body = await req.json().catch(() => ({}));
  const message = String(body.message ?? '').trim();
  const kind = body.kind === 'wrong_extraction' ? 'wrong_extraction' : 'general';

  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });

  const fb = await addFeedback({
    householdId: hh.id,
    kind,
    message,
    relatedBillId: body.relatedBillId ? String(body.relatedBillId) : undefined,
  });
  await track('feedback_submitted', hh.id, { kind });
  return NextResponse.json({ ok: true, id: fb.id });
}

/**
 * Every household's feedback in one list, for the founder. It is users' own
 * words about their own bills, so on the public site this needs
 * GIGI_ADMIN_TOKEN (src/lib/internal.ts).
 */
export async function GET(req: Request) {
  const denied = guardInternal(req);
  if (denied) return denied;

  return NextResponse.json({ feedback: await listFeedback() });
}
