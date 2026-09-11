import { NextResponse } from 'next/server';
import { updateHousehold, track, logProcessing } from '@/lib/store';
import { resolveHousehold } from '@/lib/auth';
import type { Currency, Market } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ household: resolveHousehold() });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const current = resolveHousehold();

  const patch: Record<string, unknown> = {};
  for (const key of [
    'ownerName',
    'adults',
    'children',
    'postcode',
    'timezone',
    'digestTime',
    'digestPaused',
    'connectionStatus',
  ] as const) {
    if (key in body) patch[key] = body[key];
  }

  // Market drives currency + timezone default (single-market beta, see docs).
  if (body.market === 'uk' || body.market === 'se') {
    const market = body.market as Market;
    patch.market = market;
    patch.currency = (market === 'se' ? 'SEK' : 'GBP') as Currency;
    if (!('timezone' in body)) {
      patch.timezone = market === 'se' ? 'Europe/Stockholm' : 'Europe/London';
    }
  }

  const updated = updateHousehold(current.id, patch);
  track('household_updated', current.id, { fields: Object.keys(patch) });

  if ('connectionStatus' in patch) {
    logProcessing(
      current.id, 'connection_changed', 'account', 'you',
      patch.connectionStatus === 'active'
        ? 'You reconnected your forwarding inbox'
        : 'Your forwarding connection changed state',
      'Manage which emails GiGi receives',
      'Consent',
    );
  }

  return NextResponse.json({ household: updated });
}
