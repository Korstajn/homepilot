'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV } from '@/lib/nav';
import Icon from './Icon';
import ViewToggle from './ViewToggle';

export default function Sidebar({ view, onView }: { view: 'desktop' | 'mobile'; onView: (v: 'desktop' | 'mobile') => void }) {
  const path = usePathname();
  const [caps, setCaps] = useState<string[] | null>(null);
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((j) => { setCaps(j.capabilities ?? []); setMe(j.member ?? null); }).catch(() => setCaps([]));
  }, []);

  const items = NAV.filter((t) => !t.cap || caps === null || caps.includes(t.cap));
  const initials = (me?.name ?? 'G').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo-mark" style={{ width: 34, height: 34, fontSize: 18 }}>G</span>
        <span className="logo-word" style={{ fontSize: 22 }}>GiGi</span>
      </div>

      <nav className="side-nav">
        {items.map((t) => {
          const active = path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
              <span className="glyph"><Icon name={t.icon} size={20} strokeWidth={active ? 2 : 1.7} /></span>{t.label}
            </Link>
          );
        })}
      </nav>

      <div className="side-foot">
        <Link href="/app/settings" className="card row" style={{ padding: 10, gap: 10 }}>
          <span className="avatar-btn" style={{ width: 34, height: 34, fontSize: 12 }}>{initials}</span>
          <div style={{ minWidth: 0 }}>
            <div className="small" style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me?.name ?? 'Account'}</div>
            <div className="tiny muted" style={{ textTransform: 'capitalize' }}>{me?.role ?? ''} · Settings</div>
          </div>
        </Link>
        <ViewToggle value={view} onChange={onView} />
      </div>
    </aside>
  );
}
