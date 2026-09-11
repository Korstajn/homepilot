'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import PhoneFrame from '@/components/PhoneFrame';
import Icon from '@/components/Icon';
import { trackClient } from '@/lib/analytics';

export default function Join({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [invite, setInvite] = useState<{ valid: boolean; name?: string; role?: string; email?: string } | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState('');

  useEffect(() => {
    fetch(`/api/members/join?token=${encodeURIComponent(params.token)}`)
      .then((r) => r.json())
      .then((j) => { setInvite(j); if (j.name) setName(j.name); })
      .catch(() => setInvite({ valid: false }));
    trackClient('join_viewed');
  }, [params.token]);

  async function accept() {
    setError('');
    setBusy(true);
    const res = await fetch('/api/members/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: params.token, name, password }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Could not join.');
      return;
    }
    const j = await res.json();
    trackClient('member_joined');
    setRecovery(j.recoveryCode ?? '');
  }

  if (recovery) {
    return (
      <PhoneFrame>
        <div className="screen center">
          <div style={{ color: 'var(--brand)', marginTop: 12 }}><Icon name="lock" size={30} /></div>
          <h1 style={{ marginTop: 10 }}>Save your recovery code</h1>
          <p className="small">Keeps you able to get back in if you lose your password.</p>
          <div className="card center"><code style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.04em' }}>{recovery}</code></div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => router.push('/app/digest')}>
            I&apos;ve saved it — continue
          </button>
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame>
      <div className="screen">
        <div className="center" style={{ marginBottom: 20, marginTop: 12 }}>
          <span className="logo-mark" style={{ display: 'inline-grid', width: 44, height: 44, fontSize: 22 }}>G</span>
          <h1 style={{ marginTop: 14 }}>Join the household</h1>
        </div>

        {invite && !invite.valid && (
          <div className="card center"><p className="small" style={{ margin: 0 }}>This invite is invalid or already used.</p></div>
        )}

        {invite?.valid && (
          <>
            <div className="banner ok" style={{ marginBottom: 14 }}>
              You&apos;ve been invited as {invite.role === 'teen' ? 'a teen (limited view)' : 'a co-parent'}.
            </div>
            <div className="card stack">
              <label className="field" style={{ marginBottom: 0 }}>
                <span>Your name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span>Choose a password <span className="muted tiny">— at least 6 characters</span></span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  onKeyDown={(e) => { if (e.key === 'Enter') accept(); }} />
              </label>
              {error && <p className="small" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
              <button className="btn btn-primary" disabled={!name || password.length < 6 || busy} onClick={accept}>
                {busy ? 'Joining…' : 'Join household →'}
              </button>
            </div>
            {invite.role === 'teen' && (
              <p className="tiny muted center" style={{ marginTop: 14 }}>
                As a teen you&apos;ll see the family digest, but not bills, money, or approvals.
              </p>
            )}
          </>
        )}
      </div>
    </PhoneFrame>
  );
}
