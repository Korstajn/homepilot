// The things GiGi can go and look up while answering a spoken question.
//
// Until now the assistant answered from a fixed block of context — today's
// digest, upcoming renewals, the savings total — so "what's the weather
// tomorrow, and what should they wear?" got "I don't have access to the
// weather", which was true and useless. Both of those facts are already in this
// codebase: `getForecast` fetches the forecast and `clothingAdvice` turns it
// into a kit list, and the Gmail grant already reads subject lines. They simply
// were not reachable from the one place a household actually asks.
//
// So they are tools. Two rules govern everything in this file:
//
//   1. NOTHING IS FETCHED UNTIL THE QUESTION NEEDS IT. Prefetching a forecast
//      and an inbox scan into every "good morning" would mean GiGi reads mail
//      nobody asked it to read. A tool call is a read the question asked for.
//   2. THE GUARDS LIVE HERE, NOT IN THE PROMPT. The model picks a tool and some
//      arguments; it never sees a token, a household id or a URL. Whether an
//      inbox is connected, how far back a search may reach, whether this member
//      may see money — all decided in the executor, where an instruction to the
//      model cannot talk its way past them.
//
// The answers come back as plain JSON. Where a tool cannot answer it returns
// `available: false` with a reason in the household's own language of the
// problem ("no inbox connected"), never an empty result that GiGi would read as
// "nothing to report" — the same null-over-guessing rule extraction lives by.

import type { NextRequest } from 'next/server';
import type { ClaudeTool } from './anthropic';
import { probeMessages, buildGmailQuery, ATTENTION_TERMS, googleConfigured, GMAIL_COOKIE, openConnection } from './google';
import { gmailAccessToken } from './gmail-request';
import { triageInbox } from './inbox';
import { clothingAdvice, getForecast } from './weather';
import type { Household, Member } from './types';

/** How far a single spoken question may reach into a mailbox. */
const INBOX_MAX_DAYS = 30;
const INBOX_DEFAULT_DAYS = 7;
const INBOX_MAX_MESSAGES = 25;
/** A week of forecast is all Open-Meteo is asked for, so it is all GiGi offers. */
const WEATHER_MAX_DAYS = 7;

export const ASSISTANT_TOOLS: ClaudeTool[] = [
  {
    name: 'check_weather',
    description:
      "The household's local forecast and what the children should be dressed in. " +
      'Use it for any question about weather, temperature, rain, or what to wear or pack — ' +
      'today, tomorrow, or the days ahead. Returns the 8am school-run conditions and the ' +
      "4pm walk home separately from the day's high, because those are the hours that " +
      'decide a coat. Each day comes with a kit list and the reading behind it.',
    inputSchema: {
      type: 'object',
      properties: {
        days: {
          type: 'integer',
          minimum: 1,
          maximum: WEATHER_MAX_DAYS,
          description:
            'How many days from today to return. 1 for today, 2 to cover tomorrow, up to 7.',
        },
      },
      required: [],
    },
  },
  {
    name: 'check_inbox',
    description:
      "Look through the household's connected Gmail for anything that needs them. " +
      'Use it when asked about new mail, whether anything needs attention, or whether ' +
      'something specific has arrived. Reads SUBJECT LINES AND SENDERS ONLY — never the ' +
      'body of a message — and only mail whose subject looks like an obligation: a bill, ' +
      'a school letter, a booking, a deadline, a reply someone is waiting for. Personal ' +
      'correspondence is not searched. Each result says whether a rule flagged it and which ' +
      'words in the subject did so.',
    inputSchema: {
      type: 'object',
      properties: {
        days: {
          type: 'integer',
          minimum: 1,
          maximum: INBOX_MAX_DAYS,
          description: 'How many days back to look. Default 7.',
        },
        unread_only: {
          type: 'boolean',
          description:
            'True when they asked specifically about NEW or unread mail. False to include mail they have already opened.',
        },
      },
      required: [],
    },
  },
];

