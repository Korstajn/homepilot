import { NextResponse } from 'next/server';
import { addWaitlist, listWaitlist, track } from '@/lib/store';
import { guardInternal } from '@/lib/internal';

/**
 * The waitlist, for the founder. Every entry is someone's email address, so on
 * the public site this needs GIGI_ADMIN_TOKEN (src/lib/internal.ts).
 */
export async function GET(req: Request) {
  const denied = guardInternal(req);
  if (denied) return denied;

  const entries = listWaitlist();
  const household = entries.filter((e) => e.segment === 'household').length;
  const company = entries.filter((e) => e.segment === 'company').length;
  return NextResponse.json({ total: entries.length, household, company, entries: entries.slice(0, 50) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim();
  const segment = body.segment === 'company' ? 'company' : 'household';
  const source = String(body.source ?? 'landing');

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  }

  const entry = addWaitlist(email, segment, source);
  track('waitlist_joined', null, { segment, source });
  return NextResponse.json({ ok: true, id: entry.id, segment });
}
