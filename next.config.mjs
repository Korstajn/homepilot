// Content Security Policy: self-only. No third-party scripts, styles, fonts,
// frames, or connections — this is what enforces "no trackers, no third parties"
// (see docs/PRIVACY_ARCHITECTURE.md). 'unsafe-inline' is required for Next's
// hydration/runtime inline scripts in this build; everything else is locked to
// same-origin.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
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
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
