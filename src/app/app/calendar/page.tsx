'use client';

import { useEffect, useState } from 'react';
import { trackClient } from '@/lib/analytics';
import CommandBar from '@/components/CommandBar';
import ScreenHeader from '@/components/ScreenHeader';
import { SkeletonScreen } from '@/components/Skeleton';
import type { CalendarEvent } from '@/lib/types';

const CAT_COLOR: Record<string, string> = {
  school: 'var(--upcoming)', travel: 'var(--accent)', bill: 'var(--brand)', appointment: 'var(--soon)', other: 'var(--muted)',
};

export default function Calendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [sub, setSub] = useState<{ https: string; webcal: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState('');
  const [canManage, setCanManage] = useState(true);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const [j, me] = await Promise.all([
      fetch('/api/calendar').then((r) => r.json()),
      fetch('/api/auth/me').then((r) => r.json()).catch(() => null),
    ]);
    setLoaded(true);
    setEvents(j.events ?? []);
    setSub(j.subscribe ?? null);
    setCanManage((me?.capabilities ?? []).includes('viewFinances'));
  }
  useEffect(() => { load(); trackClient('calendar_viewed'); }, []);

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2600); }

  async function subscribe(provider: string, href?: string) {
    await fetch('/api/calendar/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) });
    trackClient('calendar_subscribed', { provider });
    if (href) window.location.href = href;
    else showToast('Link copied — add it in your calendar app.');
  }

  async function rotate() {
    if (!confirm('Create a new link? Any calendar subscribed to the old link will stop updating.')) return;
    await fetch('/api/calendar/rotate', { method: 'POST' });
    showToast('New link created.');
    load();
  }

  const groups = groupByDay(events);

  if (!loaded) return <SkeletonScreen />;

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Calendar" title="Your week ahead" subtitle="School, trips, renewals & appointments" />
      <CommandBar />

      {/* Sync card */}
      {sub && (
        <div className="card stack" style={{ borderColor: 'var(--brand)' }}>
          <div className="row between">
            <h3 style={{ margin: 0 }}>Sync to your phone</h3>
            <span className="pill brand">Read-only</span>
          </div>
          <p className="small" style={{ margin: 0 }}>
            Subscribe once and GiGi&apos;s events appear in your own calendar, kept up to date.
          </p>
          <a className="btn btn-primary" href={sub.webcal} onClick={() => subscribe('Apple/iOS Calendar')}>
            Add to iPhone / Apple Calendar
          </a>
          <button className="btn btn-ghost btn-sm" style={{ width: '100%' }}
            onClick={() => { navigator.clipboard?.writeText(sub.https).catch(() => {}); subscribe('Google/Outlook (copied link)'); }}>
            Copy link for Google / Outlook
          </button>
          <p className="tiny muted" style={{ margin: 0 }}>
            Subscribing shares these events with your calendar provider (they fetch the link). It&apos;s in your{' '}
            <a href="/app/data" className="link">data log</a>. <button className="link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={rotate}>Reset link</button>
          </p>
        </div>
      )}

      {canManage && (
        adding
          ? <AddEvent onDone={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />
          : <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>+ Add event</button>
      )}

      {groups.length === 0 && (
        <div className="card center" style={{ marginTop: 12 }}><p className="small muted" style={{ margin: 0 }}>Nothing coming up.</p></div>
      )}

      {groups.map(([day, items]) => (
        <div key={day} style={{ marginTop: 14 }}>
          <p className="eyebrow" style={{ margin: '0 0 8px' }}>{day}</p>
          <div className="stack">
            {items.map((e) => (
              <div className="card" key={e.id}>
                <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <span className="dot" style={{ background: CAT_COLOR[e.category], marginTop: 6 }} />
                  <div className="grow">
                    <div className="row between">
                      <span className="tiny muted">{e.allDay ? 'All day' : timeOf(e.start)}</span>
                      <span className="badge-cat">{e.category}</span>
                    </div>
                    <h3 style={{ margin: '2px 0 2px' }}>{e.summary}</h3>
                    {e.description && <p className="tiny muted" style={{ margin: 0 }}>{e.description}</p>}
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      <a className="btn btn-subtle btn-sm" href={`/api/calendar/event?id=${encodeURIComponent(e.id)}`}>+ Add to calendar</a>
                      {canManage && e.source === 'manual' && (
                        <button className="btn btn-ghost btn-sm" onClick={async () => { await fetch(`/api/calendar?id=${e.id}`, { method: 'DELETE' }); load(); }}>Remove</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function AddEvent({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [summary, setSummary] = useState('');
  const [start, setStart] = useState('');
  const [category, setCategory] = useState('other');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    await fetch('/api/calendar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, start, category, allDay: true }),
    });
    trackClient('calendar_event_added', { category });
    setBusy(false);
    onDone();
  }

  return (
    <div className="card stack" style={{ marginTop: 12, borderColor: 'var(--brand)' }}>
      <h3>Add an event</h3>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Title</span>
        <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. School fair" />
      </label>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Date</span>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {['school', 'travel', 'appointment', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={!summary || !start || busy} onClick={submit}>{busy ? 'Adding…' : 'Add'}</button>
      </div>
    </div>
  );
}

function groupByDay(events: CalendarEvent[]): [string, CalendarEvent[]][] {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const day = new Date(e.start.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(e);
  }
  return [...map.entries()];
}

function timeOf(iso: string): string {
  if (!iso.includes('T')) return 'All day';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
