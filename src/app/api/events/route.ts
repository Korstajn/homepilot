import { NextResponse } from 'next/server';
import { listEvents, track } from '@/lib/store';
import { resolveHousehold } from '@/lib/auth';

// Client-side instrumentation sink. Every metric in §7 of the MVP doc depends
// on this existing from day one, not retrofitted.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  track(name, resolveHousehold().id, body.props ?? {});
  return NextResponse.json({ ok: true });
}

// Lightweight metrics view for the founder (also powers /app/metrics).
export async function GET() {
  const events = listEvents();
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.name] = (counts[e.name] ?? 0) + 1;
  return NextResponse.json({ total: events.length, counts, events: events.slice(0, 100) });
}
