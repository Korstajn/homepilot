'use client';

import { useState } from 'react';
import { trackClient } from '@/lib/analytics';

/**
 * "Show me what you would do with my school email."
 *
 * The whole screen is the working, not a result. A scan creates nothing: it
 * shows what GiGi read, which child it matched, what it would put in the
 * calendar and the exact sentence behind each date, and then the household
 * ticks what is right. That is approve-to-execute applied to extraction itself,
 * which is the only honest way to run a model over mail about children.
 */

interface PlannedEvent {
  key: string;
  itemType: string;
  reason: string;
  duplicate: boolean;
  event: {
    summary: string;
    description?: string;
    start: string;
    allDay: boolean;
    relatedChildId?: string;
    evidence?: { source: string; quote: string };
  };
}

interface Scan {
  sourceRef: string;
  from: string | null;
  subject: string | null;
  engine: string;
  extracted: {
    school: string | null;
    childName: string | null;
    items: { type: string; title: string; dueDate: string | null; eventDate: string | null; amount: number | null }[];
    ignoredForPrivacy: number;
    confidence: number;
  };
  planned: PlannedEvent[];
  unplanned: { type: string; title: string; why: string }[];
  skipped: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  form: 'Form',
  payment: 'Payment',
  kit: 'Bring',
  event: 'Event',
  absence: 'Absence',
  info: 'Info',
};

const ENGINE_LABEL: Record<string, string> = {
  anthropic: 'read by GiGi’s AI',
  heuristic: 'read on our server, no AI',
  'anthropic-failed': 'AI unavailable — read on our server instead',
  skipped: 'not read',
};

