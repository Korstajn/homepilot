// Digest engine — the deterministic stand-in for the "Prompt 2" (digest) call.
//
// In production this is where the Anthropic digest prompt runs (per household,
// per night, EU-region). Here we rank signals deterministically so the test
// build works with no API key while keeping the exact output contract:
//   - <=4 items shown, action-first, urgency-banded
//   - overflow surface so nothing disappears silently (reconciles max-4 with
//     carry-forward — see docs/DECISIONS.md, "product-logic contradictions")
//   - minimum mode ("all calm today, next: X in N days") so a quiet day is
//     still a signal and the 07:00 habit has a cue
//   - degraded states surfaced (dead connection / failed extraction)

import {
  Bill,
  CalendarEvent,
  Child,
  Digest,
  DigestItem,
  DigestItemCategory,
  EXECUTABLE_BILL_TYPES,
  Household,
  ActionLog,
  UrgencyBand,
} from './types';
import { adviceFor, type WeatherOutlook } from './weather';

const MAX_ITEMS = 4;

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function daysUntil(isoDateStr: string): number {
  // Take the date part only. Bills carry a date, but a calendar event may carry
  // a full timestamp — appending 'T00:00:00' to one produced an Invalid Date,
  // and NaN silently fails every comparison, so timed events could never reach
  // the digest at all.
  const target = new Date(isoDateStr.slice(0, 10) + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86_400_000);
}

/** An ISO date N days from today, in local time — the key the forecast is keyed by. */
function addDays(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0); // midday, so a DST shift cannot roll the date over
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function bandFor(days: number): UrgencyBand {
  if (days <= 3) return 'today';
  if (days <= 14) return 'soon';
  return 'upcoming';
}

// Lower = more urgent. Drives both ranking and which items win the top 4.
function priorityScore(item: DigestItem): number {
  const bandWeight: Record<UrgencyBand, number> = { today: 0, soon: 100, upcoming: 200 };
  let score = bandWeight[item.urgency];
  // Carried-forward items get a nudge up so a re-surfaced item can beat a fresh
  // one of the same band — the explicit priority rule the plan was missing.
  score -= Math.min(item.carryForwardCount, 3) * 10;
  // Executable savings slightly outrank passive info within a band.
  if (item.executable) score -= 5;
  return score;
}

// Estimated better-deal price for the beta's assisted deal-search. Deterministic
// here; a real market/affiliate lookup in production.
function estimateSaving(bill: Bill): { newPrice: number; savingAnnual: number } | null {
  if (bill.amount === null) return null;
  // Typical assisted-switch saving band, capped so it never looks fake.
  const monthlyNew = Math.max(bill.amount * 0.78, bill.amount - 20);
  const savingAnnual = Math.round((bill.amount - monthlyNew) * 12);
  if (savingAnnual < 24) return null;
  return { newPrice: Math.round(monthlyNew), savingAnnual };
}

/** The calendar categories that become digest items, and what they surface as. */
const EVENT_CATEGORY: Record<CalendarEvent['category'], DigestItemCategory> = {
  school: 'school',
  travel: 'travel',
  bill: 'bill',
  appointment: 'home',
  other: 'home',
};

function startHour(event: CalendarEvent): number | null {
  if (event.allDay || !event.start.includes('T')) return null;
  const d = new Date(event.start);
  return Number.isNaN(d.getTime()) ? null : d.getHours();
}

function monthsBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO.slice(0, 10) + 'T00:00:00Z');
  const b = new Date(toISO.slice(0, 10) + 'T00:00:00Z');
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

/**
 * Turn the household calendar into digest signals.
 *
 * This is the connection the build was missing. `buildDigest` took bills and
 * actions only, so the `school` and `travel` categories in the contract could
 * never be produced by anything — the whole of vertical 3 (pre-event nudges,
 * cover for an evening out, trip preparation) had no code path, and the
 * calendar was a screen rather than a source of signals.
 *
 * Each rule is a LEAD TIME, not a reminder: the point is to surface the thing
 * while there is still time to act on it.
 */
