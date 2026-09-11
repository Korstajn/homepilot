import { NextResponse } from 'next/server';
import { getTodayDigest, logAction, track, logProcessing } from '@/lib/store';
import { resolveHousehold, resolveMember, can } from '@/lib/auth';
import type { DigestItem } from '@/lib/types';

// The approve-to-execute loop. Every external action is gated by this explicit
// call and written to the action log (what, when, outcome).
export async function POST(req: Request) {
  const hh = resolveHousehold();
  const me = resolveMember();
  const body = await req.json().catch(() => ({}));
  const itemId = String(body.itemId ?? '');
  const action = body.action as 'approve' | 'done' | 'dismiss';

  if (!['approve', 'done', 'dismiss'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  // Teens have a limited view: they can't approve executions.
  if (action === 'approve' && !can(me.role, 'approve')) {
    return NextResponse.json({ error: 'Only a parent can approve actions.' }, { status: 403 });
  }

  const digest = getTodayDigest(hh.id);
  const item: DigestItem | undefined = digest
    ? [...digest.items, ...digest.overflow].find((i) => i.id === itemId)
    : undefined;

  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  // Mutate the live digest item so the UI reflects state immediately.
  if (action === 'approve') item.status = 'approved';
  else if (action === 'done') item.status = 'done';
  else item.status = 'dismissed';

  let outcome = '';
  if (action === 'approve' && item.executable) {
    // Beta: founder-assisted/concierge execution behind the button.
    outcome = `Switch queued for concierge — saving ${item.savingAnnual} ${hh.currency}/yr`;
  } else if (action === 'approve') {
    outcome = 'Approved';
  } else if (action === 'done') {
    outcome = 'Marked done';
  } else {
    outcome = 'Dismissed';
  }

  logAction({
    householdId: hh.id,
    itemId,
    action,
    outcome,
    savingAnnual: action === 'approve' ? item.savingAnnual : undefined,
  });

  track('action_' + action, hh.id, {
    category: item.category,
    executable: item.executable,
    savingAnnual: item.savingAnnual ?? null,
  });

  // Approving an executable action is the one moment data is shared outward —
  // record it plainly in the trust log.
  if (action === 'approve' && item.executable) {
    logProcessing(
      hh.id, 'shared_for_execution', 'bill', 'concierge',
      'You approved a switch — your name and address were shared to carry it out',
      'Execute the switch you approved',
      'Consent (your explicit approval)',
    );
  }

  return NextResponse.json({ ok: true, item, outcome });
}
