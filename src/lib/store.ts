// The data store — every read and write GiGi makes, against Postgres.
//
// This module used to be a module-level JavaScript object. That was a correct
// choice for a single long-lived Node process and a silent data-loss bug on
// Vercel, where every serverless instance has its own memory: a household
// created by one request was invisible to the next, and a redeploy erased
// everything. The API surface here is deliberately unchanged from that version
// — same names, same shapes — so the rest of the app reads the same. What
// changed is that every function is now async, because a network round trip
// cannot be hidden behind a synchronous signature without lying about it.
//
// Three rules hold throughout:
//
//   1. EVERY QUERY IS SCOPED TO A HOUSEHOLD. Not "filtered in JavaScript after
//      fetching" — scoped in the WHERE clause, so a bug cannot return someone
//      else's row and an index can serve the query.
//   2. NO N+1. A caller that needs bills and children and events gets them in
//      one round trip (`householdBundle`), not three awaits in a row. On a
//      serverless function talking to a pooler, latency is the cost that
//      matters and it is paid per round trip.
//   3. THE TRUST LOG IS APPEND-ONLY UNDER CONCURRENCY. Its hash chain is built
//      inside a transaction holding a per-household advisory lock, so two
//      requests writing at the same moment cannot both chain off the same
//      predecessor and silently break the chain the user is shown as proof.

import { createHash, randomBytes } from 'crypto';
import type {
  ActionLog,
  AnalyticsEvent,
  Bill,
  BillEvidence,
  BillingPeriod,
  BillType,
  CalendarEvent,
  Child,
  ContactMessage,
  Currency,
  Digest,
  DigestItem,
  Feedback,
  FieldEvidence,
  Household,
  Identity,
  Market,
  Member,
  MemberRole,
  ProcessingAction,
  ProcessingActor,
  ProcessingEvent,
  WaitlistEntry,
} from './types';
import { db, type Sql } from './db';
import { buildDigest } from './digest';
import { buildCalendar, findCalendarEvent } from './calendar';
import { DEFAULT_HANDED_OVER } from './handover';
import { cachedForecast } from './weather';
import { devCalendarToken, devIds, devPassword, devPasswordHash, devUserSpecs } from './dev-users';

export const DEMO_HOUSEHOLD_ID = 'hh_demo';

// --- Ids, time, coercion -------------------------------------------------------

/**
 * A prefixed, random id.
 *
 * 72 bits of randomness rather than the 41 the in-memory build used
 * (`Math.random().toString(36).slice(2, 10)`). That was fine for one process
 * and one tester; at a million rows a 41-bit id has a real chance of colliding,
 * and a collision here surfaces as a failed insert in front of a user. The
 * prefix stays because `bill_9f3c…` in a log line or a URL tells you what you
 * are looking at, which a bare uuid never does.
 */
