import { NextResponse } from 'next/server';
import { writeSession } from './auth';
import type { Household, Member } from './types';

/**
 * The guard every write goes through.
 *
 * One helper rather than the same five lines in twenty route files, so that
 * "can an anonymous caller change this?" has exactly one answer and adding a
 * route cannot quietly get a different one.
 *
 * Reads are deliberately NOT guarded: the marketing site links into /app and a
 * visitor should see the demo household working. Writing to it is another
 * matter — see `writeSession` in src/lib/auth.ts for why that stopped being
 * harmless the moment the store became one shared database.
 */
export interface Session {
  member: Member;
  household: Household;
}

export async function requireSession(): Promise<
  { ok: true; session: Session } | { ok: false; response: NextResponse }
> {
  const session = await writeSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Log in to make changes.', code: 'login_required' },
        { status: 401 },
      ),
    };
  }
  return { ok: true, session };
}
