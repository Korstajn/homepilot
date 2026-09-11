'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Lightweight founder view of the instrumentation. In production this is a
// proper analytics dashboard; here it proves the events exist from day one.
export default function Metrics() {
  const [events, setEvents] = useState<{ total: number; counts: Record<string, number> } | null>(null);
  const [waitlist, setWaitlist] = useState<{ total: number; household: number; company: number } | null>(null);
  const [feedback, setFeedback] = useState<{ feedback: { message: string; kind: string; createdAt: string }[] } | null>(null);

  useEffect(() => {
    fetch('/api/events').then((r) => r.json()).then(setEvents).catch(() => {});
    fetch('/api/waitlist').then((r) => r.json()).then(setWaitlist).catch(() => {});
    fetch('/api/feedback').then((r) => r.json()).then(setFeedback).catch(() => {});
  }, []);

  return (
    <div className="screen">
      <div className="row between" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Metrics</h1>
        <Link href="/app" className="pill">← Home</Link>
      </div>
      <p className="small muted">Beta instrumentation — the raw signal behind §7 of the plan.</p>

      <div className="row" style={{ gap: 12, marginTop: 6 }}>
        <Stat label="Waitlist" value={waitlist?.total ?? 0} sub={`${waitlist?.household ?? 0} home · ${waitlist?.company ?? 0} co.`} />
        <Stat label="Events" value={events?.total ?? 0} sub="tracked" />
        <Stat label="Feedback" value={feedback?.feedback.length ?? 0} sub="reports" />
      </div>

      <Link href="/app/eval" className="card row between" style={{ marginTop: 12, textDecoration: 'none' }}>
        <div>
          <h3 style={{ marginBottom: 2 }}>Extraction eval →</h3>
          <span className="small muted">How well Claude reads bill emails (precision/recall)</span>
        </div>
        <span className="pill">Run</span>
      </Link>

      <div className="card" style={{ marginTop: 12 }}>
        <h3>Event counts</h3>
        <div className="stack" style={{ marginTop: 8 }}>
          {events && Object.entries(events.counts).sort((a, b) => b[1] - a[1]).map(([name, n]) => (
            <div className="row between small" key={name}>
              <span className="muted" style={{ fontFamily: 'monospace' }}>{name}</span>
              <span style={{ fontWeight: 700 }}>{n}</span>
            </div>
          ))}
          {events && Object.keys(events.counts).length === 0 && <p className="small muted" style={{ margin: 0 }}>No events yet.</p>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3>Recent feedback</h3>
        <div className="stack" style={{ marginTop: 8 }}>
          {feedback?.feedback.slice(0, 8).map((f, i) => (
            <div key={i} className="small">
              <span className="pill accent" style={{ marginRight: 6 }}>{f.kind}</span>
              {f.message}
            </div>
          ))}
          {(!feedback || feedback.feedback.length === 0) && <p className="small muted" style={{ margin: 0 }}>No feedback yet.</p>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="card grow" style={{ padding: 12 }}>
      <p className="eyebrow" style={{ marginBottom: 4 }}>{label}</p>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      <span className="tiny muted">{sub}</span>
    </div>
  );
}
