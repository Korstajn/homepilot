'use client';

import { useState } from 'react';
import { trackClient } from '@/lib/analytics';
import Reveal from './Reveal';

export default function FinalCta() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function join() {
    if (!(email && email.includes('@')) || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, segment: 'household', source: 'landing_cta' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Something went wrong — please try again or email contact@getgigiapp.com directly.');
        return;
      }
      trackClient('waitlist_joined_client', { source: 'landing_cta' });
      setEmail('');
      setDone(true);
    } catch {
      setError('Something went wrong — please try again or email contact@getgigiapp.com directly.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="cta">
      <div className="cta-dot-grid" />
      <Reveal className="cta-inner">
        <h2 className="cta-h">
          Your household,
          <br />
          <em>running itself.</em>
        </h2>
        <p className="cta-sub">Bills handled. School sorted. One digest a day.</p>
        <div className="cta-input-wrap">
          <input
            type="email"
            id="cta-email"
            placeholder="your@email.com"
            aria-label="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void join();
            }}
          />
          <button onClick={join} disabled={busy}>
            {busy ? 'Joining…' : 'Join waitlist →'}
          </button>
        </div>
        <div className="cta-note">No credit card. We&apos;ll confirm your place personally.</div>
        {done && (
          <div id="cta-thanks" style={{ display: 'block' }}>
            You&apos;re on the list. We&apos;ll be in touch within 48 hours.
          </div>
        )}
        {error && (
          <div id="cta-thanks" role="alert" style={{ display: 'block' }}>
            {error}
          </div>
        )}
      </Reveal>
    </section>
  );
}
