'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { trackClient } from '@/lib/analytics';
import { formatMoney } from '@/lib/money';
import CommandBar from '@/components/CommandBar';
import ScreenHeader from '@/components/ScreenHeader';
import CountUp from '@/components/CountUp';
import { SkeletonScreen } from '@/components/Skeleton';
import type { Currency, Digest, DigestItem, Household } from '@/lib/types';

export default function DigestScreen() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [value, setValue] = useState<{ savedAnnual: number; handled: number; currency: Currency } | null>(null);
  const [toast, setToast] = useState('');
  const [showOverflow, setShowOverflow] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<DigestItem | null>(null);

  async function load(open = false) {
    const j = await fetch(`/api/digest${open ? '?open=1' : ''}`).then((r) => r.json());
    setDigest(j.digest);
    setHousehold(j.household);
    const meRes = await fetch('/api/auth/me').then((r) => r.json()).catch(() => null);
    setMe(meRes?.member ?? null);
    if ((meRes?.capabilities ?? []).includes('viewFinances')) {
      fetch('/api/value').then((r) => r.json()).then(setValue).catch(() => {});
    }
  }

  useEffect(() => {
    load(true);
    trackClient('digest_screen_opened');
  }, []);

  async function act(item: DigestItem, action: 'approve' | 'done' | 'dismiss') {
    const res = await fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id, action }),
    });
    const j = await res.json();
    if (j.ok) {
      showToast(j.outcome ?? 'Done');
      trackClient(`digest_${action}`, { category: item.category });
      load();
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  }

  if (!digest || !household) {
    return <SkeletonScreen />;
  }

  const greeting = timeGreeting();
  const name = me?.name ?? household.ownerName;
  const openCount = digest.items.filter((i) => i.status === 'open').length;
  const openItems = digest.items.filter((i) => i.status === 'open' || i.status === 'approved');
  const allResolved = digest.items.length > 0 && digest.items.every((i) => i.status !== 'open');

  return (
    <div className="screen">
      <ScreenHeader
        eyebrow={`GiGi · ${weekday(digest.date)}`}
        title={`${greeting}, ${name}`}
        subtitle={openCount > 0 ? `${openCount} thing${openCount > 1 ? 's' : ''} need your attention today` : 'All calm today'}
      />

      <CommandBar />

      <p className="tiny muted center" style={{ margin: '0 0 12px' }}>
        Tell me what you need, I&apos;ll handle it — <strong>you approve every step.</strong>
      </p>

      {household.connectionStatus === 'degraded' ? (
        <div className="banner warn" style={{ marginBottom: 14 }}>
          Your inbox connection dropped — some bills may be missed until you reconnect in Settings.
        </div>
      ) : (
        <div className="banner ok" style={{ marginBottom: 14 }}>
          ● GiGi is running. Bills, school &amp; travel monitored around the clock.
        </div>
      )}

      {value && (
        <>
          <div className="row between" style={{ margin: '2px 0 8px' }}>
            <span className="eyebrow">Your impact</span>
            <span className="tiny muted">since you joined</span>
          </div>
          <div className="row" style={{ gap: 8, marginBottom: 16 }}>
            <div className="mini-stat"><b><CountUp value={value.savedAnnual} format={(n) => formatMoney(Math.round(n), value.currency)} /></b><span>money saved</span></div>
            <div className="mini-stat"><b><CountUp value={value.handled} /></b><span>tasks managed</span></div>
            <div className="mini-stat"><b><CountUp value={Math.max(1, Math.round(value.handled * 0.4))} /> hrs</b><span>time saved</span></div>
          </div>
        </>
      )}

      {digest.items.length === 0 && (
        <div className="card center stack" style={{ marginTop: 6 }}>
          <h3>{digest.quietLine ?? 'All calm today.'}</h3>
          <p className="small" style={{ margin: 0 }}>
            No noise on the quiet days. We&apos;ll be back the moment something needs you.
          </p>
        </div>
      )}

      {digest.items.length > 0 && (
        <>
          <p className="small muted">
            {openItems.length > 0
              ? `${openItems.length} thing${openItems.length > 1 ? 's' : ''} for you today · never more than four`
              : 'All caught up for today ✓'}
          </p>
          <div className="stack" style={{ marginTop: 4 }}>
            {digest.items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onAct={act}
                onFlag={() => setFeedbackFor(item)}
              />
            ))}
          </div>
        </>
      )}

      {allResolved && (
        <div className="banner ok" style={{ marginTop: 14 }}>
          You&apos;re all caught up. Nicely done.
        </div>
      )}

      {digest.overflow.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={() => { setShowOverflow((v) => !v); trackClient('overflow_toggled'); }}>
            {showOverflow ? 'Hide' : `${digest.overflow.length} more, lower priority`}
          </button>
          {showOverflow && (
            <div className="stack" style={{ marginTop: 12 }}>
              {digest.overflow.map((item) => (
                <ItemCard key={item.id} item={item} onAct={act} onFlag={() => setFeedbackFor(item)} muted />
              ))}
            </div>
          )}
        </div>
      )}

      <p className="tiny muted center" style={{ marginTop: 22 }}>
        Something look wrong? <Link href="/app/settings" className="link">Send feedback</Link>
      </p>

      {feedbackFor && (
        <FeedbackSheet
          item={feedbackFor}
          onClose={() => setFeedbackFor(null)}
          onSent={() => { setFeedbackFor(null); showToast('Thanks — that helps GiGi learn.'); }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function ItemCard({
  item,
  onAct,
  onFlag,
  muted,
}: {
  item: DigestItem;
  onAct: (i: DigestItem, a: 'approve' | 'done' | 'dismiss') => void;
  onFlag: () => void;
  muted?: boolean;
}) {
  const resolved = item.status !== 'open';
  return (
    <div className="card" style={{ opacity: muted && !resolved ? 0.9 : 1 }}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <span className={`dot ${item.urgency}`} style={{ marginTop: 6 }} />
        <div className="grow">
          <div className="row between">
            <span className="badge-cat">{item.category}</span>
            {item.carryForwardCount > 0 && <span className="tiny muted">carried forward</span>}
          </div>
          <h3 style={{ margin: '2px 0 4px' }}>{item.line}</h3>
          {item.detail && <p className="small" style={{ margin: 0 }}>{item.detail}</p>}

          {item.executable && item.savingAnnual && item.status === 'open' && (
            <div className="row between" style={{ marginTop: 10, background: 'var(--accent-soft)', padding: '8px 12px', borderRadius: 10 }}>
              <span className="small" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                Save {item.savingAnnual} /yr
              </span>
              {item.currentPrice && item.newPrice && (
                <span className="tiny muted">{item.currentPrice} → {item.newPrice}/mo</span>
              )}
            </div>
          )}

          {item.status === 'approved' && (
            <div className="banner ok pop-in" style={{ marginTop: 10 }}>
              ✓ {item.executable ? 'Switch queued — GiGi is on it.' : 'Approved.'}
            </div>
          )}
          {item.status === 'done' && <p className="small" style={{ marginTop: 8, color: 'var(--brand)' }}>✓ Done</p>}
          {item.status === 'dismissed' && <p className="small muted" style={{ marginTop: 8 }}>Dismissed</p>}

          {item.status === 'open' && (
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              {item.executable ? (
                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => onAct(item, 'approve')}>
                  Approve
                </button>
              ) : (
                <button className="btn btn-subtle btn-sm" style={{ flex: 1 }} onClick={() => onAct(item, 'done')}>
                  Mark done
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => onAct(item, 'dismiss')}>Dismiss</button>
              <button className="btn btn-ghost btn-sm" title="Report a mistake" onClick={onFlag}>⚑</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedbackSheet({ item, onClose, onSent }: { item: DigestItem; onClose: () => void; onSent: () => void }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'wrong_extraction', message, relatedBillId: item.relatedBillId }),
    });
    setBusy(false);
    onSent();
  }

  return (
    <div
      style={{ position: 'absolute', inset: 0, background: 'rgba(38,34,30,0.4)', display: 'flex', alignItems: 'flex-end', zIndex: 20 }}
      onClick={onClose}
    >
      <div className="card stack" style={{ width: '100%', borderRadius: '20px 20px 0 0' }} onClick={(e) => e.stopPropagation()}>
        <h3>What&apos;s wrong here?</h3>
        <p className="small" style={{ margin: 0 }}>&ldquo;{item.line}&rdquo;</p>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. The amount is wrong — it's actually £48." />
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!message || busy} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
        </div>
      </div>
    </div>
  );
}

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function weekday(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
}
