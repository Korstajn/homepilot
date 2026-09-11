'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { trackClient } from '@/lib/analytics';
import type { ProcessingActor, ProcessingEvent } from '@/lib/types';

interface Subprocessor {
  name: string; role: string; region: string; data: string; active: boolean; note?: string;
}

const ACTOR: Record<ProcessingActor, { label: string; color: string }> = {
  you: { label: 'You', color: 'var(--ink)' },
  gigi_server: { label: 'GiGi server', color: 'var(--brand)' },
  gigi_ai: { label: 'GiGi AI (EU)', color: 'var(--accent)' },
  email_service: { label: 'Email service', color: 'var(--muted)' },
  concierge: { label: 'Concierge', color: 'var(--accent)' },
};

export default function DataTrust() {
  const [events, setEvents] = useState<ProcessingEvent[]>([]);
  const [subs, setSubs] = useState<Subprocessor[]>([]);
  const [integrity, setIntegrity] = useState<{ ok: boolean; count: number } | null>(null);

  useEffect(() => {
    fetch('/api/processing').then((r) => r.json()).then((j) => {
      setEvents(j.events ?? []);
      setSubs(j.subprocessors ?? []);
      setIntegrity(j.integrity ?? null);
    }).catch(() => {});
    trackClient('data_trust_viewed');
  }, []);

  const groups = groupByDay(events);

  return (
    <div className="screen">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>Your data</h1>
        <Link href="/app/settings" className="pill">← Settings</Link>
      </div>
      <p className="small muted">
        Everything GiGi has done with your data, newest first. This log records the
        data flow — never the contents of your emails.
      </p>

      {integrity && (
        <div className={`banner ${integrity.ok ? 'ok' : 'warn'}`} style={{ marginBottom: 14 }}>
          {integrity.ok
            ? `Append-only log · ${integrity.count} events · verified unaltered`
            : '⚠ Log integrity check failed'}
        </div>
      )}

      {groups.length === 0 && (
        <div className="card center"><p className="small muted" style={{ margin: 0 }}>Nothing has happened with your data yet.</p></div>
      )}

      {groups.map(([day, items]) => (
        <div key={day} style={{ marginBottom: 8 }}>
          <p className="eyebrow" style={{ margin: '14px 0 8px' }}>{day}</p>
          <div className="stack">
            {items.map((e) => <EventRow key={e.id} e={e} />)}
          </div>
        </div>
      ))}

      <div className="divider" />
      <h2 style={{ fontSize: 18 }}>Who can touch your data</h2>
      <p className="small muted" style={{ marginTop: 0 }}>The full list. Nothing hidden.</p>
      <div className="stack">
        {subs.map((s) => (
          <div className="card" key={s.name} style={{ opacity: s.active ? 1 : 0.72 }}>
            <div className="row between">
              <h3 style={{ margin: 0 }}>{s.name}</h3>
              <span className={`pill ${s.active ? 'brand' : ''}`}>{s.active ? `● ${s.region}` : 'Not in use'}</span>
            </div>
            <p className="small" style={{ margin: '6px 0 0' }}>{s.role}</p>
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>Data: {s.data}</p>
            {s.note && <p className="tiny" style={{ margin: '4px 0 0', color: 'var(--brand-ink)' }}>{s.note}</p>}
          </div>
        ))}
      </div>

      <p className="tiny muted center" style={{ marginTop: 22 }}>
        This is your GDPR record of processing (Art. 15 &amp; 30), in plain words.
      </p>
    </div>
  );
}

function EventRow({ e }: { e: ProcessingEvent }) {
  const actor = ACTOR[e.actor];
  const time = new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: actor.color, marginTop: 6, flex: 'none' }} />
        <div className="grow">
          <div className="row between">
            <span className="tiny" style={{ fontWeight: 700, color: actor.color }}>{actor.label}</span>
            <span className="tiny muted">{time} · {e.region}</span>
          </div>
          <p className="small" style={{ margin: '3px 0 0', color: 'var(--ink)' }}>{e.detail}</p>
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>
            Why: {e.purpose} · Basis: {e.legalBasis}
            {e.durationMs != null ? ` · ${e.durationMs} ms` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

function groupByDay(events: ProcessingEvent[]): [string, ProcessingEvent[]][] {
  const map = new Map<string, ProcessingEvent[]>();
  for (const e of events) {
    const day = new Date(e.at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(e);
  }
  return [...map.entries()];
}