export default function SchoolScanner({ onCreated }: { onCreated?: () => void }) {
  const [mode, setMode] = useState<'gmail' | 'paste'>('paste');
  const [scans, setScans] = useState<Scan[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const [from, setFrom] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');

  async function scan() {
    setBusy(true);
    setError('');
    setResult('');
    setScans(null);
    const res = await fetch('/api/school/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        mode === 'paste' ? { source: 'paste', email: { from, subject, text } } : { source: 'gmail', days: 30 },
      ),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'That did not work.');
      return;
    }
    trackClient('school_scan_viewed', { source: mode, planned: json.planned });
    setScans(json.scans ?? []);
    // Everything GiGi is confident enough to propose starts ticked; the user
    // unticks rather than hunting for what to tick.
    setSelected(
      new Set(
        (json.scans ?? [])
          .flatMap((s: Scan) => s.planned)
          .filter((p: PlannedEvent) => !p.duplicate)
          .map((p: PlannedEvent) => p.key),
      ),
    );
  }

  async function apply() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/school/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apply: true, approve: [...selected] }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'That did not save.');
      return;
    }
    setResult(`Added ${json.created.length} to your calendar.`);
    setScans(null);
    onCreated?.();
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const totalPlanned = scans?.reduce((n, s) => n + s.planned.length, 0) ?? 0;

  return (
    <div className="card stack" style={{ borderColor: 'var(--brand)' }}>
      <div className="row between">
        <h3 style={{ margin: 0 }}>Try it on a school email</h3>
        <span className="pill brand">Nothing saved yet</span>
      </div>
      <p className="small" style={{ margin: 0 }}>
        GiGi reads the email and shows you what it would put in the calendar, and why. You choose what it keeps.
      </p>

      <div className="choices">
        <button className={`choice ${mode === 'paste' ? 'selected' : ''}`} onClick={() => setMode('paste')}>
          Paste an email
        </button>
        <button className={`choice ${mode === 'gmail' ? 'selected' : ''}`} onClick={() => setMode('gmail')}>
          My connected inbox
        </button>
      </div>

      {mode === 'paste' ? (
        <>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>From</span>
            <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="office@stmarys.sch.uk" />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Year 4 trip to the Science Museum" />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>The email</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Paste the whole thing — GiGi will tell you what it found." />
          </label>
        </>
      ) : (
        <p className="tiny muted" style={{ margin: 0 }}>
          Reads the last 30 days of school-looking mail from the Gmail account you connected in Settings, up to eight messages.
          Reading a message is recorded in your <a href="/app/data" className="link">data log</a>.
        </p>
      )}

      <button
        className="btn btn-primary"
        disabled={busy || (mode === 'paste' && !subject && !text)}
        onClick={scan}
      >
        {busy ? 'Reading…' : 'Show me what you would do'}
      </button>

      {error && <p className="small" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
      {result && <div className="banner ok">{result}</div>}

      {scans && scans.length === 0 && (
        <p className="small muted" style={{ margin: 0 }}>No school-looking mail found in that window.</p>
      )}

      {scans?.map((s) => (
        <div key={s.sourceRef} style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, overflowWrap: 'anywhere' }}>{s.subject || '(no subject)'}</h3>
              <p className="tiny muted" style={{ margin: '2px 0 0', overflowWrap: 'anywhere' }}>{s.from}</p>
            </div>
          </div>

          <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span className="pill">{ENGINE_LABEL[s.engine] ?? s.engine}</span>
            {s.extracted.childName ? (
              <span className="pill brand">matched {s.extracted.childName}</span>
            ) : (
              <span className="pill">no child named</span>
            )}
            {s.extracted.items.length > 0 && (
              <span className="pill">confidence {Math.round(s.extracted.confidence * 100)}%</span>
            )}
          </div>

          {s.extracted.ignoredForPrivacy > 0 && (
            <p className="tiny" style={{ margin: '8px 0 0', color: 'var(--brand-ink)' }}>
              {s.extracted.ignoredForPrivacy} line{s.extracted.ignoredForPrivacy === 1 ? '' : 's'} about
              other families&apos; children {s.extracted.ignoredForPrivacy === 1 ? 'was' : 'were'} ignored and not stored.
            </p>
          )}

          {s.skipped && (
            <p className="small muted" style={{ margin: '10px 0 0' }}>{s.skipped}</p>
          )}

          {s.unplanned.map((u, i) => (
            <p key={i} className="tiny muted" style={{ margin: '8px 0 0' }}>
              Found but not added: <b>{u.title}</b> — {u.why}
            </p>
          ))}

          {s.planned.map((p) => (
            <label
              key={p.key}
              className="card"
              style={{
                display: 'block', marginTop: 10, cursor: p.duplicate ? 'default' : 'pointer',
                opacity: p.duplicate ? 0.6 : 1,
                borderColor: selected.has(p.key) ? 'var(--brand)' : 'var(--border)',
              }}
            >
              <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={selected.has(p.key)}
                  disabled={p.duplicate}
                  onChange={() => toggle(p.key)}
                  style={{ width: 18, height: 18, marginTop: 2, flex: 'none' }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row between">
                    <span className="badge-cat">{TYPE_LABEL[p.itemType] ?? p.itemType}</span>
                    {p.duplicate && <span className="tiny muted">already added</span>}
                  </div>
                  <h3 style={{ margin: '2px 0 2px', overflowWrap: 'anywhere' }}>{p.event.summary}</h3>
                  <p className="tiny" style={{ margin: 0, color: 'var(--ink-soft)' }}>{p.reason}</p>
                  {/* The sentence the date came out of. This is what makes a
                      wrong reading correctable instead of mysterious. */}
                  {p.event.evidence && (
                    <p className="tiny muted" style={{ margin: '6px 0 0', fontStyle: 'italic', overflowWrap: 'anywhere' }}>
                      “{p.event.evidence.quote}”
                    </p>
                  )}
                </div>
              </div>
            </label>
          ))}
        </div>
      ))}

      {scans && totalPlanned > 0 && (
        <button className="btn btn-primary" disabled={busy || selected.size === 0} onClick={apply}>
          {busy ? 'Adding…' : `Add ${selected.size} to the calendar`}
        </button>
      )}
    </div>
  );
}
