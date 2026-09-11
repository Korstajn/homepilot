'use client';

import { useState } from 'react';
import Reveal from './Reveal';
import WaitlistForm from './WaitlistForm';

const ITEMS = [
  {
    q: 'What accounts does GiGi need?',
    a: 'Your email and calendar, read-only. GiGi never sends, posts, or changes anything without your approval. Disconnect any time.',
  },
  {
    q: 'How does bill switching work?',
    a: 'GiGi watches your renewal dates, finds a better deal, and asks you to approve before switching. We take 10% of the saving — you keep the rest.',
  },
  {
    q: 'What do you do with my data?',
    a: 'Stored securely in the UK, used only to run GiGi. Never sold. Delete everything, anytime, by emailing contact@getgigiapp.com.',
  },
  {
    q: 'Is GiGi right for me?',
    a: 'Best for busy households — families with children, dual-income couples, anyone whose admin takes up more headspace than it should.',
  },
];

export default function Faq() {
  // Accordion: one open at a time, clicking the open one closes it.
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="section" id="faq">
      <div className="section-inner">
        <Reveal>
          <div className="sec-tag">Questions</div>
          <h2 className="sec-h">Honest answers.</h2>
        </Reveal>
        <div className="faq-layout">
          <Reveal className="faq-items">
            {ITEMS.map((item) => {
              const isOpen = open === item.q;
              return (
                <div className={`faq-item${isOpen ? ' open' : ''}`} key={item.q}>
                  <button
                    type="button"
                    className="faq-q"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : item.q)}
                  >
                    {item.q}
                    <div className="faq-icon" aria-hidden="true">
                      +
                    </div>
                  </button>
                  <div className="faq-a">{item.a}</div>
                </div>
              );
            })}
          </Reveal>
          <Reveal className="faq-visual">
            <div className="fq-title">Join the waitlist.</div>
            <div className="fq-sub">Add your email and we&apos;ll confirm your place within 48 hours.</div>
            <WaitlistForm source="landing_faq" />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
