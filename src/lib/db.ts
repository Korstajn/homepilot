// The database connection, and the one place that knows how to reach it.
//
// GiGi ran on a module-level in-memory object until now. That was right for a
// single long-lived Node process and completely wrong for Vercel: every
// serverless instance gets its OWN memory, so a household created by one
// request could be invisible to the next, and a redeploy erased everything.
// Sessions survived only because they are signed rather than looked up. This
// module is what replaces it.
//
// WHY postgres.js AND NOT AN ORM
// The query surface here is small, hand-written and hot. An ORM would add a
// code-generation step, a second schema definition to keep in sync with
// src/lib/types.ts, and a per-query translation layer, in exchange for
// abstraction this codebase does not need. postgres.js is ~20kB, has no build
// step, pipelines queries on one connection, and its tagged-template API is
// parameterised by construction — a value interpolated into sql`` becomes a
// bind parameter, never string-concatenated SQL.
//
// CONNECTING FROM SERVERLESS
// Postgres allocates a process per connection, so a few hundred concurrent
// lambdas will exhaust a small database long before the database is actually
// busy. Supabase's answer is Supavisor, a transaction-mode pooler on port 6543:
// a connection is held only for the duration of a statement, so thousands of
// callers share a few dozen backends. That is the URL to use in production, and
// it has one requirement — no server-side prepared statements, because the
// backend a statement lands on is not the one that prepared it. `prepare` is
// therefore switched off automatically whenever the URL points at a pooler,
// and left on (where it is faster) when it points at the database directly.
//
// Each instance keeps a SMALL pool for the same reason: concurrency comes from
// there being many instances, not from one instance holding many connections.

import postgres from 'postgres';

/**
 * Where the connection string comes from, in priority order.
 *
 * The Vercel–Supabase integration sets several of these at once and the exact
 * set has changed over time, so all of them are accepted rather than one being
 * guessed at. The order matters: the pooled URL is the right default for
 * serverless, and `POSTGRES_URL_NON_POOLING` is deliberately last — it is a
 * direct connection, correct for migrations and wrong for request traffic.
 */
const URL_VARS = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'SUPABASE_DB_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
] as const;

export function databaseUrl(): string | null {
  for (const name of URL_VARS) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

/** Which variable the connection came from — for diagnostics, never the value. */
export function databaseUrlSource(): string | null {
  for (const name of URL_VARS) {
    if (process.env[name]?.trim()) return name;
  }
  return null;
}

/**
 * Where the database physically is, read out of the connection host.
 *
 * This is not a nicety. /privacy tells households their data is stored in the
 * EU, and that claim is only true if the Supabase project actually is. Supabase
 * puts the region in the pooler hostname (`aws-0-eu-central-1.pooler.supabase.com`),
 * so the deployment can state what it found rather than what it hoped — and
 * /api/diagnostics warns when the host does not look European instead of
 * leaving a false promise on a public page.
 *
 * Returns null when the host carries no region, which is the honest answer for
 * a direct `db.<ref>.supabase.co` URL or a local database.
 */
export function databaseRegion(): { region: string; inEurope: boolean } | null {
  const url = databaseUrl();
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const match = /(?:^|[.-])((?:af|ap|ca|eu|me|sa|us)-[a-z]+-\d)(?:\.|$)/.exec(host);
    if (!match) return null;
    const region = match[1];
    return { region, inEurope: region.startsWith('eu-') };
  } catch {
    return null;
  }
}

export function dbConfigured(): boolean {
  return databaseUrl() !== null;
}

/**
 * A pooled (transaction-mode) connection string cannot use prepared statements.
 *
 * Detected from the URL rather than configured separately, because the two must
 * agree and a mismatch fails at runtime with an error that does not name its
 * cause ("prepared statement s1 already exists", intermittently, under load).
 */
function isTransactionPooler(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.port === '6543') return true;
    if (u.searchParams.get('pgbouncer') === 'true') return true;
    // Supavisor's session-mode port is 5432 on the same host; only 6543 is
    // transaction mode, so the host alone is not enough to decide.
    return false;
  } catch {
    return false;
  }
}

/**
 * How many connections one instance may hold.
 *
 * Small on purpose. A serverless instance serves a handful of concurrent
 * requests at most, and postgres.js pipelines several queries down one
 * connection, so a larger pool buys nothing and costs a backend process per
 * idle connection — multiplied by however many instances are warm.
 */
const MAX_CONNECTIONS = Number(process.env.GIGI_DB_POOL_MAX ?? 3);
/** Drop idle connections quickly; a cold instance should not pin a backend. */
const IDLE_TIMEOUT_S = Number(process.env.GIGI_DB_IDLE_TIMEOUT ?? 20);
/** Fail fast rather than letting a request hang on a database that is gone. */
const CONNECT_TIMEOUT_S = Number(process.env.GIGI_DB_CONNECT_TIMEOUT ?? 10);

export type Sql = postgres.Sql<Record<string, never>>;

// Held on globalThis so a hot reload in dev, and a warm lambda in production,
// reuse the same pool instead of opening a new one per module evaluation.
const g = globalThis as unknown as { __gigiSql?: Sql; __gigiMigrated?: Promise<void> };

export class DatabaseNotConfigured extends Error {
  constructor() {
    super(
      'No database is configured. Set DATABASE_URL (or POSTGRES_URL) to the Supabase connection string — use the transaction pooler on port 6543 for serverless.',
    );
    this.name = 'DatabaseNotConfigured';
  }
}

