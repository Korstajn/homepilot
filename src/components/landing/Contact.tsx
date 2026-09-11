'use client';

import { useState } from 'react';
import Reveal from './Reveal';

/**
 * "Get in touch". The reference posted to Formspree; this posts to
 * /api/contact so messages stay on our own origin (self-only CSP) and in our
 * own store — no third-party processor to add to docs/PRIVACY_ARCHITECTURE.md.
 */
export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Something went wrong — please try again or email contact@getgigiapp.com directly.');
        return;
      }
      setDone(true);
    } catch {
      setError('Something went wrong — please try again or email contact@getgigiapp.com directly.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="contact">
      <Reveal className="contact-inner">
        <div className="contact-title">Get in touch.</div>
        <div className="contact-sub">
          Questions, partnerships, press, or just want to say hello — send us a message and
          we&apos;ll get back to you.
        </div>
        {done ? (
          <div id="contact-thanks" style={{ display: 'block' }}>
            Thanks for reaching out — we&apos;ll reply personally, usually within a day.
          </div>
        ) : (
          <form className="contact-form" onSubmit={submit}>
            <div className="contact-row">
              <input
                className="contact-field"
                type="text"
                id="contact-name"
                name="name"
                placeholder="Your name"
                aria-label="Your name"
                required
                value={form.name}
                onChange={field('name')}
              />
              <input
                className="contact-field"
                type="email"
                id="contact-email-field"
                name="email"
                placeholder="Your email"
                aria-label="Your email"
                required
                value={form.email}
                onChange={field('email')}
              />
            </div>
            <textarea
              className="contact-field"
              id="contact-message"
              name="message"
              placeholder="What's on your mind?"
              aria-label="Your message"
              required
              value={form.message}
              onChange={field('message')}
            />
            <button className="contact-submit" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send message'}
            </button>
            {error && (
              <div className="contact-note" role="alert" style={{ color: '#F0B4B0' }}>
                {error}
              </div>
            )}
          </form>
        )}
      </Reveal>
    </section>
  );
}
