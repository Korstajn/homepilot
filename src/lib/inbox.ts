// Inbox triage — "is there anything in my mail that needs me?"
//
// GiGi can now answer that question, and the answer is built the same way every
// other GiGi reading is: the deterministic part decides, the model only speaks.
//
// What arrives here is a list of SUBJECT LINES and SENDERS — never a message
// body. `probeMessages` asks Gmail for `format=metadata` with a From/Subject/
// Date allow-list, so the content was not fetched and then discarded; it was
// never requested. That is what makes "GiGi read 12 subject lines" an accurate
// sentence rather than a reassuring one.
//
// The scoring below is a set of keyword rules, and it is deliberately dull.
// Handing 30 raw subject lines to a model and asking "which of these matter"
// produces a confident answer with no evidence behind it and no way for a
// household to disagree with a particular call. Rules produce a REASON per
// message ("the subject says 'payment due'"), which the user can read and
// overrule — the same standard the extraction cascade holds itself to.

import type { ProbeMessage } from './google';

export type InboxCategory = 'bill' | 'school' | 'travel' | 'delivery' | 'admin' | 'other';

export interface TriagedMessage {
  /** Who it is from, reduced to a display name where the header carried one. */
  from: string;
  subject: string;
  /** ISO date, or the raw header when it would not parse. */
  date: string;
  /** Days since it arrived, or null when the date header was unreadable. */
  ageDays: number | null;
  category: InboxCategory;
  /** True when a rule below fired — something with a deadline, a payment or a reply attached. */
  needsAttention: boolean;
  /** The words in the subject that made it so. Empty when nothing fired. */
  matched: string[];
}

export interface InboxSummary {
  scanned: number;
  needsAttention: number;
  messages: TriagedMessage[];
  /** How many of each category, for a one-line "three bills, one school letter". */
  byCategory: Record<InboxCategory, number>;
}

/**
 * The rules, in the order they are tried. First match wins the category, and
 * every match contributes to `matched` so the reason survives to the user.
 *
 * `urgent: true` marks a phrase that means someone has to DO something, as
 * opposed to a phrase that merely names a topic. "Your October invoice" is a
 * bill; "your October invoice is overdue" is a bill that needs attention. The
 * difference is the whole point of the screen.
 */
interface Rule {
  category: InboxCategory;
  urgent: boolean;
  patterns: RegExp[];
}

