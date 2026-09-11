import { NextResponse } from 'next/server';
import { listProcessing, verifyProcessingChain } from '@/lib/store';
import { resolveHousehold } from '@/lib/auth';
import { subprocessors } from '@/lib/subprocessors';

export const dynamic = 'force-dynamic';

// The user's trust log: exactly what happened with their data, newest first,
// plus the full list of who can touch it and a tamper-evidence check.
export async function GET() {
  const hh = resolveHousehold();
  const events = [...listProcessing(hh.id)].reverse();
  const integrity = verifyProcessingChain(hh.id);
  return NextResponse.json({
    events,
    integrity,
    subprocessors: subprocessors(),
    forwardingAddress: hh.forwardingAddress,
  });
}