function calendarItems(
  household: Household,
  events: CalendarEvent[],
  children: Child[],
  now: string,
): DigestItem[] {
  const items: DigestItem[] = [];
  const base = { status: 'open' as const, firstSurfacedAt: now, carryForwardCount: 0 };
  const hasChildren = household.children !== 'none' || children.length > 0;
  const passportHandled = new Set<string>();

  for (const ev of events) {
    const days = daysUntil(ev.start);
    if (days < 0) continue;

    // 1) A trip puts every child's passport on the clock. Six months of validity
    //    beyond the trip is the common entry requirement, so that is the window
    //    worth warning about — early enough that renewing is still possible.
    if (ev.category === 'travel' && days <= 90) {
      for (const child of children) {
        if (!child.passportExpiry) continue;
        if (monthsBetween(ev.start, child.passportExpiry) < 6) {
          passportHandled.add(child.id);
          items.push({
            ...base,
            id: id('item'),
            category: 'travel',
            urgency: bandFor(days),
            line: clampWords(`Renew ${child.name}'s passport before the trip`),
            detail: `${child.name}'s passport expires ${child.passportExpiry}, which is inside the six months most countries require beyond your return. The trip is in ${days} days.`,
            executable: false,
          });
        }
      }
    }

    // 2) An evening out with children at home needs cover arranged, and that is
    //    a week's notice job, not a same-day one.
    const hour = startHour(ev);
    if (hasChildren && hour !== null && hour >= 17 && days <= 7 && ev.category !== 'school') {
      items.push({
        ...base,
        id: id('item'),
        category: 'home',
        urgency: bandFor(days),
        line: clampWords(`Arrange cover for ${ev.summary}`),
        detail: `${ev.summary} starts at ${ev.start.slice(11, 16)} in ${days} day${days === 1 ? '' : 's'}. Nobody is down as being home.`,
        executable: false,
      });
      continue;
    }

    // 3) Everything else surfaces the evening before it matters, which is when
    //    a form can still be signed or a kit bag still packed.
    if (days <= 2) {
      items.push({
        ...base,
        id: id('item'),
        category: EVENT_CATEGORY[ev.category],
        urgency: days <= 1 ? 'today' : 'soon',
        line: clampWords(ev.summary),
        detail: ev.description ?? (days === 0 ? 'Today.' : `In ${days} day${days === 1 ? '' : 's'}.`),
        executable: false,
      });
    }
  }

  // 4) A passport running out is worth saying even with no trip booked, because
  //    the renewal takes longer than most people expect.
  for (const child of children) {
    if (!child.passportExpiry || passportHandled.has(child.id)) continue;
    const days = daysUntil(child.passportExpiry);
    if (days < 0 || days > 120) continue;
    items.push({
      ...base,
      id: id('item'),
      category: 'travel',
      urgency: bandFor(days),
      line: clampWords(`Renew ${child.name}'s passport`),
      detail: `It expires in ${days} days. Renewals routinely take six weeks.`,
      executable: false,
    });
  }

  return items;
}

/**
 * The weather, turned into the one thing a parent has to do about it.
 *
 * A forecast is not a signal — "14°C and showers" is information, and the
 * digest contract has no room for information. What belongs in a four-item
 * morning brief is the ACTION: the coat that has to go on, the wellies that
 * have to be found. `clothingAdvice` does that reading; this decides whether it
 * is worth one of the four slots.
 *
 * The rules that keep it from becoming noise:
 *   • only when the household actually has children — this is a kit-bag signal,
 *     not a weather widget;
 *   • only today and tomorrow, because that is the horizon where "put a coat
 *     out" is an action rather than a note;
 *   • only when the day demands something (`severity: 'act'`), so a mild dry
 *     week says nothing at all;
 *   • at most ONE item, ever. Two weather lines in a four-item digest is the
 *     digest failing.
 */
function weatherItems(
  household: Household,
  children: Child[],
  events: CalendarEvent[],
  weather: WeatherOutlook | null,
  now: string,
): DigestItem[] {
  if (!weather) return [];
  const hasChildren = household.children !== 'none' || children.length > 0;
  if (!hasChildren) return [];

  const base = { status: 'open' as const, firstSurfacedAt: now, carryForwardCount: 0 };

  for (const offset of [0, 1]) {
    const date = addDays(offset);
    const advice = adviceFor(weather, date);
    if (!advice || advice.severity !== 'act') continue;

    // A school trip or sports day on a wet morning is a different instruction
    // to an ordinary Tuesday, and it is the one people are caught out by — so
    // when the calendar has something that day, the line says so.
    const sameDay = events.filter(
      (e) => e.start.slice(0, 10) === date && (e.category === 'school' || e.category === 'travel'),
    );
    const detail = sameDay.length > 0
      ? `${advice.detail} ${sameDay[0].summary} is ${offset === 0 ? 'today' : 'tomorrow'}.`
      : advice.detail;

    return [
      {
        ...base,
        id: id('item'),
        category: 'home',
        urgency: offset === 0 ? 'today' : 'soon',
        line: clampWords(offset === 0 ? advice.headline : `Tomorrow: ${advice.headline.toLowerCase()}`),
        detail,
        executable: false,
      },
    ];
  }

  return [];
}

