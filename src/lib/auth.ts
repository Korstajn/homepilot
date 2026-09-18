import { cache } from 'react';
import { cookies } from 'next/headers';
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'crypto';
import { getDefaultHousehold, getHouseholdById, getMemberById, ownerMember } from './store';
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

/** Member id from a signed session cookie. */
function memberIdFromToken(token: string): string | null {
  const signed = verifyToken<{ m?: unknown }>(token, COOKIE_OPTS.maxAge * 1000);
  return signed && typeof signed.m === 'string' ? signed.m : null;
}

/**
 * The member this request belongs to, or null.
 *
 * The cookie carries an OPAQUE signed token — a member id and an issue time,
 * no PII — which is verified with the deployment's secret and then resolved to
 * a row.
 *
 * Wrapped in React's `cache` so that one incoming request costs ONE lookup
 * however many times it asks. A typical route calls `currentMember()` for the
 * permission check and `resolveHousehold()` for the data, and both used to be
 * free; against a database they are round trips, and doing the same one four
 * times per request is exactly the waste that shows up as latency under load.
 * The cache is scoped to a single request — it is not a cross-request cache and
 * cannot serve one household's member to another.
 */
export const currentMember = cache(async (): Promise<Member | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const memberId = memberIdFromToken(token);
  if (!memberId) return null;
  const m = await getMemberById(memberId);
  return m && m.status === 'active' ? m : null;
});

export type SessionState =
  | 'none' // no cookie: a visitor, or the demo
  | 'active' // a cookie that resolves to a live member
  | 'stale'; // a cookie WE signed, pointing at a member this instance lacks

/**
 * Tell a genuinely-absent session apart from one that no longer resolves.
 *
 * 'stale' means a cookie WE signed points at a member that is not there any
 * more — the account was deleted, or the member was removed from the household.
 * It matters because the UI must say "log in again" rather than quietly falling
 * back to the demo household and showing someone else's bills as if they were
 * theirs.
 */
export async function sessionState(): Promise<SessionState> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return 'none';
  if (await currentMember()) return 'active';
  return verifyToken<{ m?: unknown }>(token, COOKIE_OPTS.maxAge * 1000) ? 'stale' : 'none';
}

/** The session's member, falling back to the demo household's owner. */
export const resolveMember = cache(async (): Promise<Member> => {
  const m = await currentMember();
  if (m) return m;
  const demo = await getDefaultHousehold();
  const owner = await ownerMember(demo.id);
  if (!owner) throw new Error('The demo household has no owner member.');
  return owner;
});

/** The household for this request, resolved through its member. */
export const resolveHousehold = cache(async (): Promise<Household> => {
  const m = await resolveMember();
  return (await getHouseholdById(m.householdId)) ?? getDefaultHousehold();
});

/**
 * Member and household together, in one place.
 *
 * Almost every route needs both, and asking for them separately is two awaits
 * where one would do. `currentMember` is cached per request, so the member half
 * is free once either has been asked for.
 */
export async function resolveSession(): Promise<{ member: Member; household: Household }> {
  const member = await resolveMember();
  const household = (await getHouseholdById(member.householdId)) ?? (await getDefaultHousehold());
  return { member, household };
}

/**
 * The session a WRITE requires.
 *
 * `resolveMember` falls back to the demo household's owner, which is right for
 * reading — the marketing site links straight into /app and a visitor should
 * see a working product. It is wrong for writing, and it became dangerous the
 * day the store stopped being per-instance memory: with one shared database,
 * an anonymous caller falling back to the demo owner can add bills to the demo
 * household, invite members to it, rotate its calendar token, or erase it — and
 * every other visitor sees the result.
 *
 * So writes go through here instead. Null means "no real session", and the
 * route answers 401 rather than mutating somebody else's data.
 */
export async function writeSession(): Promise<{ member: Member; household: Household } | null> {
  const member = await currentMember();
  if (!member) return null;
  const household = await getHouseholdById(member.householdId);
  return household ? { member, household } : null;
}

// Is there a real (non-fallback) logged-in session?
export async function currentSessionHouseholdId(): Promise<string | null> {
  const m = await currentMember();
  return m ? m.householdId : null;
}

// --- Capabilities ------------------------------------------------------------
export type Capability =
  | 'manageMembers'
  | 'approve'
  | 'manageBills'
  | 'viewFinances'
  // The family calendar is shared property. Adding your own football practice
  // is not a financial act, and gating it on `viewFinances` — as the calendar
  // routes did — meant a teen could not put anything in the household calendar
  // at all, in a product whose whole promise is the household in one place.
  | 'manageCalendar'
  | 'forward';

const CAPS: Record<MemberRole, Capability[]> = {
  owner: ['manageMembers', 'approve', 'manageBills', 'viewFinances', 'manageCalendar', 'forward'],
  adult: ['approve', 'manageBills', 'viewFinances', 'manageCalendar', 'forward'], // co-parent
  teen: ['manageCalendar'], // limited view: no finances, no execution, no management
};

export function can(role: MemberRole, cap: Capability): boolean {
  return CAPS[role].includes(cap);
}

export function capabilitiesFor(role: MemberRole): Capability[] {
  return CAPS[role];
}
