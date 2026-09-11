'use client';

import ArrowIcon from './ArrowIcon';
import PhoneMock from './PhoneMock';
import Reveal from './Reveal';
import { scrollToId } from './scroll';

const PROOF_AVATARS = [
  { initials: 'SL', color: '#2D6A4F' },
  { initials: 'MP', color: '#3730A3' },
  { initials: 'JK', color: '#6D28D9' },
  { initials: 'AW', color: '#92400E' },
];

export default function Hero() {
  return (
    <section id="hero">
      <div className="hero-dot-grid" />
      <div className="hero-glow" />
      <div className="hero-inner">
        <Reveal visible>
          <div className="hero-badge">GiGi — your proactive chief of staff for household admin</div>
          <h1 className="hero-h1">
            Mental load
            <br />
            <em>lifted.</em>
          </h1>
          <p className="hero-sub">
            One notification every morning with what needs managing — kids&apos; schedules, family
            logistics, the everyday admin. Tell GiGi what she can take off your plate, and she&apos;ll
            manage it on your behalf, with your approval.
          </p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            <button
              className="btn-hero"
              style={{ padding: '17px 38px', fontSize: 17 }}
              onClick={() => scrollToId('faq')}
            >
              Join the waitlist
              <ArrowIcon />
            </button>
          </div>
          <div className="hero-proof">
            <div className="proof-avatars">
              {PROOF_AVATARS.map((a) => (
                <div key={a.initials} className="proof-avatar" style={{ background: a.color }}>
                  {a.initials}
                </div>
              ))}
            </div>
            <span>Joined by early households already using GiGi</span>
          </div>
        </Reveal>

        <Reveal visible className="hero-visual">
          <div className="float-card" style={{ top: '6%', right: -10 }}>
            <div className="fc-label">THIS WEEK</div>
            <div className="fc-val">£168</div>
            <div className="fc-sub" style={{ color: '#2D6A4F' }}>
              saved on broadband
            </div>
          </div>
          <div className="float-card" style={{ bottom: '6%', left: -16 }}>
            <div className="fc-label">REMINDER</div>
            <div className="fc-val" style={{ fontSize: 13 }}>
              Book babysitter
            </div>
            <div className="fc-sub">Thu 7pm</div>
          </div>
          <PhoneMock />
        </Reveal>
      </div>
    </section>
  );
}
