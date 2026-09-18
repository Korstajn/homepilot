/**
 * From a school email to things in the family calendar — with a dry run.
 *
 * The dry run is the point, not a debugging aid. Everything GiGi reads out of a
 * mailbox lands unconfirmed for bills, and school mail deserves more care, not
 * less: it concerns children, it is the least structured mail a household gets,
 * and a wrong date here means a child turns up on the wrong day. So this module
 * PLANS first — what it read, which child it matched, what it would create, and
 * the exact sentence behind every value — and only writes when asked to.
 */

import type { CalendarEvent, Child, Household } from './types';
import { extractSchool, looksLikeSchool, referenceDate, type ExtractedSchool, type SchoolEmail, type SchoolItem, type SchoolItemType } from './school';
import { formatMoney } from './money';
import { addCalendarEvent, listManualEvents, logProcessing, regenerateDigest, track } from './store';

export interface PlannedEvent {
  /** Stable within one scan, so the UI can let the user deselect one. */
  key: string;
  itemType: SchoolItemType;
  event: Omit<CalendarEvent, 'id' | 'createdAt' | 'source'>;
  /** Why GiGi thinks this belongs in the calendar, in plain words. */
  reason: string;
  /** Already created by an earlier scan of the same message. */
  duplicate: boolean;
}

export interface SchoolScan {
  sourceRef: string;
  from: string | null;
  subject: string | null;
  /**
   * The date every relative expression in this email was measured from. Shown
   * to the user, because "Friday" means nothing without it and a wrong
   * reference frame is the one kind of date error that looks entirely correct.
   */
  receivedAt: string;
  engine: string;
  extracted: ExtractedSchool;
  planned: PlannedEvent[];
  /** Things GiGi read but could not place on a day — shown, never silently dropped. */
  unplanned: { type: SchoolItemType; title: string; why: string }[];
  /** Set when nothing was planned, saying why rather than going quiet. */
  skipped: string | null;
}

const ALARM_FOR: Record<SchoolItemType, number> = {
  // A form or a kit is useless as a reminder on the morning it is due — the
  // packing and the signing happen the night before.
  form: 24 * 60,
  payment: 24 * 60,
  kit: 14 * 60,
  event: 24 * 60,
  absence: 60,
  info: 24 * 60,
};

function detailFor(item: SchoolItem, household: Household): string {
  const bits: string[] = [];
  if (item.amount !== null) {
    bits.push(formatMoney(item.amount, item.currency ?? household.currency));
  }
  if (item.dueDate && item.eventDate) bits.push(`due ${item.dueDate}, happens ${item.eventDate}`);
  return bits.length ? `${bits.join(' · ')}. ${item.evidence.quote}` : item.evidence.quote;
}

function planItem(
  household: Household,
  child: Child | null,
  item: SchoolItem,
  sourceRef: string,
  index: number,
  anchor: string | null,
): PlannedEvent | null {
  // An event goes in the calendar on the day it happens; a task goes in on the
  // day it is due.
  const isEvent = Boolean(item.eventDate);
  const own = item.eventDate ?? item.dueDate;

  // "Children should bring a packed lunch on the day" has no date of its own,
  // but the letter it is in does. Inheriting the letter's day is an inference,
  // so it is only done for the two kinds where it is unambiguous, and the reason
  // SAYS it was inherited — the user approves each line seeing exactly that.
  const inherited = !own && anchor && (item.type === 'kit' || item.type === 'payment') ? anchor : null;
  const day = own ?? inherited;
  if (!day) return null;

  const timed = isEvent && Boolean(item.eventTime);
  const start = timed ? `${day}T${item.eventTime}:00` : day;

  return {
    key: `${sourceRef}#${index}`,
    itemType: item.type,
    reason: inherited
      ? `No date of its own — taken from the ${day} date this letter is about`
      : isEvent
        ? `Happens on ${day}${item.eventTime ? ` at ${item.eventTime}` : ''}`
        : `Has to be done by ${day}`,
    duplicate: false,
    event: {
      householdId: household.id,
      summary: item.title,
      description: detailFor(item, household),
      category: 'school',
      start,
      allDay: !timed,
      tzid: timed ? household.timezone || 'Europe/London' : undefined,
      alarmMinutesBefore: ALARM_FOR[item.type],
      relatedChildId: child?.id,
      sourceRef: `${sourceRef}#${index}`,
      evidence: item.evidence,
    },
  };
}

