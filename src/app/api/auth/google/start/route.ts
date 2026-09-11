import { NextResponse } from 'next/server';
import { currentMember } from '@/lib/auth';
import { getDefaultHousehold, track } from '@/lib/store';
import { safeNextPath } from '@/lib/beta';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE_OPTS,
  authUrl,
  googleClient,
  redirectHostMismatch,
  redirectUri,
} from '@/lib/google';
import { nonce, seal } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

// Step 1 of the Gmail grant: send the browser to Google's consent screen.
//
// A plain 302 from the server, deliberately — the self-only CSP in
// next.config.mjs would block Google's browser SDK, and a redirect needs no
// third-party script to begin with.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const requested = url.searchParams.get('next');
  const next = requested ? safeNextPath(requested) : '/onboarding/connect';
  const back = (reason: string) => {
    const dest = new URL(next, req.url);
    dest.searchParams.set('gmail', reason);
    return NextResponse.redirect(dest);
  };

  const client = googleClient();
  if (!client) return back('unconfigured');

  // Connecting a mailbox is a per-person credential grant, so it needs a real
  // session — and it must never land on the demo household, which every
  // visitor to this build shares.
  const member = currentMember();
  if (!member) {
    const login = new URL('/login', req.url);
    login.searchParams.set('next', next);
    return NextResponse.redirect(login);
  }
  if (member.householdId === getDefaultHousehold().id) return back('demo');

  // Stop here rather than bouncing the user off Google's error page: a pinned
  // redirect URI on another host cannot succeed, and Google's 400 never comes
  // back to us to be explained.
  if (redirectHostMismatch(req)) return back('host_mismatch');

  const state = nonce();
  track('gmail_connect_started', member.householdId, {});

  const res = NextResponse.redirect(
    authUrl({ client, redirectUri: redirectUri(req), state }),
  );
  // The state lives in a sealed cookie next to the path to return to, so the
  // callback can verify the round trip without any server-side storage.
  res.cookies.set(OAUTH_STATE_COOKIE, seal({ state, next }), OAUTH_STATE_COOKIE_OPTS);
  return res;
}
