'use client';

import { useCallback, useEffect, useState } from 'react';
import { trackClient } from '@/lib/analytics';

/**
 * Bring a Google calendar into GiGi.
 *
 * Two things this screen has to be honest about, because both are easy to
 * assume wrongly:
 *
 *   1. A Gmail connection is not calendar access. Someone who linked their
 *      account earlier has a working connection that cannot read a single
 *      calendar, and the fix is to reconnect — so that case gets its own state
 *      and its own sentence rather than "not connected".
 *   2. Nothing is imported until a calendar is ticked. A Google account carries
 *      holidays, birthdays and whatever anyone has ever shared with it, and
 *      pulling all of that in would be the opposite of what GiGi is for.
 */

interface Calendar {
  calendarId: string;
  summary: string;
  isPrimary: boolean;
  backgroundColor?: string;
  selected: boolean;
  category: 'school' | 'travel' | 'appointment' | 'other';
  lastSyncedAt?: string;
  lastError?: string;
}

interface State {
  configured: boolean;
  connected: boolean;
  calendarAccess?: boolean;
  needsReconnect?: boolean;
  account?: string | null;
  calendars: Calendar[];
  stale?: boolean;
  reason?: string;
  error?: string | null;
}

const CATEGORIES: Calendar['category'][] = ['school', 'travel', 'appointment', 'other'];
const CATEGORY_LABEL: Record<Calendar['category'], string> = {
  school: 'School',
  travel: 'Travel',
  appointment: 'Appointments',
  other: 'Other',
};

