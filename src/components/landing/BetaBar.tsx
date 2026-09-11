import Link from 'next/link';
import { gateMode } from '@/lib/beta';

/**
 * Dev-only way into the product.
 *
 * The reference landing (docs/reference/landing-reference.html) is the PUBLIC
 * marketing page — it has no "log in" and no demo link, and this port keeps it
 * that way, pixel for pixel. But a beta tester who just typed a code needs a
 * door. This pill is fixed to the viewport, outside the page flow, so it adds
 * an entry point without moving a single element of the design — and it
 * disappears entirely once the gate is off (i.e. on the public site).
 */
export default function BetaBar() {
  if (gateMode() === 'off') return null;

  return (
    <div className="beta-bar">
      <span className="beta-dot" aria-hidden="true" />
      <span>Beta build</span>
      <Link href="/app/digest">Open the app →</Link>
    </div>
  );
}
