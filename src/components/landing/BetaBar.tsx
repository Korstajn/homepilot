import Link from 'next/link';
import { isPublicSite } from '@/lib/beta';

/**
 * Dev-only way into the product.
 *
 * The reference landing (docs/reference/landing-reference.html) is the PUBLIC
 * marketing page — it has no "log in" and no demo link, and this port keeps it
 * that way, pixel for pixel. But a tester landing on the dev build needs a
 * door. This pill is fixed to the viewport, outside the page flow, so it adds
 * an entry point without moving a single element of the design — and it
 * disappears entirely on the public site.
 *
 * It keys off isPublicSite(), NOT the beta gate: an ungated dev deployment is
 * exactly where testers arrive with no idea where the app lives, so that is
 * the last place the only signpost should vanish.
 */
export default function BetaBar() {
  if (isPublicSite()) return null;

  return (
    <div className="beta-bar">
      <span className="beta-dot" aria-hidden="true" />
      <span>Beta build</span>
      <Link href="/app/digest">Open the app →</Link>
    </div>
  );
}
