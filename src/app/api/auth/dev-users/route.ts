import { NextResponse } from 'next/server';
import { devUserSpecs, devUsersEnabled } from '@/lib/dev-users';
import { secretSource } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

/**
 * Which test accounts this deployment has, so the login screen can list them
 * instead of a tester having to guess the addresses.
 *
 * Returns addresses and names only — never GIGI_DEV_PASSWORD, and nothing at
 * all unless test accounts are switched on. `sessionSecret` reports which key
 * material is signing sessions, because 'ephemeral' is the one state where
 * logins will not survive on serverless and it is otherwise invisible.
 */
export async function GET() {
  if (!devUsersEnabled()) return NextResponse.json({ enabled: false, users: [] });
  return NextResponse.json({
    enabled: true,
    users: devUserSpecs().map((u) => ({ email: u.email, name: u.name })),
    sessionSecret: secretSource(),
  });
}
