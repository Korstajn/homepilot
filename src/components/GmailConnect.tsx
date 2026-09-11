'use client';

import { useCallback, useEffect, useState } from 'react';
import { trackClient } from '@/lib/analytics';

interface Status {
  configured: boolean;
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
  redirectUri?: string | null;
  hostMismatch?: { pinned: string; actual: string } | null;
  redirectUriProblem?: string | null;
}

interface ProbeMessage {
  from: string | null;
  subject: string | null;
  date: string | null;
}

interface ImportedBill {
  provider: string;
  amount: number | null;
  renewalDate: string | null;
}

interface ImportResult {
  days: number;
  found: number;
  alreadyImported: number;
  imported: ImportedBill[];
  withAttachments: number;
  failed: number;
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
  host_mismatch: { text: 'Gmail can’t be connected from this address — see below.' },
  exchange: { text: 'Google couldn’t complete the connection. Try again.' },
  error: { text: 'Something went wrong connecting Gmail. Try again.' },
};

export default function GmailConnect({ next }: { next: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok?: boolean } | null>(null);
  const [probe, setProbe] = useState<{ total: number | null; messages: ProbeMessage[] } | null>(null);
  const [probeError, setProbeError] = useState('');
  const [copied, setCopied] = useState(false);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState<{ total: number | null; messages: ProbeMessage[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [actionError, setActionError] = useState('');
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

  // Typing this string by hand is how it ends up mismatched, and a phone is
  // the worst place to select it out of a paragraph. Clipboard writes reject
  // outside a secure context, so failure leaves the visible string as the
  // fallback rather than claiming a copy that did not happen.
  async function copyRedirectUri() {
    if (!status?.redirectUri) return;
    try {
      await navigator.clipboard.writeText(status.redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

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

  async function runSearch() {
    setBusy(true);
    setActionError('');
    setImported(null);
    const res = await fetch(`/api/gmail/search?days=${days}&max=25`);
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setActionError(json.error ?? 'Could not search your inbox.');
      if (json.reconnect) load();
      return;
    }
    setSearch({ total: json.total ?? null, messages: json.messages ?? [] });
  }

  // Separate from the search on purpose: this one reads message content, and
  // the button that does it should never be the one the user already pressed
  // expecting subject lines.
  async function runImport() {
    setImporting(true);
    setActionError('');
    const res = await fetch('/api/gmail/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ days }),
    });
    const json = await res.json().catch(() => ({}));
    setImporting(false);
    if (!res.ok) {
      setActionError(json.error ?? 'Could not import from your inbox.');
      if (json.reconnect) load();
      return;
    }
    setImported(json as ImportResult);
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

      {/*
        A pinned redirect URI on another host cannot work from here. Say so
        with both hostnames instead of letting Google answer with a bare
        redirect_uri_mismatch 400 on a page we never see.
      */}
      {status.hostMismatch && (
        <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 12 }}>
          <div className="small" style={{ fontWeight: 600, color: 'var(--danger)' }}>
            Wrong address for Gmail
          </div>
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>
            GOOGLE_REDIRECT_URI points at <strong>{status.hostMismatch.pinned}</strong>, but you
            are on <strong>{status.hostMismatch.actual}</strong>. Google would send you back to
            the wrong host, so the connection is refused before it starts.
          </p>
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>
            Either open GiGi on {status.hostMismatch.pinned}, or point
            GOOGLE_REDIRECT_URI at this host and register it in Google Cloud Console.
          </p>
        </div>
      )}

      {/*
        A pinned URI that is malformed fails byte-for-byte at Google however it
        is registered there, so name the defect rather than leaving another
        bare 400 to be interpreted.
      */}
      {status.redirectUriProblem && (
        <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 12 }}>
          <div className="small" style={{ fontWeight: 600, color: 'var(--danger)' }}>
            The redirect URI cannot match
          </div>
          <p className="tiny muted" style={{ margin: '4px 0 0' }}>{status.redirectUriProblem}</p>
        </div>
      )}

      {status.configured && !status.connected && !status.hostMismatch && (
        <>
          <p className="small" style={{ margin: 0 }}>
            Instead of forwarding each email, you can let GiGi look for bills itself.
            <strong> Read-only</strong> — GiGi can never send, delete or change anything in your
            inbox. Searching reads subject lines only. Importing a bill opens that one email and
            its PDF invoice, and only ever when you press the button yourself.
          </p>
          <button className="btn btn-primary btn-sm" onClick={connect}>
            Connect Gmail →
          </button>
          <p className="tiny muted" style={{ margin: 0 }}>
            Google will show an “unverified app” warning while GiGi is in beta. Your Gmail
            permission is stored in your browser, not on our servers.
          </p>
          {status.redirectUri && (
            <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 12 }}>
              <p className="tiny muted" style={{ margin: 0 }}>
                Google Cloud Console → Credentials → your OAuth client →{' '}
                <strong>Authorized redirect URIs</strong> (not JavaScript origins) must contain
                exactly this, or Google answers <code>redirect_uri_mismatch</code>:
              </p>
              <code
                className="tiny"
                style={{ display: 'block', wordBreak: 'break-all', margin: '6px 0' }}
              >
                {status.redirectUri}
              </code>
              <button className="btn btn-subtle btn-sm" onClick={copyRedirectUri}>
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          )}
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

          <div style={{ borderTop: '1px solid var(--line, rgba(0,0,0,.08))', paddingTop: 12 }}>
            <div className="row between" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label className="tiny muted" htmlFor="gmail-days">
                Look back
              </label>
              <select
                id="gmail-days"
                className="tiny"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                <option value={30}>1 month</option>
                <option value={60}>2 months</option>
                <option value={90}>3 months</option>
              </select>
              <button className="btn btn-subtle btn-sm" disabled={busy || importing} onClick={runSearch}>
                {busy ? 'Searching…' : 'Search my inbox'}
              </button>
            </div>

            {search && (
              <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 12, marginTop: 10 }}>
                <p className="tiny muted" style={{ marginTop: 0 }}>
                  {search.messages.length === 0
                    ? `No bill-looking emails in the last ${days} days.`
                    : `${search.messages.length} bill-looking email(s). Subject lines only — no message content was requested.`}
                </p>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {search.messages.map((m, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      <strong>{m.subject ?? '(no subject)'}</strong>
                      {m.from && <span className="tiny muted"> — {m.from}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/*
            The one place GiGi reads message content. The copy says so before
            the button, not after it — a search that quietly grew into a full
            read is exactly what the metadata allow-list exists to prevent.
          */}
          <div style={{ borderTop: '1px solid var(--line, rgba(0,0,0,.08))', paddingTop: 12 }}>
            <div className="small" style={{ fontWeight: 600 }}>Import bills</div>
            <p className="tiny muted" style={{ margin: '4px 0 8px' }}>
              To read an amount and a renewal date, GiGi has to open the email itself and any
              PDF invoice attached to it — a subject line almost never carries either. This is
              the only feature that reads message content, it happens when you press this
              button and never on a schedule, and every email opened is recorded in your{' '}
              <strong>trust log</strong>. Imported bills arrive unconfirmed for you to check.
            </p>
            <button className="btn btn-primary btn-sm" disabled={busy || importing} onClick={runImport}>
              {importing ? 'Reading your inbox…' : `Import bills from the last ${days} days`}
            </button>

            {imported && (
              <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 12, marginTop: 10 }}>
                <p className="tiny muted" style={{ marginTop: 0 }}>
                  Found {imported.found} bill-looking email(s)
                  {imported.alreadyImported > 0 && `, ${imported.alreadyImported} already imported`}
                  {imported.withAttachments > 0 && `, ${imported.withAttachments} with a PDF`}
                  {imported.failed > 0 && `, ${imported.failed} could not be read`}.
                </p>
                {imported.imported.length === 0 ? (
                  <p className="small" style={{ margin: 0 }}>Nothing new to add.</p>
                ) : (
                  <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                    {imported.imported.map((b, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        <strong>{b.provider}</strong>
                        <span className="tiny muted">
                          {b.amount !== null ? ` — ${b.amount}/mo` : ' — amount not found'}
                          {b.renewalDate ? `, renews ${b.renewalDate}` : ', no renewal date found'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {actionError && (
            <p className="small" style={{ margin: 0, color: 'var(--danger)' }}>{actionError}</p>
          )}

          <button className="btn btn-ghost btn-sm" disabled={busy || importing} onClick={disconnect}>
            Disconnect Gmail
          </button>
        </>
      )}
    </div>
  );
}