function id(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('hex')}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isoDate(daysFromNow = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/** A timestamptz column as an ISO string. */
function ts(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value == null ? nowIso() : String(value);
}

/**
 * A `date` column as 'YYYY-MM-DD'.
 *
 * postgres.js parses a date into a Date at UTC midnight, so slicing the ISO
 * string is exact — no timezone can move it onto the previous day, which is the
 * classic way a renewal date drifts by one.
 */
function day(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** A `numeric` column, which the driver hands back as a string to keep precision. */
function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Drop a key rather than carry `null`, so optional fields match src/lib/types.ts. */
function opt<T>(value: T | null | undefined): T | undefined {
  return value == null ? undefined : value;
}

/**
 * A value bound as jsonb.
 *
 * The driver's own JSON type is narrower than the domain types here (evidence
 * carries unions, digest items carry optional fields), and widening every one
 * of those to satisfy it would be changing the model to please the plumbing.
 * The cast is confined to this one function so it is auditable: everything
 * passed in is a plain object this codebase built, never user input reflected
 * straight through.
 */
function json(value: unknown): Parameters<Sql['json']>[0] {
  return value as Parameters<Sql['json']>[0];
}

// --- Connection + one-time seeding ---------------------------------------------

const g = globalThis as unknown as { __gigiSeeded?: Promise<void> };

/**
 * A migrated, seeded connection. Every exported function starts here.
 *
 * The seed check costs one indexed lookup per cold instance, not per request:
 * the promise is memoised on globalThis, which survives both a warm lambda and
 * a dev hot reload.
 */
async function conn(): Promise<Sql> {
  const client = await db();
  if (!g.__gigiSeeded) {
    g.__gigiSeeded = seedIfEmpty(client).catch((e) => {
      g.__gigiSeeded = undefined;
      throw e;
    });
  }
  await g.__gigiSeeded;
  return client;
}

/** Advisory lock key for the seed, so a cold deploy's ten instances seed once. */
const SEED_LOCK_KEY = 4_071_985_212;

async function seedIfEmpty(client: Sql): Promise<void> {
  const [demo] = await client<{ id: string }[]>`
    select id from households where id = ${DEMO_HOUSEHOLD_ID}
  `;
  const specs = devUserSpecs();
  if (demo && specs.length === 0) return;

  // The lock is held on one reserved connection — a session-level advisory lock
  // must be released by the session that took it — while the seeding itself
  // runs on the pool. Every instance that boots queues on the same key, so a
  // deploy that starts ten lambdas at once seeds exactly once.
  const held = await client.reserve();
  try {
    await held`select pg_advisory_lock(${SEED_LOCK_KEY})`;
    await seedDemoHousehold(client);
    await seedDevUsers(client);
  } finally {
    await held`select pg_advisory_unlock(${SEED_LOCK_KEY})`;
    held.release();
  }
}

// --- Row mappers ---------------------------------------------------------------
//
// One mapper per table, and nothing else converts a row. A field read two
// different ways in two places is how "amount" ends up a string on one screen
// and a number on another.

/* eslint-disable @typescript-eslint/no-explicit-any */

function toHousehold(r: any): Household {
  return {
    id: r.id,
    ownerName: r.owner_name,
    email: r.email ?? '',
    passwordHash: opt(r.password_hash),
    market: r.market as Market,
    currency: r.currency as Currency,
    timezone: r.timezone,
    adults: r.adults,
    children: r.children,
    postcode: r.postcode ?? '',
    forwardingAddress: r.forwarding_address,
    connectionStatus: r.connection_status,
    digestTime: r.digest_time,
    digestPaused: r.digest_paused,
    handedOver: r.handed_over ?? [],
    calendarToken: opt(r.calendar_token),
    createdAt: ts(r.created_at),
  };
}

function toMember(r: any): Member {
  return {
    id: r.id,
    householdId: r.household_id,
    name: r.name,
    role: r.role as MemberRole,
    status: r.status,
    subjectId: r.subject_id,
    inviteToken: opt(r.invite_token),
    createdAt: ts(r.created_at),
  };
}

function toIdentity(r: any): Identity {
  return {
    subjectId: r.subject_id,
    email: opt(r.email),
    passwordHash: opt(r.password_hash),
    recoveryHash: opt(r.recovery_hash),
    createdAt: ts(r.created_at),
  };
}

function toChild(r: any): Child {
  return {
    id: r.id,
    householdId: r.household_id,
    name: r.name,
    yearGroup: opt(r.year_group),
    passportExpiry: opt(day(r.passport_expiry)),
    createdAt: ts(r.created_at),
  };
}

function toCalendarEvent(r: any): CalendarEvent {
  return {
    id: r.id,
    householdId: r.household_id,
    summary: r.summary,
    description: opt(r.description),
    location: opt(r.location),
    category: r.category,
    start: r.start_at,
    end: opt(r.end_at),
    allDay: r.all_day,
    tzid: opt(r.tzid),
    rrule: opt(r.rrule),
    alarmMinutesBefore: opt(r.alarm_minutes_before),
    source: r.source,
    relatedChildId: opt(r.related_child_id),
    sourceRef: opt(r.source_ref),
    evidence: opt(r.evidence as FieldEvidence),
    createdAt: ts(r.created_at),
    updatedAt: opt(r.updated_at ? ts(r.updated_at) : undefined),
  };
}

function toBill(r: any): Bill {
  return {
    id: r.id,
    householdId: r.household_id,
    provider: r.provider,
    type: r.type as BillType,
    amount: num(r.amount),
    sourceAmount: r.source_amount == null ? undefined : num(r.source_amount),
    currency: r.currency as Currency,
    renewalDate: day(r.renewal_date),
    billingPeriod: opt(r.billing_period as BillingPeriod),
    paymentDueDate: r.payment_due_date == null ? undefined : day(r.payment_due_date),
    evidence: opt(r.evidence as BillEvidence),
    priceIncreaseFlag: r.price_increase_flag,
    source: r.source,
    sourceRef: opt(r.source_ref),
    confirmed: r.confirmed,
    createdAt: ts(r.created_at),
  };
}

function toDigest(r: any): Digest {
  return {
    id: r.id,
    householdId: r.household_id,
    date: day(r.digest_date)!,
    items: (r.items ?? []) as DigestItem[],
    overflow: (r.overflow ?? []) as DigestItem[],
    quietLine: opt(r.quiet_line),
    delivered: r.delivered,
    openedAt: opt(r.opened_at ? ts(r.opened_at) : undefined),
    createdAt: ts(r.created_at),
  };
}

function toActionLog(r: any): ActionLog {
  return {
    id: r.id,
    householdId: r.household_id,
    itemId: r.item_id,
    action: r.action,
    outcome: r.outcome,
    savingAnnual: r.saving_annual == null ? undefined : num(r.saving_annual)!,
    createdAt: ts(r.created_at),
  };
}

function toProcessingEvent(r: any): ProcessingEvent {
  return {
    id: r.id,
    householdId: r.household_id,
    at: ts(r.at),
    action: r.action as ProcessingAction,
    category: r.category,
    actor: r.actor as ProcessingActor,
    detail: r.detail,
    purpose: r.purpose,
    legalBasis: r.legal_basis,
    region: r.region,
    durationMs: opt(r.duration_ms),
    prevHash: r.prev_hash,
    hash: r.hash,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// --- Households ---------------------------------------------------------------

export async function getHousehold(householdId: string): Promise<Household | undefined> {
  return getHouseholdById(householdId);
}

async function householdRow(sql: Sql, householdId: string): Promise<Household | undefined> {
  const [row] = await sql`select * from households where id = ${householdId}`;
  return row ? toHousehold(row) : undefined;
}

export async function getHouseholdById(householdId: string): Promise<Household | undefined> {
  return householdRow(await conn(), householdId);
}

/** The demo household, which every deployment has and which seeding guarantees. */
export async function getDefaultHousehold(): Promise<Household> {
  const hh = await getHouseholdById(DEMO_HOUSEHOLD_ID);
  if (hh) return hh;
  // Only reachable if someone deleted the demo row by hand. Re-create it rather
  // than throwing from the fallback path that half the app relies on.
  const sql = await conn();
  await seedDemoHousehold(sql);
  const again = await getHouseholdById(DEMO_HOUSEHOLD_ID);
  if (!again) throw new Error('The demo household could not be created.');
  return again;
}

export async function findHouseholdByEmail(email: string): Promise<Household | undefined> {
  const sql = await conn();
  const [row] = await sql`
    select * from households where lower(email) = ${email.trim().toLowerCase()} limit 1
  `;
  return row ? toHousehold(row) : undefined;
}

/**
 * Route an inbound (forwarded) email to a household.
 *
 * Best-effort by design, in this order:
 *   1) the recipient carries a household's forwarding local-part or its id;
 *   2) the sender is a household's own address, or a login address in the vault;
 *   3) exactly one real (non-demo) household exists — a single tester's
 *      deployment, where plus-addressing is friction for no benefit;
 *   4) the demo household.
 */
export async function resolveInboundHousehold(
  recipient?: string,
  sender?: string,
): Promise<Household> {
  const sql = await conn();
  const rcpt = (recipient ?? '').toLowerCase();

  if (rcpt) {
    // Matching in SQL rather than by scanning every household in JavaScript:
    // the local part is the left of '@', and `position` is an index-free but
    // bounded check against a table that stays small per deployment.
    const [row] = await sql`
      select * from households
      where position(lower(split_part(forwarding_address, '@', 1)) in ${rcpt}) > 0
         or position(lower(id) in ${rcpt}) > 0
      limit 1
    `;
    if (row) return toHousehold(row);
  }

  if (sender) {
    const addr = sender.replace(/.*</, '').replace(/>.*/, '').trim().toLowerCase();
    if (addr) {
      const [row] = await sql`
        select h.* from households h where lower(h.email) = ${addr}
        union all
        select h.* from households h
          join members m on m.household_id = h.id and m.status = 'active'
          join identities i on i.subject_id = m.subject_id
        where lower(i.email) = ${addr}
        limit 1
      `;
      if (row) return toHousehold(row);
    }
  }

  const real = await sql`
    select * from households where id <> ${DEMO_HOUSEHOLD_ID} limit 2
  `;
  if (real.length === 1) return toHousehold(real[0]);
  return getDefaultHousehold();
}

/**
 * Market for a brand-new household. GIGI_DEFAULT_MARKET is the documented
 * switch (.env.example, docs/DECISIONS.md §2).
 */
function defaultMarket(): { market: Market; currency: Currency; timezone: string } {
  const market: Market =
    process.env.GIGI_DEFAULT_MARKET?.trim().toLowerCase() === 'se' ? 'se' : 'uk';
  return market === 'se'
    ? { market, currency: 'SEK', timezone: 'Europe/Stockholm' }
    : { market, currency: 'GBP', timezone: 'Europe/London' };
}

/**
 * A forwarding address nobody else has.
 *
 * The column is unique, so a clash is a failed sign-up rather than a mix-up —
 * but two people called `anna@` on different domains is ordinary, not
 * exceptional, so the suffix is found before the insert rather than after a
 * constraint violation.
 */
async function freeForwardingAddress(sql: Sql, localPart: string): Promise<string> {
  const base = (localPart || 'household').replace(/[^a-z0-9]/gi, '.').toLowerCase();
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? `${base}@in.getgigiapp.com` : `${base}.${n}@in.getgigiapp.com`;
    const [taken] = await sql`
      select 1 from households where lower(forwarding_address) = ${candidate} limit 1
    `;
    if (!taken) return candidate;
  }
  return `${base}.${randomBytes(3).toString('hex')}@in.getgigiapp.com`;
}

/**
 * Create a household on sign-up, with its owner and vault identity.
 *
 * One transaction: a household without its owner member, or an owner without a
 * vault entry, is an account nobody can log into. The two example "found" bills
 * are part of it — the bills-found onboarding screen has nothing to confirm
 * without them.
 */
export async function createHousehold(input: {
  ownerName: string;
  email?: string;
  passwordHash: string;
  recoveryHash: string;
}): Promise<{ household: Household; member: Member }> {
  const sql = await conn();
  const hid = id('hh');
  const email = input.email?.trim() ?? '';
  const forwarding = await freeForwardingAddress(sql, email ? email.split('@')[0] : hid);
  const { market, currency, timezone } = defaultMarket();
  const subjectId = id('subj');
  const memberId = id('mem');

  const { household, member } = await sql.begin(async (tx) => {
    const [hRow] = await tx`
      insert into households (
        id, owner_name, email, market, currency, timezone, adults, children,
        postcode, forwarding_address, connection_status, digest_time,
        digest_paused, handed_over, calendar_token
      ) values (
        ${hid}, ${input.ownerName || 'there'}, ${email}, ${market}, ${currency}, ${timezone},
        '2', '1-2', '', ${forwarding}, 'pending', '07:00', false,
        ${sql.array([...DEFAULT_HANDED_OVER])}, ${'cal_' + randomBytes(12).toString('hex')}
      )
      returning *
    `;

    await tx`
      insert into identities (subject_id, email, password_hash, recovery_hash)
      values (${subjectId}, ${email || null}, ${input.passwordHash}, ${input.recoveryHash})
    `;

    const [mRow] = await tx`
      insert into members (id, household_id, name, role, status, subject_id)
      values (${memberId}, ${hid}, ${input.ownerName || 'there'}, 'owner', 'active', ${subjectId})
      returning *
    `;

    // Two example bills so onboarding has something to act on. One deliberately
    // has no amount: null over guessing is the behaviour to show, not hide.
    await tx`
      insert into bills (id, household_id, provider, type, amount, currency, renewal_date,
                         price_increase_flag, source, confirmed)
      values
        (${id('bill')}, ${hid}, 'Virgin Media', 'broadband', 59, ${currency}, ${isoDate(18)}, true, 'extracted', false),
        (${id('bill')}, ${hid}, 'British Gas', 'energy', null, ${currency}, ${isoDate(40)}, false, 'extracted', false)
    `;

    return { household: toHousehold(hRow), member: toMember(mRow) };
  });

  const bills = await listBills(hid);
  await saveDigest(sql, buildDigest(household, bills, []));
  await track('household_created', hid);
  await logProcessing(
    hid,
    'account_created',
    'account',
    'you',
    'You created your household',
    'Set up your account',
    'Contract (providing the service)',
  );

  return { household, member };
}

export async function updateHousehold(
  householdId: string,
  patch: Partial<Household>,
): Promise<Household | undefined> {
  const sql = await conn();
  const [row] = await sql`
    update households set
      owner_name        = coalesce(${patch.ownerName ?? null}, owner_name),
      email             = coalesce(${patch.email ?? null}, email),
      market            = coalesce(${patch.market ?? null}, market),
      currency          = coalesce(${patch.currency ?? null}, currency),
      timezone          = coalesce(${patch.timezone ?? null}, timezone),
      adults            = coalesce(${patch.adults ?? null}, adults),
      children          = coalesce(${patch.children ?? null}, children),
      -- Deliberately not coalesced: clearing a postcode is a real edit, and a
      -- household that removes theirs must stop being geocoded.
      postcode          = ${patch.postcode === undefined ? sql`postcode` : patch.postcode},
      connection_status = coalesce(${patch.connectionStatus ?? null}, connection_status),
      digest_time       = coalesce(${patch.digestTime ?? null}, digest_time),
      digest_paused     = coalesce(${patch.digestPaused ?? null}, digest_paused),
      handed_over       = coalesce(${patch.handedOver ? sql.array(patch.handedOver) : null}, handed_over),
      calendar_token    = coalesce(${patch.calendarToken ?? null}, calendar_token)
    where id = ${householdId}
    returning *
  `;
  return row ? toHousehold(row) : undefined;
}

// --- Identity vault + sessions -------------------------------------------------

export async function getIdentity(subjectId: string): Promise<Identity | undefined> {
  const sql = await conn();
  const [row] = await sql`select * from identities where subject_id = ${subjectId}`;
  return row ? toIdentity(row) : undefined;
}

export async function findIdentityByEmail(email: string): Promise<Identity | undefined> {
  const sql = await conn();
  const [row] = await sql`
    select * from identities where lower(email) = ${email.trim().toLowerCase()} limit 1
  `;
  return row ? toIdentity(row) : undefined;
}

export async function findIdentityByRecoveryHash(
  recoveryHash: string,
): Promise<Identity | undefined> {
  const sql = await conn();
  const [row] = await sql`
    select * from identities where recovery_hash = ${recoveryHash} limit 1
  `;
  return row ? toIdentity(row) : undefined;
}

export async function memberForSubject(subjectId: string): Promise<Member | undefined> {
  const sql = await conn();
  const [row] = await sql`
    select * from members where subject_id = ${subjectId} and status = 'active' limit 1
  `;
  return row ? toMember(row) : undefined;
}

/** Name for display plus the email from the vault. The API layer only. */
export async function displayFor(member: Member): Promise<{ name: string; email?: string }> {
  const identity = await getIdentity(member.subjectId);
  return { name: member.name, email: identity?.email };
}

/**
 * Sessions are signed tokens, not rows.
 *
 * `src/lib/auth.ts` mints a signed token carrying an opaque member id and an
 * issue time, and verifies it with the deployment's secret. That is a
 * deliberate choice over a sessions table: it costs zero queries on every
 * single authenticated request, which is the hottest path in the app, and it
 * cannot be the thing that breaks when the database is briefly slow.
 *
 * The trade-off, stated plainly: a signed token cannot be revoked server-side
 * before it expires. Logging out clears the cookie, which ends the session on
 * that device; it does not invalidate a token someone copied out of it first.
 * Revocation needs a token version on the member row, checked per request — one
 * indexed lookup — and it is the right next step when accounts can be shared or
 * stolen. It is not needed for a closed beta and is not worth a query per
 * request until then.
 */
export function memberIdForSession(_token: string): undefined {
  return undefined;
}

// --- Members -------------------------------------------------------------------

export async function listMembers(householdId: string): Promise<Member[]> {
  const sql = await conn();
  const rows = await sql`
    select * from members where household_id = ${householdId} order by created_at
  `;
  return rows.map(toMember);
}

/**
 * The household's members WITH the email each one logs in with.
 *
 * One join rather than a `displayFor` call per member. The family screen listed
 * five people and made six queries; the number of people in a household is
 * small, but "small × every page load × every household" is exactly the kind of
 * N+1 that looks free in development and is the whole latency budget in
 * production.
 */
export async function listMembersWithEmail(
  householdId: string,
): Promise<Array<Member & { email: string | null }>> {
  const sql = await conn();
  const rows = await sql`
    select m.*, i.email as login_email
    from members m
      join identities i on i.subject_id = m.subject_id
    where m.household_id = ${householdId}
    order by m.created_at
  `;
  return rows.map((r) => ({ ...toMember(r), email: r.login_email ?? null }));
}

export async function getMemberById(memberId: string): Promise<Member | undefined> {
  const sql = await conn();
  const [row] = await sql`select * from members where id = ${memberId}`;
  return row ? toMember(row) : undefined;
}

export async function findMemberByEmail(email: string): Promise<Member | undefined> {
  const sql = await conn();
  const [row] = await sql`
    select m.* from members m
      join identities i on i.subject_id = m.subject_id
    where lower(i.email) = ${email.trim().toLowerCase()} and m.status = 'active'
    limit 1
  `;
  return row ? toMember(row) : undefined;
}

export async function ownerMember(householdId: string): Promise<Member | undefined> {
  const sql = await conn();
  const [row] = await sql`
    select * from members where household_id = ${householdId} and role = 'owner' limit 1
  `;
  return row ? toMember(row) : undefined;
}

/** Invite an adult co-parent or a teen. A pending vault entry holds their email. */
export async function inviteMember(
  householdId: string,
  name: string,
  email: string,
  role: MemberRole,
): Promise<Member> {
  const sql = await conn();
  const subjectId = id('subj');
  // Never a second owner: the household has exactly one, enforced by a partial
  // unique index as well as here.
  const effectiveRole: MemberRole = role === 'owner' ? 'adult' : role;
  const inviteToken = id('inv') + randomBytes(9).toString('hex');

  const [row] = await sql.begin(async (tx) => {
    await tx`insert into identities (subject_id, email) values (${subjectId}, ${email.trim()})`;
    return tx`
      insert into members (id, household_id, name, role, status, subject_id, invite_token)
      values (${id('mem')}, ${householdId}, ${name}, ${effectiveRole}, 'invited', ${subjectId}, ${inviteToken})
      returning *
    `;
  });

  const member = toMember(row);
  await logProcessing(
    householdId,
    'member_invited',
    'account',
    'you',
    `You invited ${name} to your household as ${member.role}`,
    'Add a family member',
    'Consent',
  );
  return member;
}

export async function getMemberByInvite(token: string): Promise<Member | undefined> {
  if (!token) return undefined;
  const sql = await conn();
  const [row] = await sql`
    select * from members where invite_token = ${token} and status = 'invited' limit 1
  `;
  return row ? toMember(row) : undefined;
}

/** Accept an invite: set the name, put the secrets in the vault, activate. */
export async function activateMember(
  token: string,
  name: string,
  passwordHash: string,
  recoveryHash: string,
): Promise<Member | undefined> {
  const sql = await conn();
  const rows = await sql.begin(async (tx) => {
    // The whole activation is one transaction under a row lock: two taps on the
    // same invite link must not both succeed and mint two members.
    const [existing] = await tx`
      select * from members where invite_token = ${token} and status = 'invited'
      for update
    `;
    if (!existing) return [];
    await tx`
      update identities set password_hash = ${passwordHash}, recovery_hash = ${recoveryHash}
      where subject_id = ${existing.subject_id}
    `;
    return tx`
      update members set name = ${name || existing.name}, status = 'active', invite_token = null
      where id = ${existing.id}
      returning *
    `;
  });

  if (rows.length === 0) return undefined;
  const member = toMember(rows[0]);
  await logProcessing(
    member.householdId,
    'member_joined',
    'account',
    'you',
    `${member.name} joined your household`,
    'A family member accepted their invite',
    'Consent',
  );
  return member;
}

export async function removeMember(householdId: string, memberId: string): Promise<boolean> {
  const sql = await conn();
  // The owner is never removable — deleting them would orphan the household.
  // Deleting the identity cascades to the member row, so the vault entry can
  // never outlive the person it belonged to.
  const rows = await sql`
    delete from identities
    where subject_id = (
      select subject_id from members
      where id = ${memberId} and household_id = ${householdId} and role <> 'owner'
    )
    returning subject_id
  `;
  if (rows.length === 0) return false;
  await logProcessing(
    householdId,
    'member_removed',
    'account',
    'you',
    'You removed a member from your household',
    'Manage who can access your household',
    'Consent',
  );
  return true;
}

// --- Calendar ------------------------------------------------------------------

export async function listManualEvents(householdId: string): Promise<CalendarEvent[]> {
  const sql = await conn();
  const rows = await sql`
    select * from calendar_events where household_id = ${householdId} order by start_at
  `;
  return rows.map(toCalendarEvent);
}

export async function addCalendarEvent(
  input: Omit<CalendarEvent, 'id' | 'createdAt' | 'source'>,
): Promise<CalendarEvent> {
  const sql = await conn();
  const [row] = await sql`
    insert into calendar_events (
      id, household_id, summary, description, location, category, start_at, end_at,
      all_day, tzid, rrule, alarm_minutes_before, source, related_child_id, source_ref, evidence
    ) values (
      ${'cal_' + randomBytes(9).toString('hex')}, ${input.householdId}, ${input.summary},
      ${input.description ?? null}, ${input.location ?? null}, ${input.category},
      ${input.start}, ${input.end ?? null}, ${input.allDay}, ${input.tzid ?? null},
      ${input.rrule ?? null}, ${input.alarmMinutesBefore ?? null}, 'manual',
      ${input.relatedChildId ?? null}, ${input.sourceRef ?? null},
      ${input.evidence ? sql.json(json(input.evidence)) : null}
    )
    -- A re-scan of the same email must not create the same event twice. The
    -- partial unique index makes that a database guarantee rather than a check
    -- the caller might forget; returning nothing tells us it was a duplicate.
    on conflict (household_id, source_ref) where source_ref is not null do nothing
    returning *
  `;
  if (row) return toCalendarEvent(row);

  const [existing] = await sql`
    select * from calendar_events
    where household_id = ${input.householdId} and source_ref = ${input.sourceRef ?? null}
    limit 1
  `;
  return toCalendarEvent(existing);
}

/**
 * Edit a manual event. Derived events are projections of a bill or a child, so
 * they are not editable here — changing one would drift from the record it came
 * from, and the next rebuild would silently undo the edit.
 */
export async function updateCalendarEvent(
  householdId: string,
  eventId: string,
  patch: Partial<Omit<CalendarEvent, 'id' | 'householdId' | 'createdAt' | 'source'>>,
): Promise<CalendarEvent | undefined> {
  const sql = await conn();
  const [row] = await sql`
    update calendar_events set
      summary              = coalesce(${patch.summary ?? null}, summary),
      description          = ${patch.description === undefined ? sql`description` : patch.description},
      location             = ${patch.location === undefined ? sql`location` : patch.location},
      category             = coalesce(${patch.category ?? null}, category),
      start_at             = coalesce(${patch.start ?? null}, start_at),
      end_at               = ${patch.end === undefined ? sql`end_at` : patch.end},
      all_day              = coalesce(${patch.allDay ?? null}, all_day),
      tzid                 = ${patch.tzid === undefined ? sql`tzid` : patch.tzid},
      alarm_minutes_before = ${patch.alarmMinutesBefore === undefined ? sql`alarm_minutes_before` : patch.alarmMinutesBefore},
      related_child_id     = ${patch.relatedChildId === undefined ? sql`related_child_id` : patch.relatedChildId},
      updated_at           = now()
    where id = ${eventId} and household_id = ${householdId}
    returning *
  `;
  return row ? toCalendarEvent(row) : undefined;
}

export async function deleteCalendarEvent(
  householdId: string,
  eventId: string,
): Promise<boolean> {
  const sql = await conn();
  const rows = await sql`
    delete from calendar_events where id = ${eventId} and household_id = ${householdId}
    returning id
  `;
  return rows.length > 0;
}

export async function getHouseholdByCalendarToken(
  token: string,
): Promise<Household | undefined> {
  if (!token) return undefined;
  const sql = await conn();
  const [row] = await sql`select * from households where calendar_token = ${token} limit 1`;
  return row ? toHousehold(row) : undefined;
}

export async function calendarToken(householdId: string): Promise<string> {
  const sql = await conn();
  const [row] = await sql`
    update households
      set calendar_token = coalesce(calendar_token, ${'cal_' + randomBytes(12).toString('hex')})
    where id = ${householdId}
    returning calendar_token
  `;
  return row?.calendar_token ?? '';
}

export async function rotateCalendarToken(householdId: string): Promise<string> {
  const sql = await conn();
  const [row] = await sql`
    update households set calendar_token = ${'cal_' + randomBytes(12).toString('hex')}
    where id = ${householdId}
    returning calendar_token
  `;
  if (!row) return '';
  await logProcessing(
    householdId,
    'calendar_shared',
    'account',
    'you',
    'You revoked the old calendar link and created a new one',
    'Stop the previous subscription from receiving your events',
    'Consent',
  );
  return row.calendar_token;
}

// --- Hand over -----------------------------------------------------------------

export async function getHandover(householdId: string): Promise<string[]> {
  const sql = await conn();
  const [row] = await sql`select handed_over from households where id = ${householdId}`;
  return row?.handed_over ?? [...DEFAULT_HANDED_OVER];
}

export async function setHandover(
  householdId: string,
  category: string,
  on: boolean,
): Promise<string[]> {
  const sql = await conn();
  // Done in SQL rather than read-modify-write so two toggles at once cannot
  // lose one another's change.
  const [row] = await sql`
    update households set handed_over = ${
      on
        ? sql`(select array(select distinct unnest(handed_over || ${sql.array([category])})))`
        : sql`array_remove(handed_over, ${category})`
    }
    where id = ${householdId}
    returning handed_over
  `;
  if (!row) return [...DEFAULT_HANDED_OVER];
  await logProcessing(
    householdId,
    'handover_changed',
    'account',
    'you',
    on
      ? `You handed "${category}" over to GiGi to run end-to-end`
      : `You took "${category}" back from GiGi`,
    'Choose what GiGi manages for you',
    'Consent',
  );
  return row.handed_over;
}

// --- Children ------------------------------------------------------------------

export async function listChildren(householdId: string): Promise<Child[]> {
  const sql = await conn();
  const rows = await sql`
    select * from children where household_id = ${householdId} order by created_at
  `;
  return rows.map(toChild);
}

export async function addChild(
  householdId: string,
  input: { name: string; yearGroup?: string; passportExpiry?: string },
): Promise<Child> {
  const sql = await conn();
  const [row] = await sql`
    insert into children (id, household_id, name, year_group, passport_expiry)
    values (${id('child')}, ${householdId}, ${input.name}, ${input.yearGroup ?? null},
            ${input.passportExpiry || null})
    returning *
  `;
  const child = toChild(row);
  await logProcessing(
    householdId,
    'child_added',
    'account',
    'you',
    `You added a child profile (${child.name})`,
    'Associate school and travel items with your child',
    'Consent (special-category data, minimised)',
  );
  return child;
}

export async function removeChild(householdId: string, childId: string): Promise<boolean> {
  const sql = await conn();
  const rows = await sql`
    delete from children where id = ${childId} and household_id = ${householdId}
    returning name
  `;
  if (rows.length === 0) return false;
  await logProcessing(
    householdId,
    'child_removed',
    'account',
    'you',
    `You removed a child profile (${rows[0].name})`,
    'Remove a child profile',
    'Consent',
  );
  return true;
}

// --- Bills ---------------------------------------------------------------------

export async function listBills(householdId: string): Promise<Bill[]> {
  const sql = await conn();
  const rows = await sql`
    select * from bills where household_id = ${householdId} order by created_at
  `;
  return rows.map(toBill);
}

export async function getBill(billId: string): Promise<Bill | undefined> {
  const sql = await conn();
  const [row] = await sql`select * from bills where id = ${billId}`;
  return row ? toBill(row) : undefined;
}

export async function addBill(input: Omit<Bill, 'id' | 'createdAt'>): Promise<Bill> {
  const sql = await conn();
  const [row] = await sql`
    insert into bills (
      id, household_id, provider, type, amount, source_amount, billing_period, currency,
      renewal_date, payment_due_date, evidence, price_increase_flag, source, source_ref, confirmed
    ) values (
      ${id('bill')}, ${input.householdId}, ${input.provider}, ${input.type},
      ${input.amount}, ${input.sourceAmount ?? null}, ${input.billingPeriod ?? null},
      ${input.currency}, ${input.renewalDate || null}, ${input.paymentDueDate || null},
      ${input.evidence ? sql.json(json(input.evidence)) : null},
      ${input.priceIncreaseFlag}, ${input.source}, ${input.sourceRef ?? null}, ${input.confirmed}
    )
    -- Importing the same Gmail message twice is a duplicate bill in front of a
    -- user, so the database refuses it rather than the caller remembering to.
    on conflict (household_id, source_ref) where source_ref is not null do nothing
    returning *
  `;
  if (row) return toBill(row);

  const [existing] = await sql`
    select * from bills
    where household_id = ${input.householdId} and source_ref = ${input.sourceRef ?? null}
    limit 1
  `;
  return toBill(existing);
}

export async function updateBill(billId: string, patch: Partial<Bill>): Promise<Bill | undefined> {
  const sql = await conn();
  const [row] = await sql`
    update bills set
      provider            = coalesce(${patch.provider ?? null}, provider),
      type                = coalesce(${patch.type ?? null}, type),
      -- Null is a value here, not an absence: "we could not read the amount"
      -- must be storable, or null-over-guessing cannot survive an edit.
      amount              = ${patch.amount === undefined ? sql`amount` : patch.amount},
      source_amount       = ${patch.sourceAmount === undefined ? sql`source_amount` : patch.sourceAmount},
      billing_period      = ${patch.billingPeriod === undefined ? sql`billing_period` : patch.billingPeriod},
      currency            = coalesce(${patch.currency ?? null}, currency),
      renewal_date        = ${patch.renewalDate === undefined ? sql`renewal_date` : patch.renewalDate || null},
      payment_due_date    = ${patch.paymentDueDate === undefined ? sql`payment_due_date` : patch.paymentDueDate || null},
      evidence            = ${patch.evidence === undefined ? sql`evidence` : patch.evidence ? sql.json(json(patch.evidence)) : null},
      price_increase_flag = coalesce(${patch.priceIncreaseFlag ?? null}, price_increase_flag),
      confirmed           = coalesce(${patch.confirmed ?? null}, confirmed)
    where id = ${billId}
    returning *
  `;
  return row ? toBill(row) : undefined;
}

export async function deleteBill(billId: string): Promise<boolean> {
  const sql = await conn();
  const rows = await sql`delete from bills where id = ${billId} returning id`;
  return rows.length > 0;
}

// --- Digests -------------------------------------------------------------------

export async function getTodayDigest(householdId: string): Promise<Digest | undefined> {
  const sql = await conn();
  const [row] = await sql`
    select * from digests where household_id = ${householdId} and digest_date = ${isoDate()}
  `;
  return row ? toDigest(row) : undefined;
}

export async function listDigests(householdId: string): Promise<Digest[]> {
  const sql = await conn();
  const rows = await sql`
    select * from digests where household_id = ${householdId}
    order by digest_date desc
    -- The history screen shows a handful; an account running for a year should
    -- not ship 365 documents to render five of them.
    limit 60
  `;
  return rows.map(toDigest);
}

async function saveDigest(sql: Sql, digest: Digest): Promise<Digest> {
  const [row] = await sql`
    insert into digests (id, household_id, digest_date, items, overflow, quiet_line, delivered, opened_at)
    values (
      ${digest.id}, ${digest.householdId}, ${digest.date},
      ${sql.json(json(digest.items))},
      ${sql.json(json(digest.overflow))},
      ${digest.quietLine ?? null}, ${digest.delivered}, ${digest.openedAt ?? null}
    )
    on conflict (household_id, digest_date) do update set
      items      = excluded.items,
      overflow   = excluded.overflow,
      quiet_line = excluded.quiet_line,
      -- A rebuild must not un-open a digest the household already read: that is
      -- the number the whole open-rate metric is built on.
      opened_at  = coalesce(digests.opened_at, excluded.opened_at)
    returning *
  `;
  return toDigest(row);
}

/**
 * Everything a household's calendar is built from, in ONE round trip.
 *
 * The calendar, the digest and the ICS feed each need bills, children and
 * manual events. Fetched one await at a time that is three round trips to the
 * pooler on every request; fetched like this it is one. On a serverless
 * function, that difference is most of the response time.
 */
async function householdBundle(
  sql: Sql,
  householdId: string,
): Promise<{ bills: Bill[]; children: Child[]; events: CalendarEvent[] }> {
  const [bills, children, events] = await Promise.all([
    sql`select * from bills where household_id = ${householdId} order by created_at`,
    sql`select * from children where household_id = ${householdId} order by created_at`,
    sql`select * from calendar_events where household_id = ${householdId} order by start_at`,
  ]);
  return {
    bills: bills.map(toBill),
    children: children.map(toChild),
    events: events.map(toCalendarEvent),
  };
}

/**
 * A household's full calendar: manual events plus everything derived from bills
 * and children. Lives here rather than in calendar.ts so that module stays free
 * of store imports — the dependency runs one way.
 */
export async function householdCalendar(
  householdId: string,
  includeFinance = true,
): Promise<CalendarEvent[]> {
  const { bills, children, events } = await householdBundle(await conn(), householdId);
  return buildCalendar({
    householdId,
    bills,
    children,
    manualEvents: events,
    includeFinance,
  });
}

/** One event by id, across the full range rather than the display window. */
export async function householdCalendarEvent(
  householdId: string,
  eventId: string,
): Promise<CalendarEvent | undefined> {
  const { bills, children, events } = await householdBundle(await conn(), householdId);
  return findCalendarEvent({ householdId, bills, children, manualEvents: events }, eventId);
}

async function rebuildDigest(sql: Sql, householdId: string): Promise<Digest | undefined> {
  const [household, bundle, actionRows] = await Promise.all([
    householdRow(sql, householdId),
    householdBundle(sql, householdId),
    sql`select * from action_logs where household_id = ${householdId} order by created_at`,
  ]);
  if (!household) return undefined;

  const calendar = buildCalendar({
    householdId,
    bills: bundle.bills,
    children: bundle.children,
    manualEvents: bundle.events,
  });
  // The forecast is read from cache, never fetched here: this is called from a
  // dozen places and a network round trip in the middle of them would make all
  // of them slower. `/api/digest` warms the cache first, so the path a user
  // actually travels has today's weather; every other path degrades to no
  // weather item, which is the same silence a household with no postcode gets.
  const weather = cachedForecast(household);

  return saveDigest(
    sql,
    buildDigest(
      household,
      bundle.bills,
      actionRows.map(toActionLog),
      calendar,
      bundle.children,
      weather,
    ),
  );
}

/** Rebuild today's digest from current state. The 02:00 job, on demand. */
export async function regenerateDigest(householdId: string): Promise<Digest | undefined> {
  return rebuildDigest(await conn(), householdId);
}

export async function markDigestOpened(householdId: string): Promise<void> {
  const sql = await conn();
  await sql`
    update digests set opened_at = now()
    where household_id = ${householdId} and digest_date = ${isoDate()} and opened_at is null
  `;
}

// --- Actions -------------------------------------------------------------------

export async function logAction(input: Omit<ActionLog, 'id' | 'createdAt'>): Promise<ActionLog> {
  const sql = await conn();
  const [row] = await sql`
    insert into action_logs (id, household_id, item_id, action, outcome, saving_annual)
    values (${id('act')}, ${input.householdId}, ${input.itemId}, ${input.action},
            ${input.outcome}, ${input.savingAnnual ?? null})
    returning *
  `;
  return toActionLog(row);
}

export async function listActions(householdId: string): Promise<ActionLog[]> {
  const sql = await conn();
  const rows = await sql`
    select * from action_logs where household_id = ${householdId} order by created_at
  `;
  return rows.map(toActionLog);
}

/**
 * Value tracker: total saved and tasks handled.
 *
 * Aggregated in the database rather than by fetching every action and reducing
 * in JavaScript. The numbers are two scalars; shipping a household's entire
 * action history across the wire to compute them is work nobody needs done.
 */
export async function valueSummary(
  householdId: string,
): Promise<{ savedAnnual: number; handled: number; currency: string }> {
  const sql = await conn();
  const [[row], household] = await Promise.all([
    sql`
      select
        coalesce(sum(saving_annual) filter (where action = 'approve'), 0) as saved,
        count(*) filter (where action in ('approve','done'))              as handled
      from action_logs where household_id = ${householdId}
    `,
    getHouseholdById(householdId),
  ]);
  return {
    savedAnnual: num(row?.saved) ?? 0,
    handled: Number(row?.handled ?? 0),
    currency: household?.currency ?? 'GBP',
  };
}

// --- Analytics -----------------------------------------------------------------

/**
 * Record one product event.
 *
 * Deliberately not awaited by most callers — instrumentation must never be the
 * reason a user's request is slower or fails, so a write that does not land is
 * swallowed here rather than thrown at a route handler that cannot do anything
 * useful about it.
 */
async function trackOn(
  sql: Sql,
  name: string,
  householdId: string | null,
  props: Record<string, unknown>,
): Promise<void> {
  await sql`
    insert into analytics_events (id, household_id, name, props)
    values (${id('evt')}, ${householdId}, ${name}, ${sql.json(json(props))})
  `;
}

export async function track(
  name: string,
  householdId: string | null,
  props: Record<string, unknown> = {},
): Promise<void> {
  try {
    await trackOn(await conn(), name, householdId, props);
  } catch (e) {
    console.error('analytics write failed:', (e as Error)?.message);
  }
}

export async function listEvents(limit = 500): Promise<AnalyticsEvent[]> {
  const sql = await conn();
  const rows = await sql`
    select * from analytics_events order by created_at desc limit ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    householdId: r.household_id ?? null,
    name: r.name,
    props: r.props ?? {},
    createdAt: ts(r.created_at),
  }));
}

// --- Feedback ------------------------------------------------------------------

export async function addFeedback(input: Omit<Feedback, 'id' | 'createdAt'>): Promise<Feedback> {
  const sql = await conn();
  const [row] = await sql`
    insert into feedback (id, household_id, kind, message, related_bill_id)
    values (${id('fb')}, ${input.householdId}, ${input.kind}, ${input.message},
            ${input.relatedBillId ?? null})
    returning *
  `;
  return {
    id: row.id,
    householdId: row.household_id ?? null,
    kind: row.kind,
    message: row.message,
    relatedBillId: opt(row.related_bill_id),
    createdAt: ts(row.created_at),
  };
}

export async function listFeedback(limit = 200): Promise<Feedback[]> {
  const sql = await conn();
  const rows = await sql`select * from feedback order by created_at desc limit ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    householdId: r.household_id ?? null,
    kind: r.kind,
    message: r.message,
    relatedBillId: opt(r.related_bill_id),
    createdAt: ts(r.created_at),
  }));
}

