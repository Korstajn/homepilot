import { NextResponse } from 'next/server';
import { gateDiagnostics, gateMode, isPublicSite } from '@/lib/beta';
import { devUserSpecs, devUsersEnabled } from '@/lib/dev-users';
import {
  GMAIL_SCOPES,
  googleConfigured,
  redirectHostMismatch,
  redirectUri,
  redirectUriProblem,
} from '@/lib/google';
import { secretSource } from '@/lib/secrets';
import { adminToken, guardInternal } from '@/lib/internal';
import { inviteDiagnostics } from '@/lib/invite';

export const dynamic = 'force-dynamic';

/**
 * What this deployment can actually see of its configuration.
 *
 * The reason this exists: setting an environment variable in the Vercel
 * dashboard does not touch deployments that already exist, and a variable
 * scoped to Production only is invisible to a preview build. From the outside
 * both are indistinguishable from never having set it — which is exactly the
 * trap the beta gate's 503 page was written to escape (src/lib/beta.ts). This
 * is the same idea for every other variable, so verifying a deploy is one URL
 * instead of a round of guessing.
 *
 * RULE: presence, never values. No secret is printed here — not the beta code,
 * the dev password, the session secret, the Anthropic key, nor the Google
 * client secret. `googleClientId` and `googleRedirectUri` ARE included because
 * neither is a secret: both appear in the browser's address bar during the
 * OAuth redirect, and the redirect URI is the single value most likely to be
 * mismatched against Google Cloud Console.
 *
 * Who may read it: on a non-public build, anyone with the URL — the value of
 * being able to read a deployment's real configuration is worth more than the
 * little this discloses, none of which is secret. On the PUBLIC site it needs
 * GIGI_ADMIN_TOKEN and 404s without one (src/lib/internal.ts). That is the
 * "revisit this before the origin serves the public site" this comment used to
 * promise: the configuration of the real site is not a thing to hand out, even
 * when no single field in it is a secret.
 */
