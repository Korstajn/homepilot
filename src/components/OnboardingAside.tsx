'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from './Logo';

/**
 * The desktop panel beside the onboarding form: the four steps, with the
 * current one marked.
 *
 * On a phone the same information is the four-segment bar at the top of each
 * step (`OnboardingProgress`), which is all the room there is for it. A desktop
 * has room to name the steps, and naming them is worth doing — "how much more
 * of this is there" is the question someone abandons a sign-up over.
 *
 * The step is read from the path rather than passed down because this renders
 * from the shared onboarding layout, which has no idea which child is mounted.
 */
const STEPS = [
  { path: '/onboarding', label: 'Your household', hint: 'Where you are, who is at home' },
  { path: '/onboarding/connect', label: 'Connect your email', hint: 'Forward a bill, or link Gmail' },
  { path: '/onboarding/bills', label: 'Confirm what GiGi found', hint: 'You check every value' },
  { path: '/onboarding/done', label: 'You are set up', hint: 'First digest lands at 7am' },
];

export default function OnboardingAside() {
  const pathname = usePathname();
  // Longest match wins, so '/onboarding/connect' doesn't also light up the
  // '/onboarding' step it is prefixed by.
  const current = STEPS.reduce(
    (best, step, i) => (pathname?.startsWith(step.path) && step.path.length >= STEPS[best].path.length ? i : best),
    0,
  );

  return (
    <>
      <Link href="/" className="auth-brand" aria-label="GiGi — home">
        <Logo height={30} />
      </Link>

      <h2 className="auth-aside-title">Four steps, then GiGi runs on its own.</h2>

      <ol className="auth-steps">
        {STEPS.map((step, i) => (
          <li key={step.path} className={i === current ? 'on' : i < current ? 'past' : ''}>
            <span className="step-num">{i < current ? '✓' : i + 1}</span>
            <span>
              {step.label}
              <span className="step-hint">{step.hint}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="auth-aside-foot">
        You can change any of this later in Settings.
      </p>
    </>
  );
}
