'use client';

import { useEffect, useState } from 'react';
import TabBar from './TabBar';
import Sidebar from './Sidebar';
import ViewToggle from './ViewToggle';

const KEY = 'gigi_view';

// Responsive shell:
//  - narrow screens always get the mobile phone frame + bottom tab bar
//  - wide screens get the desktop sidebar layout, unless the user chose "App"
// The choice is remembered per browser.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [wide, setWide] = useState(false);
  const [pref, setPref] = useState<'desktop' | 'mobile'>('desktop');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { const v = localStorage.getItem(KEY); if (v === 'mobile' || v === 'desktop') setPref(v); } catch {}
    const mq = window.matchMedia('(min-width: 900px)');
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    setReady(true);
    return () => mq.removeEventListener('change', update);
  }, []);

  function choose(v: 'desktop' | 'mobile') {
    setPref(v);
    try { localStorage.setItem(KEY, v); } catch {}
  }

  // Avoid a flash of the wrong layout before we've read width/pref.
  if (!ready) return <div style={{ minHeight: '100dvh', background: 'var(--paper)' }} />;

  const desktop = wide && pref === 'desktop';

  if (desktop) {
    return (
      <div className="deskshell">
        <Sidebar view={pref} onView={choose} />
        <main className="deskmain">{children}</main>
      </div>
    );
  }

  return (
    <div className="viewport">
      {wide && (
        <div className="float-toggle">
          <ViewToggle value={pref} onChange={choose} />
        </div>
      )}
      <div className="phone">
        {children}
        <TabBar />
      </div>
    </div>
  );
}
