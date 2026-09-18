// Content Security Policy: self-only, with one deliberate exception. No
// third-party scripts, styles, fonts, or frames — that's what enforces "no
// trackers, no third parties" (see docs/PRIVACY_ARCHITECTURE.md). 'unsafe-inline'
// is required for Next's hydration/runtime inline scripts in this build;
// everything else is locked to same-origin, except connect-src, which also
// allows https://formspree.io: the waitlist controls (WaitlistButton,
// WaitlistForm) fetch() there, after their own /api/waitlist call succeeds,
// purely so Formspree can send the visitor its autoresponder confirmation —
// see src/components/landing/formspree.ts for why that's not done server-side.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://formspree.io",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  // microphone=(self) lets the voice assistant use the mic on our own origin;
  // camera/geolocation stay fully disabled. (microphone=() would block the mic
  // site-wide and silently break voice.)
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // The migration runner reads db/migrations/*.sql at runtime (src/lib/db.ts).
  // Next's file tracer only ships files it can see being read, and that
  // directory is assembled at runtime rather than imported, so it has to be
  // declared. Without this the first request on a fresh deploy fails with
  // ENOENT instead of migrating — which is exactly the kind of thing that only
  // shows up in production.
  // (Next 14 keeps this under `experimental`; it graduates in 15.)
  experimental: {
    outputFileTracingIncludes: {
      '/api/**/*': ['./db/migrations/**/*'],
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
