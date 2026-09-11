'use client';

import { useEffect, useState } from 'react';
import { trackClient } from '@/lib/analytics';
import { formatMoney } from '@/lib/money';
import { AddBill } from '@/components/AddBill';
import ForwardTester from '@/components/ForwardTester';
import CommandBar from '@/components/CommandBar';
import ScreenHeader from '@/components/ScreenHeader';
import CountUp from '@/components/CountUp';
import { SkeletonScreen } from '@/components/Skeleton';
import type { Bill, Currency, Digest, DigestItem } from '@/lib/types';

export default function BillsRegister() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [currency, setCurrency] = useState<Currency>('GBP');
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [value, setValue] = useState<{ savedAnnual: number; handled: number } | null>(null);
  const [proposals, setProposals] = useState<DigestItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const [toast, setToast] = useState('');
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const j = await fetch('/api/bills').then((r) => r.json());
    setLoaded(true);
    setBills(j.bills ?? []);
    setCurrency(j.currency ?? 'GBP');
    setMonthlyTotal(j.monthlyTotal ?? 0);
    fetch('/api/value').then((r) => r.json()).then(setValue).catch(() => {});
    const d = await fetch('/api/digest').then((r) => r.json()).catch(() => ({ digest: null }));
    const digest: Digest | null = d.digest;
    const all = digest ? [...digest.items, ...digest.overflow] : [];
    setProposals(all.filter((i) => i.category === 'bill' && i.executable && i.status === 'open'));
  }

  useEffect(() => { load(); trackClient('bills_register_viewed'); }, []);

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2600); }

  async function approve(item: DigestItem) {
    const res = await fetch('/api/actions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id, action: 'approve' }),
    });
    const j = await res.json();
    if (j.ok) { showToast(j.outcome ?? 'Approved'); trackClient('bill_approved', {}); load(); }
  }

  async function remove(id: string) {
    await fetch(`/api/bills/${id}`, { method: 'DELETE' });
    trackClient('bill_deleted', { id });
    load();
  }

  const renewalsSoon = bills.filter((b) => b.confirmed && b.renewalDate).length;

  if (!loaded) return <SkeletonScreen />;

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Bills & contracts" title="Optimising your bills" subtitle="Monitored continuously · switched with your approval" />
      <CommandBar />

      {/* Impact stat card */}
      <div className="card" style={{ background: 'linear-gradient(160deg,#26221e,#1c1b19)', color: '#fff', border: 'none' }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <p className="eyebrow" style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Monthly bills tracked</p>
            <div style={{ fontSize: 26, fontWeight: 700 }}><CountUp value={monthlyTotal} format={(n) => formatMoney(Math.round(n), currency)} /></div>
            <span className="tiny" style={{ color: 'rgba(255,255,255,0.6)' }}>{bills.filter((b) => b.confirmed).length} contracts monitored</span>
          </div>
          {value && (
            <span className="pill" style={{ background: 'var(--brand)', color: '#fff' }}>
              <CountUp value={value.savedAnnual} format={(n) => formatMoney(Math.round(n), currency)} /> saved
            </span>
          )}
        </div>
        <div className="row" style={{ gap: 20, marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 12 }}>
          <div><div style={{ fontWeight: 700, color: 'var(--brand-soft)' }}>{renewalsSoon}</div><span className="tiny" style={{ color: 'rgba(255,255,255,0.6)' }}>renewals tracked</span></div>
          <div><div style={{ fontWeight: 700 }}>{value ? Math.max(1, Math.round(value.handled * 0.4)) : 0} hrs</div><span className="tiny" style={{ color: 'rgba(255,255,255,0.6)' }}>time saved</span></div>
        </div>
      </div>

      {/* Ready to approve */}
      {proposals.length > 0 && (
        <>
          <p className="eyebrow" style={{ margin: '18px 0 10px' }}>Ready to approve</p>
          <div className="stack">
            {proposals.map((p) => (
              <div className="card" key={p.id} style={{ borderColor: 'var(--brand)' }}>
                <span className="badge-cat">{p.line}</span>
                {p.currentPrice && p.newPrice && (
                  <div className="row" style={{ gap: 10, marginTop: 8, alignItems: 'center' }}>
                    <div className="card" style={{ flex: 1, padding: '8px 10px', textAlign: 'center', boxShadow: 'none' }}>
                      <div className="tiny muted">Current</div><b>{formatMoney(p.currentPrice, currency)}/mo</b>
                    </div>
                    <span>→</span>
                    <div className="card" style={{ flex: 1, padding: '8px 10px', textAlign: 'center', boxShadow: 'none', borderColor: 'var(--brand)' }}>
                      <div className="tiny muted">New deal</div><b style={{ color: 'var(--brand)' }}>{formatMoney(p.newPrice, currency)}/mo</b>
                    </div>
                  </div>
                )}
                {p.savingAnnual && <p className="small" style={{ margin: '8px 0 0' }}>You save {formatMoney(p.savingAnnual, currency)} this year · you keep 90%</p>}
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={() => approve(p)}>Approve switch</button>
                  <button className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => { fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: p.id, action: 'dismiss' }) }).then(load); }}>Not now</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="eyebrow" style={{ margin: '18px 0 10px' }}>All bills</p>
      <div className="stack">
        {bills.map((b) => (
          <div className="card" key={b.id}>
            <div className="row between">
              <div>
                <h3 style={{ marginBottom: 2 }}>{b.provider}</h3>
                <span className="badge-cat">{b.type}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{formatMoney(b.amount, currency)}<span className="tiny muted">/mo</span></div>
                {b.renewalDate && <span className="tiny muted">renews {b.renewalDate}</span>}
              </div>
            </div>
            <div className="row between" style={{ marginTop: 10 }}>
              <div className="row" style={{ gap: 6 }}>
                {b.priceIncreaseFlag && <span className="pill accent">↑ rising</span>}
                {!b.confirmed && <span className="pill accent">unconfirmed</span>}
                <span className="pill">{b.source}</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => remove(b.id)}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <AddBill currency={currency} where="register" onDone={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />
      ) : (
        <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => { setAdding(true); trackClient('add_bill_opened', { where: 'register' }); }}>
          + Add a bill
        </button>
      )}

      {forwarding ? (
        <div style={{ marginTop: 12 }}>
          <ForwardTester onIngested={load} />
          <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => setForwarding(false)}>Close</button>
        </div>
      ) : (
        <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => { setForwarding(true); trackClient('forward_tester_opened', { where: 'register' }); }}>
          Forward a bill to GiGi
        </button>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