/** What a tool run reports back for the trust log and the UI. */
export interface ToolOutcome {
  /** Which outbound hop this was. Decides the trust-log action, actor and region. */
  kind: 'weather' | 'inbox';
  /** Plain-language line for the processing log, or null when nothing left the server. */
  logLine: string | null;
  /** Short label shown to the user under GiGi's answer. */
  label: string;
}

export interface AssistantToolContext {
  req: NextRequest;
  household: Household;
  member: Member;
  /**
   * Whether a real session resolved, as opposed to the demo household GiGi
   * falls back to for logged-out /app links. The forecast is harmless either
   * way — it is a postal district. A mailbox is not: the demo household's trust
   * log is shared, so an inbox search run from it would write one person's
   * subject-line count into a log other people can read.
   */
  signedIn: boolean;
  /** Today in the household's own timezone, 'YYYY-MM-DD'. */
  today: string;
}

/**
 * Today's date in a given IANA timezone.
 *
 * `new Date().toISOString().slice(0, 10)` is UTC, which is the wrong day for a
 * Stockholm household for two hours every summer evening — and a forecast keyed
 * to the wrong day is the kind of error that reads as entirely correct.
 */
export function todayIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// --- Weather ------------------------------------------------------------------

async function runWeather(
  ctx: AssistantToolContext,
  input: Record<string, unknown>,
): Promise<{ result: unknown; outcome: ToolOutcome }> {
  const days = clampInt(input.days, 1, WEATHER_MAX_DAYS, 3);
  const outlook = await getForecast(ctx.household);

  if (!outlook) {
    return {
      result: {
        available: false,
        reason: ctx.household.postcode
          ? 'The forecast service could not be reached just now.'
          : 'No postcode is set for this household, so there is no location to forecast. They can add one in Settings.',
      },
      outcome: { kind: 'weather', logLine: null, label: 'the forecast (unavailable)' },
    };
  }

  // Only from today forward. A cached outlook can still carry yesterday, and
  // "it rained" is not an answer to "what should they wear".
  const wanted = outlook.days
    .filter((d) => d.date >= ctx.today)
    .slice(0, days)
    .map((d) => {
      const advice = clothingAdvice(d);
      return {
        date: d.date,
        // Named relative to today as well as dated, so "tomorrow" never has to
        // be arithmetic the model does in its head.
        when: d.date === ctx.today ? 'today' : d.date === addDays(ctx.today, 1) ? 'tomorrow' : d.date,
        conditions: d.description,
        temp_min_c: Math.round(d.tempMinC),
        temp_max_c: Math.round(d.tempMaxC),
        rain_chance_pct: d.precipitationChance,
        wind_kph: Math.round(d.windKph),
        uv_index: d.uvIndex,
        at_8am: d.schoolRun
          ? {
              temp_c: Math.round(d.schoolRun.tempC),
              feels_like_c: Math.round(d.schoolRun.feelsLikeC),
              rain_chance_pct: d.schoolRun.precipitationChance,
            }
          : null,
        at_4pm: d.homeTime
          ? {
              temp_c: Math.round(d.homeTime.tempC),
              feels_like_c: Math.round(d.homeTime.feelsLikeC),
              rain_chance_pct: d.homeTime.precipitationChance,
            }
          : null,
        wear: advice.items,
        advice: advice.detail,
      };
    });

  return {
    result: {
      available: true,
      area: outlook.area,
      today: ctx.today,
      days: wanted,
    },
    outcome: {
      kind: 'weather',
      logLine: `Looked up the forecast for ${outlook.area} — the postal district only, never your full postcode`,
      label: 'the forecast',
    },
  };
}

// --- Inbox --------------------------------------------------------------------

