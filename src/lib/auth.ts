import { cookies } from 'next/headers';
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'crypto';
import { getDefaultHousehold, getHouseholdById, getMemberById, ownerMember, memberIdForSession } from './store';
import { signToken, verifyToken } from './secrets';
import type { Household, Member, MemberRole } from './types';

export const SESSION_COOKIE = 'gigi_session';

export const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
  secure: process.env.NODE_ENV === 'production',
};

// Password hashing. scrypt with a per-user salt — real enough for the test
// build; production swaps this for Supabase Auth (see docs/DECISIONS.md).
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored?: string): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// One-time recovery code for email-free accounts. Shown once, stored only as a
// hash. Format: GIGI-XXXX-XXXX-XXXX.
export function generateRecoveryCode(): string {
  const chunk = () => randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
  return `GIGI-${chunk()}-${chunk()}-${chunk()}`;
}

export function hashRecovery(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

/**
 * Mint a session cookie value for a member.
 *
 * The token is SIGNED rather than looked up in a table (see src/lib/secrets.ts):
 * on Vercel the store lives in one serverless instance's memory, so a token
 * that only exists as a row there stops resolving the moment the next request
 * lands elsewhere. It still carries no PII — an opaque member id and an issue
 * time, nothing else.
 */
export function newSessionToken(memberId: string): string {
  return signToken({ m: memberId });
}

/** Member id from a session cookie: signed token first, legacy in-memory second. */
function memberIdFromToken(token: string): string | null {
  const signed = verifyToken<{ m?: unknown }>(token, COOKIE_OPTS.maxAge * 1000);
  if (signed && typeof signed.m === 'string') return signed.m;
  // Tokens minted before sessions were signed, and any still in memory on this
  // instance. Harmless to keep; it costs one array scan.
  return memberIdForSession(token) ?? null;
}

// The session cookie holds an OPAQUE token (not the member id, no PII). Resolve
// it server-side to the member (or the demo owner as a fallback so /app demo
// links keep working without logging in).
export function currentMember(): Member | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    const memberId = memberIdFromToken(token);
    if (memberId) {
      const m = getMemberById(memberId);
      if (m && m.status === 'active') return m;
    }
  }
  return null;
}

export type SessionState =
  | 'none' // no cookie: a visitor, or the demo
  | 'active' // a cookie that resolves to a live member
  | 'stale'; // a cookie WE signed, pointing at a member this instance lacks

/**
 * Tell a genuinely-absent session apart from a lost one.
 *
 * 'stale' is the in-memory store's failure mode on serverless: the signature is
 * ours, so the person really did log in, but the household only ever existed in
 * another instance's memory. Without this the UI would quietly fall back to the
 * demo household and show them someone else's bills as if they were their own.
 * It disappears once the store is backed by Postgres (db/schema.sql).
 */
export function sessionState(): SessionState {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return 'none';
  if (currentMember()) return 'active';
  return verifyToken<{ m?: unknown }>(token, COOKIE_OPTS.maxAge * 1000) ? 'stale' : 'none';
}

export function resolveMember(): Member {
  const m = currentMember();
  if (m) return m;
  // Fallback: the demo household's owner member.
  return ownerMember(getDefaultHousehold().id)!;
}

// Resolve the household for the current request via the session member.
export function resolveHousehold(): Household {
  const m = resolveMember();
  return getHouseholdById(m.householdId) ?? getDefaultHousehold();
}

// Is there a real (non-fallback) logged-in session?
export function currentSessionHouseholdId(): string | null {
  const m = currentMember();
  return m ? m.householdId : null;
}

// --- Capabilities ------------------------------------------------------------
export type Capability = 'manageMembers' | 'approve' | 'manageBills' | 'viewFinances' | 'forward';

const CAPS: Record<MemberRole, Capability[]> = {
  owner: ['manageMembers', 'approve', 'manageBills', 'viewFinances', 'forward'],
  adult: ['approve', 'manageBills', 'viewFinances', 'forward'], // co-parent
  teen: [], // limited view: no finances, no execution, no management
};

export function can(role: MemberRole, cap: Capability): boolean {
  return CAPS[role].includes(cap);
}

export function capabilitiesFor(role: MemberRole): Capability[] {
  return CAPS[role];
}
