'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// The header on the main screens: an eyebrow section label, a serif title, a
// subtitle, and the account avatar (top-right) that opens Settings.
export default function ScreenHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  const [initials, setInitials] = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((j) => {
      const name = j?.member?.name ?? j?.household?.ownerName ?? '';
      setInitials(name.split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'G');
    }).catch(() => setInitials('G'));
  }, []);

  return (
    <div className="screen-head">
      <div>
        <p className="eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</p>
        <h1 style={{ margin: 0 }}>{title}</h1>
        {subtitle && <p className="small" style={{ margin: '4px 0 0' }}>{subtitle}</p>}
      </div>
      <Link href="/app/settings" className="avatar-btn" aria-label="Account & settings">{initials}</Link>
    </div>
  );
}
