import { NextResponse } from 'next/server';
import { getTodayDigest, markDigestOpened, regenerateDigest, track } from '@/lib/store';
import { resolveHousehold, resolveMember, can } from '@/lib/auth';
import type { Digest } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const hh = resolveHousehold();
  const me = resolveMember();
  let digest = getTodayDigest(hh.id);
  if (!digest) digest = regenerateDigest(hh.id);

  const url = new URL(req.url);
  if (url.searchParams.get('open') === '1' && digest && !digest.openedAt) {
    markDigestOpened(hh.id);
    track('digest_opened', hh.id, { date: digest.date });
  }

  // Teens get a limited view — no financial (bill) items.
  if (digest && !can(me.role, 'viewFinances')) {
    const strip = (d: Digest): Digest => ({
      ...d,
      items: d.items.filter((i) => i.category !== 'bill'),
      overflow: d.overflow.filter((i) => i.category !== 'bill'),
    });
    digest = strip(digest);
  }

  return NextResponse.json({ digest, household: hh, role: me.role });
}
