'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * The one banner that must never be silent.
 *
 * `session: 'stale'` from /api/auth/me means a session cookie GiGi itself
 * signed no longer resolves to a member — on Vercel that happens when the
 * account only ever existed in another serverless instance's memory
 * (src/lib/store.ts). Without this banner `resolveMember()` falls back to the
 * demo household and the app shows Kerstin's bills as though they were the
 * user's own, which is a far worse failure than an honest "log in again".
 *
 * Expected to disappear entirely once the store is backed by Postgres.
 */
export default function SessionNotice() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((j) => setStale(j.session === 'stale'))
      .catch(() => {});
  }, []);

  if (!stale) return null;

  return (
    <div
      role="status"
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--danger)',
        borderRadius: 12,
        padding: '10px 14px',
        margin: '12px 16px 0',
      }}
    >
      <div className="small" style={{ fontWeight: 600 }}>You’re signed out</div>
      <p className="tiny muted" style={{ margin: '2px 0 8px' }}>
        This build stores accounts in memory, so your household was lost when the server
        restarted. Anything below is demo data, not yours.
      </p>
      <Link href="/login" className="btn btn-primary btn-sm" style={{ width: '100%' }}>
        Log in again
      </Link>
    </div>
  );
}
