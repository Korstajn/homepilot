import { NextResponse } from 'next/server';
import { updateHousehold, track, logProcessing } from '@/lib/store';
import { resolveHousehold } from '@/lib/auth';
import type { Household } from '@/lib/types';
import { requireSession } from '@/lib/require-session';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ household: await resolveHousehold() });
}

/**
 * Settings.
 *
 * Every field is validated against the values the column actually accepts
 * rather than copied out of the body. When the store was an object in memory,
 * `patch[key] = body[key]` meant a household could end up with `adults: "yes"`
 * and nothing would complain until a screen rendered it; against Postgres the
 * same input is a check-constraint violation and a 500. Neither is acceptable,
 * and the fix is the same one: decide here what a legal value is, and answer
 * 400 for anything else.
 */
const ADULTS = ['1', '2', '3+'] as const;
const CHILDREN = ['none', '1-2', '3+'] as const;
const CONNECTION = ['pending', 'active', 'degraded'] as const;
/** 'HH:MM', 24-hour. The digest job reads this as a wall-clock time. */
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function PATCH(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const current = auth.session.household;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Partial<Household> = {};
  const reject = (message: string) => NextResponse.json({ error: message }, { status: 400 });

  if ('ownerName' in body) {
    const name = String(body.ownerName ?? '').trim().slice(0, 80);
    if (!name) return reject('Enter a name.');
    patch.ownerName = name;
  }
  if ('adults' in body) {
    if (!ADULTS.includes(body.adults as (typeof ADULTS)[number])) return reject('Unknown value for adults.');
    patch.adults = body.adults as Household['adults'];
  }
  if ('children' in body) {
    if (!CHILDREN.includes(body.children as (typeof CHILDREN)[number])) return reject('Unknown value for children.');
    patch.children = body.children as Household['children'];
  }
  if ('postcode' in body) {
    // Clearing it is a real edit — a household that removes its postcode must
    // stop being geocoded — so an empty string is stored, not ignored.
    patch.postcode = String(body.postcode ?? '').trim().slice(0, 12).toUpperCase();
  }
  if ('timezone' in body) {
    const tz = String(body.timezone ?? '').trim();
    // Checked against the runtime's own tz database rather than a hand-kept
    // list: an unknown zone here would make the digest fire at the wrong hour,
    // every day, silently.
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
    } catch {
      return reject('Unknown timezone.');
    }
    patch.timezone = tz;
  }
  if ('digestTime' in body) {
    const time = String(body.digestTime ?? '').trim();
    if (!TIME.test(time)) return reject('Digest time must look like 07:00.');
    patch.digestTime = time;
  }
  if ('digestPaused' in body) {
    if (typeof body.digestPaused !== 'boolean') return reject('digestPaused must be true or false.');
    patch.digestPaused = body.digestPaused;
  }
  if ('connectionStatus' in body) {
    if (!CONNECTION.includes(body.connectionStatus as (typeof CONNECTION)[number])) {
      return reject('Unknown connection status.');
    }
    patch.connectionStatus = body.connectionStatus as Household['connectionStatus'];
  }

  // Market drives currency and the timezone default (single-market beta, see docs).
  if (body.market === 'uk' || body.market === 'se') {
    patch.market = body.market;
    patch.currency = body.market === 'se' ? 'SEK' : 'GBP';
    if (!('timezone' in body)) {
      patch.timezone = body.market === 'se' ? 'Europe/Stockholm' : 'Europe/London';
    }
  }

  const fields = Object.keys(patch);
  if (fields.length === 0) return NextResponse.json({ household: current });

  const updated = await updateHousehold(current.id, patch);
  await track('household_updated', current.id, { fields });

  if (patch.connectionStatus !== undefined) {
    await logProcessing(
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
