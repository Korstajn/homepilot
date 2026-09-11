import { NextResponse } from 'next/server';
import { runEval } from '@/lib/eval';
import { aiEnabled } from '@/lib/anthropic';
import { resolveMember, can } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // eval runs several model calls

// Founder tool: run the extraction eval over the labeled set and report
// precision/recall/null-rate per field + the CLAUDE.md gate. Uses the real
// Claude path when ANTHROPIC_API_KEY is set, else the heuristic baseline.
export async function POST() {
  if (!can(resolveMember().role, 'viewFinances')) {
    return NextResponse.json({ error: 'Not available on this account.' }, { status: 403 });
  }
  const report = await runEval();
  return NextResponse.json({ ...report, aiConfigured: aiEnabled() });
}
