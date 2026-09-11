'use client';

import { useState } from 'react';

export default function BetaGateForm({ next }: { next: string }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/beta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Something went wrong. Try again.');
        setBusy(false);
        return;
      }
      // Full navigation, not a client-side push: the middleware has to see the
      // new cookie before it will let this request through.
      window.location.assign(next);
    } catch {
      setError('Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <input
        className="gate-input"
        type="text"
        name="code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Your beta code"
        aria-label="Beta code"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        autoFocus
      />
      <button className="gate-btn" type="submit" disabled={busy || !code.trim()}>
        {busy ? 'Checking…' : 'Open GiGi'}
      </button>
      {error && (
        <div className="gate-error" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
