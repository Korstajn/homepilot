const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xyegndwz';

/**
 * Fires a waitlist entry at Formspree so it can send the visitor its
 * autoresponder confirmation — the one thing /api/waitlist never did (see
 * docs/PRIVACY_ARCHITECTURE.md for what that means and what changed here).
 *
 * Client-side, not proxied through /api/waitlist: Formspree's spam
 * protection is keyed to the form's registered domain via the browser's own
 * request, which a server-to-server call from Vercel wouldn't carry (no
 * Referer, no origin to check) — the request would either be rejected or
 * need the same trust relaxed a different way. This is NOT the source of
 * truth for the signup: /api/waitlist already stored it and is what
 * /app/metrics reads, so a Formspree failure here is swallowed rather than
 * shown — the visitor already succeeded.
 */
export function notifyFormspree(email: string, source: string): void {
  const data = new FormData();
  data.append('email', email);
  data.append('_subject', 'New GiGi waitlist signup');
  data.append('source', source);
  fetch(FORMSPREE_ENDPOINT, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: data,
  }).catch(() => {
    /* best-effort confirmation email only */
  });
}
