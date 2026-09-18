import { NextResponse } from 'next/server';
import { regenerateDigest, track, logProcessing } from '@/lib/store';
import { resolveHousehold } from '@/lib/auth';
import { getForecast } from '@/lib/weather';
import { requireSession } from '@/lib/require-session';

// Simulates the 02:00 nightly Inngest run on demand (useful for the demo).
export async function POST() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const hh = auth.session.household;
  // The nightly run is exactly when the forecast should be refreshed — the
  // digest a household wakes up to is about the day ahead.
  await getForecast(hh);
  const digest = await regenerateDigest(hh.id);
  await track('nightly_run_simulated', hh.id, { items: digest?.items.length ?? 0 });
  await logProcessing(
    hh.id, 'digest_generated', 'digest', 'gigi_server',
    'GiGi prepared your digest from what it already knows',
    'Show you what needs attention',
    'Contract (providing the service)',
  );
  return NextResponse.json({ ok: true, digest });
}
