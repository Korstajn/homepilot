'use client';

import { useCallback, useEffect, useState } from 'react';
import { trackClient } from '@/lib/analytics';

interface Status {
  configured: boolean;
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
}

interface ProbeMessage {
  from: string | null;
  subject: string | null;
  date: string | null;
}

// Fixed copy per reason code. The callback route never passes Google's own
// error text through, so nothing attacker-influenced reaches the page.
const NOTICE: Record<string, { text: string; ok?: boolean }> = {
  connected: { text: 'Gmail connected.', ok: true },
  denied: { text: 'You cancelled on Google’s screen — nothing was connected.' },
  state: { text: 'That link had expired. Start the connection again.' },
  session: { text: 'Your session ended before the connection finished. Log in and try again.' },
  demo: { text: 'The demo household can’t connect a real inbox — log into your own account first.' },
  unconfigured: { text: 'Gmail isn’t configured on this deployment yet.' },
  no_refresh: { text: 'Google didn’t grant lasting access. Try again and approve the Gmail permission.' },
  exchange: { text: 'Google couldn’t complete the connection. Try again.' },
  error: { text: 'Something went wrong connecting Gmail. Try again.' },
};

export default function GmailConnect({ next }: { next: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok?: boolean } | null>(null);
  const [probe, setProbe] = useState<{ total: number | null; messages: ProbeMessage[] } | null>(null);
  const [probeError, setProbeError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch('/api/auth/google')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false, connected: false, email: null, connectedAt: null }));
  }, []);

  useEffect(() => {
    load();
    // Read the outcome from the callback's ?gmail= param, then strip it so a
    // refresh doesn't replay the message. Done here rather than with
    // useSearchParams to keep this out of a Suspense boundary.
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('gmail');
    if (reason) {
      setNotice(NOTICE[reason] ?? NOTICE.error);
      params.delete('gmail');
      const query = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
    }
  }, [load]);

  function connect() {
    trackClient('gmail_connect_clicked');
    window.location.href = `/api/auth/google/start?next=${encodeURIComponent(next)}`;
  }

  async function disconnect() {
    setBusy(true);
    await fetch('/api/auth/google', { method: 'DELETE' }).catch(() => {});
    setBusy(false);
    setProbe(null);
    setProbeError('');
    setNotice({ text: 'Gmail disconnected and access revoked at Google.', ok: true });
    trackClient('gmail_disconnect_clicked');
    load();
  }

  async function runProbe() {
    setBusy(true);
    setProbeError('');
    const res = await fetch('/api/gmail/probe');
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setProbeError(json.error ?? 'Could not read your inbox.');
      if (json.reconnect) load();
      return;
    }
    setProbe({ total: json.total ?? null, messages: json.messages ?? [] });
  }

  if (!status) {
    return (
      <div className="card stack">
        <h3>Connect Gmail</h3>
        <p className="small muted" style={{ margin: 0 }}>Checking…</p>
      </div>
    );
  }

  return (
    <div className="card stack">
      <div className="row between">
        <h3 style={{ margin: 0 }}>Connect Gmail</h3>
        {status.connected ? (
          <span className="pill brand">● Connected</span>
        ) : status.configured ? (
          <span className="pill accent">○ Not connected</span>
        ) : (
          <span className="pill">Unavailable</span>
        )}
      </div>

      {notice && (
        <p className="small" style={{ margin: 0, color: notice.ok ? 'var(--brand)' : 'var(--danger)' }}>
          {notice.text}
        </p>
      )}

      {!status.configured && (
        <p className="small muted" style={{ margin: 0 }}>
          This deployment has no Google OAuth client set. Forwarding still works — see above.
        </p>
      )}

      {status.configured && !status.connected && (
        <>
          <p className="small" style={{ margin: 0 }}>
            Instead of forwarding each email, you can let GiGi look for bills itself.
            <strong> Read-only</strong> — GiGi can never send, delete or change anything in your
            inbox, and only reads the subject lines of emails that look like bills.
          </p>
          <button className="btn btn-primary btn-sm" onClick={connect}>
            Connect Gmail →
          </button>
          <p className="tiny muted" style={{ margin: 0 }}>
            Google will show an “unverified app” warning while GiGi is in beta. Your Gmail
            permission is stored in your browser, not on our servers.
          </p>
        </>
      )}

      {status.connected && (
        <>
          <div>
            <div className="small" style={{ fontWeight: 600 }}>{status.email ?? 'Gmail inbox'}</div>
            <span className="tiny muted">Read-only access, granted by you. Revoke any time.</span>
          </div>

          <button className="btn btn-subtle btn-sm" disabled={busy} onClick={runProbe}>
            {busy ? 'Checking…' : 'Show me what GiGi can see'}
          </button>

          {probeError && <p className="small" style={{ margin: 0, color: 'var(--danger)' }}>{probeError}</p>}

          {probe && (
            <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 12 }}>
              <p className="tiny muted" style={{ marginTop: 0 }}>
                {probe.messages.length === 0
                  ? 'No bill-looking emails in the last 60 days.'
                  : 'Subject lines only — no message content was requested.'}
              </p>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {probe.messages.map((m, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <strong>{m.subject ?? '(no subject)'}</strong>
                    {m.from && <span className="tiny muted"> — {m.from}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={disconnect}>
            Disconnect Gmail
          </button>
        </>
      )}
    </div>
  );
}
