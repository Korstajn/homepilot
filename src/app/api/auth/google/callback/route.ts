import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { currentMember } from '@/lib/auth';
import { logProcessing, track, updateHousehold } from '@/lib/store';
import { safeNextPath } from '@/lib/beta';
import {
  GMAIL_COOKIE,
  GMAIL_COOKIE_OPTS,
  OAUTH_STATE_COOKIE,
  emailFromIdToken,
  exchangeCode,
  googleClient,
  redirectUri,
  sealConnection,
} from '@/lib/google';
import { unseal } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

// Step 2: Google sends the browser back here with a one-time code.
//
// Every failure path redirects to a page with a FIXED reason code rather than
// rendering Google's error text — that text is attacker-influencable, and it has
// no business being echoed into a page.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sealedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const stored = unseal<{ state: string; next: string }>(sealedState);
  const next = stored?.next ? safeNextPath(stored.next) : '/onboarding/connect';

  const back = (reason: string) => {
    const dest = new URL(next, req.url);
    dest.searchParams.set('gmail', reason);
    const res = NextResponse.redirect(dest);
    res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  };

  // The user pressed "Cancel", or Google refused the request.
  if (url.searchParams.get('error')) return back('denied');

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return back('error');
  // CSRF: the state must match the one we sealed into the cookie when starting.
  if (!stored || stored.state !== state) return back('state');

  const client = googleClient();
  if (!client) return back('unconfigured');

  const member = currentMember();
  if (!member) return back('session');

  const token = await exchangeCode(client, code, redirectUri(req));
  if (!token.access_token) return back('exchange');

  // No refresh token means we could only read the inbox for the next hour, so
  // treat it as a failure rather than reporting a connection that will die
  // silently. `prompt=consent` in the auth URL is what normally prevents this.
  if (!token.refresh_token) return back('no_refresh');

  const email = emailFromIdToken(token.id_token);
  const res = back('connected');
  res.cookies.set(
    GMAIL_COOKIE,
    sealConnection({
      refreshToken: token.refresh_token,
      email,
      scope: token.scope ?? '',
      connectedAt: new Date().toISOString(),
    }),
    GMAIL_COOKIE_OPTS,
  );

  updateHousehold(member.householdId, { connectionStatus: 'active' });
  logProcessing(
    member.householdId,
    'inbox_connected',
    'account',
    'you',
    email
      ? `You gave GiGi read-only access to the Gmail inbox ${email}`
      : 'You gave GiGi read-only access to your Gmail inbox',
    'Find bills without you forwarding each one',
    'Consent',
    'Google (not EU-resident)',
  );
  track('gmail_connected', member.householdId, {});
  return res;
}
