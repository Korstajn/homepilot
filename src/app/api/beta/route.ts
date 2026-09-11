import { NextResponse } from 'next/server';
import {
  BETA_COOKIE,
  BETA_COOKIE_OPTS,
  betaCode,
  betaCookieValue,
  gateMode,
  normalizeCode,
  safeEqual,
} from '@/lib/beta';

// Not statically analysable — it reads cookies and the client IP.
export const dynamic = 'force-dynamic';

/**
 * Best-effort brute-force brake. One shared code is short enough to guess if
 * you get unlimited tries, so cap tries per IP. In-memory, so it is per
 * instance and resets on redeploy — proportionate for a dev gate, and the
 * thing to replace first if the gate ever fronts something that matters.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: Request) {
  if (gateMode() === 'off') {
    return NextResponse.json({ ok: true, gate: 'off' });
  }

  const code = betaCode();
  if (!code) {
    return NextResponse.json({ error: 'The beta gate is not configured on this deployment.' }, { status: 503 });
  }

  if (rateLimited(clientIp(req))) {
    return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const submitted = String(body.code ?? '');
  if (!submitted.trim()) {
    return NextResponse.json({ error: 'Enter your beta code.' }, { status: 400 });
  }

  // Compare digests, not the codes: equal-length inputs, constant-time compare.
  const expected = await betaCookieValue(code);
  const given = await betaCookieValue(normalizeCode(submitted));
  if (!safeEqual(given, expected)) {
    return NextResponse.json({ error: "That code doesn't match. Check it and try again." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(BETA_COOKIE, expected, BETA_COOKIE_OPTS);
  return res;
}

/** Lock this browser out again — useful when testing the gate itself. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(BETA_COOKIE, '', { ...BETA_COOKIE_OPTS, maxAge: 0 });
  return res;
}
