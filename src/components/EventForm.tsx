'use client';

import { useState } from 'react';
import { trackClient } from '@/lib/analytics';
import type { CalendarEvent, Child } from '@/lib/types';

const CATEGORIES: CalendarEvent['category'][] = ['school', 'travel', 'appointment', 'other'];

const REPEATS: { label: string; value: string }[] = [
  { label: 'Once', value: '' },
  { label: 'Every week', value: 'FREQ=WEEKLY' },
  { label: 'Every fortnight', value: 'FREQ=WEEKLY;INTERVAL=2' },
  { label: 'Every month', value: 'FREQ=MONTHLY' },
  { label: 'Every year', value: 'FREQ=YEARLY' },
];

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/**
 * Add or edit one event.
 *
 * The form this replaces could only express "a thing, on a day": `allDay` was
 * hard-coded true, there was no time, no child, no repeat and no edit. That is
 * not the shape of family life — swimming is every Tuesday at 08:20 and belongs
 * to one specific child, and saying so once should be enough.
 */
export default function EventForm({
  event,
  children,
  onDone,
  onCancel,
}: {
  event?: CalendarEvent;
  children: Child[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const editing = Boolean(event);
  const [summary, setSummary] = useState(event?.summary ?? '');
  const [date, setDate] = useState(event?.start.slice(0, 10) ?? '');
  const [time, setTime] = useState(event && !event.allDay ? event.start.slice(11, 16) : '');
  const [category, setCategory] = useState<string>(event?.category ?? 'other');
  const [childId, setChildId] = useState(event?.relatedChildId ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [repeat, setRepeat] = useState(baseRepeat(event?.rrule));
  const [byDay, setByDay] = useState<string[]>(parseByDay(event?.rrule));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function rrule(): string | undefined {
    if (!repeat) return undefined;
    if (repeat.startsWith('FREQ=WEEKLY') && byDay.length) {
      return `${repeat};BYDAY=${byDay.join(',')}`;
    }
    return repeat;
  }

  async function submit() {
    setBusy(true);
    setError('');
    const start = time ? `${date}T${time}:00` : date;
    const res = await fetch('/api/calendar', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: event?.id,
        summary,
        start,
        allDay: !time,
        category,
        location: location || undefined,
        relatedChildId: childId || undefined,
        rrule: rrule(),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'That did not save.');
      return;
    }
    trackClient(editing ? 'calendar_event_edited' : 'calendar_event_added', { category });
    onDone();
  }

  const weekly = repeat.startsWith('FREQ=WEEKLY');

  return (
    <div className="card stack" style={{ marginTop: 12, borderColor: 'var(--brand)' }}>
      <h3>{editing ? 'Edit event' : 'Add an event'}</h3>

      <label className="field" style={{ marginBottom: 0 }}>
        <span>Title</span>
        <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Swimming" />
      </label>

      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <label className="field grow" style={{ marginBottom: 0 }}>
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field grow" style={{ marginBottom: 0 }}>
          {/* Optional on purpose: a school trip is a day, a pickup is a time. */}
          <span>Time <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>

      <label className="field" style={{ marginBottom: 0 }}>
        <span>Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      {children.length > 0 && (
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Who is it for? <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></span>
          <select value={childId} onChange={(e) => setChildId(e.target.value)}>
            <option value="">The whole household</option>
            {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}

      <label className="field" style={{ marginBottom: 0 }}>
        <span>Repeats</span>
        <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
          {REPEATS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </label>

      {weekly && (
        <div className="choices">
          {WEEKDAYS.map((d) => (
            <button
              key={d}
              type="button"
              className={`choice ${byDay.includes(d) ? 'selected' : ''}`}
              style={{ padding: '8px 12px' }}
              onClick={() => setByDay((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))}
            >
              {d[0] + d[1].toLowerCase()}
            </button>
          ))}
        </div>
      )}

      <label className="field" style={{ marginBottom: 0 }}>
        <span>Where <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Leisure centre" />
      </label>

      {error && <p className="small" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={!summary || !date || busy} onClick={submit}>
          {busy ? 'Saving…' : editing ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  );
}

function baseRepeat(rrule?: string): string {
  if (!rrule) return '';
  return rrule.replace(/;BYDAY=[A-Z,]+/, '');
}

function parseByDay(rrule?: string): string[] {
  const m = rrule?.match(/BYDAY=([A-Z,]+)/);
  return m ? m[1].split(',') : [];
}
