import './globals.css';
import type { Metadata, Viewport } from 'next';
import { DM_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google';

// next/font downloads these at BUILD time and serves them from our own origin,
// so the landing matches the reference design without a runtime request to
// fonts.googleapis.com — which the self-only CSP in next.config.mjs forbids,
// and which would leak a visitor's IP to a third party (docs/PRIVACY_ARCHITECTURE.md).
const sans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-serif',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

const TITLE = 'GiGi — A calmer home, a happier you. Mental load, lifted.';
const DESCRIPTION =
  'GiGi is a proactive chief of staff for the household. One 7am digest, four things that matter, one-tap approvals.';

export const metadata: Metadata = {
  // Needed for Next to resolve the absolute URLs Open Graph requires. Read from
  // the environment so a preview deployment advertises itself rather than the
  // production domain.
  metadataBase: new URL(process.env.GIGI_SITE_URL || 'https://getgigiapp.com'),
  title: TITLE,
  description: DESCRIPTION,
  // Without these, sharing the site anywhere — a message, a post, a Slack —
  // renders a bare URL with no title or picture. The image is the existing
  // wordmark; nothing new is invented for it.
  openGraph: {
    type: 'website',
    siteName: 'GiGi',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/images/gigi-logo.png', width: 990, height: 579, alt: 'GiGi' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/images/gigi-logo.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#F5F2EC',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
