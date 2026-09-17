import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import BetaGateForm from '@/components/landing/BetaGateForm';
import Logo from '@/components/Logo';
import { BETA_COOKIE, gateMode, hasValidBetaCookie, safeNextPath } from '@/lib/beta';
import '../landing.css';

export const metadata: Metadata = {
  title: 'GiGi — private beta',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function BetaGatePage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = safeNextPath(searchParams.next);

  // Nothing to unlock (gate off, or this browser already has the cookie):
  // don't show a code box that does nothing.
  if (gateMode() === 'off') redirect(next);
  if (await hasValidBetaCookie(cookies().get(BETA_COOKIE)?.value)) redirect(next);

  return (
    <div className="landing">
      <div className="gate-wrap">
        <div className="hero-dot-grid" />
        <div className="gate-card">
          <div className="gate-logo">
            <Logo height={30} priority />
          </div>
          <div className="gate-tag">Private beta</div>
          <h1 className="gate-title">This build is still in development.</h1>
          <p className="gate-sub">
            Enter the beta code we sent you to open it. It stays unlocked on this browser for 30
            days.
          </p>
          <BetaGateForm next={next} />
          <div className="gate-note">
            No code yet? Email{' '}
            <a href="mailto:contact@getgigiapp.com" style={{ textDecoration: 'underline' }}>
              contact@getgigiapp.com
            </a>{' '}
            and we&apos;ll send you one.
          </div>
        </div>
      </div>
    </div>
  );
}