const RULES: Rule[] = [
  {
    category: 'bill',
    urgent: true,
    patterns: [
      /\boverdue\b/i,
      /\bfinal notice\b/i,
      /\bpayment (?:is )?(?:due|failed|declined)\b/i,
      /\bunpaid\b/i,
      /\bdue (?:on|by|date)\b/i,
      /\bprice (?:increase|change|rise)\b/i,
      /\brenew(?:s|al|ing)?\b/i,
      /\bförfaller\b/i,
      /\bobetald\b/i,
      /\bförsenad\b/i,
      /\bpåminnelse\b/i,
    ],
  },
  {
    category: 'bill',
    urgent: false,
    patterns: [/\binvoice\b/i, /\bbill\b/i, /\breceipt\b/i, /\bstatement\b/i, /\bfaktura\b/i, /\bkvitto\b/i],
  },
  {
    category: 'school',
    urgent: true,
    patterns: [
      /\bpermission slip\b/i,
      /\bconsent form\b/i,
      /\breply (?:by|slip)\b/i,
      /\bsign(?:ed)? (?:and )?return\b/i,
      /\bparents(?:'|’)? evening\b/i,
      /\bschool trip\b/i,
      /\bskolresa\b/i,
      /\bföräldramöte\b/i,
      /\butvecklingssamtal\b/i,
      /\bsvara senast\b/i,
    ],
  },
  {
    category: 'school',
    urgent: false,
    patterns: [/\bschool\b/i, /\bnursery\b/i, /\bpreschool\b/i, /\bhomework\b/i, /\bPE kit\b/i, /\bskola\b/i, /\bförskola\b/i, /\bfritids\b/i],
  },
  {
    category: 'travel',
    urgent: true,
    patterns: [
      /\bpassport\b/i,
      /\bvisa (?:application|required|approved)\b/i,
      /\bcheck[- ]?in (?:now|opens|open)\b/i,
      /\bflight (?:change|cancelled|delayed)\b/i,
      /\bbekräfta (?:din )?bokning\b/i,
    ],
  },
  {
    category: 'travel',
    urgent: false,
    patterns: [/\bbooking\b/i, /\bitinerary\b/i, /\bflight\b/i, /\bhotel\b/i, /\bbokning\b/i, /\bresa\b/i],
  },
  {
    category: 'delivery',
    urgent: true,
    patterns: [/\bdelivery (?:failed|attempted|missed)\b/i, /\baction (?:required|needed)\b/i, /\breschedule\b/i],
  },
  {
    category: 'delivery',
    urgent: false,
    patterns: [/\byour order\b/i, /\bdispatched\b/i, /\bshipped\b/i, /\bout for delivery\b/i, /\bleverans\b/i],
  },
  {
    category: 'admin',
    urgent: true,
    patterns: [
      /\baction (?:required|needed)\b/i,
      /\bdeadline\b/i,
      /\bexpir(?:es|ing|ed)\b/i,
      /\bplease (?:reply|respond|confirm)\b/i,
      /\brsvp\b/i,
      /\bappointment\b/i,
      /\bconfirm your\b/i,
      /\bsista dag\b/i,
      /\båtgärd krävs\b/i,
      /\btidsbokning\b/i,
    ],
  },
  {
    category: 'admin',
    urgent: false,
    patterns: [/\breminder\b/i, /\bconfirmation\b/i, /\bnotice\b/i, /\bupdate your\b/i],
  },
];

/**
 * The display name out of a From header.
 *
 * `"Thames Water" <billing@thameswater.co.uk>` is far more useful to read back
 * than the address, and an address is the more identifying half of the pair —
 * so when the header offers a name, that is what GiGi carries forward.
 */
export function senderName(from: string | null): string {
  const raw = (from ?? '').trim();
  if (!raw) return 'unknown sender';
  const named = /^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (named) return named[1].trim() || named[2].trim();
  return raw.replace(/[<>]/g, '').trim();
}

function ageInDays(header: string | null, now: Date): number | null {
  if (!header) return null;
  const t = Date.parse(header);
  if (Number.isNaN(t)) return null;
  const days = Math.floor((now.getTime() - t) / 86_400_000);
  return days < 0 ? 0 : days;
}

function isoDate(header: string | null): string {
  if (!header) return '';
  const t = Date.parse(header);
  return Number.isNaN(t) ? header : new Date(t).toISOString().slice(0, 10);
}

/** Classify one subject line. Exported so the rules can be unit-tested directly. */
export function triageSubject(subject: string): {
  category: InboxCategory;
  needsAttention: boolean;
  matched: string[];
} {
  const text = subject || '';
  let category: InboxCategory = 'other';
  let needsAttention = false;
  const matched: string[] = [];

  for (const rule of RULES) {
    for (const re of rule.patterns) {
      const hit = re.exec(text);
      if (!hit) continue;
      // The first rule to fire names the category; later rules can still raise
      // urgency (a "school trip" subject that also says "deadline") but must
      // not relabel a bill as admin because both words appear.
      if (category === 'other') category = rule.category;
      if (rule.urgent) needsAttention = true;
      if (!matched.includes(hit[0])) matched.push(hit[0]);
      break; // one match per rule is enough evidence
    }
  }

  return { category, needsAttention, matched: matched.slice(0, 4) };
}

/**
 * Turn a header-only Gmail probe into something GiGi can speak from.
 *
 * `now` is a parameter rather than a call to `Date.now()` inside so the output
 * is a pure function of its input — the same property `buildDigest` has, and
 * for the same reason: an "arrived 2 days ago" that depends on the wall clock
 * cannot be tested and cannot be reproduced from a trust-log entry.
 */
export function triageInbox(messages: ProbeMessage[], now: Date = new Date()): InboxSummary {
  const byCategory: Record<InboxCategory, number> = {
    bill: 0,
    school: 0,
    travel: 0,
    delivery: 0,
    admin: 0,
    other: 0,
  };

  const triaged: TriagedMessage[] = messages.map((m) => {
    const subject = (m.subject ?? '').trim() || '(no subject)';
    const { category, needsAttention, matched } = triageSubject(subject);
    byCategory[category] += 1;
    return {
      from: senderName(m.from),
      subject,
      date: isoDate(m.date),
      ageDays: ageInDays(m.date, now),
      category,
      needsAttention,
      matched,
    };
  });

  // Whatever needs attention goes first, then newest first. A model reading a
  // truncated list must see the important half of it.
  triaged.sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
    return (a.ageDays ?? 999) - (b.ageDays ?? 999);
  });

  return {
    scanned: triaged.length,
    needsAttention: triaged.filter((m) => m.needsAttention).length,
    messages: triaged,
    byCategory,
  };
}