export function buildDigest(
  household: Household,
  bills: Bill[],
  actions: ActionLog[],
  events: CalendarEvent[] = [],
  children: Child[] = [],
  weather: WeatherOutlook | null = null,
): Digest {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const items: DigestItem[] = [];

  const resolvedItemKeys = new Set(
    actions.filter((a) => a.action !== 'approve').map((a) => a.itemId),
  );

  // 1) Degraded-state banner (P0 gap the plan missed): if the connection is
  // dead or a bill failed extraction, say so plainly instead of going silent.
  if (household.connectionStatus === 'degraded') {
    items.push({
      id: id('item'),
      category: 'system',
      urgency: 'today',
      line: 'Reconnect your inbox — GiGi paused monitoring',
      detail:
        'Your forwarding connection stopped delivering mail. Bills may be missed until it is reconnected.',
      executable: false,
      status: 'open',
      firstSurfacedAt: now,
      carryForwardCount: 0,
    });
  }

  const unconfirmed = bills.filter((b) => b.source === 'extracted' && !b.confirmed);
  if (unconfirmed.length > 0) {
    items.push({
      id: id('item'),
      category: 'system',
      urgency: 'soon',
      line: `Confirm ${unconfirmed.length} bill${unconfirmed.length > 1 ? 's' : ''} GiGi found`,
      detail:
        'One or more values could not be read confidently. Confirm or correct them so monitoring is accurate.',
      executable: false,
      status: 'open',
      firstSurfacedAt: now,
      carryForwardCount: 0,
    });
  }

  // 2) Renewal + saving proposals. Agent "wakes" 30 days pre-renewal.
  for (const bill of bills) {
    if (!bill.confirmed || bill.renewalDate === null) continue;
    const days = daysUntil(bill.renewalDate);
    if (days < 0 || days > 30) continue;

    const canExecute = EXECUTABLE_BILL_TYPES.includes(bill.type);
    const deal = estimateSaving(bill);

    if (deal) {
      // Insurance: surface the finding but NO fee, NO in-app execution
      // (regulated activity — docs/DECISIONS.md §3).
      const line = canExecute
        ? `Switch ${bill.provider} — save ${deal.savingAnnual} ${bill.currency}/yr`
        : `Cheaper ${bill.type} found — review ${bill.provider}`;
      items.push({
        id: id('item'),
        category: 'bill',
        urgency: bandFor(days),
        line: clampWords(line),
        detail: canExecute
          ? `Renews in ${days} days. GiGi can switch you on approval.`
          : `Renews in ${days} days. We found a cheaper option — here is the link (no switch on your behalf).`,
        executable: canExecute,
        savingAnnual: deal.savingAnnual,
        currentPrice: bill.amount ?? undefined,
        newPrice: deal.newPrice,
        relatedBillId: bill.id,
        status: 'open',
        firstSurfacedAt: now,
        carryForwardCount: 0,
      });
    } else if (bill.priceIncreaseFlag) {
      items.push({
        id: id('item'),
        category: 'bill',
        urgency: bandFor(days),
        line: clampWords(`${bill.provider} price rising at renewal`),
        detail: `Renews in ${days} days with a price increase. No cheaper deal found yet.`,
        executable: false,
        relatedBillId: bill.id,
        status: 'open',
        firstSurfacedAt: now,
        carryForwardCount: 0,
      });
    }
  }

  // 2b) The calendar — school, travel and home logistics.
  items.push(...calendarItems(household, events, children, now));

  // 2c) The weather, but only as an action on a kit bag. Null when the forecast
  // could not be fetched, which is silence rather than a stale guess.
  items.push(...weatherItems(household, children, events, weather, now));

  // Drop anything the user already resolved.
  const open = items.filter((i) => !resolvedItemKeys.has(i.id));
  open.sort((a, b) => priorityScore(a) - priorityScore(b));

  const top = open.slice(0, MAX_ITEMS);
  const overflow = open.slice(MAX_ITEMS);

  // 3) Minimum mode — a quiet day is still a cue for the 07:00 habit.
  let quietLine: string | undefined;
  if (top.length === 0) {
    const next = nextThing(bills, events);
    quietLine = next
      ? `All calm today. Next: ${next.label} in ${next.days} days.`
      : 'All calm today. Nothing needs you right now.';
  }

  return {
    id: id('digest'),
    householdId: household.id,
    date: today,
    items: top,
    overflow,
    quietLine,
    // "delivered" mirrors the parallel metric: a digest with content (or a quiet
    // line) is delivered; open rate is measured against this, not against silence.
    delivered: true,
    createdAt: now,
  };
}

function nextThing(bills: Bill[], events: CalendarEvent[] = []): { label: string; days: number } | null {
  const upcoming = [
    ...bills
      .filter((b) => b.confirmed && b.renewalDate)
      .map((b) => ({ label: `${b.provider} renewal`, days: daysUntil(b.renewalDate as string) })),
    // A quiet day should point at the next real thing in the household's life,
    // not only at the next invoice.
    ...events.map((e) => ({ label: e.summary, days: daysUntil(e.start) })),
  ]
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days);
  return upcoming[0] ?? null;
}

// Enforce the <=10-word action-line rule from the MVP doc.
export function clampWords(line: string, max = 10): string {
  const words = line.split(/\s+/);
  if (words.length <= max) return line;
  return words.slice(0, max).join(' ');
}
