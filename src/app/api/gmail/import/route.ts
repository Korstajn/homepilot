import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { currentMember, can } from '@/lib/auth';
import {
  getDefaultHousehold,
  getHouseholdById,
  listBills,
  logProcessing,
  track,
} from '@/lib/store';
import { BILL_TERMS, buildGmailQuery, fetchMessageContent, searchMessageIds } from '@/lib/google';
import { gmailAccessToken } from '@/lib/gmail-request';
import { ingestEmail } from '@/lib/ingest';

export const dynamic = 'force-dynamic';

const DEFAULT_DAYS = 30;
// Each message costs a Gmail fetch, up to two attachment fetches and one model
// call, all inside one HTTP request. Twelve keeps a run inside a serverless
// timeout; a bigger mailbox is a second run, not a longer one.
const MAX_MESSAGES = 12;

/**
 * Import bills from the connected inbox — the half that reads message content.
 *
 * This is the deliberate opposite of /api/gmail/search. It requests
 * `format=full` and downloads PDF attachments, because that is the only place
 * an amount and a renewal date actually live: a subject line almost never
 * carries either, and Prompt 1's "null over guessing" rule turns header-only
 * extraction into a column of nulls.
 *
 * That is a real change in what GiGi sees, so it is gated accordingly: a real
 * session, never the shared demo household, a capability check, an explicit
 * POST rather than something a page can trigger by loading, and a
 * `mailbox_read` entry per message in the trust log.
 *
 * Extracted bills land UNCONFIRMED, exactly like a forwarded one. Nothing read
 * out of a mailbox starts out trusted.
 */
export async function POST(req: NextRequest) {
  const member = currentMember();
  if (!member) {
    return NextResponse.json({ error: 'Log in to import from your inbox.' }, { status: 401 });
  }
  if (member.householdId === getDefaultHousehold().id) {
    return NextResponse.json(
      { error: 'The demo household cannot import a real inbox.' },
      { status: 403 },
    );
  }
  if (!can(member.role, 'manageBills')) {
    return NextResponse.json(
      { error: 'Your account cannot add bills to this household.' },
      { status: 403 },
    );
  }
  const household = getHouseholdById(member.householdId);
  if (!household) {
    return NextResponse.json({ error: 'Household not found.' }, { status: 409 });
  }

  const token = await gmailAccessToken(req);
  if (!token.ok) return token.response;

  const body = (await req.json().catch(() => ({}))) as { days?: number; max?: number };
  const days = Number(body.days ?? DEFAULT_DAYS) || DEFAULT_DAYS;
  const max = Math.min(Math.max(Number(body.max ?? MAX_MESSAGES) || MAX_MESSAGES, 1), MAX_MESSAGES);
  const query = buildGmailQuery({ terms: BILL_TERMS, days });

  const listed = await searchMessageIds(token.accessToken, query, max);
  if ('error' in listed) {
    return NextResponse.json({ error: 'Gmail rejected the search.', reason: listed.error }, { status: 502 });
  }

  // Re-importing the same message would silently duplicate a bill the user has
  // already reviewed, so the message id is recorded on the bill and checked here.
  const alreadyImported = new Set(
    listBills(household.id)
      .map((b) => b.sourceRef)
      .filter((ref): ref is string => Boolean(ref)),
  );
  const fresh = listed.ids.filter((id) => !alreadyImported.has(`gmail:${id}`));

  const imported: { provider: string; amount: number | null; renewalDate: string | null }[] = [];
  const failed: string[] = [];
  let withAttachments = 0;

  for (const id of fresh) {
    const content = await fetchMessageContent(token.accessToken, id);
    if ('error' in content) {
      failed.push(content.error);
      continue;
    }
    if (content.attachments.length) withAttachments++;

    try {
      const { bill } = await ingestEmail(
        household,
        {
          from: content.from ?? undefined,
          subject: content.subject ?? undefined,
          text: content.text,
          structured: content.structured,
          attachments: content.attachments.map((a) => ({ mediaType: a.mediaType, data: a.data })),
        },
        'gmail',
        `gmail:${id}`,
      );
      imported.push({
        provider: bill.provider,
        amount: bill.amount,
        renewalDate: bill.renewalDate,
      });
    } catch {
      // One unreadable email must not abandon the rest of the run.
      failed.push('extraction_failed');
    }
  }

  logProcessing(
    household.id,
    'mailbox_searched',
    'bill',
    'google',
    `GiGi searched the last ${days} days of your inbox and found ${listed.ids.length} bill-looking email(s), ${fresh.length} not yet imported`,
    'Find bills to import',
    'Consent',
    'Google (not EU-resident)',
  );
  track('gmail_import_run', household.id, {
    days,
    found: listed.ids.length,
    imported: imported.length,
    skipped: listed.ids.length - fresh.length,
    failed: failed.length,
    withAttachments,
  });

  return NextResponse.json({
    ok: true,
    days,
    found: listed.ids.length,
    alreadyImported: listed.ids.length - fresh.length,
    imported,
    withAttachments,
    failed: failed.length,
  });
}
