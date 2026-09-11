'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import PhoneFrame from '@/components/PhoneFrame';
import Icon from '@/components/Icon';
import { trackClient } from '@/lib/analytics';

export default function Signup() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailless, setEmailless] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState('');

  async function submit() {
    setError('');
    setBusy(true);
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email: emailless ? '' : email, password }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Could not create your account.');
      return;
    }
    const j = await res.json();
    trackClient('signup_success', { emailless });
    setRecovery(j.recoveryCode); // show the one-time recovery code first
  }

  if (recovery) {
    return (
      <PhoneFrame>
        <div className="screen">
          <div className="center" style={{ marginBottom: 20, marginTop: 12 }}>
            <div style={{ color: 'var(--brand)' }}><Icon name="lock" size={30} /></div>
            <h1 style={{ marginTop: 10 }}>Save your recovery code</h1>
            <p className="small" style={{ margin: 0 }}>
              {emailless
                ? 'This is the only way back into your account. We can’t recover it for you.'
                : 'Keep this somewhere safe — it lets you back in if you lose your password.'}
            </p>
          </div>
          <div className="card center">
            <code style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.04em' }}>{recovery}</code>
          </div>
          <button className="btn btn-subtle btn-sm" style={{ width: '100%', marginTop: 10 }}
            onClick={() => { navigator.clipboard?.writeText(recovery).catch(() => {}); }}>
            Copy code
          </button>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => router.push('/onboarding')}>
            I&apos;ve saved it — continue
          </button>
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame>
      <div className="screen">
        <div className="center" style={{ marginBottom: 24, marginTop: 12 }}>
          <span className="logo-mark" style={{ display: 'inline-grid', width: 44, height: 44, fontSize: 22 }}>G</span>
          <h1 style={{ marginTop: 14 }}>Create your account</h1>
          <p className="small" style={{ margin: 0 }}>Two weeks free. No card needed.</p>
        </div>

        <div className="card stack">
          <label className="field" style={{ marginBottom: 0 }}>
            <span>First name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kerstin" />
          </label>
          {!emailless && (
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
          )}
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Password <span className="muted tiny">— at least 6 characters</span></span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          </label>
          {error && <p className="small" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
          <button className="btn btn-primary" disabled={!name || (!emailless && !email) || password.length < 6 || busy} onClick={submit}>
            {busy ? 'Creating…' : 'Create account →'}
          </button>
        </div>

        <div className="card stack" style={{ marginTop: 12 }}>
          <div className="row between">
            <div>
              <div className="small" style={{ fontWeight: 600 }}>Sign up without email</div>
              <span className="tiny muted">Most private. You get a recovery code instead.</span>
            </div>
            <button className={`btn btn-sm ${emailless ? 'btn-primary' : 'btn-subtle'}`} onClick={() => setEmailless((v) => !v)}>
              {emailless ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        <p className="small center" style={{ marginTop: 16 }}>
          Already have an account? <Link href="/login" className="link">Log in</Link>
        </p>
        <p className="tiny muted center" style={{ marginTop: 14 }}>
          By continuing you agree to our <Link href="/privacy" className="link">privacy policy</Link>. UK &amp; EU data only.
        </p>
      </div>
    </PhoneFrame>
  );
}
