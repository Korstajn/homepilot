'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import PhoneFrame from '@/components/PhoneFrame';
import { trackClient } from '@/lib/analytics';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [testers, setTesters] = useState<{ email: string; name: string }[]>([]);

  // The GIGI_DEV_USERS accounts this deployment has, so a tester doesn't have to
  // guess the addresses. Addresses and names only — the endpoint never returns
  // GIGI_DEV_PASSWORD, and returns nothing at all when test accounts are off.
  useEffect(() => {
    fetch('/api/auth/dev-users')
      .then((r) => r.json())
      .then((j) => setTesters(j.enabled ? j.users ?? [] : []))
      .catch(() => {});
  }, []);

  async function submit() {
    setError('');
    setBusy(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(useRecovery ? { recoveryCode } : { email, password }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Could not log in.');
      return;
    }
    trackClient('login_success');
    // Honour ?next= so someone bounced here from /api/auth/google/start lands
    // back where they were, not on the digest. Same-origin paths only.
    const requested = new URLSearchParams(window.location.search).get('next');
    const safe = requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : null;
    router.push(safe ?? '/app/digest');
  }

  async function demo() {
    await fetch('/api/auth/demo', { method: 'POST' });
    trackClient('demo_started');
    router.push('/app/digest');
  }

  return (
    <PhoneFrame>
      <div className="screen">
        <div className="center" style={{ marginBottom: 24, marginTop: 12 }}>
          <span className="logo-mark" style={{ display: 'inline-grid', width: 44, height: 44, fontSize: 22 }}>G</span>
          <h1 style={{ marginTop: 14 }}>Welcome back</h1>
          <p className="small" style={{ margin: 0 }}>Log in to your household.</p>
        </div>

        <div className="card stack">
          {useRecovery ? (
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Recovery code</span>
              <input value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} placeholder="GIGI-XXXX-XXXX-XXXX"
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
            </label>
          ) : (
            <>
              <label className="field" style={{ marginBottom: 0 }}>
                <span>Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span>Password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
              </label>
            </>
          )}
          {error && <p className="small" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
          <button className="btn btn-primary" disabled={busy || (useRecovery ? !recoveryCode : (!email || !password))} onClick={submit}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
          <button className="link small" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => { setUseRecovery((v) => !v); setError(''); }}>
            {useRecovery ? 'Use email & password instead' : 'Log in with a recovery code (no email)'}
          </button>
        </div>

        {testers.length > 0 && !useRecovery && (
          <div className="card stack" style={{ marginTop: 12 }}>
            <p className="eyebrow" style={{ margin: 0 }}>Test accounts on this build</p>
            {testers.map((t) => (
              <div className="row between" key={t.email}>
                <div>
                  <div className="small" style={{ fontWeight: 600 }}>{t.name}</div>
                  <span className="tiny muted">{t.email}</span>
                </div>
                <button
                  className="btn btn-subtle btn-sm"
                  onClick={() => { setEmail(t.email); setError(''); }}
                >
                  Use
                </button>
              </div>
            ))}
            <p className="tiny muted" style={{ margin: 0 }}>
              The password is the one set as GIGI_DEV_PASSWORD for this deployment.
            </p>
          </div>
        )}

        <p className="small center" style={{ marginTop: 16 }}>
          New here? <Link href="/signup" className="link">Create an account</Link>
        </p>

        <div className="divider" />
        <button className="btn btn-ghost" onClick={demo}>Just show me the demo →</button>
        <p className="tiny muted center" style={{ marginTop: 8 }}>
          Explore GiGi with a ready-made household — no account needed.
        </p>
      </div>
    </PhoneFrame>
  );
}