// --- Waitlist + contact ---------------------------------------------------------

export async function addWaitlist(
  email: string,
  segment: 'household' | 'company',
  source: string,
): Promise<WaitlistEntry> {
  const sql = await conn();
  const [row] = await sql`
    insert into waitlist (id, email, segment, source)
    values (${id('wl')}, ${email}, ${segment}, ${source})
    -- Pressing the button twice is one person, not two leads. The second press
    -- still succeeds from the user's point of view, which is what they expect.
    on conflict (lower(email), segment) do update set email = excluded.email
    returning *
  `;
  return {
    id: row.id,
    email: row.email,
    segment: row.segment,
    source: row.source,
    createdAt: ts(row.created_at),
  };
}

export async function listWaitlist(limit = 500): Promise<WaitlistEntry[]> {
  const sql = await conn();
  const rows = await sql`select * from waitlist order by created_at desc limit ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    segment: r.segment,
    source: r.source,
    createdAt: ts(r.created_at),
  }));
}

export async function addContactMessage(
  input: Omit<ContactMessage, 'id' | 'createdAt'>,
): Promise<ContactMessage> {
  const sql = await conn();
  const [row] = await sql`
    insert into contact_messages (id, name, email, message)
    values (${id('msg')}, ${input.name}, ${input.email}, ${input.message})
    returning *
  `;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    message: row.message,
    createdAt: ts(row.created_at),
  };
}

export async function listContactMessages(limit = 200): Promise<ContactMessage[]> {
  const sql = await conn();
  const rows = await sql`select * from contact_messages order by created_at desc limit ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    message: r.message,
    createdAt: ts(r.created_at),
  }));
}

