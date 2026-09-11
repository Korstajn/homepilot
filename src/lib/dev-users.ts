/**
 * Deterministic test users, configured entirely from environment variables.
 *
 * The problem this solves: `/api/auth/signup` creates a household in one
 * serverless instance's memory, so the account is gone as soon as a request
 * lands on another instance. Real sign-up needs the Postgres swap
 * (`db/schema.sql`) to work properly.
 *
 * Test users dodge that entirely by being *derived* rather than stored. Every
 * instance computes the same household id, member id and subject id from the
 * same email, so an account seeded on one instance is byte-identical to the one
 * seeded on the next. Combined with the signed session cookie in
 * `src/lib/secrets.ts`, logging in as a test user works across any number of
 * instances with no database at all.
 *
 * Configuration:
 *   GIGI_DEV_PASSWORD  the shared password. UNSET ⇒ no test users exist at all.
 *                      There is deliberately no default: a hardcoded password
 *                      on a deployed build is a back door.
 *   GIGI_DEV_USERS     optional. "email:Name, email:Name". Defaults to two
 *                      accounts on example.com (RFC 2606 — can never be a real
 *                      mailbox, so nothing is sent anywhere by accident).
 *
 * These are ordinary owner accounts with empty registers, not demo accounts:
 * no seeded bills, no seeded calendar. That is the point — you are testing what
 * a real new household sees. `/api/auth/demo` still gives you the rich
 * pre-filled household.
 */

import { createHash, scryptSync } from 'crypto';

export interface DevUserSpec {
  email: string;
  name: string;
}

const DEFAULT_USERS: DevUserSpec[] = [
  { email: 'tester1@example.com', name: 'Alex' },
  { email: 'tester2@example.com', name: 'Sam' },
];

/** The shared test password, or null when the feature is off. */
export function devPassword(): string | null {
  const raw = process.env.GIGI_DEV_PASSWORD?.trim();
  return raw ? raw : null;
}

export function devUsersEnabled(): boolean {
  return devPassword() !== null;
}

/**
 * Parse GIGI_DEV_USERS. Split on the FIRST colon only, so a name may contain
 * one. Entries without a name get one from the address' local part.
 */
export function devUserSpecs(): DevUserSpec[] {
  if (!devUsersEnabled()) return [];

  const raw = process.env.GIGI_DEV_USERS?.trim();
  if (!raw) return DEFAULT_USERS;

  const seen = new Set<string>();
  const specs: DevUserSpec[] = [];
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    const email = (colon === -1 ? trimmed : trimmed.slice(0, colon)).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);

    const given = colon === -1 ? '' : trimmed.slice(colon + 1).trim();
    const fallback = email.split('@')[0].replace(/[._-]+/g, ' ');
    specs.push({ email, name: given || fallback.charAt(0).toUpperCase() + fallback.slice(1) });
  }
  return specs.length ? specs : DEFAULT_USERS;
}

/**
 * Ids derived from the email, so they are identical in every instance and
 * across restarts. `hh_dev_*` / `mem_dev_*` also make a test account obvious in
 * a log line without exposing the address.
 */
export function devIds(email: string): { householdId: string; memberId: string; subjectId: string } {
  const key = email.trim().toLowerCase();
  const digest = (tag: string) =>
    createHash('sha256').update(`gigi-dev-v1:${tag}:${key}`).digest('hex').slice(0, 12);
  return {
    householdId: `hh_dev_${digest('household')}`,
    memberId: `mem_dev_${digest('member')}`,
    subjectId: `subj_dev_${digest('subject')}`,
  };
}

/**
 * The stored password hash, in the same "salt:scryptHex" format
 * `verifyPassword()` expects. The salt is derived from the email rather than
 * random so the hash is stable across instances — every instance must arrive at
 * the same identity record, and a per-instance random salt would still verify
 * but would make the seeded data non-deterministic for no benefit.
 */
export function devPasswordHash(email: string, password: string): string {
  const salt = createHash('sha256').update(`gigi-dev-salt-v1:${email.trim().toLowerCase()}`).digest('hex').slice(0, 32);
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

/**
 * The ICS-feed token for a test household.
 *
 * It has to be stable across instances or the calendar subscription breaks on
 * every restart, so it is derived rather than random — but it is derived from
 * the SECRET dev password, not from the email or the household id. Those are
 * guessable, and this token is a capability URL: anyone holding it can read the
 * household's calendar feed without a session.
 */
export function devCalendarToken(email: string, password: string): string {
  const digest = createHash('sha256')
    .update(`gigi-dev-cal-v1:${password}:${email.trim().toLowerCase()}`)
    .digest('hex');
  return `cal_dev_${digest.slice(0, 24)}`;
}

export function isDevHousehold(householdId: string): boolean {
  return householdId.startsWith('hh_dev_');
}
