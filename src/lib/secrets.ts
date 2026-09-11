/**
 * Signed session tokens and sealed (encrypted) cookies.
 *
 * Why this exists: `src/lib/store.ts` keeps everything in memory. That works on
 * one long-lived Node process (Render), but not on Vercel, where every
 * serverless instance has its own memory. A session whose only record is a row
 * in one instance's array is gone the moment the next request lands somewhere
 * else — and `resolveMember()` then silently falls back to the demo household,
 * so the user sees Kerstin's bills instead of being told to log in again.
 *
 * Both mechanisms here move that state into the cookie itself — signed for
 * sessions, encrypted for the Google refresh token — so it survives any number
 * of instances without a database.
 *
 * Key material, in order of preference:
 *   1. GIGI_SESSION_SECRET — set this in production.
 *   2. GIGI_DEV_PASSWORD — already set to enable the test users, so logins work
 *      with one variable instead of two. Rotating it invalidates every session
 *      and every stored Google token, which is the behaviour you want anyway.
 *   3. A per-process random key — local dev with nothing configured. Sessions
 *      then die with the process, exactly as they did before this file existed.
 */

import {
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'crypto';

export type SecretSource = 'configured' | 'dev-password' | 'ephemeral';

// Hangs off globalThis so a hot reload in dev doesn't invalidate open sessions.
const g = globalThis as unknown as {
  __gigiEphemeralSecret?: string;
  __gigiKeyCache?: { secret: string; sign: Buffer; seal: Buffer };
};

function secretMaterial(): { secret: string; source: SecretSource } {
  const configured = process.env.GIGI_SESSION_SECRET?.trim();
  if (configured) return { secret: configured, source: 'configured' };

  const devPassword = process.env.GIGI_DEV_PASSWORD?.trim();
  if (devPassword) return { secret: `dev-password:${devPassword}`, source: 'dev-password' };

  if (!g.__gigiEphemeralSecret) g.__gigiEphemeralSecret = randomBytes(32).toString('hex');
  return { secret: g.__gigiEphemeralSecret, source: 'ephemeral' };
}

/** Which key material is in play — surfaced on the diagnostics route, never the key itself. */
export function secretSource(): SecretSource {
  return secretMaterial().source;
}

/**
 * Two independent keys from the same material: one for HMAC signing, one for
 * AES. scrypt is deliberately slow, so the pair is cached per secret — the
 * derivation must not run on every request.
 */
function keys(): { sign: Buffer; seal: Buffer } {
  const { secret } = secretMaterial();
  if (g.__gigiKeyCache?.secret === secret) return g.__gigiKeyCache;
  const cache = {
    secret,
    sign: scryptSync(secret, 'gigi-sign-v1', 32),
    seal: scryptSync(secret, 'gigi-seal-v1', 32),
  };
  g.__gigiKeyCache = cache;
  return cache;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function equal(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- Signed tokens (sessions) -----------------------------------------------
// Format: v1.<payload>.<hmac>. The payload is readable but not forgeable; it
// holds an opaque member id and an issue time, never an email or a password.

const TOKEN_PREFIX = 'v1';

export function signToken(payload: Record<string, unknown>): string {
  const body = b64url(Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })));
  const mac = createHmac('sha256', keys().sign).update(`${TOKEN_PREFIX}.${body}`).digest();
  return `${TOKEN_PREFIX}.${body}.${b64url(mac)}`;
}

/**
 * Verify and decode. Returns null for anything that is not a token we signed
 * with the current key, or that is older than `maxAgeMs` (default 30 days, to
 * match the session cookie's own lifetime).
 */
export function verifyToken<T>(token: string, maxAgeMs = 30 * 24 * 60 * 60 * 1000): (T & { iat: number }) | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const [, body, mac] = parts;

  const expected = createHmac('sha256', keys().sign).update(`${TOKEN_PREFIX}.${body}`).digest();
  if (!equal(fromB64url(mac), expected)) return null;

  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as T & { iat?: number };
    if (typeof payload.iat !== 'number') return null;
    if (Date.now() - payload.iat > maxAgeMs) return null;
    return payload as T & { iat: number };
  } catch {
    return null;
  }
}

// --- Sealed values (the Google refresh token) -------------------------------
// AES-256-GCM. Used for the one piece of state that is a live credential, so it
// must be unreadable to anyone who gets hold of the cookie — unlike a session
// token, where tamper-evidence is enough.

const SEAL_PREFIX = 's1';

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keys().seal, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `${SEAL_PREFIX}.${b64url(Buffer.concat([iv, cipher.getAuthTag(), body]))}`;
}

export function unseal<T>(sealed: string | undefined): T | null {
  if (!sealed) return null;
  const parts = sealed.split('.');
  if (parts.length !== 2 || parts[0] !== SEAL_PREFIX) return null;
  try {
    const raw = fromB64url(parts[1]);
    if (raw.length < 28) return null;
    const decipher = createDecipheriv('aes-256-gcm', keys().seal, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const out = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    return JSON.parse(out.toString('utf8')) as T;
  } catch {
    // Wrong key (the secret was rotated) or a tampered cookie. Either way the
    // caller should treat it as "not connected".
    return null;
  }
}

/** A URL-safe random string, for OAuth state and similar one-shot nonces. */
export function nonce(bytes = 32): string {
  return b64url(randomBytes(bytes));
}
