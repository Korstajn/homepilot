import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/require-session';
import {
  householdCalendar,
  listBills,
  listChildren,
  listDigests,
  listMembers,
  listProcessing,
  logProcessing,
  track,
  verifyProcessingChain,
} from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * Right of portability — everything GiGi holds about a household, as one file.
 *
 * Structured JSON rather than a PDF, because portability means a machine you
 * choose can read it, not that you can look at it. It is the same data the app
 * screens render, assembled in one place.
 *
 * Three things are deliberately absent:
 *
 *   - the identity vault (email, password hash, recovery hash). It is the one
 *     store that links a person to this content, and re-uniting the two halves
 *     in a downloadable file would undo the separation the whole design rests
 *     on. What it holds about you is an address you already know and hashes
 *     that are useless outside our login check.
 *   - the sealed Gmail refresh token, which is a live credential, not data.
 *   - other members' login details. A household export carries who is in the
 *     household and their role, never their credentials.
 *
 * The export is itself an act on the household's data, so it is logged like
 * every other one.
 */
export async function GET() {
  // A full copy of a household's data is not something to hand to whoever asks.
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { household: hh, member: me } = auth.session;

  const payload = {
    exportedAt: new Date().toISOString(),
    format: 'gigi-household-export/1',
    note:
      'Everything GiGi holds for this household. Login credentials are held in a separate identity vault and are deliberately not included — see /privacy.',
    household: {
      market: hh.market,
      currency: hh.currency,
      timezone: hh.timezone,
      postcode: hh.postcode,
      adults: hh.adults,
      children: hh.children,
      forwardingAddress: hh.forwardingAddress,
      connectionStatus: hh.connectionStatus,
      digestTime: hh.digestTime,
      digestPaused: hh.digestPaused,
      handedOver: hh.handedOver ?? [],
      createdAt: hh.createdAt,
    },
    members: (await listMembers(hh.id)).map((m) => ({
      name: m.name,
      role: m.role,
      status: m.status,
      createdAt: m.createdAt,
    })),
    children: await listChildren(hh.id),
    bills: await listBills(hh.id),
    calendar: await householdCalendar(hh.id),
    digests: await listDigests(hh.id),
    // The trust log ships with its own integrity check, so the copy you hold can
    // be verified as the copy we held.
    processingLog: await listProcessing(hh.id),
    processingLogIntegrity: await verifyProcessingChain(hh.id),
  };

  await logProcessing(
    hh.id,
    'stored',
    'account',
    'you',
    `${me.name} downloaded a full copy of this household's data`,
    'Your right to a portable copy of your data',
    'Legal obligation (data portability)',
  );
  await track('data_exported', hh.id, {});

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="gigi-export-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
