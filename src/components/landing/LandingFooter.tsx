import Image from 'next/image';
import Link from 'next/link';
import { InstagramIcon } from './icons';

export default function LandingFooter() {
  return (
    <footer>
      <div className="footer-logo">
        <Image src="/images/gigi-logo-bone.png" alt="GiGi" width={990} height={579} />
      </div>
      <div className="footer-links">
        <Link href="/privacy">Privacy policy</Link>
        {/* No terms page exists yet — inert until the legal copy lands. */}
        <span>Terms of service</span>
        <a href="mailto:contact@getgigiapp.com">contact@getgigiapp.com</a>
        <a
          href="https://www.instagram.com/getgigiapp"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GiGi on Instagram"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
        >
          <InstagramIcon />
          @getgigiapp
        </a>
      </div>
      <div className="footer-copy">© 2026 GiGi Ltd · getgigiapp.com · London, UK</div>
    </footer>
  );
}
