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

const FLOAT_CARDS = [
  {
    style: { top: '20%', right: -10 },
    label: 'THIS WEEK',
    value: '£168',
    sub: 'saved on broadband',
    subColor: '#2D6A4F',
  },
  {
    style: { bottom: '6%', left: -16 },
    label: 'REMINDER',
    value: 'Book babysitter',
    valueSize: 13,
    sub: 'Thu 7pm',
  },
  {
    style: { top: '52%', left: -38 },
    label: 'HEADS UP',
    value: "Ella's passport",
    valueSize: 13,
    sub: 'expires September',
    subColor: '#92400E',
  },
  {
    style: { bottom: '16%', right: -30 },
    label: 'SATURDAY',
    value: "Ines' birthday party",
    valueSize: 13,
    sub: 'Buy a gift?',
    subColor: '#3730A3',
  },
];

export default function Hero() {
  return (
    <section id="hero">
      <div className="hero-dot-grid" />
      <div className="hero-glow" />
      <div className="hero-inner">
        <Reveal visible>
          <div className="hero-eyebrow">
            Mental load, <em>lifted.</em>
          </div>
          <h1 className="hero-h1">
            A calmer home,
            <br />
            <em>a happier you.</em>
          </h1>
          <div className="hero-badge">The household operating system every family needs</div>
          <p className="hero-sub">
            One place for the whole household&apos;s to-do list — delegate to GiGi, your proactive
            chief of staff for household admin, or to anyone else in your household.
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
          {FLOAT_CARDS.map((c) => (
            <div className="float-card" style={c.style} key={c.label}>
              <div className="fc-label">{c.label}</div>
              <div className="fc-val" style={c.valueSize ? { fontSize: c.valueSize } : undefined}>
                {c.value}
              </div>
              <div className="fc-sub" style={c.subColor ? { color: c.subColor } : undefined}>
                {c.sub}
              </div>
            </div>
          ))}
          <PhoneMock />
        </Reveal>
      </div>
    </section>
  );
}
