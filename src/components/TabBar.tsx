'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV } from '@/lib/nav';
import Icon from './Icon';

export default function TabBar() {
  const path = usePathname();
  const [caps, setCaps] = useState<string[] | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((j) => setCaps(j.capabilities ?? [])).catch(() => setCaps([]));
  }, []);

  const tabs = NAV.filter((t) => !t.cap || caps === null || caps.includes(t.cap));

  return (
    <nav className="tabbar">
      {tabs.map((t) => {
        const active = path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
            <span className="glyph"><Icon name={t.icon} size={21} strokeWidth={active ? 2 : 1.7} /></span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
