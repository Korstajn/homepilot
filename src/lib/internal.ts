/**
 * The guard in front of the founder-only endpoints.
 *
 * A handful of routes exist for the people running GiGi rather than for the
 * household using it: the waitlist, the raw feedback, the analytics event
 * stream, the deployment's own configuration, and the list of test accounts.
 * None of them ever had a caller check, because until now this build only ever
 * served testers on an unguessable `*.vercel.app` hostname. On the public site
 * that is no longer true, and two of them — the waitlist and the feedback —
 * hand out other people's email addresses and words to anyone who knows the
 * path. `/api/diagnostics` says so in its own header comment: "Revisit that
 * before this origin serves the public site."
 *
 * The rule here:
 *
 *   • A caller holding GIGI_ADMIN_TOKEN is always let through, on any
 *     deployment. That is how the founder still reads the waitlist once the
 *     site is public.
 *   • Otherwise a NON-public build stays open, exactly as it is today, so
 *     nothing about working on the dev build changes.
 *   • Otherwise — the public site, no token — the route 404s.
 *
 * It answers 404 rather than 401 on purpose. A 401 confirms the endpoint is
 * there and invites guessing at the token; a 404 says only that the public site
 * has no such path, which is the truth as far as the public site is concerned.
 */

import { NextResponse } from 'next/server';
import { isPublicSite, safeEqual } from './beta';

/** The shared founder token, or null when none is configured. */
export function adminToken(): string | null {
  const raw = process.env.GIGI_ADMIN_TOKEN?.trim();
  return raw ? raw : null;
}

/**
 * Does this request carry the founder token?
 *
 * Header or query string, matching the `INBOUND_SECRET` convention already used
 * by `/api/inbound` — a header for anything scripted, `?token=` for the times
 * you just want to open it in a browser.
 */
export function hasAdminToken(req: Request): boolean {
  const token = adminToken();
  if (!token) return false;

  const provided =
    req.headers.get('x-gigi-admin') ?? new URL(req.url).searchParams.get('token') ?? '';
  return provided.length > 0 && safeEqual(provided, token);
}

/**
 * Call this first in a founder-only handler. Returns a response to send back
 * when the caller may NOT see the route, or null when they may proceed.
 *
 *   const denied = guardInternal(req);
 *   if (denied) return denied;
 */
export function guardInternal(req: Request): NextResponse | null {
  if (hasAdminToken(req)) return null;
  if (!isPublicSite()) return null;
  return notFound();
}

/**
 * The same decision for routes that are not founder tooling but simply have no
 * business existing on the public site at all — the demo session opener, the
 * test-account list. No token opens these; they are a property of the build.
 */
export function guardNonPublic(): NextResponse | null {
  return isPublicSite() ? notFound() : null;
}

function notFound(): NextResponse {
  return NextResponse.json({ error: 'Not found.' }, { status: 404, headers: { 'cache-control': 'no-store' } });
}
