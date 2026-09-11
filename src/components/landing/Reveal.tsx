'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Scroll-reveal wrapper — the React equivalent of the reference page's
 * IntersectionObserver over `.reveal` (docs/reference/landing-reference.html).
 *
 * `visible` renders the element already revealed (the hero, which is above the
 * fold and must never flash in). Everything else fades up once it enters view;
 * the observer disconnects after firing, matching the reference's one-way
 * animation.
 */
export default function Reveal({
  children,
  visible = false,
  className = '',
  ...rest
}: {
  children: React.ReactNode;
  visible?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(visible);

  useEffect(() => {
    if (visible || shown) return;
    const el = ref.current;
    if (!el) return;

    // No IntersectionObserver (or reduced motion): show it immediately rather
    // than leaving the page blank.
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            obs.disconnect();
          }
        });
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible, shown]);

  return (
    <div ref={ref} className={`reveal${shown ? ' visible' : ''}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </div>
  );
}
