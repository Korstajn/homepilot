import Link from 'next/link';

/**
 * The frame for every page someone reaches BEFORE they are inside the app:
 * log in, create an account, accept an invite, onboarding.
 *
 * These used to render inside the phone frame the app screens share, which is
 * right for the product — GiGi is a phone app and presenting it as one is the
 * point — but wrong here. A 440px phone card floating in the middle of a 27"
 * display is what a demo looks like, not what a product someone is about to
 * hand their email address to looks like. Sign-up is also the first page a
 * visitor from the landing site sees, and that site is full-width: dropping
 * from a real web page into a phone mock at the exact moment of the decision
 * is the worst possible place for that seam.
 *
 * So on a wide screen this is a proper two-column layout: what GiGi is on the
 * left, the form on the right. Below 900px it collapses to the single centred
 * column it always was, and below 480px to full bleed.
 *
 * It is CSS-only on purpose. `AppShell` needs JavaScript because it honours a
 * remembered desktop/mobile preference, and it pays for that with a blank frame
 * on first paint. An auth page has no preference to read, so it should not pay
 * that cost: this renders correctly on the server, at every width, with no
 * layout flash.
 */
export default function AuthFrame({
  children,
  aside,
}: {
  children: React.ReactNode;
  /** Replaces the default left-hand panel. Onboarding uses it for the steps. */
  aside?: React.ReactNode;
}) {
  return (
    <div className="authwrap">
      <aside className="auth-aside">
        <div className="auth-aside-inner">{aside ?? <DefaultAside />}</div>
      </aside>
      <main className="auth-main">
        <div className="auth-col">{children}</div>
      </main>
    </div>
  );
}

function DefaultAside() {
  return (
    <>
      <Link href="/" className="auth-brand">
        <span className="logo-mark">G</span>
        <span className="wordmark">GiGi</span>
      </Link>

      <h2 className="auth-aside-title">
        The household admin, handled — before it needs you.
      </h2>

      <ul className="auth-points">
        <li>
          <b>Never more than four things.</b>
          One morning digest, ranked. Nothing at all on the calm days.
        </li>
        <li>
          <b>Bills, school and travel in one place.</b>
          Renewals, forms, kit bags and passports, watched around the clock.
        </li>
        <li>
          <b>Every action waits for your tap.</b>
          GiGi proposes. Nothing is switched, sent or booked without you.
        </li>
        <li>
          <b>UK &amp; EU data only.</b>
          No trackers, no cookie banner. You can even sign up without an email.
        </li>
      </ul>

      <p className="auth-aside-foot">
        <Link href="/privacy" className="link">
          How GiGi handles your data
        </Link>
      </p>
    </>
  );
}
