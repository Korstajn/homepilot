'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { trackClient } from '@/lib/analytics';
import ArrowIcon from './ArrowIcon';
import { notifyFormspree } from './formspree';

/**
 * "Join the waitlist" — a button that becomes the form.
 *
 * It used to scroll to an anchor further down the homepage, which is a fine
 * pattern and the wrong one here: the person has already decided, and the reply
 * to a decision should not be a journey. So the button expands in place into the
 * one field it needs, and then into the answer.
 *
 * THE MORPH IS A CLIP, NOT A RESIZE
 * The panel is always its full width and sits exactly on top of the trigger,
 * clipped to the trigger's own footprint until it opens. Opening animates the
 * clip, so nothing in the nav reflows — no neighbour jumps, no text rewraps
 * mid-animation, and the whole thing runs on the compositor. The trigger's width
 * is measured rather than hard-coded, so the closed state lines up to the pixel
 * at any font size or zoom level.
 *
 * ONE HEIGHT MEASUREMENT, DELIBERATELY
 * The three states are different heights and their text wraps differently at
 * every width, so the height is measured from the state that is actually
 * rendered and transitioned. CSS cannot do this today without `interpolate-size`,
 * which is too new to rely on. Eight lines of honest measurement beats a
 * hard-coded height that is wrong on the one phone nobody tested.
 *
 * MOTION IS A PREFERENCE, NOT A DECORATION
 * globals.css already collapses every transition and animation to 0.001ms under
 * `prefers-reduced-motion`, and landing.css additionally neutralises this
 * control's starting transforms. The states still change; they just stop
 * moving.
 */

type Phase = 'idle' | 'form' | 'done';

export default function WaitlistButton({
  source = 'nav',
  label = 'Join the waitlist',
  variant = 'nav',
  tone = 'light',
  align = 'end',
}: {
  source?: string;
  label?: string;
  /** 'nav' is the pill in the header; 'hero' is the larger one in a CTA block. */
  variant?: 'nav' | 'hero';
  /**
   * The surface it sits ON, not the button's own colour. An ink-on-ink button
   * is invisible, which is exactly what happened the first time this went into
   * the dark story CTA: the pill vanished and left a bare line of text.
   */
  tone?: 'light' | 'dark';
  /**
   * Which edge the panel grows from — it has to match where the button sits in
   * its container. A centred button whose panel expands leftwards lands off the
   * axis everything else on the page is aligned to.
   */
  align?: 'start' | 'center' | 'end';
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageHeight, setStageHeight] = useState<number>();

  const open = phase !== 'idle';

  // The closed clip has to match the trigger exactly, so it is measured rather
  // than assumed. Re-measured on resize because the label's width changes with
  // the font the browser actually loaded.
  const measureTrigger = useCallback(() => {
    const el = triggerRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    wrap.style.setProperty('--wl-trigger-w', `${el.offsetWidth}px`);
    wrap.style.setProperty('--wl-trigger-h', `${el.offsetHeight}px`);
  }, []);

  useLayoutEffect(() => {
    measureTrigger();
    window.addEventListener('resize', measureTrigger);
    return () => window.removeEventListener('resize', measureTrigger);
  }, [measureTrigger]);

  // Height of whichever state is on screen, so the pill grows into the answer
  // rather than snapping to it.
  useLayoutEffect(() => {
    if (!open) { setStageHeight(undefined); return; }
    const el = stageRef.current?.querySelector('[data-active]') as HTMLElement | null;
    if (el) setStageHeight(el.offsetHeight);
  }, [open, phase, error]);

  useEffect(() => {
    if (phase === 'form') {
      // After the clip has started travelling, not before: focusing instantly
      // makes the field appear fully formed inside a pill that is still the
      // width of a button.
      const t = setTimeout(() => inputRef.current?.focus(), 180);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // Escape closes; a click elsewhere closes. Both only while open, so the page
  // carries no listeners it is not using.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setPhase('idle');
    setError('');
  }

  function start() {
    setPhase('form');
    setError('');
    trackClient('waitlist_opened', { source });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value || busy) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setError('That does not look like an email address.');
      inputRef.current?.focus();
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, segment: 'household', source }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Something went wrong. Try again, or email contact@getgigiapp.com.');
        return;
      }
      trackClient('waitlist_joined_client', { source });
      notifyFormspree(value, source);
      setPhase('done');
    } catch {
      setError('Something went wrong. Try again, or email contact@getgigiapp.com.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={wrapRef}
      className={
        `wl wl-${variant} wl-${align}${tone === 'dark' ? ' wl-invert' : ''}` +
        `${open ? ' wl-open' : ''}${phase === 'done' ? ' wl-done' : ''}`
      }
    >
      <button
        ref={triggerRef}
        type="button"
        className="wl-trigger"
        aria-expanded={open}
        aria-controls={`wl-panel-${source}`}
        onClick={start}
        // Hidden from the tab order while the panel is open: it is underneath
        // the panel and invisible, and tabbing into something you cannot see is
        // the classic way an animated disclosure breaks a keyboard user.
        tabIndex={open ? -1 : 0}
      >
        <span className="wl-trigger-label">{label}</span>
        <ArrowIcon size={variant === 'hero' ? 15 : 13} />
      </button>

      <div
        id={`wl-panel-${source}`}
        className="wl-panel"
        aria-hidden={!open}
        style={stageHeight ? { height: stageHeight } : undefined}
      >
        <div className="wl-stage" ref={stageRef}>
          {/* The two states are stacked in one grid cell so the pill morphs
              between them instead of one replacing the other. */}
          <form
            className="wl-state wl-form"
            // The browser's own bubble for an invalid `type="email"` fires
            // before this handler runs, so the message someone sees would be
            // the UA's, in the UA's typeface, pointing at a field inside a pill
            // it knows nothing about. `type` stays for the phone keyboard; the
            // validating is ours.
            noValidate
            onSubmit={submit}
            {...(phase === 'form' ? { 'data-active': true } : {})}
          >
            <input
              ref={inputRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              className="wl-input"
              placeholder="your@email.com"
              aria-label="Email address"
              value={email}
              disabled={phase !== 'form'}
              tabIndex={phase === 'form' ? 0 : -1}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
            />
            <button
              type="submit"
              className="wl-send"
              disabled={busy || phase !== 'form'}
              tabIndex={phase === 'form' ? 0 : -1}
              aria-label="Join the waitlist"
            >
              {busy ? <span className="wl-spinner" aria-hidden /> : <ArrowIcon size={14} />}
            </button>
          </form>

          <div
            className="wl-state wl-success"
            role="status"
            {...(phase === 'done' ? { 'data-active': true } : {})}
          >
            <span className="wl-check" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M4 12.6l5.2 5.2L20 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="wl-success-text">
              <b>Welcome to GiGi.</b>
              We&apos;ll notify you with an invite code as soon as there&apos;s room.
            </span>
          </div>
        </div>
      </div>

      {/* Outside the pill so an error never changes its height mid-animation. */}
      {error && <p className="wl-error" role="alert">{error}</p>}
    </div>
  );
}
