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

export const metadata: Metadata = {
  title: 'GiGi — A calmer home, a happier you. Mental load, lifted.',
  description:
    'GiGi is a proactive chief of staff for the household. One 7am digest, four things that matter, one-tap approvals.',
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
