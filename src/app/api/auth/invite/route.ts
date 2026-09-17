import { NextResponse } from 'next/server';
import { inviteMode } from '@/lib/invite';

export const dynamic = 'force-dynamic';

/**
 * Whether this deployment asks for an invite code at sign-up.
 *
 * The sign-up screen needs to know before it renders: asking for a code that
 * is not required is a dead end for the person typing, and NOT asking for one
 * that is required means their first attempt fails for a reason the form never
 * mentioned.
 *
 * It reports the mode and nothing else. The codes themselves never leave the
 * server — not their values, not how many there are. Knowing that an invite is
 * needed tells an attacker only what the form already tells them.
 */
export async function GET() {
  const mode = inviteMode();
  return NextResponse.json(
    { required: mode === 'required', closed: mode === 'closed' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
