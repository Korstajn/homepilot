'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { trackClient } from '@/lib/analytics';
import { Progress } from '@/components/OnboardingProgress';

const TIMEZONES = [
  { id: 'Europe/London', label: 'UK — London (GMT/BST)' },
  { id: 'Europe/Stockholm', label: 'Sweden — Stockholm (CET/CEST)' },
];

export default function Profile() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [market, setMarket] = useState<'uk' | 'se'>('uk');
  const [adults, setAdults] = useState<'1' | '2' | '3+'>('2');
  const [children, setChildren] = useState<'none' | '1-2' | '3+'>('1-2');
  const [postcode, setPostcode] = useState('');
  const [timezone, setTimezone] = useState('Europe/London');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    trackClient('onboarding_started');
    fetch('/api/household')
      .then((r) => r.json())
      .then((j) => {
        if (j.household?.ownerName && j.household.ownerName !== 'Kerstin') setName(j.household.ownerName);
      })
      .catch(() => {});
  }, []);

  async function next() {
    setBusy(true);
    await fetch('/api/household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerName: name || 'there', market, adults, children, postcode, timezone }),
    });
    trackClient('profile_saved', { market });
    router.push('/onboarding/connect');
  }

  return (
    <div className="screen">
      <Progress step={1} />
      <h1>Let&apos;s set up your household</h1>
      <p>A few taps so GiGi knows what to watch. You can change any of this later.</p>

      <div className="card stack">
        <label className="field">
          <span>Your first name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kerstin" />
        </label>

        <div>
          <span className="small" style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>Where are you?</span>
          <div className="choices">
            {(['uk', 'se'] as const).map((m) => (
              <button
                key={m}
                className={`choice ${market === m ? 'selected' : ''}`}
                onClick={() => {
                  setMarket(m);
                  setTimezone(m === 'se' ? 'Europe/Stockholm' : 'Europe/London');
                }}
              >
                {m === 'uk' ? '🇬🇧 United Kingdom' : '🇸🇪 Sweden'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="small" style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>Adults</span>
          <div className="choices">
            {(['1', '2', '3+'] as const).map((a) => (
              <button key={a} className={`choice ${adults === a ? 'selected' : ''}`} onClick={() => setAdults(a)}>{a}</button>
            ))}
          </div>
        </div>

        <div>
          <span className="small" style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>Children</span>
          <div className="choices">
            {(['none', '1-2', '3+'] as const).map((c) => (
              <button key={c} className={`choice ${children === c ? 'selected' : ''}`} onClick={() => setChildren(c)}>
                {c === 'none' ? 'None' : c}
              </button>
            ))}
          </div>
        </div>

        <label className="field" style={{ marginBottom: 0 }}>
          <span>{market === 'se' ? 'Postnummer' : 'Postcode'}</span>
          <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder={market === 'se' ? '114 34' : 'SW1A 1AA'} />
        </label>

        <label className="field" style={{ marginBottom: 0 }}>
          <span>Time zone <span className="muted tiny">— for your 7am digest</span></span>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
      </div>

      <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={busy} onClick={next}>
        Continue
      </button>
    </div>
  );
}
