import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { currentMember } from '@/lib/auth';
import { logProcessing, track } from '@/lib/store';
import { BILL_TERMS, buildGmailQuery, probeMessages } from '@/lib/google';
import { gmailAccessToken } from '@/lib/gmail-request';

export const dynamic = 'force-dynamic';

/** One month is the question people actually ask; the rest is bounded around it. */
const DEFAULT_DAYS = 30;
const MAX_RESULTS = 50;

/**
 * Search the connected inbox — headers only.
 *
 * This is the read-only half of the Gmail integration: `probeMessages` asks
 * Gmail for `format=metadata` with a From/Subject/Date allow-list, so no message
 * body is fetched. What this adds over /api/gmail/probe is that the caller
 * chooses the terms and the window ("bills from the last month"), and that the
 * ceiling is 50 rather than the fixed demo's 10.
 *
 * Terms are composed through buildGmailQuery, never concatenated here: the
 * parenthesisation it applies is what keeps `newer_than` binding over an OR
 * list, and a search that silently loses its time bound would read far more of
 * the mailbox than the user asked for.
 */
export async function GET(req: NextRequest) {
  const member = await currentMember();
  if (!member) {
    return NextResponse.json({ error: 'Log in to search your inbox.' }, { status: 401 });
  }

  const token = await gmailAccessToken(req);
  if (!token.ok) return token.response;

  const params = req.nextUrl.searchParams;
  const days = Number(params.get('days') ?? DEFAULT_DAYS) || DEFAULT_DAYS;
  const max = Math.min(Math.max(Number(params.get('max') ?? 20) || 20, 1), MAX_RESULTS);
  // A caller may narrow the search, but only within the bill-hunting frame:
  // free-text straight from a query box would let one typo ("in:anywhere")
  // widen the read beyond what the consent copy promises.
  const terms = params.get('q')?.trim() ? `(${BILL_TERMS}) AND (${params.get('q')!.trim().slice(0, 200)})` : BILL_TERMS;
  const query = buildGmailQuery({ terms, days });

  const result = await probeMessages(token.accessToken, query, max);
  if ('error' in result) {
    return NextResponse.json({ error: 'Gmail rejected the search.', reason: result.error }, { status: 502 });
  }

  await logProcessing(
    member.householdId,
    'mailbox_searched',
    'bill',
    'google',
    `GiGi searched the last ${days} days of your inbox and read ${result.messages.length} subject line(s) — no message content`,
    'Find emails that look like bills',
    'Consent',
    'Google (not EU-resident)',
  );
  await track('gmail_searched', member.householdId, { days, found: result.messages.length });

  return NextResponse.json({
    ok: true,
    query,
    days,
    total: result.total,
    messages: result.messages,
  });
}
