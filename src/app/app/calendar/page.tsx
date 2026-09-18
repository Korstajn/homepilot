'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { trackClient } from '@/lib/analytics';
import CommandBar from '@/components/CommandBar';
import ScreenHeader from '@/components/ScreenHeader';
import { SkeletonScreen } from '@/components/Skeleton';
import WeekStrip, { colourFor } from '@/components/WeekStrip';
import EventForm from '@/components/EventForm';
import GoogleCalendarSync from '@/components/GoogleCalendarSync';
import { describeRrule } from '@/lib/calendar';
import type { CalendarEvent, Child } from '@/lib/types';

export default function Calendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [sub, setSub] = useState<{ https: string; webcal: string } | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);
  const [toast, setToast] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [j, kids] = await Promise.all([
      fetch('/api/calendar').then((r) => r.json()),
      fetch('/api/children').then((r) => r.json()).catch(() => ({ children: [] })),
    ]);
    setLoaded(true);
    setEvents(j.events ?? []);
    setSub(j.subscribe ?? null);
    setCanManage(Boolean(j.canManage));
    setChildren(kids.children ?? []);
  }, []);
  useEffect(() => { load(); trackClient('calendar_viewed'); }, [load]);

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

  async function remove(id: string) {
    await fetch(`/api/calendar?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    load();
  }

  const groups = useMemo(() => groupByDay(events), [events]);

  if (!loaded) return <SkeletonScreen />;

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Calendar" title="The week ahead" subtitle="Everyone in the family, everything in the house" />
      <CommandBar />

      {/* The whole household at a glance: one coloured bar per person or
          category with something on that day. Reading it takes a second and
          needs no words. */}
      <WeekStrip events={events} children={children} />

      {canManage && (
        editing === 'new'
          ? <EventForm children={children} onDone={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
          : <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setEditing('new')}>+ Add event</button>
      )}

      {groups.length === 0 && (
        <div className="card center" style={{ marginTop: 12 }}>
          <p className="small muted" style={{ margin: 0 }}>Nothing coming up.</p>
        </div>
      )}

      {groups.map(({ day, label, items }) => (
        <div key={day} style={{ marginTop: 14 }}>
          <p className="eyebrow" style={{ margin: '0 0 8px' }}>{label}</p>
          <div className="stack">
            {items.map((e) =>
              editing !== 'new' && editing?.id === e.id ? (
                <EventForm
                  key={e.id}
                  event={e}
                  children={children}
                  onDone={() => { setEditing(null); load(); }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <article className="card" key={e.id} style={{ display: 'flex', gap: 0, padding: 0, overflow: 'hidden' }}>
                  <span aria-hidden style={{ width: 4, flex: 'none', background: colourFor(e, children) }} />
                  <div style={{ flex: 1, padding: 16 }}>
                    <div className="row between">
                      <span className="tiny muted">
                        {e.allDay ? 'All day' : timeOf(e.start)}
                        {/* Say where it came from. An imported event cannot be
                            edited here, and a card that looks identical to a
                            typed-in one makes the missing Edit button read as a
                            bug rather than as the rule it is. */}
                        {e.source === 'google' && ' · from Google'}
                      </span>
                      <span className="badge-cat">{e.category}</span>
                    </div>
                    <h3 style={{ margin: '2px 0 2px' }}>{e.summary}</h3>
                    {e.description && <p className="tiny muted" style={{ margin: 0 }}>{e.description}</p>}
                    {(e.location || e.rrule) && (
                      <p className="tiny muted" style={{ margin: '2px 0 0' }}>
                        {[e.location, e.rrule ? describeRrule(e.rrule) : null].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      <a className="btn btn-subtle btn-sm" href={`/api/calendar/event?id=${encodeURIComponent(e.id)}`}>+ Add to calendar</a>
                      {canManage && e.source === 'manual' && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(e)}>Edit</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => remove(e.id)}>Remove</button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              ),
            )}
          </div>
        </div>
      ))}

      {/* Sync sits below the week itself: it is setup, not the daily job.
          Two directions, in this order: what comes IN from Google, then what
          goes OUT to a phone. */}
      {canManage && <GoogleCalendarSync onChanged={load} />}

      {sub && (
        <div className="card stack" style={{ marginTop: 20, borderColor: 'var(--brand)' }}>
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
            <a href="/app/data" className="link">data log</a>.{' '}
            <button className="link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={rotate}>Reset link</button>
          </p>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function groupByDay(events: CalendarEvent[]): { day: string; label: string; items: CalendarEvent[] }[] {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const day = e.start.slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(e);
  }
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, items]) => {
      const pretty = new Date(day + 'T00:00:00').toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long',
      });
      const label = day === today ? `Today · ${pretty}` : day === tomorrow ? `Tomorrow · ${pretty}` : pretty;
      return { day, label, items };
    });
}

function timeOf(iso: string): string {
  if (!iso.includes('T')) return 'All day';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