/**
 * Read one school email and work out what it would create. Writes nothing.
 */
export async function planSchoolEmail(
  household: Household,
  children: Child[],
  email: SchoolEmail,
  sourceRef: string,
  now: Date = new Date(),
): Promise<SchoolScan> {
  const base = {
    sourceRef,
    from: email.from ?? null,
    subject: email.subject ?? null,
    receivedAt: referenceDate(email, now).toISOString().slice(0, 10),
  };

  if (!looksLikeSchool(email)) {
    return {
      ...base,
      engine: 'skipped',
      extracted: { kind: 'school', school: null, childId: null, childName: null, items: [], ignoredForPrivacy: 0, confidence: 0 },
      planned: [],
      unplanned: [],
      skipped: 'This does not look like school mail, so GiGi did not read it.',
    };
  }

  const { result, engine } = await extractSchool(email, children, now);
  const child = result.childId ? children.find((c) => c.id === result.childId) ?? null : null;

  const existing = new Set(
    (await listManualEvents(household.id))
      .map((e) => e.sourceRef)
      .filter((r): r is string => Boolean(r)),
  );

  // The day the letter is about: the first thing in it that actually happens.
  const anchor = result.items.find((i) => i.eventDate)?.eventDate ?? null;

  const planned: PlannedEvent[] = [];
  const unplanned: SchoolScan['unplanned'] = [];
  result.items.forEach((item, i) => {
    const plan = planItem(household, child, item, sourceRef, i, anchor);
    if (plan) {
      planned.push({ ...plan, duplicate: existing.has(plan.event.sourceRef!) });
    } else {
      unplanned.push({
        type: item.type,
        title: item.title,
        why:
          item.amount !== null
            ? 'GiGi found this but the email never says when — nothing was invented.'
            : 'No date anywhere for this, so there is nowhere to put it.',
      });
    }
  });

  return {
    ...base,
    engine,
    extracted: result,
    planned,
    unplanned,
    skipped:
      planned.length === 0
        ? result.items.length === 0
          ? 'Nothing in here asks you to do anything on a date.'
          : 'Found something, but no date to put it on — left it alone rather than guessing.'
        : null,
  };
}

/**
 * Create the events the user approved. Approve-to-execute, applied to
 * extraction itself: GiGi proposes what it read, the household decides.
 */
export async function commitSchoolPlan(
  householdId: string,
  scans: SchoolScan[],
  approvedKeys: string[] | null,
): Promise<{ created: CalendarEvent[]; skipped: number }> {
  const wanted = approvedKeys === null ? null : new Set(approvedKeys);
  const created: CalendarEvent[] = [];
  let skipped = 0;

  const existing = new Set(
    (await listManualEvents(householdId))
      .map((e) => e.sourceRef)
      .filter((r): r is string => Boolean(r)),
  );

  for (const scan of scans) {
    for (const plan of scan.planned) {
      if (wanted && !wanted.has(plan.key)) { skipped++; continue; }
      if (existing.has(plan.event.sourceRef!)) { skipped++; continue; }
      created.push(await addCalendarEvent(plan.event));
      existing.add(plan.event.sourceRef!);
    }
  }

  if (created.length) {
    await logProcessing(
      householdId, 'stored', 'school', 'gigi_server',
      `${created.length} school date${created.length === 1 ? '' : 's'} you approved ${created.length === 1 ? 'was' : 'were'} added to your calendar`,
      'Put what the school asked for where you will see it',
      'Consent', 'EU (London)',
    );
    // The digest should know about a form due tomorrow now, not at 02:00.
    await regenerateDigest(householdId);
    await track('school_items_created', householdId, {
      created: created.length,
      types: created.map((e) => e.category).length,
    });
  }

  return { created, skipped };
}

/**
 * The last scan per household.
 *
 * Approving is a second request, and the events it creates must be the ones the
 * SERVER read — not a payload the browser hands back, which would let a client
 * write arbitrary events into a calendar. So the plan is kept here between the
 * two calls. Module-level, exactly like the store itself: this is the in-memory
 * build, and both go when the process does.
 */
const lastScan = new Map<string, SchoolScan[]>();

export function rememberScan(householdId: string, scans: SchoolScan[]): void {
  lastScan.set(householdId, scans);
}

export function recallScan(householdId: string): SchoolScan[] {
  return lastScan.get(householdId) ?? [];
}
