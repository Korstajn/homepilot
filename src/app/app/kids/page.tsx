'use client';

import { useEffect, useState } from 'react';
import { trackClient } from '@/lib/analytics';
import CommandBar from '@/components/CommandBar';
import ScreenHeader from '@/components/ScreenHeader';
import type { Child, Digest, DigestItem } from '@/lib/types';

export default function KidsTravel() {
  const [children, setChildren] = useState<Child[]>([]);
  const [items, setItems] = useState<DigestItem[]>([]);
  const [filter, setFilter] = useState<string>('all');

  async function load() {
    const [m, d] = await Promise.all([
      fetch('/api/members').then((r) => r.json()).catch(() => ({ children: [] })),
      fetch('/api/digest').then((r) => r.json()).catch(() => ({ digest: null })),
    ]);
    setChildren(m.children ?? []);
    const digest: Digest | null = d.digest;
    const all = digest ? [...digest.items, ...digest.overflow] : [];
    setItems(all.filter((i) => i.category === 'school' || i.category === 'travel'));
  }
  useEffect(() => { load(); trackClient('kids_viewed'); }, []);

  // Passport reminders derived from child profiles (real data).
  const passportAlerts = children.filter((c) => c.passportExpiry).map((c) => ({
    child: c.name,
    date: c.passportExpiry as string,
    months: monthsUntil(c.passportExpiry as string),
  })).filter((a) => a.months <= 12);

  const shown = filter === 'all'
    ? items
    : items.filter((i) => (`${i.line} ${i.detail ?? ''}`).toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Kids & Travel" title="This week" subtitle="School, activities & upcoming trips" />
      <CommandBar />

      {children.length > 0 && (
        <div className="choices" style={{ marginBottom: 14 }}>
          {children.map((c) => (
            <button key={c.id} className={`choice ${filter === c.name ? 'selected' : ''}`} onClick={() => setFilter(c.name)}>
              {c.name}{c.yearGroup ? <span style={{ fontWeight: 400, opacity: 0.8 }}> · {c.yearGroup}</span> : null}
            </button>
          ))}
          <button className={`choice ${filter === 'all' ? 'selected' : ''}`} onClick={() => setFilter('all')}>Both</button>
        </div>
      )}

      {passportAlerts.map((a) => (
        <div key={a.child} className="banner" style={{ background: '#f7e7ea', color: '#8a2c46', border: '1px solid #eccdd5', marginBottom: 12 }}>
          <strong>{a.child}&apos;s passport expires {monthName(a.date)}.</strong>
          <div className="small" style={{ color: 'inherit', marginTop: 2 }}>
            Renew in good time to avoid delays before any trip.
          </div>
        </div>
      ))}

      <p className="eyebrow" style={{ margin: '14px 0 10px' }}>This week</p>
      {shown.length === 0 ? (
        <div className="card center"><p className="small muted" style={{ margin: 0 }}>Nothing school or travel needs you this week.</p></div>
      ) : (
        <div className="timeline">
          {shown.map((i) => (
            <div className="tl-item" key={i.id}>
              <span className="tl-dot" style={{ background: dotColor(i.urgency) }} />
              <span className="tl-time">{i.urgency === 'today' ? 'TODAY' : i.urgency === 'soon' ? 'SOON' : 'UPCOMING'}</span>
              <div className="card" style={{ marginTop: 4 }}>
                <span className="badge-cat">{i.category}</span>
                <h3 style={{ margin: '2px 0 4px' }}>{i.line}</h3>
                {i.detail && <p className="small" style={{ margin: 0 }}>{i.detail}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function monthsUntil(iso: string): number {
  const d = new Date(iso + 'T00:00:00'); const now = new Date();
  return (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
}
function monthName(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long' });
}
function dotColor(u: string): string {
  return u === 'today' ? 'var(--today)' : u === 'soon' ? 'var(--soon)' : 'var(--upcoming)';
}
