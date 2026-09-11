'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Progress } from '@/components/OnboardingProgress';
import ForwardTester from '@/components/ForwardTester';
import { trackClient } from '@/lib/analytics';

// No OAuth in the beta (docs/DECISIONS.md §1): the user forwards known senders
// to their private GiGi address. Zero verification, zero critical path.
export default function Connect() {
  const router = useRouter();
  const [address, setAddress] = useState('…');

  useEffect(() => {
    trackClient('connect_screen_viewed');
    fetch('/api/household')
      .then((r) => r.json())
      .then((j) => setAddress(j.household?.forwardingAddress ?? 'your.name@in.getgigiapp.com'))
      .catch(() => {});
  }, []);

  return (
    <div className="screen">
      <Progress step={2} />
      <h1>Connect your inbox</h1>
      <p>
        No passwords, no account access. You forward the emails GiGi should watch — bills,
        school, travel — to your private address. GiGi can only ever read what you send it.
      </p>

      <div className="card stack">
        <p className="eyebrow" style={{ margin: 0 }}>Your GiGi address</p>
        <div
          className="row between"
          style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 12 }}
        >
          <code style={{ fontSize: 14, fontWeight: 600 }}>{address}</code>
          <button
            className="btn btn-subtle btn-sm"
            onClick={() => {
              navigator.clipboard?.writeText(address).catch(() => {});
              trackClient('forwarding_address_copied');
            }}
          >
            Copy
          </button>
        </div>
        <p className="small" style={{ margin: 0 }}>
          Set up a filter in Gmail or Outlook to auto-forward known senders here. We&apos;ll
          walk you through it on your onboarding call.
        </p>
      </div>

      <div className="card stack" style={{ marginTop: 12 }}>
        <h3>Two ways to add a bill</h3>
        <p className="small" style={{ margin: 0 }}>
          <strong>Forward it</strong> — send any bill email to your address above.
          <br />
          <strong>Add it by hand</strong> — type in a provider and renewal date in the next step.
          Nothing has to come from email.
        </p>
      </div>

      <div style={{ marginTop: 12 }}>
        <ForwardTester />
      </div>

      <button
        className="btn btn-primary"
        style={{ marginTop: 16 }}
        onClick={() => {
          trackClient('connect_completed');
          router.push('/onboarding/bills');
        }}
      >
        I&apos;ve set this up
      </button>
      <button
        className="btn btn-ghost"
        style={{ marginTop: 10 }}
        onClick={() => router.push('/onboarding/bills')}
      >
        Skip for now
      </button>
    </div>
  );
}