// --- Trust log ------------------------------------------------------------------

/** The canonical string a hash is taken over. Order matters and must never change. */
function processingDigest(
  prevHash: string,
  e: Omit<ProcessingEvent, 'id' | 'hash' | 'prevHash'>,
): string {
  const canonical = [e.at, e.action, e.category, e.actor, e.region, e.purpose, e.legalBasis, e.detail].join('|');
  return createHash('sha256').update(`${prevHash}|${canonical}`).digest('hex');
}

/**
 * Append one entry to a household's tamper-evident log.
 *
 * `detail` must be metadata only — a provider or a category is fine, an amount
 * or an email body never is.
 *
 * The transaction and the advisory lock are the whole point. Reading the last
 * hash and inserting the next row are two statements, and between them another
 * request can insert its own row; both would then chain off the same
 * predecessor and the chain the user is shown as proof would be broken by our
 * own concurrency. `pg_advisory_xact_lock` keyed on the household serialises
 * appends for that household only — two different households never wait on each
 * other — and the lock is released when the transaction ends, including when it
 * fails.
 */
async function appendProcessing(
  sql: Sql,
  householdId: string,
  action: ProcessingAction,
  category: ProcessingEvent['category'],
  actor: ProcessingActor,
  detail: string,
  purpose: string,
  legalBasis: string,
  region: string,
  durationMs?: number,
): Promise<ProcessingEvent> {
  const at = nowIso();

  const [row] = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${householdId}))`;
    const [prev] = await tx`
      select hash from processing_events where household_id = ${householdId}
      order by seq desc limit 1
    `;
    const prevHash: string = prev?.hash ?? 'genesis';
    const hash = processingDigest(prevHash, {
      householdId, at, action, category, actor, detail, purpose, legalBasis, region, durationMs,
    });
    return tx`
      insert into processing_events (
        id, household_id, at, action, category, actor, detail, purpose,
        legal_basis, region, duration_ms, prev_hash, hash
      ) values (
        ${id('proc')}, ${householdId}, ${at}, ${action}, ${category}, ${actor}, ${detail},
        ${purpose}, ${legalBasis}, ${region}, ${durationMs ?? null}, ${prevHash}, ${hash}
      )
      returning *
    `;
  });

  return toProcessingEvent(row);
}

export async function logProcessing(
  householdId: string,
  action: ProcessingAction,
  category: ProcessingEvent['category'],
  actor: ProcessingActor,
  detail: string,
  purpose: string,
  legalBasis: string,
  region = 'EU (London)',
  durationMs?: number,
): Promise<ProcessingEvent> {
  return appendProcessing(
    await conn(), householdId, action, category, actor, detail, purpose, legalBasis, region, durationMs,
  );
}

export async function listProcessing(
  householdId: string,
  limit = 500,
): Promise<ProcessingEvent[]> {
  const sql = await conn();
  const rows = await sql`
    select * from processing_events where household_id = ${householdId}
    order by seq limit ${limit}
  `;
  return rows.map(toProcessingEvent);
}

/**
 * Recompute the chain to prove the log has not been altered or reordered.
 *
 * Ordered by `seq`, not by `at`: two entries written in the same millisecond
 * have an unambiguous order, and a clock that steps backwards cannot rewrite
 * history. Reads hashes only — the verification never needs the details.
 */
export async function verifyProcessingChain(
  householdId: string,
): Promise<{ ok: boolean; count: number }> {
  const sql = await conn();
  const rows = await sql`
    select at, action, category, actor, detail, purpose, legal_basis, region,
           duration_ms, prev_hash, hash
    from processing_events where household_id = ${householdId} order by seq
  `;
  let prev = 'genesis';
  for (const r of rows) {
    if (r.prev_hash !== prev) return { ok: false, count: rows.length };
    const expected = processingDigest(prev, {
      householdId,
      at: ts(r.at),
      action: r.action,
      category: r.category,
      actor: r.actor,
      detail: r.detail,
      purpose: r.purpose,
      legalBasis: r.legal_basis,
      region: r.region,
      durationMs: opt(r.duration_ms),
    });
    if (expected !== r.hash) return { ok: false, count: rows.length };
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}

/**
 * Right to erasure.
 *
 * Clears the household's content and every non-owner member, then records the
 * deletion as the last entry in the log — the proof that it happened is itself
 * the final thing written. The owner and the household row survive so the
 * person is left logged into an empty account rather than a 404.
 */
export async function deleteHouseholdData(householdId: string): Promise<void> {
  const sql = await conn();
  await sql.begin(async (tx) => {
    await tx`delete from bills where household_id = ${householdId}`;
    await tx`delete from digests where household_id = ${householdId}`;
    await tx`delete from action_logs where household_id = ${householdId}`;
    await tx`delete from feedback where household_id = ${householdId}`;
    await tx`delete from calendar_events where household_id = ${householdId}`;
    await tx`delete from children where household_id = ${householdId}`;
    // Deleting the identity cascades to the member, so no vault entry is left
    // behind for a person who no longer has an account.
    await tx`
      delete from identities where subject_id in (
        select subject_id from members where household_id = ${householdId} and role <> 'owner'
      )
    `;
  });
  await logProcessing(
    householdId,
    'data_deleted',
    'account',
    'you',
    'You deleted all your data — bills, digests and history were erased',
    'Your right to erasure',
    'Legal obligation (GDPR Art. 17)',
  );
}

// --- Seeding --------------------------------------------------------------------

/**
 * The demo household: the rich, pre-filled account behind /api/auth/demo and
 * every "see it working" link on the marketing site.
 *
 * Idempotent, and written as one transaction so a half-seeded demo cannot
 * exist. Dates are relative to today at seed time — a renewal "in 12 days"
 * demonstrates the product; a renewal in 2026 does not.
 */
async function seedDemoHousehold(sql: Sql): Promise<void> {
  const [existing] = await sql`select id from households where id = ${DEMO_HOUSEHOLD_ID}`;
  if (existing) return;

  await sql.begin(async (tx) => {
    await tx`
      insert into households (
        id, owner_name, email, market, currency, timezone, adults, children, postcode,
        forwarding_address, connection_status, digest_time, digest_paused, handed_over,
        calendar_token, created_at
      ) values (
        ${DEMO_HOUSEHOLD_ID}, 'Kerstin', 'demo@getgigiapp.com', 'uk', 'GBP', 'Europe/London',
        '2', '1-2', 'SW1A 1AA', 'kerstin.demo@in.getgigiapp.com', 'active', '07:00', false,
        ${tx.array([...DEFAULT_HANDED_OVER])},
        ${'cal_demo_' + randomBytes(9).toString('hex')}, now() - interval '40 days'
      )
      on conflict (id) do nothing
    `;

    await tx`
      insert into identities (subject_id, email, created_at)
      values ('subj_demo', 'demo@getgigiapp.com', now() - interval '40 days')
      on conflict (subject_id) do nothing
    `;
    await tx`
      insert into members (id, household_id, name, role, status, subject_id, created_at)
      values ('mem_demo', ${DEMO_HOUSEHOLD_ID}, 'Kerstin', 'owner', 'active', 'subj_demo',
              now() - interval '40 days')
      on conflict (id) do nothing
    `;
    await tx`
      insert into children (id, household_id, name, year_group, passport_expiry, created_at)
      values ('child_demo', ${DEMO_HOUSEHOLD_ID}, 'Ella', 'Year 4', ${isoDate(300)},
              now() - interval '40 days')
      on conflict (id) do nothing
    `;

    await tx`
      insert into bills (id, household_id, provider, type, amount, currency, renewal_date,
                         price_increase_flag, source, confirmed, created_at)
      values
        ('bill_broadband', ${DEMO_HOUSEHOLD_ID}, 'Virgin Media',  'broadband', 62,   'GBP', ${isoDate(12)}, true,  'seed',      true,  now() - interval '40 days'),
        ('bill_energy',    ${DEMO_HOUSEHOLD_ID}, 'Octopus Energy','energy',    184,  'GBP', ${isoDate(48)}, false, 'seed',      true,  now() - interval '40 days'),
        ('bill_mobile',    ${DEMO_HOUSEHOLD_ID}, 'Vodafone',      'mobile',    28,   'GBP', ${isoDate(70)}, false, 'seed',      true,  now() - interval '40 days'),
        ('bill_insurance', ${DEMO_HOUSEHOLD_ID}, 'Aviva',         'insurance', 41,   'GBP', ${isoDate(26)}, true,  'seed',      true,  now() - interval '40 days'),
        -- Deliberately degraded: extraction returned null over guessing, and the
        -- demo should show that rather than hide it.
        ('bill_tv',        ${DEMO_HOUSEHOLD_ID}, 'Sky',           'tv',        null, 'GBP', null,           false, 'extracted', false, now() - interval '3 days')
      on conflict (id) do nothing
    `;

    const dentistStart = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 11);
    await tx`
      insert into calendar_events (id, household_id, summary, category, start_at, end_at,
                                   all_day, tzid, alarm_minutes_before, source, created_at)
      values
        ('cal_seed1', ${DEMO_HOUSEHOLD_ID}, ${'Parents’ evening — St Mary’s'}, 'school',
         ${isoDate(5)}, null, true, null, ${24 * 60}, 'manual', now() - interval '10 days'),
        ('cal_seed2', ${DEMO_HOUSEHOLD_ID}, 'Dentist — Ella', 'appointment',
         ${dentistStart + '09:00:00'}, ${dentistStart + '10:00:00'}, false, 'Europe/London',
         null, 'manual', now() - interval '6 days'),
        ('cal_seed3', ${DEMO_HOUSEHOLD_ID}, 'Half-term break', 'school',
         ${isoDate(20)}, ${isoDate(25)}, true, null, null, 'manual', now() - interval '6 days')
      on conflict (id) do nothing
    `;
  });

  // The trust log and the digest go through the normal paths, so the demo's
  // hash chain is built by the same code that builds a real one — a seeded log
  // that verification rejects would be worse than no seeded log.
  const seedLog: Array<[ProcessingAction, ProcessingEvent['category'], ProcessingActor, string, string, string, number | undefined]> = [
    ['account_created', 'account', 'you', 'You created your household', 'Set up your account', 'Contract (providing the service)', undefined],
    ['email_received', 'bill', 'email_service', 'A broadband email you forwarded arrived', 'You asked GiGi to watch this sender', 'Consent', undefined],
    ['analyzed_on_server', 'bill', 'gigi_server', 'GiGi read it on our server (no AI, nothing left the server)', 'Find the provider, price and renewal date', 'Consent', 40],
    ['stored', 'bill', 'gigi_server', 'A broadband bill was saved to your register', 'Track your renewal', 'Consent', undefined],
    ['digest_generated', 'digest', 'gigi_server', 'Tonight’s digest was prepared', 'Show you what needs attention', 'Contract (providing the service)', 12],
  ];
  // These go through the same append and rebuild the live paths use — a seeded
  // log that the integrity check would reject is worse than no seeded log — but
  // against the handle passed in rather than through `conn()`. Seeding runs
  // INSIDE the promise `conn()` awaits, so re-entering it here would be a
  // deadlock: the seed would wait on itself and every request would hang.
  for (const [action, category, actor, detail, purpose, basis, ms] of seedLog) {
    await appendProcessing(sql, DEMO_HOUSEHOLD_ID, action, category, actor, detail, purpose, basis, 'EU (London)', ms);
  }

  await rebuildDigest(sql, DEMO_HOUSEHOLD_ID);
  await trackOn(sql, 'seed_loaded', DEMO_HOUSEHOLD_ID, {});
}

/**
 * Test accounts from GIGI_DEV_USERS.
 *
 * Ordinary owner accounts with EMPTY registers — no seeded bills, no seeded
 * calendar — because the point is to see what a real new household sees. Their
 * ids are derived from the email (src/lib/dev-users.ts) so the same account is
 * the same row whatever created it, which is what makes re-running this safe.
 */
async function seedDevUsers(sql: Sql): Promise<void> {
  const password = devPassword();
  if (!password) return;

  for (const spec of devUserSpecs()) {
    const { householdId, memberId, subjectId } = devIds(spec.email);
    const [existing] = await sql`select id from households where id = ${householdId}`;
    if (existing) continue;

    const { market, currency, timezone } = defaultMarket();
    const forwarding = await freeForwardingAddress(sql, spec.email.split('@')[0]);

    await sql.begin(async (tx) => {
      await tx`
        insert into households (
          id, owner_name, email, market, currency, timezone, adults, children, postcode,
          forwarding_address, connection_status, digest_time, digest_paused, handed_over,
          calendar_token
        ) values (
          ${householdId}, ${spec.name}, ${spec.email}, ${market}, ${currency}, ${timezone},
          '2', '1-2', '', ${forwarding}, 'pending', '07:00', false,
          ${tx.array([...DEFAULT_HANDED_OVER])}, ${devCalendarToken(spec.email, password)}
        )
        on conflict (id) do nothing
      `;
      await tx`
        insert into identities (subject_id, email, password_hash)
        values (${subjectId}, ${spec.email}, ${devPasswordHash(spec.email, password)})
        on conflict (subject_id) do nothing
      `;
      await tx`
        insert into members (id, household_id, name, role, status, subject_id)
        values (${memberId}, ${householdId}, ${spec.name}, 'owner', 'active', ${subjectId})
        on conflict (id) do nothing
      `;
    });

    await appendProcessing(
      sql,
      householdId,
      'account_created',
      'account',
      'you',
      'Your household was created from a test account',
      'Set up your account',
      'Contract (providing the service)',
      'EU (London)',
    );
    await rebuildDigest(sql, householdId);
  }
}
