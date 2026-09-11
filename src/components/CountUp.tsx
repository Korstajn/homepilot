'use client';

import { useEffect, useRef, useState } from 'react';

// Smoothly counts from 0 to `value`. Respects reduced-motion (snaps instantly).
export default function CountUp({ value, format, duration = 850 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [n, setN] = useState(0);
  const raf = useRef<number>();

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(value); return;
    }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(value * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration]);

  return <>{format ? format(n) : Math.round(n).toString()}</>;
}