export function sql(): Sql {
  if (g.__gigiSql) return g.__gigiSql;

  const url = databaseUrl();
  if (!url) throw new DatabaseNotConfigured();

  const client = postgres(url, {
    max: MAX_CONNECTIONS,
    idle_timeout: IDLE_TIMEOUT_S,
    connect_timeout: CONNECT_TIMEOUT_S,
    prepare: !isTransactionPooler(url),
    // Supabase terminates TLS at the pooler with a certificate chain Node does
    // not carry, and the connection never leaves the provider's network. The
    // traffic is encrypted; the certificate is not verified. `verify-full`
    // needs the Supabase CA bundle shipped with the app, which is a change to
    // make deliberately rather than one to break deploys over.
    ssl: needsSsl(url) ? { rejectUnauthorized: false } : false,
    // `undefined` in a query means "no value given", which is almost always a
    // bug waiting to be a wrong row. Turning it into NULL makes the intent
    // explicit and matches how the optional fields in src/lib/types.ts read.
    transform: { undefined: null },
    // Postgres NOTICE output (e.g. "relation already exists, skipping" from an
    // idempotent migration) is not an application event; it belongs in the
    // database log, not in ours.
    onnotice: () => {},
  });

  g.__gigiSql = client;
  return client;
}

function needsSsl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.searchParams.get('sslmode') === 'disable') return false;
    // Localhost is the test database; everything else is a hosted one.
    return !['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  } catch {
    return true;
  }
}

/** Close the pool. Used by tests and scripts; a serverless instance never calls it. */
export async function closeDb(): Promise<void> {
  const client = g.__gigiSql;
  g.__gigiSql = undefined;
  g.__gigiMigrated = undefined;
  if (client) await client.end({ timeout: 5 });
}

// --- Migrations ---------------------------------------------------------------

/**
 * Migrations run themselves, once, on first use.
 *
 * The alternative — a deploy step someone has to remember — is the reason
 * half-migrated databases exist. This is safe to call from every request
 * because of three things together:
 *
 *   1. A per-instance promise, so concurrent requests on one instance await one
 *      run rather than starting several.
 *   2. A Postgres ADVISORY LOCK, so concurrent instances (a deploy rolling out
 *      to ten lambdas at once) serialise across the whole cluster. Without it,
 *      two instances would both see an empty `gigi_migrations` and both try to
 *      create the same table.
 *   3. Every migration is recorded by name and skipped if already applied, and
 *      each one runs inside a transaction — so a failure leaves the database on
 *      the previous version rather than half-way into a new one.
 *
 * The cost after the first run is one `SELECT name FROM gigi_migrations` per
 * cold instance, not per request.
 */
const MIGRATION_LOCK_KEY = 4_071_985_211;

export async function ensureMigrated(): Promise<void> {
  if (!g.__gigiMigrated) {
    g.__gigiMigrated = runMigrations().catch((e) => {
      // A failed run must not be cached as "done", or the instance would serve
      // every later request against a schema that was never created.
      g.__gigiMigrated = undefined;
      throw e;
    });
  }
  return g.__gigiMigrated;
}

async function runMigrations(): Promise<void> {
  const db = sql();
  const migrations = await loadMigrations();

  await db`
    create table if not exists gigi_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const applied = new Set(
    (await db<{ name: string }[]>`select name from gigi_migrations`).map((r) => r.name),
  );
  const pending = migrations.filter((m) => !applied.has(m.name));
  if (pending.length === 0) return;

  // A session-level advisory lock is held on ONE reserved connection for the
  // whole run: `pg_advisory_lock` is scoped to the session that took it, so
  // taking and releasing it from a pool would risk unlocking on a different
  // backend than locked. The migrations themselves run on the pool — the lock
  // is a mutex every instance queues on, not the thing doing the work.
  const held = await db.reserve();
  try {
    await held`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    // Re-read under the lock: another instance may have applied them while we
    // were queuing for it.
    const nowApplied = new Set(
      (await db<{ name: string }[]>`select name from gigi_migrations`).map((r) => r.name),
    );
    for (const migration of migrations) {
      if (nowApplied.has(migration.name)) continue;
      // Each migration is one transaction: a failure leaves the database on the
      // previous version rather than half-way into a new one.
      await db.begin(async (tx) => {
        await tx.unsafe(migration.sql);
        await tx`insert into gigi_migrations (name) values (${migration.name})`;
      });
    }
  } finally {
    await held`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    held.release();
  }
}

interface Migration {
  name: string;
  sql: string;
}

/**
 * Migration files, read from disk at runtime.
 *
 * Read rather than imported because a .sql file is not a module, and bundled
 * rather than left to chance because Vercel's file tracer only ships files it
 * can see being read — `next.config.mjs` declares db/migrations as an included
 * file for exactly this reason.
 */
async function loadMigrations(): Promise<Migration[]> {
  const { readdir, readFile } = await import('fs/promises');
  const path = await import('path');
  const dir = path.join(process.cwd(), 'db', 'migrations');
  const names = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  return Promise.all(
    names.map(async (name) => ({ name, sql: await readFile(path.join(dir, name), 'utf8') })),
  );
}

/**
 * The handle every store function starts from: a migrated database, or a clear
 * failure.
 *
 * There is deliberately no in-memory fallback. A store that silently degrades
 * to memory when the database is unreachable is a store that loses a
 * household's data while reporting success — and the resulting bug surfaces
 * days later as "my bills disappeared", with nothing in the logs.
 */
export async function db(): Promise<Sql> {
  const client = sql();
  await ensureMigrated();
  return client;
}

/** Is the database actually reachable? For diagnostics — never on a hot path. */
export async function dbHealth(): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
  if (!dbConfigured()) return { ok: false, error: 'No connection string configured.' };
  const started = Date.now();
  try {
    const client = await db();
    await client`select 1`;
    return { ok: true, latencyMs: Date.now() - started };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 300) };
  }
}
