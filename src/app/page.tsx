import Contact from '@/components/landing/Contact';
import BetaBar from '@/components/landing/BetaBar';
import Faq from '@/components/landing/Faq';
import FinalCta from '@/components/landing/FinalCta';
import Hero from '@/components/landing/Hero';
import HowItWorks from '@/components/landing/HowItWorks';
import LandingFooter from '@/components/landing/LandingFooter';
import LandingNav from '@/components/landing/LandingNav';
import Manifesto from '@/components/landing/Manifesto';
import Proof from '@/components/landing/Proof';
import WhatGigiDoes from '@/components/landing/WhatGigiDoes';
import { gateMode } from '@/lib/beta';
import './landing.css';

/**
 * The GiGi marketing landing page.
 *
 * Section order, copy and styling are a 1:1 port of the approved design kept
 * at docs/reference/landing-reference.html. The port is componentised (one
 * component per section, data in arrays) so copy changes are edits to a list
 * rather than to markup — but the rendered page is the reference page.
 */
export default function Landing() {
  // The beta pill is fixed over the bottom-right corner; give the footer room
  // so it can never sit on top of the copyright line.
  const betaBar = gateMode() !== 'off';

  return (
    <div className={`landing${betaBar ? ' has-beta-bar' : ''}`}>
      <LandingNav />
      <Hero />
      <Manifesto />
      <WhatGigiDoes />
      <HowItWorks />
      <Proof />
      <Faq />
      <FinalCta />
      <Contact />
      <LandingFooter />
      <BetaBar />
    </div>
  );
}
