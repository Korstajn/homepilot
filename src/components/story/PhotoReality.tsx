import Image from 'next/image';
import Reveal from '../landing/Reveal';

/**
 * The photo and the line about it are one thought, so they are one block.
 *
 * They used to be two: an 820px image floating in cream with a lot of nothing
 * either side, and then a separate dark band underneath. The seam between them
 * was the most visible break on the page, and neither half filled its own
 * space. Side by side in one dark section, the picture is the evidence for the
 * sentence next to it.
 */
export default function PhotoReality() {
  return (
    <section className="chapter-photo">
      <div className="photo-wrap">
        <Reveal>
          <Image
            src="/images/story-kitchen.jpg"
            alt="Kerstin at home with her family"
            width={1200}
            height={1093}
            sizes="(max-width: 900px) 100vw, 520px"
          />
        </Reveal>
        <Reveal className="photo-caption">
          <div className="photo-caption-inner">
            <div className="ch-eyebrow" style={{ color: 'rgba(245,242,236,0.45)' }}>
              The reality
            </div>
            <div className="photo-quote">
              I was too. Toddlers, a renovation, a full-time job — one evening in the kitchen I
              remember thinking: there has to be a better way to hold all this.
            </div>
            <div className="photo-attrib">Kerstin, founder</div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
