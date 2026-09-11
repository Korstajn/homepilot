'use client';

import { useEffect, useState } from 'react';
import ArrowIcon from './ArrowIcon';
import { onAnchorClick, scrollToId } from './scroll';

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav id="nav" className={scrolled ? 'scrolled' : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
        <div className="nav-logo">
          <div className="logo-mark">
            <span>G</span>
          </div>
          GiGi
        </div>
        <div className="nav-links">
          <a href="#what" onClick={onAnchorClick('what')}>
            What we do
          </a>
          <a href="#faq" onClick={onAnchorClick('faq')}>
            FAQ
          </a>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/*
          The only route from the marketing page into the app. It sits here
          rather than in .nav-links because that group is display:none under
          760px (landing.css) — and a phone is exactly where a tester opens
          this. Deliberate addition to the approved design: without it /login
          is reachable only by typing the path.
        */}
        <a href="/login" className="nav-login">
          Log in
        </a>
        <button className="btn-primary" onClick={() => scrollToId('faq')}>
          Join the waitlist
          <ArrowIcon size={13} />
        </button>
      </div>
    </nav>
  );
}
