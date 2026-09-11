import { NextResponse } from 'next/server';
import { regenerateDigest, track, logProcessing } from '@/lib/store';
import { resolveHousehold } from '@/lib/auth';

// Simulates the 02:00 nightly Inngest run on demand (useful for the demo).
export async function POST() {
  const hh = resolveHousehold();
  const digest = regenerateDigest(hh.id);
  track('nightly_run_simulated', hh.id, { items: digest?.items.length ?? 0 });
  logProcessing(
    hh.id, 'digest_generated', 'digest', 'gigi_server',
    'GiGi prepared your digest from what it already knows',
    'Show you what needs attention',
    'Contract (providing the service)',
  );
  return NextResponse.json({ ok: true, digest });
}
