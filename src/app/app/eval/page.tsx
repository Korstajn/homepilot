'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trackClient } from '@/lib/analytics';

interface Report {
  engine: string;
  aiConfigured: boolean;
  total: number;
  fields: {
    amount: { precision: number; recall: number; nullRate: number };
    renewalDate: { precision: number; recall: number; nullRate: number };
    provider: { accuracy: number };
    type: { accuracy: number };
  };
  gate: { threshold: number; amountPass: boolean; datePass: boolean; pass: boolean };
  cases: {
    id: string; note: string;
    predicted: { provider: string | null; type: string | null; amount: number | null; renewalDate: string | null };
    gold: { provider: string | null; type: string | null; amount: number | null; renewalDate: string | null };
    correct: { amount: boolean; renewalDate: boolean; provider: boolean; type: boolean };
  }[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function Eval() {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true); setError('');
    trackClient('eval_run');
    const res = await fetch('/api/eval', { method: 'POST' });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Eval failed.'); return; }
    setReport(await res.json());
  }

  return (
    <div className="screen">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>Extraction eval</h1>
        <Link href="/app/metrics" className="pill">← Metrics</Link>
      </div>
      <p className="small muted">
        How well GiGi reads bill emails, measured against a hand-labeled set. The gate
        (from CLAUDE.md) is ≥95% precision on amount and renewal date.
      </p>

      <button className="btn btn-primary" onClick={run} disabled={busy}>
        {busy ? 'Running…' : 'Run extraction eval'}
      </button>
      {error && <p className="small" style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</p>}

      {report && (
        <>
          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            <span className={`pill ${report.aiConfigured ? 'brand' : 'accent'}`}>
              Engine: {report.engine === 'anthropic' ? 'Claude (claude-sonnet-5)' : 'Heuristic baseline'}
            </span>
            <span className="pill">{report.total} emails</span>
          </div>

          <div className={`banner ${report.gate.pass ? 'ok' : 'warn'}`} style={{ marginTop: 12 }}>
            {report.gate.pass
              ? `✓ Gate passed — amount & renewal-date precision ≥ ${pct(report.gate.threshold)}`
              : `✗ Gate not met — needs ≥ ${pct(report.gate.threshold)} precision on amount & renewal date`}
          </div>

          <div className="stack" style={{ marginTop: 12 }}>
            <FieldCard label="Amount" f={report.fields.amount} />
            <FieldCard label="Renewal date" f={report.fields.renewalDate} />
            <div className="card row between">
              <span className="small" style={{ fontWeight: 600 }}>Provider accuracy</span>
              <span style={{ fontWeight: 700 }}>{pct(report.fields.provider.accuracy)}</span>
            </div>
            <div className="card row between">
              <span className="small" style={{ fontWeight: 600 }}>Type accuracy</span>
              <span style={{ fontWeight: 700 }}>{pct(report.fields.type.accuracy)}</span>
            </div>
          </div>

          <h2 style={{ fontSize: 18, marginTop: 18 }}>Per-email</h2>
          <div className="stack">
            {report.cases.map((c) => (
              <div className="card" key={c.id}>
                <div className="row between">
                  <span className="small" style={{ fontWeight: 600 }}>{c.id}</span>
                  <span className="tiny">
                    {mark(c.correct.amount)} amt {mark(c.correct.renewalDate)} date {mark(c.correct.provider)} prov {mark(c.correct.type)} type
                  </span>
                </div>
                <p className="tiny muted" style={{ margin: '4px 0 6px' }}>{c.note}</p>
                <div className="tiny" style={{ fontFamily: 'monospace', color: 'var(--ink-soft)' }}>
                  got: {c.predicted.provider ?? '∅'} / {c.predicted.type ?? '∅'} / {c.predicted.amount ?? '∅'} / {c.predicted.renewalDate ?? '∅'}
                  <br />
                  want: {c.gold.provider ?? '∅'} / {c.gold.type ?? '∅'} / {c.gold.amount ?? '∅'} / {c.gold.renewalDate ?? '∅'}
                </div>
              </div>
            ))}
          </div>

          {!report.aiConfigured && (
            <p className="tiny muted center" style={{ marginTop: 16 }}>
              Set <code>ANTHROPIC_API_KEY</code> to run this against Claude instead of the heuristic baseline.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function FieldCard({ label, f }: { label: string; f: { precision: number; recall: number; nullRate: number } }) {
  return (
    <div className="card">
      <div className="row between">
        <span className="small" style={{ fontWeight: 600 }}>{label}</span>
      </div>
      <div className="row" style={{ gap: 16, marginTop: 6 }}>
        <Metric k="Precision" v={pct(f.precision)} />
        <Metric k="Recall" v={pct(f.recall)} />
        <Metric k="Null rate" v={pct(f.nullRate)} />
      </div>
    </div>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{v}</div>
      <div className="tiny muted">{k}</div>
    </div>
  );
}

function mark(ok: boolean) { return ok ? '✓' : '✗'; }