export default function GoogleCalendarSync({ onChanged }: { onChanged: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async (refresh = false) => {
    const res = await fetch(`/api/calendar/google${refresh ? '?refresh=1' : ''}`);
    const json = await res.json().catch(() => null);
    if (json) setState(json);
    return json as State | null;
  }, []);

  // On mount: read the state, and if the copy has gone stale, refresh it in the
  // background. `ifStale` means the server decides — the page asking on every
  // load must not become a round trip to Google on every load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await load();
      if (cancelled || !s?.calendarAccess || !s.stale) return;
      await fetch('/api/calendar/google/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ifStale: true }),
      }).catch(() => {});
      if (cancelled) return;
      await load();
      onChanged();
    })();
    return () => { cancelled = true; };
  }, [load, onChanged]);

  async function toggle(calendar: Calendar, selected: boolean) {
    setBusy(calendar.calendarId);
    await fetch('/api/calendar/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId: calendar.calendarId, selected }),
    });
    trackClient('google_calendar_toggled', { selected });
    if (selected) {
      // Ticking a calendar and then waiting half an hour for anything to appear
      // would read as broken, so the first sync is immediate.
      await fetch('/api/calendar/google/sync', { method: 'POST' });
      setNote(`Syncing “${calendar.summary}”…`);
    } else {
      setNote(`Stopped syncing “${calendar.summary}”. Its events were removed from GiGi.`);
    }
    await load();
    setBusy('');
    onChanged();
  }

  async function setCategory(calendar: Calendar, category: Calendar['category']) {
    setBusy(calendar.calendarId);
    await fetch('/api/calendar/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId: calendar.calendarId, category }),
    });
    await load();
    setBusy('');
    onChanged();
  }

  async function syncNow() {
    setBusy('sync');
    const res = await fetch('/api/calendar/google/sync', { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    trackClient('google_calendar_sync_clicked');
    if (json.needsReconnect) setNote('Reconnect your Google account to grant calendar access.');
    else if (json.errors?.length) setNote(`Synced, but ${json.errors.length} calendar(s) could not be read.`);
    else setNote(`Up to date — ${json.imported ?? 0} event(s) from Google.`);
    await load();
    setBusy('');
    onChanged();
  }

  async function disconnect() {
    if (!confirm('Turn off Google Calendar sync? Everything imported from it will be deleted from GiGi.')) return;
    setBusy('disconnect');
    await fetch('/api/calendar/google', { method: 'DELETE' });
    trackClient('google_calendar_disconnected');
    setNote('Google Calendar sync is off and the imported events are gone.');
    await load();
    setBusy('');
    onChanged();
  }

  if (!state || !state.configured) return null;

  const selectedCount = state.calendars.filter((c) => c.selected).length;

  return (
    <div className="card stack" style={{ marginTop: 14 }}>
      <div className="row between">
        <h3 style={{ margin: 0 }}>Your Google calendar</h3>
        <span className={`pill ${state.calendarAccess ? 'brand' : ''}`}>
          {state.calendarAccess ? (selectedCount ? `● ${selectedCount} syncing` : '○ None chosen') : 'Read-only'}
        </span>
      </div>

      {!state.connected && (
        <>
          <p className="small" style={{ margin: 0 }}>
            Bring the appointments already in your Google calendar into GiGi, so the household&apos;s
            week is genuinely in one place. <strong>Read-only</strong> — GiGi can never add, move or
            delete anything in your calendar.
          </p>
          <a className="btn btn-primary" href="/api/auth/google/start?next=/app/calendar">
            Connect Google →
          </a>
        </>
      )}

      {state.connected && state.needsReconnect && (
        <>
          <p className="small" style={{ margin: 0 }}>
            {state.reason ??
              'This connection covers Gmail but not your calendar — they are separate permissions.'}
          </p>
          <a className="btn btn-primary" href="/api/auth/google/start?next=/app/calendar">
            Reconnect to add calendar access →
          </a>
          <p className="tiny muted" style={{ margin: 0 }}>
            Still read-only. Nothing in your calendar can be changed by GiGi.
          </p>
        </>
      )}

      {state.calendarAccess && (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            {state.account ? `${state.account} · ` : ''}Tick a calendar to bring it in, and tell GiGi
            what it is — that is what puts a school date in the school part of your digest.
          </p>

          {state.error && (
            <p className="small" style={{ margin: 0, color: 'var(--danger)' }}>{state.error}</p>
          )}

          {state.calendars.length === 0 && (
            <p className="small muted" style={{ margin: 0 }}>No calendars found on this account.</p>
          )}

          <div className="stack">
            {state.calendars.map((c) => (
              <div
                key={c.calendarId}
                style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  padding: '10px 0', borderTop: '1px solid var(--border)',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 10, height: 10, borderRadius: 3, marginTop: 4, flex: 'none',
                    background: c.backgroundColor || 'var(--border-strong)',
                  }}
                />
                <div className="grow" style={{ minWidth: 0 }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={c.selected}
                      disabled={busy === c.calendarId}
                      onChange={(e) => toggle(c, e.target.checked)}
                    />
                    <span className="small" style={{ fontWeight: 600 }}>
                      {c.summary}{c.isPrimary ? ' · main' : ''}
                    </span>
                  </label>

                  {c.selected && (
                    <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          className={`pill ${c.category === cat ? 'brand' : ''}`}
                          style={{ border: 'none', cursor: 'pointer' }}
                          disabled={busy === c.calendarId}
                          onClick={() => setCategory(c, cat)}
                        >
                          {CATEGORY_LABEL[cat]}
                        </button>
                      ))}
                    </div>
                  )}

                  {c.lastError && (
                    <p className="tiny" style={{ margin: '4px 0 0', color: 'var(--danger)' }}>
                      {c.lastError}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-subtle btn-sm" disabled={busy === 'sync'} onClick={syncNow}>
              {busy === 'sync' ? 'Syncing…' : 'Sync now'}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy === 'disconnect'} onClick={() => load(true)}>
              Refresh list
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy === 'disconnect'} onClick={disconnect}>
              Turn off
            </button>
          </div>

          <p className="tiny muted" style={{ margin: 0 }}>
            One way only: GiGi reads, never writes. Imported events can&apos;t be edited here —
            change them in Google and they update on the next sync. GiGi reads your calendar when
            you open the app, not in the background, because the permission lives in your browser
            and not on our servers. It&apos;s all in your{' '}
            <a href="/app/data" className="link">data log</a>.
          </p>
        </>
      )}

      {note && <p className="tiny" style={{ margin: 0, color: 'var(--brand)' }}>{note}</p>}
    </div>
  );
}
