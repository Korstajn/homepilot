'use client';

import { useState } from 'react';
import { trackClient } from '@/lib/analytics';
import type { BillType, Currency } from '@/lib/types';

const TYPES: BillType[] = ['broadband', 'energy', 'mobile', 'tv', 'insurance', 'other'];

// Manual add-bill — P0 in this build (the plan had it as P1; see docs/DECISIONS.md).
// Shared by onboarding (bills-found) and the bills register.
export function AddBill({
  currency,
  onDone,
  onCancel,
  where = 'onboarding',
}: {
  currency: Currency;
  onDone: () => void;
  onCancel: () => void;
  where?: string;
}) {
  const [provider, setProvider] = useState('');
  const [type, setType] = useState<BillType>('broadband');
  const [amount, setAmount] = useState('');
  const [renewalDate, setRenewalDate] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    await fetch('/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, type, amount, renewalDate }),
    });
    trackClient('bill_added_manually', { type, where });
    setBusy(false);
    onDone();
  }

  return (
    <div className="card stack" style={{ marginTop: 12, borderColor: 'var(--brand)' }}>
      <h3>Add a bill</h3>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Provider</span>
        <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. BT, Octopus, Vodafone" />
      </label>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Type</span>
        <select value={type} onChange={(e) => setType(e.target.value as BillType)}>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Monthly amount ({currency}) <span className="muted tiny">— optional</span></span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 42" />
      </label>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Renewal date <span className="muted tiny">— optional</span></span>
        <input type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} />
      </label>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={!provider || busy} onClick={submit}>
          {busy ? 'Adding…' : 'Add bill'}
        </button>
      </div>
    </div>
  );
}
