import { NextResponse } from 'next/server';
import { addContactMessage, listContactMessages, track } from '@/lib/store';

/**
 * "Get in touch" on the landing page.
 *
 * Same-origin replacement for the reference page's Formspree endpoint: no
 * third-party processor sees a visitor's name, email and message, which is
 * what docs/PRIVACY_ARCHITECTURE.md promises.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim();
  const message = String(body.message ?? '').trim();

  if (!name) return NextResponse.json({ error: 'Add your name.' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  }
  if (!message) return NextResponse.json({ error: 'Add a message.' }, { status: 400 });
  if (message.length > 4000) {
    return NextResponse.json({ error: 'That message is too long — 4000 characters max.' }, { status: 400 });
  }

  await addContactMessage({ name, email, message });
  // Count the event, but never log the message body itself.
  await track('contact_message', null, { length: message.length });
  return NextResponse.json({ ok: true });
}

/** Count only — the messages themselves are personal data, not a public list. */
export async function GET() {
  return NextResponse.json({ total: (await listContactMessages()).length });
}
