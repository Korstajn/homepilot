import { NextResponse } from 'next/server';
import { devUserSpecs, devUsersEnabled } from '@/lib/dev-users';
import { secretSource } from '@/lib/secrets';
import { guardNonPublic } from '@/lib/internal';

export const dynamic = 'force-dynamic';

/**
 * Which test accounts this deployment has.
 *
 * Dev builds only. GIGI_DEV_PASSWORD is shared by every test account, so on a
 * public origin this route is half of a working credential pair — it names the
 * addresses that password opens. The login screen no longer lists them either;
 * this is for working on the build.
 */
export async function GET() {
  const denied = guardNonPublic();
  if (denied) return denied;

  if (!devUsersEnabled()) return NextResponse.json({ enabled: false, users: [] });
  return NextResponse.json({
    enabled: true,
    users: devUserSpecs().map((u) => ({ email: u.email, name: u.name })),
    sessionSecret: secretSource(),
  });
}
