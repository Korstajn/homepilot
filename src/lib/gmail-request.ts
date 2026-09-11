import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { GMAIL_COOKIE, googleClient, openConnection, refreshAccessToken } from './google';

/**
 * The three steps every Gmail-reading route repeats: is Gmail configured, is an
 * inbox connected, and can the sealed refresh token still be exchanged for an
 * access token.
 *
 * Factored out because the third step has a failure mode worth handling
 * identically everywhere: in Google's Testing mode refresh tokens for
 * restricted scopes expire after 7 days, so `invalid_grant` is expected rather
 * than exceptional, and every caller must answer "reconnect", not "error".
 */
export async function gmailAccessToken(
  req: NextRequest,
): Promise<{ ok: true; accessToken: string } | { ok: false; response: NextResponse }> {
  const client = googleClient();
  if (!client) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Gmail is not configured on this deployment.' },
        { status: 503 },
      ),
    };
  }

  const conn = openConnection(req.cookies.get(GMAIL_COOKIE)?.value);
  if (!conn) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No Gmail inbox is connected.' }, { status: 409 }),
    };
  }

  const refreshed = await refreshAccessToken(client, conn.refreshToken);
  if ('error' in refreshed) {
    const expired = refreshed.error === 'invalid_grant';
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: expired
            ? 'Google has expired this connection — reconnect your inbox.'
            : 'Google refused to renew the connection.',
          reason: refreshed.error,
          reconnect: true,
        },
        { status: 401 },
      ),
    };
  }

  return { ok: true, accessToken: refreshed.accessToken };
}
