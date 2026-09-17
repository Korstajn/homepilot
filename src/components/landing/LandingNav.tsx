'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ArrowIcon from './ArrowIcon';
import { onAnchorClick, scrollToId } from './scroll';

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  // #what and #faq live on the homepage. From another page (e.g. /story) a
  // click needs to navigate there first; on the homepage itself it's a plain
  // in-page scroll, same as the reference's IntersectionObserver-free anchors.
  const onHome = pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function goToSection(id: string) {
    if (onHome) {
      scrollToId(id);
    } else {
      router.push(`/#${id}`);
    }
  }

  return (
    <nav id="nav" className={scrolled ? 'scrolled' : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
        <Link href="/" className="nav-logo">
          <Image src="/images/gigi-logo.png" alt="GiGi" width={990} height={579} priority />
        </Link>
        <div className="nav-links">
          <Link href={onHome ? '#what' : '/#what'} onClick={onHome ? onAnchorClick('what') : undefined}>
            What we do
          </Link>
          <Link href="/story">Our story</Link>
          <Link href={onHome ? '#faq' : '/#faq'} onClick={onHome ? onAnchorClick('faq') : undefined}>
            FAQ
          </Link>
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
        <button className="btn-primary" onClick={() => goToSection('faq')}>
          Join the waitlist
          <ArrowIcon size={13} />
        </button>
      </div>
    </nav>
  );
}