export async function GET(req: Request) {
  const denied = guardInternal(req);
  if (denied) return denied;

  const gate = gateDiagnostics();
  const secret = secretSource();
  const gmail = googleConfigured();
  const testers = devUserSpecs();

  // Named problems rather than a table to interpret. Each line is something
  // that is actually wrong, in the order it will bite.
  const warnings: string[] = [];

  if (secret === 'ephemeral') {
    warnings.push(
      'GIGI_SESSION_SECRET and GIGI_DEV_PASSWORD are both unset, so sessions are signed with a per-process random key — every login will be lost on the next request. Set GIGI_SESSION_SECRET (openssl rand -hex 32).',
    );
  } else if (secret === 'dev-password') {
    warnings.push(
      'Sessions are signed with GIGI_DEV_PASSWORD because GIGI_SESSION_SECRET is unset. This works, but changing the dev password logs everyone out and invalidates every stored Gmail token.',
    );
  }

  if (!devUsersEnabled()) {
    warnings.push('GIGI_DEV_PASSWORD is unset, so there are no test accounts on this build. Sign-up does not persist on serverless, so without them there is no account here that survives a redeploy.');
  }

  if (gateMode() === 'off' && !isPublicSite()) {
    warnings.push(
      'This origin is ungated (GIGI_BETA_GATE is not "on"), so every page and API route here — including this one — answers anyone with the URL. robots.txt still disallows crawling, so it will not be indexed. Note that /api/auth/dev-users lists the test-account addresses and GIGI_DEV_PASSWORD is shared by all of them: while the build is open, that password is the only thing between a stranger and a test account. Set GIGI_BETA_GATE=on to gate it again. (On the public site that route, /api/auth/demo and the founder endpoints are closed regardless — see src/lib/internal.ts.)',
    );
  }

  if (!gmail) {
    warnings.push('GOOGLE_CLIENT_ID and/or GOOGLE_CLIENT_SECRET are unset, so Connect Gmail shows "Unavailable". Forwarding is unaffected.');
  } else if (redirectHostMismatch(req)) {
    const m = redirectHostMismatch(req)!;
    warnings.push(
      `GOOGLE_REDIRECT_URI points at ${m.pinned} but this deployment is served from ${m.actual}. Gmail cannot be connected from here: Google would reject it as redirect_uri_mismatch, and even if the URI were registered it would return the browser to the other host, where the state cookie does not exist. Either browse ${m.pinned}, or set GOOGLE_REDIRECT_URI for this environment to https://${m.actual}/api/auth/google/callback and register that in Google Cloud Console.`,
    );
  } else if (redirectUriProblem()) {
    warnings.push(
      `${redirectUriProblem()} Google compares the redirect URI byte for byte, so this fails as redirect_uri_mismatch however the URI is registered in Google Cloud Console.`,
    );
  } else if (!process.env.GOOGLE_REDIRECT_URI?.trim()) {
    warnings.push(
      'GOOGLE_REDIRECT_URI is unset, so the redirect URI is derived from each request. On Vercel every preview deployment has a different hostname and none are registered with Google, which fails as redirect_uri_mismatch. Set it explicitly.',
    );
  }

  const invite = inviteDiagnostics();
  if (invite.mode === 'closed') {
    warnings.push(
      'This is the public site and GIGI_INVITE_CODES is unset, so /api/auth/signup is refusing every attempt: nobody can create an account. That is the fail-closed default, not a bug — set GIGI_INVITE_CODES to the codes you are sending out, or GIGI_INVITE_GATE=off to open sign-up to everyone.',
    );
  } else if (invite.mode === 'open' && isPublicSite()) {
    warnings.push(
      'Sign-up on the public site is OPEN to anyone: GIGI_INVITE_GATE=off overrides the invite requirement. Remove it to go back to invite-only.',
    );
  }

  if (!adminToken() && isPublicSite()) {
    warnings.push(
      'GIGI_ADMIN_TOKEN is unset on the public site, so the founder endpoints (/api/waitlist, /api/feedback, /api/events, this route) answer 404 for everyone including you. Set it to read them — openssl rand -hex 32.',
    );
  }

  if (gate.vercelEnv && gate.vercelEnv !== 'production') {
    warnings.push(
      `This is a ${gate.vercelEnv} deployment. Any variable scoped to Production only is invisible here — tick Preview (and Development) on it too, then redeploy.`,
    );
  }

  return NextResponse.json({
    // Which build is answering. Without this it is impossible to tell whether
    // you are looking at the deployment you just redeployed.
    deployment: {
      vercelEnv: gate.vercelEnv || null,
      gitBranch: gate.gitRef || null,
      gitCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      nodeEnv: gate.nodeEnv,
      nodeVersion: process.version,
      region: process.env.VERCEL_REGION ?? null,
      siteEnv: process.env.GIGI_SITE_ENV ?? null,
    },
    betaGate: {
      codeVisible: gate.codeVisible,
      override: gate.gateOverride,
    },
    // Whether account creation is gated, and how many codes are live. Never
    // the codes themselves.
    invites: {
      mode: invite.mode,
      codesConfigured: invite.codesConfigured,
      override: invite.gateOverride,
      adminToken: Boolean(adminToken()),
    },
    accounts: {
      sessionSecret: secret,
      testAccounts: testers.length,
      // Addresses only — the same ones /api/auth/dev-users already lists so the
      // login screen can show them. Never the password.
      testEmails: testers.map((t) => t.email),
      signupPersists: false, // in-memory store; see db/schema.sql
    },
    gmail: {
      configured: gmail,
      googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || null,
      googleRedirectUri: gmail ? redirectUri(req) : null,
      redirectUriPinned: Boolean(process.env.GOOGLE_REDIRECT_URI?.trim()),
      redirectUriProblem: gmail ? redirectUriProblem() : null,
      hostMismatch: gmail ? redirectHostMismatch(req) : null,
      scopes: GMAIL_SCOPES,
    },
    ai: {
      anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      region: process.env.ANTHROPIC_REGION?.trim() || 'eu (default)',
    },
    market: process.env.GIGI_DEFAULT_MARKET?.trim() || 'uk (default)',
    warnings,
  });
}
