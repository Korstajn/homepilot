'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Progress } from '@/components/OnboardingProgress';
import { trackClient } from '@/lib/analytics';

export default function Done() {
  const [name, setName] = useState('there');
  const [count, setCount] = useState(0);

  useEffect(() => {
    trackClient('onboarding_completed');
    fetch('/api/household').then((r) => r.json()).then((j) => setName(j.household?.ownerName ?? 'there')).catch(() => {});
    fetch('/api/bills').then((r) => r.json()).then((j) => setCount(j.bills?.length ?? 0)).catch(() => {});
  }, []);

  return (
    <div className="screen center">
      <Progress step={4} />
      <h1>GiGi is running, {name}.</h1>
      <p>
        We&apos;re watching {count} bill{count === 1 ? '' : 's'} and your household admin. From here,
        you&apos;ll only hear from us when something needs you.
      </p>

      <div className="card stack" style={{ textAlign: 'left', marginTop: 8 }}>
        <div className="row"><span className="dot upcoming" /><span className="small">Your first digest lands tomorrow at 7am.</span></div>
        <div className="row"><span className="dot upcoming" /><span className="small">Never more than four things. Nothing on the calm days.</span></div>
        <div className="row"><span className="dot upcoming" /><span className="small">Every action waits for your tap.</span></div>
      </div>

      <Link href="/app/digest" className="btn btn-primary" style={{ marginTop: 18 }}>
        Preview today&apos;s digest
      </Link>
      <Link href="/app/family" className="btn btn-ghost" style={{ marginTop: 10 }}>
        Add your family
      </Link>
      <Link href="/app" className="link small" style={{ marginTop: 12, display: 'inline-block' }}>
        Skip to home
      </Link>
    </div>
  );
}
