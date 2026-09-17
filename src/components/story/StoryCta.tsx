import Link from 'next/link';
import { InstagramIcon } from '../landing/icons';
import Reveal from '../landing/Reveal';

export default function StoryCta() {
  return (
    <section className="chapter chapter-dark" style={{ textAlign: 'center' }}>
      <Reveal className="chapter-inner">
        <div
          style={{
            display: 'inline-block',
            background: 'rgba(45,106,79,0.25)',
            border: '1px solid rgba(110,231,183,0.3)',
            borderRadius: 24,
            padding: '9px 20px',
            fontSize: 14,
            fontWeight: 600,
            color: '#6EE7B7',
            marginBottom: 32,
          }}
        >
          ● LIVE NOW
        </div>
        <div className="ch-big" style={{ fontSize: 72 }}>
          Mental load
          <br />
          <em style={{ color: 'rgba(245,242,236,0.42)' }}>lifted.</em>
        </div>
        <div className="ch-body" style={{ margin: '24px auto 44px', textAlign: 'center' }}>
          Waitlist open — the first 100 households join as founding members.
        </div>
        <Link href="/#faq" style={{ textDecoration: 'none' }}>
          <span
            style={{
              fontFamily: 'var(--font-serif), serif',
              fontSize: 38,
              color: 'var(--bone)',
              borderBottom: '3px solid var(--sage-m)',
              paddingBottom: 8,
            }}
          >
            getgigiapp.com
          </span>
        </Link>
        <div style={{ marginTop: 26 }}>
          <a
            href="https://www.instagram.com/getgigiapp"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GiGi on Instagram"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 9,
              color: 'rgba(245,242,236,0.7)',
              textDecoration: 'none',
              fontSize: 15,
            }}
          >
            <InstagramIcon size={20} />
            @getgigiapp
          </a>
        </div>
      </Reveal>
    </section>
  );
}
