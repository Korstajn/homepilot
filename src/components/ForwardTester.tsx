'use client';

import { useState } from 'react';
import { trackClient } from '@/lib/analytics';
import { formatMoney } from '@/lib/money';
import type { Currency } from '@/lib/types';

const SAMPLE = {
  from: 'billing@virginmedia.com',
  subject: 'Your broadband price is changing',
  text: `Hi,

Thanks for being with Virgin Media. From next month your broadband package
will cost £59 per month. Your current contract renews on 15/10/2026.

If you'd like to discuss your options, get in touch.

The Virgin Media team`,
};

type Extracted = {
  provider: string | null;
  type: string | null;
  amount: number | null;
  currency: Currency | null;
  renewalDate: string | null;
  priceIncreaseFlag: boolean;
  confidence: number;
};

export default function ForwardTester({ onIngested }: { onIngested?: () => void }) {
  const [from, setFrom] = useState(SAMPLE.from);
  const [subject, setSubject] = useState(SAMPLE.subject);
  const [text, setText] = useState(SAMPLE.text);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ extracted: Extracted; engine: string } | null>(null);
  const [error, setError] = useState('');

  async function send() {
    setError('');
    setBusy(true);
    setResult(null);
    const res = await fetch('/api/inbound/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, subject, text }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Could not process that email.');
      return;
    }
    const j = await res.json();
    setResult({ extracted: j.extracted, engine: j.engine });
    trackClient('forward_tested', { engine: j.engine });
    onIngested?.();
  }

  return (
    <div className="card stack" style={{ borderColor: 'var(--brand)' }}>
      <div>
        <h3>Try forwarding a bill</h3>
        <p className="small" style={{ margin: 0 }}>
          Paste any bill email below and send it to GiGi — she&apos;ll read it just like a
          real forward. A sample is filled in for you.
        </p>
      </div>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>From</span>
        <input value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Subject</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Body</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 120 }} />
      </label>
      {error && <p className="small" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
      <button className="btn btn-primary" disabled={busy} onClick={send}>
        {busy ? 'Reading…' : 'Send to GiGi →'}
      </button>

      {result && (
        <div className="banner ok" style={{ padding: '12px 14px' }}>
          <strong>GiGi read it{result.engine === 'heuristic' ? '' : ' with AI'}.</strong>
          <div className="small" style={{ marginTop: 6, color: 'inherit' }}>
            Provider: <b>{result.extracted.provider ?? '—'}</b> · Type: <b>{result.extracted.type ?? '—'}</b>
            <br />
            Amount: <b>{formatMoney(result.extracted.amount, result.extracted.currency ?? 'GBP')}</b>
            {result.extracted.amount !== null ? '/mo' : ' (left blank — null over guessing)'}
            <br />
            Renews: <b>{result.extracted.renewalDate ?? '— (left blank)'}</b>
            {result.extracted.priceIncreaseFlag ? ' · ↑ price rising' : ''}
          </div>
          <div className="small" style={{ marginTop: 8, color: 'inherit' }}>
            Added to your bills as unconfirmed — confirm it under <b>Bills</b>.
          </div>
        </div>
      )}
    </div>
  );
}
