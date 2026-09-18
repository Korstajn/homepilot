// Google Calendar — the read-only half, and only the read-only half.
//
// WHAT THIS IS NOT
// There is no write path here and there must never be one. GiGi's promise is
// that it never sends, deletes or modifies anything in a connected account, and
// a calendar is the easiest place in the world to break that promise by
// accident — a sync that "keeps both sides in step" is a sync that can delete
// somebody's dentist appointment because our copy was stale. So this is a
// one-way import: Google is the source of truth, GiGi holds a read-only
// reflection, and nothing GiGi does can change what is in their calendar.
//
// THE NETWORK EDGE IS AN INTERFACE
// `CalendarApi` exists so the sync logic in src/lib/calendar-sync.ts can be run
// against a stub. That is not test scaffolding bolted on afterwards: the parts
// worth getting right — what happens when an event is deleted upstream, when an
// all-day event straddles a month end, when someone declines an invitation —
// are exactly the parts you cannot exercise by clicking through a real Google
// account, and a sync nobody can test is a sync that corrupts a calendar
// quietly.

export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

/** One calendar in the account's list. */
export interface GoogleCalendarSummary {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
  primary?: boolean;
  /** Google's own colour for the calendar, so the picker looks like their calendar. */
  backgroundColor?: string;
  /** 'owner' | 'writer' | 'reader' | 'freeBusyReader' — we only ever read. */
  accessRole?: string;
  /** True for the birthday/holiday calendars Google adds by default. */
  selected?: boolean;
}

export interface GoogleEventDate {
  /** 'YYYY-MM-DD' for an all-day event. */
  date?: string;
  /** RFC3339 for a timed event. */
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleEvent {
  id: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleEventDate;
  end?: GoogleEventDate;
  recurringEventId?: string;
  updated?: string;
  transparency?: 'opaque' | 'transparent';
  visibility?: 'default' | 'public' | 'private' | 'confidential';
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
  eventType?: string;
}

/** Everything the sync needs from Google, and nothing else. */
export interface CalendarApi {
  listCalendars(): Promise<GoogleCalendarSummary[]>;
  listEvents(calendarId: string, window: { timeMin: string; timeMax: string }): Promise<GoogleEvent[]>;
}

/** Hard ceilings, so one pathological account cannot blow up a request. */
export const MAX_CALENDARS = 25;
export const MAX_EVENTS_PER_CALENDAR = 750;
const PAGE_SIZE = 250;
const MAX_PAGES = Math.ceil(MAX_EVENTS_PER_CALENDAR / PAGE_SIZE);
const FETCH_TIMEOUT_MS = 10_000;

export class CalendarApiError extends Error {
  constructor(
    message: string,
    /** 'auth' means reconnect; 'rate' means back off; 'other' means report it. */
    readonly kind: 'auth' | 'rate' | 'other',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CalendarApiError';
  }
}

async function getJson<T>(url: string, accessToken: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new CalendarApiError('Google Calendar did not answer in time.', 'other');
  }

  if (res.ok) return (await res.json()) as T;

  const detail = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  // 401/403 here almost always means the grant does not carry the calendar
  // scopes — the connection was made before GiGi asked for them, or the user
  // unticked one. That is a "reconnect", not an error to retry.
  if (res.status === 401 || res.status === 403) {
    throw new CalendarApiError(
      'Google refused calendar access for this connection.',
      'auth',
      res.status,
    );
  }
  if (res.status === 429 || res.status >= 500) {
    throw new CalendarApiError('Google Calendar is rate-limiting or unavailable.', 'rate', res.status);
  }
  throw new CalendarApiError(
    detail.error?.message?.slice(0, 200) ?? `Google Calendar returned ${res.status}.`,
    'other',
    res.status,
  );
}

/** The real client. One access token, read-only, bounded. */
export function googleCalendarApi(accessToken: string): CalendarApi {
  return {
    async listCalendars() {
      const url = new URL(`${CALENDAR_API}/users/me/calendarList`);
      url.searchParams.set('maxResults', String(MAX_CALENDARS));
      // We can only read, so a calendar we could not read is noise in a picker.
      url.searchParams.set('minAccessRole', 'reader');
      url.searchParams.set('showHidden', 'false');
      const json = await getJson<{ items?: GoogleCalendarSummary[] }>(url.toString(), accessToken);
      return (json.items ?? []).slice(0, MAX_CALENDARS);
    },

    async listEvents(calendarId, window) {
      const events: GoogleEvent[] = [];
      let pageToken: string | undefined;

      for (let page = 0; page < MAX_PAGES; page++) {
        const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
        // `singleEvents` expands a recurring event into its occurrences. GiGi's
        // model stores an RRULE string but nothing in the digest or the week
        // strip expands one, so importing "every Tuesday" as a single row would
        // put it on the calendar once and then never again. Expanding at the
        // edge is the honest fix.
        url.searchParams.set('singleEvents', 'true');
        url.searchParams.set('orderBy', 'startTime');
        url.searchParams.set('timeMin', window.timeMin);
        url.searchParams.set('timeMax', window.timeMax);
        url.searchParams.set('maxResults', String(PAGE_SIZE));
        // Cancelled occurrences are handled by the reconcile — an event that is
        // gone from this response is removed locally — so there is nothing to
        // be gained by downloading them.
        url.searchParams.set('showDeleted', 'false');
        if (pageToken) url.searchParams.set('pageToken', pageToken);

        const json = await getJson<{ items?: GoogleEvent[]; nextPageToken?: string }>(
          url.toString(),
          accessToken,
        );
        events.push(...(json.items ?? []));
        pageToken = json.nextPageToken;
        if (!pageToken || events.length >= MAX_EVENTS_PER_CALENDAR) break;
      }

      return events.slice(0, MAX_EVENTS_PER_CALENDAR);
    },
  };
}
