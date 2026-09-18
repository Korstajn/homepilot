import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { currentMember } from '@/lib/auth';
import { logProcessing, track } from '@/lib/store';
import { DEFAULT_GMAIL_QUERY, probeMessages } from '@/lib/google';
import { gmailAccessToken } from '@/lib/gmail-request';

export const dynamic = 'force-dynamic';

/**
 * "Show me what GiGi can actually see."
 *
 * Proof the grant works, and a data-minimisation demo at the same time: the
 * Gmail call asks for `format=metadata` with a From/Subject/Date allow-list, so
 * no message body is ever fetched — not filtered out afterwards, never
 * requested. Read-only, stores nothing.
 */
export async function GET(req: NextRequest) {
  const token = await gmailAccessToken(req);
  if (!token.ok) return token.response;

  const max = Math.min(Math.max(Number(req.nextUrl.searchParams.get('max') ?? 5) || 5, 1), 10);
  const result = await probeMessages(token.accessToken, DEFAULT_GMAIL_QUERY, max);
  if ('error' in result) {
    return NextResponse.json({ error: 'Gmail rejected the request.', reason: result.error }, { status: 502 });
  }

  const member = await currentMember();
  if (member) {
    await logProcessing(
      member.householdId,
      'mailbox_searched',
      'bill',
      'google',
      `GiGi searched your inbox for bill emails and read ${result.messages.length} subject line(s) — no message content`,
      'Show you which emails GiGi would pick up',
      'Consent',
      'Google (not EU-resident)',
    );
    await track('gmail_probed', member.householdId, { found: result.messages.length });
  }

  return NextResponse.json({
    ok: true,
    query: DEFAULT_GMAIL_QUERY,
    total: result.total,
    messages: result.messages,
  });
}
