import { NextResponse } from 'next/server';
import { resolveInboundHousehold } from '@/lib/store';
import { ingestEmail } from '@/lib/ingest';

export const dynamic = 'force-dynamic';

// Inbound email webhook. Point a free inbound-email service at this URL
// (Postmark / Cloudflare Email Routing / Mailgun / SendGrid) — see
// docs/FORWARDING.md. Accepts JSON or form payloads and normalises the fields.
function pick(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return undefined;
}

export async function POST(req: Request) {
  // Optional shared secret so a public URL can't be spammed.
  const secret = process.env.INBOUND_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const provided = req.headers.get('x-gigi-secret') || url.searchParams.get('secret');
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const ct = req.headers.get('content-type') || '';
  let body: Record<string, unknown> = {};
  try {
    if (ct.includes('application/json')) {
      body = await req.json();
    } else {
      const form = await req.formData();
      form.forEach((v, k) => { body[k] = typeof v === 'string' ? v : ''; });
    }
  } catch {
    return NextResponse.json({ error: 'Could not parse payload' }, { status: 400 });
  }

  const from = pick(body, ['from', 'sender', 'From', 'FromFull']);
  const recipient = pick(body, ['to', 'recipient', 'To', 'OriginalRecipient', 'ToFull']);
  const subject = pick(body, ['subject', 'Subject']);
  const text = pick(body, ['text', 'body-plain', 'stripped-text', 'TextBody', 'plain', 'body']);

  if (!subject && !text) {
    return NextResponse.json({ error: 'No email content found in payload' }, { status: 400 });
  }

  const household = resolveInboundHousehold(recipient, from);
  const { engine, extracted, bill } = await ingestEmail(household, { from, subject, text });

  return NextResponse.json({ ok: true, engine, householdId: household.id, extracted, billId: bill.id });
}
