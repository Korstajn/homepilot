import { NextResponse } from 'next/server';
import { listEvents, track } from '@/lib/store';
import { resolveHousehold } from '@/lib/auth';
import { guardInternal } from '@/lib/internal';

// Client-side instrumentation sink. Every metric in §7 of the MVP doc depends
// on this existing from day one, not retrofitted.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  await track(name, (await resolveHousehold()).id, body.props ?? {});
  return NextResponse.json({ ok: true });
}

// Lightweight metrics view for the founder (also powers /app/metrics). The
// event stream is the whole product's usage in one place, so on the public site
// this needs GIGI_ADMIN_TOKEN (src/lib/internal.ts).
export async function GET(req: Request) {
  const denied = guardInternal(req);
  if (denied) return denied;

  const events = await listEvents();
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.name] = (counts[e.name] ?? 0) + 1;
  return NextResponse.json({ total: events.length, counts, events: events.slice(0, 100) });
}
