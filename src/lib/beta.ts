/**
 * Beta gate — the code you must type to open the dev site.
 *
 * dev.getgigiapp.com is a work-in-progress build with seeded data and real
 * product copy. It is not private data, but it is not public either: nothing
 * there should be shareable, quotable or indexable by accident. A single
 * shared beta code in front of the whole origin is the smallest thing that
 * makes that true, and it costs a tester one paste.
 *
 * Design notes:
 *  - This module is imported by middleware (Edge runtime), so it uses Web
 *    Crypto only — no `node:crypto`, no `Buffer`.
 *  - The cookie never contains the code. It holds SHA-256 of the code, which
 *    the middleware recomputes from the configured code on each request. Nobody
 *    who can read the cookie learns anything they didn't already have to know.
 *  - It is an access gate for a dev environment, NOT authentication. Account
 *    auth lives in lib/auth.ts and is unchanged by this.
 */

export const BETA_COOKIE = 'gigi_beta';

export const BETA_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days — type the code once per month
  secure: process.env.NODE_ENV === 'production',
};

export type GateMode =
  | 'off' // no gate: local dev, or an environment that opted out explicitly
  | 'on' // a code is configured and required
  | 'misconfigured'; // deployed with no code — fail CLOSED, never fall open

export function betaCode(): string | null {
  const raw = process.env.GIGI_BETA_CODE?.trim();
  return raw ? raw : null;
}

/**
 * Deliberately fail-closed: a production deploy that forgets GIGI_BETA_CODE
 * serves a 503 rather than quietly publishing the dev build. Opening the site
 * to everyone has to be an explicit decision (GIGI_BETA_GATE=off), never an
 * omission.
 */
export function gateMode(): GateMode {
  if (process.env.GIGI_BETA_GATE?.trim().toLowerCase() === 'off') return 'off';
  if (betaCode()) return 'on';
  return process.env.NODE_ENV === 'production' ? 'misconfigured' : 'off';
}

/**
 * What the running build can actually see, for the 503 page. Never includes the
 * code itself — only whether one is visible, and which deployment this is.
 *
 * The reason this exists: the usual cause of a 503 here is that the code is
 * set, but not for THIS deployment — a preview build cannot see a variable
 * scoped to production only, and a dashboard change never reaches a deployment
 * that already exists. From outside, both look identical to never having set
 * it, so the page names the deployment rather than making you guess.
 */
export interface GateDiagnostics {
  nodeEnv: string;
  codeVisible: boolean;
  gateOverride: string;
  /** Vercel: production | preview | development. Empty elsewhere. */
  vercelEnv: string;
  /** The branch this build came from, when the host tells us. */
  gitRef: string;
}

export function gateDiagnostics(): GateDiagnostics {
  return {
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    codeVisible: Boolean(betaCode()),
    gateOverride: process.env.GIGI_BETA_GATE?.trim() ?? '(unset)',
    vercelEnv: process.env.VERCEL_ENV?.trim() ?? '',
    gitRef: process.env.VERCEL_GIT_COMMIT_REF?.trim() ?? '',
  };
}

/** Codes are compared case- and whitespace-insensitively: they get pasted around. */
export function normalizeCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

export async function betaCookieValue(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(`gigi-beta-v1:${normalizeCode(code)}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time string compare — no early exit on the first wrong character. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hasValidBetaCookie(cookieValue: string | undefined): Promise<boolean> {
  const code = betaCode();
  if (!code || !cookieValue) return false;
  return safeEqual(cookieValue, await betaCookieValue(code));
}

/**
 * Only ever redirect back to a path on this origin. `//evil.com` and
 * `https://evil.com` are both rejected — an open redirect on the gate would
 * hand phishers a getgigiapp.com link.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return '/';
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}
