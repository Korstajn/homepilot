'use client';

import { useEffect, useState } from 'react';
import { trackClient } from '@/lib/analytics';
import CommandBar from '@/components/CommandBar';
import ScreenHeader from '@/components/ScreenHeader';

interface Cat { id: string; title: string; icon: string; blurb: string; live: boolean }

export default function Handover() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState('');

  async function load() {
    const j = await fetch('/api/handover').then((r) => r.json());
    setCats(j.categories ?? []);
    setLiveCount(j.liveCount ?? 0);
    setTotal(j.total ?? 0);
  }
  useEffect(() => { load(); trackClient('handover_viewed'); }, []);

  async function toggle(cat: Cat) {
    setBusy(cat.id);
    await fetch('/api/handover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: cat.id, on: !cat.live }),
    });
    trackClient('handover_changed', { category: cat.id, on: !cat.live });
    setBusy('');
    load();
  }

  const live = cats.filter((c) => c.live);
  const available = cats.filter((c) => !c.live);

  return (
    <div className="screen">
      <ScreenHeader eyebrow="Hand over to GiGi" title="What should I take on?" subtitle="Tap a category to hand it over — completely" />
      <CommandBar />

      <div className="banner ok" style={{ marginBottom: 12 }}>
        <strong>End to end, not just a reminder.</strong> When you hand a task over, I see it through
        start to finish — you only step in to approve.
      </div>

      <div className="card" style={{ background: 'linear-gradient(160deg,#3f6152,#2c4539)', color: '#fff', border: 'none' }}>
        <div className="row between">
          <span className="eyebrow" style={{ color: 'rgba(255,255,255,0.7)' }}>Handed over to GiGi</span>
          <span style={{ fontWeight: 700 }}>{liveCount} of {total}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.2)', marginTop: 10 }}>
          <div style={{ height: '100%', borderRadius: 3, background: '#fff', width: `${total ? (liveCount / total) * 100 : 0}%` }} />
        </div>
        <p className="small" style={{ color: 'rgba(255,255,255,0.85)', margin: '10px 0 0' }}>
          The rest is still yours to manage. Hand any of it over and I&apos;ll run it end to end — you&apos;ll
          only see it again to approve.
        </p>
      </div>

      {live.length > 0 && <p className="eyebrow" style={{ margin: '18px 0 10px' }}>Live now</p>}
      <div className="stack">
        {live.map((c) => <CatCard key={c.id} c={c} busy={busy === c.id} onToggle={() => toggle(c)} />)}
      </div>

      {available.length > 0 && <p className="eyebrow" style={{ margin: '18px 0 10px' }}>Hand more over</p>}
      <div className="stack">
        {available.map((c) => <CatCard key={c.id} c={c} busy={busy === c.id} onToggle={() => toggle(c)} />)}
      </div>
    </div>
  );
}

function CatCard({ c, busy, onToggle }: { c: Cat; busy: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      disabled={busy}
      className="card"
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        borderColor: c.live ? 'var(--brand)' : 'var(--border)',
        background: c.live ? 'var(--brand-soft)' : 'var(--surface)',
      }}
    >
      <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <span
          style={{
            width: 24, height: 24, flex: 'none', borderRadius: 7, marginTop: 1,
            border: c.live ? 'none' : '1.5px solid var(--border-strong)',
            background: c.live ? 'var(--brand)' : 'transparent',
            color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14,
          }}
        >{c.live ? '✓' : ''}</span>
        <div className="grow">
          <div className="row between">
            <h3 style={{ margin: 0 }}>{c.title}</h3>
            {c.live && <span className="pill brand" style={{ fontSize: 10 }}>LIVE</span>}
          </div>
          <p className="small" style={{ margin: '4px 0 0' }}>{c.blurb}</p>
        </div>
      </div>
    </button>
  );
}