async function runInbox(
  ctx: AssistantToolContext,
  input: Record<string, unknown>,
): Promise<{ result: unknown; outcome: ToolOutcome }> {
  const days = clampInt(input.days, 1, INBOX_MAX_DAYS, INBOX_DEFAULT_DAYS);
  const unreadOnly = input.unread_only === true;

  if (!ctx.signedIn) {
    return {
      result: {
        available: false,
        reason:
          'They are looking at the demo household, not a signed-in account, so there is no inbox of theirs to look at.',
      },
      outcome: { kind: 'inbox', logLine: null, label: 'the inbox (not signed in)' },
    };
  }

  if (!googleConfigured()) {
    return {
      result: {
        available: false,
        reason: 'Gmail is not set up on this deployment, so there is no inbox to look at.',
      },
      outcome: { kind: 'inbox', logLine: null, label: 'the inbox (not available)' },
    };
  }

  // Checked before the token exchange so "you have not connected an inbox" and
  // "your connection expired" stay two different answers. Google expires
  // refresh tokens for restricted scopes weekly in Testing mode, and a
  // household told to "connect Gmail" when they already did will go looking for
  // a setting that is already on.
  if (!openConnection(ctx.req.cookies.get(GMAIL_COOKIE)?.value)) {
    return {
      result: {
        available: false,
        reason:
          'No inbox is connected. They can connect Gmail in Settings — it is read-only, and GiGi only ever reads subject lines unless they press Import.',
      },
      outcome: { kind: 'inbox', logLine: null, label: 'the inbox (not connected)' },
    };
  }

  const token = await gmailAccessToken(ctx.req);
  if (!token.ok) {
    return {
      result: {
        available: false,
        reason:
          'Google has expired the connection to this inbox. They need to reconnect it in Settings — Google times these out weekly during the beta.',
      },
      outcome: { kind: 'inbox', logLine: null, label: 'the inbox (connection expired)' },
    };
  }

  const query = buildGmailQuery({ terms: ATTENTION_TERMS, days, unreadOnly });
  const probe = await probeMessages(token.accessToken, query, INBOX_MAX_MESSAGES);
  if ('error' in probe) {
    return {
      result: { available: false, reason: 'Gmail refused the search just now.' },
      outcome: { kind: 'inbox', logLine: null, label: 'the inbox (Gmail refused)' },
    };
  }

  const summary = triageInbox(probe.messages);

  return {
    result: {
      available: true,
      searched_days: days,
      unread_only: unreadOnly,
      scanned: summary.scanned,
      needs_attention: summary.needsAttention,
      by_category: summary.byCategory,
      // Trimmed for the model's benefit only — the triage already sorted what
      // needs attention to the front, so a truncation cannot hide the urgent half.
      messages: summary.messages.slice(0, 12).map((m) => ({
        from: m.from,
        subject: m.subject,
        date: m.date,
        days_ago: m.ageDays,
        category: m.category,
        needs_attention: m.needsAttention,
        flagged_because: m.matched,
      })),
      note:
        'Subject lines and senders only — no message was opened. GiGi cannot say what is inside any of these.',
    },
    outcome: {
      kind: 'inbox',
      logLine: `GiGi looked through the last ${days} days of your inbox${
        unreadOnly ? ' (unread only)' : ''
      } and read ${summary.scanned} subject line(s) — no message content`,
      label: `${summary.scanned} subject line${summary.scanned === 1 ? '' : 's'}`,
    },
  };
}

// --- Dispatch -----------------------------------------------------------------

export async function runAssistantTool(
  ctx: AssistantToolContext,
  call: { name: string; input: Record<string, unknown> },
): Promise<{ result: unknown; outcome: ToolOutcome }> {
  switch (call.name) {
    case 'check_weather':
      return runWeather(ctx, call.input);
    case 'check_inbox':
      return runInbox(ctx, call.input);
    default:
      return {
        result: { available: false, reason: `No such tool: ${call.name}` },
        outcome: { kind: 'weather', logLine: null, label: call.name },
      };
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
