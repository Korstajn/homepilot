import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireSession } from '@/lib/require-session';
import {
  disconnectGoogleCalendars,
  listGoogleCalendars,
  logProcessing,
  regenerateDigest,
  setGoogleCalendarSelection,
  track,
} from '@/lib/store';
import {
  CALENDAR_EVENTS_SCOPE,
  CALENDAR_LIST_SCOPE,
  GMAIL_COOKIE,
  googleConfigured,
  hasCalendarScopes,
  missingScopes,
  openConnection,
} from '@/lib/google';
import { gmailAccessToken } from '@/lib/gmail-request';
import { googleCalendarApi, CalendarApiError } from '@/lib/google-calendar';
import { isStale, refreshCalendarList } from '@/lib/calendar-sync';
import type { GoogleCalendar } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CATEGORIES: GoogleCalendar['category'][] = ['school', 'travel', 'appointment', 'other'];

/**
 * The state of Google Calendar sync for this household.
 *
 * The three "not ready" answers are kept apart on purpose, because they need
 * three different sentences from the UI and one of them is easy to get wrong:
 *
 *   - not configured — this deployment has no Google OAuth client;
 *   - not connected — nobody has linked an account;
 *   - connected WITHOUT calendar scopes — the common one. Reading a mailbox and
 *     reading a calendar are different grants, so anyone who linked their
 *     account before this feature existed has a connection that works for mail
 *     and cannot see a single calendar. Telling them "not connected" would send
 *     them looking for a setting that is already on.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { household } = auth.session;

  if (!googleConfigured()) {
    return NextResponse.json({ configured: false, connected: false, calendars: [] });
  }

  const conn = openConnection(req.cookies.get(GMAIL_COOKIE)?.value);
  if (!conn) {
    return NextResponse.json({ configured: true, connected: false, calendars: [] });
  }

  const missing = missingScopes(conn.scope, [CALENDAR_LIST_SCOPE, CALENDAR_EVENTS_SCOPE]);
  if (missing.length > 0) {
    return NextResponse.json({
      configured: true,
      connected: true,
      calendarAccess: false,
      needsReconnect: true,
      account: conn.email,
      calendars: await listGoogleCalendars(household.id),
      reason:
        'This connection was made before GiGi could read calendars, so it only covers Gmail. Reconnect to add calendar access — it stays read-only.',
    });
  }

  let calendars = await listGoogleCalendars(household.id);

  // Fetch the list from Google when we have none yet, or when asked. Not on
  // every load: the list changes when someone creates a calendar, which is
  // rare, and the events are what go stale.
  const wantRefresh = req.nextUrl.searchParams.get('refresh') === '1' || calendars.length === 0;
  let listError: string | null = null;
  if (wantRefresh) {
    const token = await gmailAccessToken(req);
    if (!token.ok) return token.response;
    try {
      calendars = await refreshCalendarList(googleCalendarApi(token.accessToken), household.id);
      await logProcessing(
        household.id,
        'calendar_connected',
        'account',
        'google',
        `GiGi listed the ${calendars.length} calendar(s) in your Google account — names only, no events`,
        'Let you choose which calendars to bring into GiGi',
        'Consent',
        'Google (not EU-resident)',
      );
    } catch (e) {
      const apiError = e instanceof CalendarApiError;
      if (apiError && e.kind === 'auth') {
        return NextResponse.json({
          configured: true,
          connected: true,
          calendarAccess: false,
          needsReconnect: true,
          account: conn.email,
          calendars,
          reason: 'Google refused calendar access for this connection. Reconnect to grant it.',
        });
      }
      listError = apiError ? e.message : 'Could not read your calendar list just now.';
    }
  }

  return NextResponse.json({
    configured: true,
    connected: true,
    calendarAccess: true,
    account: conn.email,
    calendars,
    stale: isStale(calendars),
    error: listError,
  });
}

/**
 * Tick a calendar, or say what its events are.
 *
 * Both are the household's decision and neither is inferred: GiGi does not
 * guess that a calendar called "Skola" is the school one, because the digest
 * ranks by category and a wrong guess quietly changes what a parent is told to
 * do today.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { household } = auth.session;

  const body = (await req.json().catch(() => ({}))) as {
    calendarId?: unknown;
    selected?: unknown;
    category?: unknown;
  };
  const calendarId = String(body.calendarId ?? '').trim();
  if (!calendarId) return NextResponse.json({ error: 'Which calendar?' }, { status: 400 });

  const patch: { selected?: boolean; category?: GoogleCalendar['category'] } = {};
  if ('selected' in body) {
    if (typeof body.selected !== 'boolean') {
      return NextResponse.json({ error: 'selected must be true or false.' }, { status: 400 });
    }
    patch.selected = body.selected;
  }
  if ('category' in body) {
    if (!CATEGORIES.includes(body.category as GoogleCalendar['category'])) {
      return NextResponse.json({ error: 'Unknown category.' }, { status: 400 });
    }
    patch.category = body.category as GoogleCalendar['category'];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  const updated = await setGoogleCalendarSelection(household.id, calendarId, patch);
  if (!updated) return NextResponse.json({ error: 'No such calendar.' }, { status: 404 });

  if (patch.selected === false) {
    await logProcessing(
      household.id,
      'calendar_disconnected',
      'account',
      'you',
      `You stopped syncing the calendar "${updated.summary}" — everything imported from it was deleted`,
      'Stop bringing this calendar into GiGi',
      'Consent',
    );
    // Those events were signals the digest was ranking; it should stop now.
    await regenerateDigest(household.id);
  }
  await track('google_calendar_selection_changed', household.id, {
    selected: patch.selected ?? null,
    category: patch.category ?? null,
  });

  return NextResponse.json({ ok: true, calendar: updated });
}

/** Stop syncing altogether: forget the calendars and delete what came from them. */
export async function DELETE() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { household } = auth.session;

  const { removed } = await disconnectGoogleCalendars(household.id);
  await logProcessing(
    household.id,
    'calendar_disconnected',
    'account',
    'you',
    `You turned off Google Calendar sync — ${removed} imported event(s) were deleted from GiGi`,
    'Stop bringing your Google calendars into GiGi',
    'Consent',
  );
  await regenerateDigest(household.id);
  await track('google_calendar_disconnected', household.id, { removed });

  return NextResponse.json({ ok: true, removed });
}
