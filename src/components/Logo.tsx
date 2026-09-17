import Image from 'next/image';

/**
 * The GiGi wordmark — the real one.
 *
 * Every screen outside the marketing site used to draw its own placeholder: an
 * ink-black rounded square with a serif "G" next to the word "GiGi" set in the
 * body serif. That was scaffolding from before the brand existed, and it meant
 * the landing page showed the actual logo while login, sign-up, onboarding, the
 * app sidebar and the privacy page all showed something else. A visitor who
 * clicked "Log in" watched the brand change under them.
 *
 * There is one asset in two inks, so `tone` picks the one that will actually be
 * legible rather than leaving each caller to guess:
 *   - `ink`  — the deep sage wordmark, for the cream and white surfaces.
 *   - `bone` — the cream wordmark, for the dark footer and any dark panel.
 *
 * Sized by HEIGHT, because that is what keeps a wordmark optically consistent
 * next to text; the width follows from the aspect ratio. The intrinsic size is
 * passed to next/image so it can serve a correctly sized file, and `priority`
 * is available for the one above the fold on a first paint.
 */

// The asset's intrinsic pixels. Both inks are the same artwork.
//
// These are the `-sm` files, not the 990px originals. The UI draws the logo at
// 26–34px tall, so even at 3x the densest screen asks for about 100px — the
// original is thirty times more pixels than anything renders, and at 452KB it
// was the single heaviest thing on a login page. Quantised to a small palette
// (it is a two-ink wordmark, not a photograph) the same mark is 13KB with no
// visible difference. The full-size originals stay for the Open Graph card,
// which wants the big one.
const NATURAL_WIDTH = 410;
const NATURAL_HEIGHT = 240;
const RATIO = NATURAL_WIDTH / NATURAL_HEIGHT;

export default function Logo({
  height = 28,
  tone = 'ink',
  priority = false,
  className,
}: {
  height?: number;
  tone?: 'ink' | 'bone';
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={tone === 'bone' ? '/images/gigi-logo-bone-sm.png' : '/images/gigi-logo-sm.png'}
      alt="GiGi"
      width={NATURAL_WIDTH}
      height={NATURAL_HEIGHT}
      priority={priority}
      className={className}
      // Inline rather than a class so a caller can ask for any height without a
      // new CSS rule per size. `width: auto` keeps the aspect ratio honest.
      style={{ height, width: 'auto', display: 'block' }}
      sizes={`${Math.round(height * RATIO)}px`}
    />
  );
}
