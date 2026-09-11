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
  Digest,
  DigestItem,
  EXECUTABLE_BILL_TYPES,
  Household,
  ActionLog,
  UrgencyBand,
} from './types';

const MAX_ITEMS = 4;

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function daysUntil(isoDateStr: string): number {
  const target = new Date(isoDateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86_400_000);
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

export function buildDigest(
  household: Household,
  bills: Bill[],
  actions: ActionLog[],
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

  // Drop anything the user already resolved.
  const open = items.filter((i) => !resolvedItemKeys.has(i.id));
  open.sort((a, b) => priorityScore(a) - priorityScore(b));

  const top = open.slice(0, MAX_ITEMS);
  const overflow = open.slice(MAX_ITEMS);

  // 3) Minimum mode — a quiet day is still a cue for the 07:00 habit.
  let quietLine: string | undefined;
  if (top.length === 0) {
    const next = nextThing(bills);
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

function nextThing(bills: Bill[]): { label: string; days: number } | null {
  const upcoming = bills
    .filter((b) => b.confirmed && b.renewalDate)
    .map((b) => ({ label: `${b.provider} renewal`, days: daysUntil(b.renewalDate as string) }))
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
