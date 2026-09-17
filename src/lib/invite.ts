/**
 * Beta invite codes — the code you must hold to CREATE an account.
 *
 * This is a different thing from the beta gate in `src/lib/beta.ts`, and the
 * two are deliberately independent:
 *
 *   • The beta gate hides the whole ORIGIN behind one shared code. It answers
 *     "may you look at this build at all?".
 *   • An invite code gates ACCOUNT CREATION only. It answers "may you have an
 *     account?". Logging in never asks for one — an invite is spent the moment
 *     the account exists, and a tester who already signed up must not be locked
 *     out when the code they were sent is rotated.
 *
 * Codes are configured, not stored. `src/lib/store.ts` keeps everything in one
 * serverless instance's memory, so a code recorded there would stop being
 * recognised as soon as the next request landed elsewhere, and would vanish
 * entirely on redeploy — which is the one failure mode an invite must never
 * have, because the person holding it cannot tell it from being rejected. So
 * the codes live in the environment, the same way the test accounts in
 * `src/lib/dev-users.ts` dodge the same problem by being derived rather than
 * stored.
 *
 * The cost of that choice, stated plainly: a code is a SHARED SECRET, not a
 * single-use ticket. Nothing here can enforce "one signup per code" or expire a
 * code on use, because that needs a row somewhere that survives. Issue one code
 * per recipient if you want to know who used it, and rotate the list when a
 * code leaks. Single-use invites arrive with the Postgres swap (db/schema.sql).
 */

import { isPublicSite, safeEqual } from './beta';

export type InviteMode =
  /** No codes configured on a non-public build: anyone can sign up. Local dev. */
  | 'open'
  /** Codes are configured: signup needs one of them. */
  | 'required'
  /** The public site with no codes configured: signup refuses rather than falling open. */
  | 'closed';

/**
 * The accepted codes.
 *
 * Separated by COMMAS or NEWLINES, never by spaces — a space inside a code is
 * part of the code, not a separator, because `normalizeInviteCode` strips
 * spaces so that a code pasted out of an email still matches. Splitting on
 * spaces too would take a configured `GIGI BETA 01` and silently turn it into
 * three useless codes.
 */
export function inviteCodes(): string[] {
  const raw = process.env.GIGI_INVITE_CODES?.trim();
  if (!raw) return [];

  const seen = new Set<string>();
  const codes: string[] = [];
  for (const entry of raw.split(/[,\n\r]+/)) {
    const normalized = normalizeInviteCode(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    codes.push(normalized);
  }
  return codes;
}

/**
 * Whether signup asks for a code, and what happens when it cannot.
 *
 * The public site is invite-only by DEFAULT — it does not wait to be told. A
 * missing `GIGI_INVITE_CODES` there means signup closes, never that it opens to
 * everyone: forgetting to set a variable must not be the thing that throws the
 * doors open on launch day. That is the same fail-closed reasoning as
 * `gateMode()`, applied to the one action that creates data.
 *
 * `GIGI_INVITE_GATE=off` is the deliberate way out, for the day GiGi stops
 * being invite-only. It is an explicit statement, so it is allowed to open
 * signup on the public site; nothing else is.
 */
export function inviteMode(): InviteMode {
  if (process.env.GIGI_INVITE_GATE?.trim().toLowerCase() === 'off') return 'open';
  if (inviteCodes().length > 0) return 'required';
  return isPublicSite() ? 'closed' : 'open';
}

/**
 * Codes get pasted out of emails and chat, where they pick up spaces, dashes
 * and inconsistent case. Strip everything that is not alphanumeric and compare
 * upper-case, so `gigi-beta 01` and `GIGIBETA01` are the same code.
 */
export function normalizeInviteCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Is this one of the configured codes?
 *
 * Compared in constant time and WITHOUT an early exit on the first match: the
 * loop runs over every configured code whatever happens, so the time taken
 * reveals neither which code matched nor how far down the list it sits.
 */
export function isValidInviteCode(raw: string): boolean {
  const codes = inviteCodes();
  if (codes.length === 0) return false;

  const candidate = normalizeInviteCode(raw);
  if (!candidate) return false;

  let matched = false;
  for (const code of codes) {
    if (safeEqual(code, candidate)) matched = true;
  }
  return matched;
}

/**
 * What the running build can see, for the diagnostics route. The count, never
 * the codes themselves — knowing that four invites are live is operationally
 * useful; knowing what they are is the whole secret.
 */
export function inviteDiagnostics(): { mode: InviteMode; codesConfigured: number; gateOverride: string } {
  return {
    mode: inviteMode(),
    codesConfigured: inviteCodes().length,
    gateOverride: process.env.GIGI_INVITE_GATE?.trim() ?? '(unset)',
  };
}
