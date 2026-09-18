import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/require-session';
import { listGoogleCalendars, logProcessing, regenerateDigest, track } from '@/lib/store';
import {
  CALENDAR_EVENTS_SCOPE,
  CALENDAR_LIST_SCOPE,
  GMAIL_COOKIE,
  missingScopes,
  openConnection,
} from '@/lib/google';
import { gmailAccessToken } from '@/lib/gmail-request';
import { googleCalendarApi } from '@/lib/google-calendar';
import { isStale, syncGoogleCalendars } from '@/lib/calendar-sync';

export const dynamic = 'force-dynamic';
// A household with several calendars is several round trips to Google plus the
// writes; the default 10s is not enough and a timeout mid-sync is the one
// failure that looks like data loss.
export const maxDuration = 60;

/**
 * Read the selected Google calendars and make GiGi's copy of the window match.
 *
 * Two ways in, and the difference matters:
 *
 *   - `{ ifStale: true }` — the calendar page asking on load. Returns without
 *     touching Google when the copy is fresh, so opening the app four times
 *     before breakfast is one sync, not four.
 *   - no body — the household pressed "Sync now", which means "I changed
 *     something over there and I want it now". That always runs.
 *
 * WHAT THIS CANNOT DO, STATED PLAINLY: the Google refresh token lives in an
 * encrypted cookie in the user's own browser, not on our server — a genuinely
 * better privacy position, and the reason there is no background sync. GiGi
 * reads the calendar when the household is here, and the 02:00 digest is built
 * from whatever the last visit brought in. Moving that would mean holding a
 * live credential for every household in the database, which is a trade worth
 * making deliberately rather than by accident.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { household } = auth.session;

  const body = (await req.json().catch(() => ({}))) as { ifStale?: boolean };

  const conn = openConnection(req.cookies.get(GMAIL_COOKIE)?.value);
  if (!conn) {
    return NextResponse.json({ error: 'No Google account is connected.' }, { status: 409 });
  }
  if (missingScopes(conn.scope, [CALENDAR_LIST_SCOPE, CALENDAR_EVENTS_SCOPE]).length > 0) {
    return NextResponse.json(
      {
        error: 'This connection does not include calendar access. Reconnect to grant it.',
        needsReconnect: true,
      },
      { status: 409 },
    );
  }

  const calendars = await listGoogleCalendars(household.id);
  const selected = calendars.filter((c) => c.selected);
  if (selected.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'nothing_selected', imported: 0, removed: 0 });
  }
  if (body.ifStale && !isStale(calendars)) {
    return NextResponse.json({ ok: true, skipped: 'fresh', imported: 0, removed: 0 });
  }

  const token = await gmailAccessToken(req);
  if (!token.ok) return token.response;

  const started = Date.now();
  const result = await syncGoogleCalendars(googleCalendarApi(token.accessToken), household.id);
  const took = Date.now() - started;

  // Logged whatever the outcome — a read of somebody's calendar happened, and
  // the count is what makes "read-only reflection" checkable rather than
  // claimed. Never the contents: the trust log records the flow, not the data.
  await logProcessing(
    household.id,
    'calendar_imported',
    'account',
    'google',
    `GiGi read ${result.calendars} connected Google calendar(s) and updated ${result.imported} event(s)` +
      (result.removed ? `, removing ${result.removed} that are no longer there` : ''),
    'Show your own calendar alongside the rest of the household',
    'Consent',
    'Google (not EU-resident)',
    took,
  );

  if (result.imported > 0 || result.removed > 0) {
    // New events are new signals; the digest should know about a parents'
    // evening tomorrow now, not at 02:00.
    await regenerateDigest(household.id);
  }
  await track('google_calendar_synced', household.id, {
    calendars: result.calendars,
    imported: result.imported,
    removed: result.removed,
    errors: result.errors.length,
    tookMs: took,
  });

  return NextResponse.json({ ok: true, ...result });
}
