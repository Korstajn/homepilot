import type { Metadata } from 'next';
import LandingFooter from '@/components/landing/LandingFooter';
import LandingNav from '@/components/landing/LandingNav';
import Hook from '@/components/story/Hook';
import PhotoReality from '@/components/story/PhotoReality';
import ProductChapter from '@/components/story/ProductChapter';
import Realisation from '@/components/story/Realisation';
import StoryCta from '@/components/story/StoryCta';
import ThingsGrid from '@/components/story/ThingsGrid';
import '../landing.css';

export const metadata: Metadata = {
  title: 'GiGi — Why I built this',
  description:
    "Kerstin, GiGi's founder, on the mental load of running a household and why she built a chief of staff for it.",
};

/**
 * "Our story" — the founder narrative linked from the main nav.
 *
 * A 1:1 port of docs/reference/story-reference.html, componentised the same
 * way as the homepage (src/app/page.tsx): one component per chapter, copy in
 * the component, styling shared through landing.css under `.landing`.
 */
export default function Story() {
  return (
    <div className="landing">
      <LandingNav />
      <Hook />
      <PhotoReality />
      <Realisation />
      <ProductChapter />
      <ThingsGrid />
      <StoryCta />
      <LandingFooter />
    </div>
  );
}
