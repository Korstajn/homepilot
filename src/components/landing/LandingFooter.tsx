import Link from 'next/link';

export default function LandingFooter() {
  return (
    <footer>
      <div className="footer-logo">GiGi</div>
      <div className="footer-links">
        <Link href="/privacy">Privacy policy</Link>
        {/* No terms page exists yet — inert until the legal copy lands. */}
        <span>Terms of service</span>
        <a href="mailto:contact@getgigiapp.com">contact@getgigiapp.com</a>
      </div>
      <div className="footer-copy">© 2026 GiGi Ltd · getgigiapp.com · London, UK</div>
    </footer>
  );
}
