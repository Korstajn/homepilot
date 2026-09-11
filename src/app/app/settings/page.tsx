'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { trackClient } from '@/lib/analytics';
import type { Household } from '@/lib/types';

export default function Settings() {
  const router = useRouter();
  const [hh, setHh] = useState<Household | null>(null);
  const [me, setMe] = useState<{ loggedIn: boolean; isDemo: boolean; member?: { name: string; email: string; role: string } } | null>(null);
  const [toast, setToast] = useState('');
  const [feedback, setFeedback] = useState('');

  async function load() {
    const j = await fetch('/api/household').then((r) => r.json());
    setHh(j.household);
    fetch('/api/auth/me').then((r) => r.json()).then(setMe).catch(() => {});
  }
  useEffect(() => { load(); trackClient('settings_viewed'); }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    trackClient('logout');
    router.push('/');
  }

  async function patch(body: Record<string, unknown>) {
    const j = await fetch('/api/household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json());
    setHh(j.household);
  }

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2400); }

  if (!hh) return <div className="screen"><p className="muted">Loading…</p></div>;

  return (
    <div className="screen">
      <h1>Settings</h1>

      <section className="card stack">
        <h3>Account</h3>
        <div className="row between">
          <div>
            <div className="small" style={{ fontWeight: 600 }}>{me?.member?.name ?? hh.ownerName}</div>
            <span className="tiny muted">{me?.member?.email ?? hh.email}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            {me?.member?.role && <span className="pill brand">{me.member.role === 'owner' ? 'Owner' : me.member.role === 'teen' ? 'Teen' : 'Co-parent'}</span>}
            {me?.isDemo && <span className="pill accent" style={{ marginLeft: 6 }}>Demo</span>}
          </div>
        </div>
        <Link href="/app/family" className="btn btn-subtle btn-sm" style={{ width: '100%' }}>
          Family &amp; members →
        </Link>
        {me?.isDemo ? (
          <Link href="/signup" className="btn btn-primary btn-sm" style={{ width: '100%' }}>
            Create your own account →
          </Link>
        ) : (
          <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={logout}>Log out</button>
        )}
      </section>

      <section className="card stack">
        <h3>Connected inbox</h3>
        <div className="row between">
          <div>
            <div className="small" style={{ fontWeight: 600 }}>{hh.forwardingAddress}</div>
            <span className={`pill ${hh.connectionStatus === 'active' ? 'brand' : 'accent'}`} style={{ marginTop: 4 }}>
              {hh.connectionStatus === 'active' ? '● Active' : hh.connectionStatus === 'degraded' ? '● Reconnect needed' : '○ Pending'}
            </span>
          </div>
        </div>
        {hh.connectionStatus === 'degraded' ? (
          <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={() => { patch({ connectionStatus: 'active' }); showToast('Reconnected.'); }}>
            Reconnect
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={() => { patch({ connectionStatus: 'degraded' }); showToast('Simulated a dropped connection.'); }}>
            Demo: simulate a dropped connection
          </button>
        )}
      </section>

      <section className="card stack">
        <h3>Digest delivery</h3>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Delivery time</span>
          <input type="time" value={hh.digestTime} onChange={(e) => patch({ digestTime: e.target.value })} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>Time zone</span>
          <select value={hh.timezone} onChange={(e) => patch({ timezone: e.target.value })}>
            <option value="Europe/London">UK — London</option>
            <option value="Europe/Stockholm">Sweden — Stockholm</option>
          </select>
        </label>
        <div className="row between">
          <span className="small">Pause digests</span>
          <button
            className={`btn btn-sm ${hh.digestPaused ? 'btn-primary' : 'btn-subtle'}`}
            onClick={() => { patch({ digestPaused: !hh.digestPaused }); showToast(hh.digestPaused ? 'Resumed.' : 'Paused.'); }}
          >
            {hh.digestPaused ? 'Paused' : 'On'}
          </button>
        </div>
      </section>

      <section className="card stack">
        <h3>Send feedback</h3>
        <p className="small" style={{ margin: 0 }}>Wrong extraction, a missed bill, anything. This is how GiGi learns.</p>
        <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Tell us what happened…" />
        <button
          className="btn btn-primary btn-sm"
          style={{ width: '100%' }}
          disabled={!feedback}
          onClick={async () => {
            await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'general', message: feedback }) });
            setFeedback('');
            showToast('Thank you — we read every one.');
          }}
        >
          Send
        </button>
      </section>

      <section className="card stack">
        <h3>Demo &amp; founder</h3>
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: '100%' }}
          onClick={async () => { await fetch('/api/digest/generate', { method: 'POST' }); trackClient('nightly_run_simulated', { where: 'settings' }); showToast('Reran tonight’s digest.'); }}
        >
          Simulate tonight&apos;s 2am run
        </button>
        <Link href="/app/metrics" className="link small">Founder metrics →</Link>
        <Link href="/app/eval" className="link small">Extraction eval →</Link>
      </section>

      <section className="card stack">
        <h3>Privacy &amp; data</h3>
        <Link href="/app/data" className="btn btn-subtle btn-sm" style={{ width: '100%' }}>
          See everything GiGi did with your data →
        </Link>
        <Link href="/privacy" className="link small">Privacy policy →</Link>
        <p className="tiny muted" style={{ margin: 0 }}>UK &amp; EU data only. No user content in logs.</p>
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', color: 'var(--danger)', borderColor: '#e6c9c4' }}
          onClick={async () => {
            if (!confirm('Delete everything? This erases all your bills, digests and history now.')) return;
            await fetch('/api/account/delete', { method: 'POST' });
            trackClient('data_deletion_executed');
            showToast('Done — your data was erased. See the record under Your data.');
          }}
        >
          Delete everything
        </button>
      </section>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
