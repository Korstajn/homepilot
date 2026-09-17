'use client';

import { useState } from 'react';
import { trackClient } from '@/lib/analytics';

/**
 * The FAQ-column waitlist form.
 *
 * The reference page posted to Formspree. Here it posts to our own
 * /api/waitlist instead: same-origin (the CSP in next.config.mjs forbids
 * third-party form-action), and it keeps beta signups inside the store the
 * founder metrics screen reads (/app/metrics).
 */
export default function WaitlistForm({ source }: { source: string }) {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, segment: 'household', source }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Something went wrong — please try again or email contact@getgigiapp.com directly.');
        return;
      }
      trackClient('waitlist_joined_client', { source });
      setDone(true);
    } catch {
      setError('Something went wrong — please try again or email contact@getgigiapp.com directly.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div id="signup-thanks" style={{ display: 'block' }}>
        You&apos;re on the list. We&apos;ll be in touch within 48 hours.
      </div>
    );
  }

  return (
    <>
      <form onSubmit={submit}>
        <div className="fq-input">
          <input
            type="email"
            id="fq-email"
            name="email"
            placeholder="your@email.com"
            aria-label="Email address"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Joining…' : 'Join waitlist'}
          </button>
        </div>
      </form>
      <div className="fq-note">No spam. We&apos;ll send you an access code once you&apos;ve been approved to try GiGi.</div>
      {error && (
        <div className="fq-note" role="alert" style={{ color: '#B4342F', marginTop: 8 }}>
          {error}
        </div>
      )}
    </>
  );
}
