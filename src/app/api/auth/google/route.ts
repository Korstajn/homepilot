import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { currentMember } from '@/lib/auth';
import { logProcessing, track } from '@/lib/store';
import {
  GMAIL_COOKIE,
  GMAIL_SCOPES,
  googleConfigured,
  openConnection,
  redirectHostMismatch,
  redirectUri,
  redirectUriProblem,
  revokeToken,
} from '@/lib/google';

export const dynamic = 'force-dynamic';

// Connection status for the UI. Never returns the token itself.
export async function GET(req: NextRequest) {
  const conn = openConnection(req.cookies.get(GMAIL_COOKIE)?.value);
  const configured = googleConfigured();
  return NextResponse.json({
    configured,
    connected: conn !== null,
    email: conn?.email ?? null,
    connectedAt: conn?.connectedAt ?? null,
    scopes: GMAIL_SCOPES,
    // The exact string Google must have registered, and whether it can
    // possibly work from the host currently being browsed. Neither is secret:
    // the redirect URI is visible in the address bar during the OAuth hop.
    redirectUri: configured ? redirectUri(req) : null,
    hostMismatch: configured ? redirectHostMismatch(req) : null,
    redirectUriProblem: configured ? redirectUriProblem() : null,
  });
}

// Disconnect: revoke at Google, then drop our cookie.
export async function DELETE(req: NextRequest) {
  const conn = openConnection(req.cookies.get(GMAIL_COOKIE)?.value);
  if (conn) await revokeToken(conn.refreshToken);

  const res = NextResponse.json({ ok: true, connected: false });
  res.cookies.set(GMAIL_COOKIE, '', { path: '/', maxAge: 0 });

  const member = currentMember();
  if (conn && member) {
    logProcessing(
      member.householdId,
      'inbox_disconnected',
      'account',
      'you',
      'You disconnected your Gmail inbox and the access was revoked at Google',
      'You withdrew consent',
      'Consent withdrawn',
      'Google (not EU-resident)',
    );
    track('gmail_disconnected', member.householdId, {});
  }
  return res;
}
