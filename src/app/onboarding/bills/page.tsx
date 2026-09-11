'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Progress } from '@/components/OnboardingProgress';
import { AddBill } from '@/components/AddBill';
import { trackClient } from '@/lib/analytics';
import { formatMoney } from '@/lib/money';
import type { Bill, Currency } from '@/lib/types';

export default function BillsFound() {
  const router = useRouter();
  const [bills, setBills] = useState<Bill[]>([]);
  const [currency, setCurrency] = useState<Currency>('GBP');
  const [adding, setAdding] = useState(false);

  async function load() {
    const j = await fetch('/api/bills').then((r) => r.json());
    setBills(j.bills);
    setCurrency(j.currency);
  }

  useEffect(() => {
    trackClient('bills_found_viewed');
    load();
  }, []);

  async function confirm(id: string) {
    await fetch(`/api/bills/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true }),
    });
    trackClient('bill_confirmed', { id });
    load();
  }

  const needsAttention = bills.filter((b) => !b.confirmed || b.amount === null || b.renewalDate === null);

  return (
    <div className="screen">
      <Progress step={3} />
      <h1>Here&apos;s what we found</h1>
      <p>
        Confirm or fix these before GiGi starts monitoring. When we weren&apos;t sure of a value,
        we left it blank rather than guess — please fill it in.
      </p>

      {needsAttention.length > 0 && (
        <div className="banner warn" style={{ marginBottom: 12 }}>
          {needsAttention.length} bill{needsAttention.length > 1 ? 's need' : ' needs'} a quick check.
        </div>
      )}

      <div className="stack">
        {bills.map((b) => (
          <BillCard key={b.id} bill={b} currency={currency} onConfirm={() => confirm(b.id)} onChange={load} />
        ))}
      </div>

      {adding ? (
        <AddBill currency={currency} onDone={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />
      ) : (
        <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => { setAdding(true); trackClient('add_bill_opened', { where: 'onboarding' }); }}>
          + Add a bill manually
        </button>
      )}

      <button
        className="btn btn-primary"
        style={{ marginTop: 16 }}
        onClick={() => {
          trackClient('onboarding_bills_confirmed', { count: bills.length });
          router.push('/onboarding/done');
        }}
      >
        Start monitoring
      </button>
    </div>
  );
}

function BillCard({
  bill,
  currency,
  onConfirm,
  onChange,
}: {
  bill: Bill;
  currency: Currency;
  onConfirm: () => void;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(bill.amount === null || bill.renewalDate === null);
  const [amount, setAmount] = useState(bill.amount?.toString() ?? '');
  const [renewalDate, setRenewalDate] = useState(bill.renewalDate ?? '');

  async function save() {
    await fetch(`/api/bills/${bill.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, renewalDate, confirmed: true }),
    });
    trackClient('bill_edited', { id: bill.id });
    setEditing(false);
    onChange();
  }

  return (
    <div className="card">
      <div className="row between">
        <div>
          <h3 style={{ marginBottom: 2 }}>{bill.provider}</h3>
          <span className="badge-cat">{bill.type}</span>
        </div>
        {bill.confirmed && !editing ? (
          <span className="pill brand">✓ Confirmed</span>
        ) : (
          <span className="pill accent">Needs check</span>
        )}
      </div>

      {editing ? (
        <div className="stack" style={{ marginTop: 12 }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Monthly amount ({currency})</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 42" />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Renewal date</span>
            <input type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} />
          </label>
          <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={save}>Save</button>
        </div>
      ) : (
        <div className="row between" style={{ marginTop: 10 }}>
          <span className="small">
            {formatMoney(bill.amount, currency)}/mo
            {bill.renewalDate ? ` · renews ${bill.renewalDate}` : ''}
            {bill.priceIncreaseFlag ? ' · ↑ price rising' : ''}
          </span>
          {!bill.confirmed ? (
            <button className="btn btn-subtle btn-sm" onClick={onConfirm}>Confirm</button>
          ) : (
            <button className="btn btn-subtle btn-sm" onClick={() => setEditing(true)}>Edit</button>
          )}
        </div>
      )}
    </div>
  );
}
