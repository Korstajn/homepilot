import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { currentMember } from '@/lib/auth';
import { logProcessing, track } from '@/lib/store';
import {
  DEFAULT_GMAIL_QUERY,
  GMAIL_COOKIE,
  googleClient,
  openConnection,
  probeMessages,
  refreshAccessToken,
} from '@/lib/google';

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
  const client = googleClient();
  if (!client) {
    return NextResponse.json({ error: 'Gmail is not configured on this deployment.' }, { status: 503 });
  }

  const conn = openConnection(req.cookies.get(GMAIL_COOKIE)?.value);
  if (!conn) {
    return NextResponse.json({ error: 'No Gmail inbox is connected.' }, { status: 409 });
  }

  const refreshed = await refreshAccessToken(client, conn.refreshToken);
  if ('error' in refreshed) {
    // invalid_grant is the expected one: in Google's Testing mode, refresh
    // tokens for restricted scopes expire after 7 days.
    const expired = refreshed.error === 'invalid_grant';
    return NextResponse.json(
      {
        error: expired
          ? 'Google has expired this connection — reconnect your inbox.'
          : 'Google refused to renew the connection.',
        reason: refreshed.error,
        reconnect: true,
      },
      { status: 401 },
    );
  }

  const max = Math.min(Math.max(Number(req.nextUrl.searchParams.get('max') ?? 5) || 5, 1), 10);
  const result = await probeMessages(refreshed.accessToken, DEFAULT_GMAIL_QUERY, max);
  if ('error' in result) {
    return NextResponse.json({ error: 'Gmail rejected the request.', reason: result.error }, { status: 502 });
  }

  const member = currentMember();
  if (member) {
    logProcessing(
      member.householdId,
      'mailbox_searched',
      'bill',
      'google',
      `GiGi searched your inbox for bill emails and read ${result.messages.length} subject line(s) — no message content`,
      'Show you which emails GiGi would pick up',
      'Consent',
      'Google (not EU-resident)',
    );
    track('gmail_probed', member.householdId, { found: result.messages.length });
  }

  return NextResponse.json({
    ok: true,
    query: DEFAULT_GMAIL_QUERY,
    total: result.total,
    messages: result.messages,
  });
}
