import { InstagramIcon } from '../landing/icons';
import Reveal from '../landing/Reveal';
import WaitlistButton from '../landing/WaitlistButton';

/**
 * The end of the story, which is the place someone decides.
 *
 * It used to hand them a link to getgigiapp.com — the site they are already on —
 * set in 38px serif with an underline, below a 72px heading, all of it written
 * in inline styles and an emerald that appears nowhere else in the palette. It
 * now asks for the one thing it wants, with the same control as every other
 * "join the waitlist" on the site.
 */
export default function StoryCta() {
  return (
    <section className="chapter chapter-dark story-cta">
      <Reveal className="chapter-inner">
        <div className="story-cta-inner">
          <div className="story-live">Waitlist open</div>
          <div className="ch-big">
            Mental load <em>lifted.</em>
          </div>
          <div className="ch-body">
            The first 100 households join as founding members. Leave your email and we&apos;ll send
            an invite code when there&apos;s room.
          </div>
          <div className="story-cta-actions">
            <WaitlistButton source="story" variant="hero" tone="dark" align="center" />
          </div>
          <a
            className="story-social"
            href="https://www.instagram.com/getgigiapp"
            target="_blank"
            rel="noopener noreferrer"
          >
            <InstagramIcon size={18} />
            @getgigiapp
          </a>
        </div>
      </Reveal>
    </section>
  );
}
