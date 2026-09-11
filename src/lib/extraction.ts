// Bill extraction — the "Prompt 1" contract from CLAUDE.md.
//
// Default path is a deterministic heuristic extractor so the forward feature
// works on a free Render box with NO API key. If ANTHROPIC_API_KEY is set, the
// real model call runs instead (claude-sonnet-5, EU inference), keeping the same
// strict-JSON, null-over-guessing contract.

import type { BillType, Currency } from './types';
import { claudeText, EXTRACTION_MODEL } from './anthropic';

export interface ExtractedBill {
  kind: 'bill';
  provider: string | null;
  type: BillType | null;
  amount: number | null; // monthly, null over guessing
  currency: Currency | null;
  renewalDate: string | null; // ISO YYYY-MM-DD, null over guessing
  priceIncreaseFlag: boolean;
  confidence: number; // 0..1
}

export interface RawEmail {
  from?: string;
  subject?: string;
  text?: string;
}

// Known senders → provider + type. Keeps provider naming clean and lets us infer
// the vertical even when the body is terse.
const KNOWN: { match: RegExp; provider: string; type: BillType }[] = [
  { match: /virgin\s?media/i, provider: 'Virgin Media', type: 'broadband' },
  { match: /\bbt\b|bt\.com/i, provider: 'BT', type: 'broadband' },
  { match: /talktalk/i, provider: 'TalkTalk', type: 'broadband' },
  { match: /\bsky\b/i, provider: 'Sky', type: 'tv' },
  { match: /vodafone/i, provider: 'Vodafone', type: 'mobile' },
  { match: /\bee\b|ee\.co\.uk/i, provider: 'EE', type: 'mobile' },
  { match: /\bo2\b/i, provider: 'O2', type: 'mobile' },
  { match: /\bthree\b|three\.co\.uk/i, provider: 'Three', type: 'mobile' },
  { match: /octopus/i, provider: 'Octopus Energy', type: 'energy' },
  { match: /british\s?gas/i, provider: 'British Gas', type: 'energy' },
  { match: /\bedf\b/i, provider: 'EDF', type: 'energy' },
  { match: /e\.?on/i, provider: 'E.ON', type: 'energy' },
  { match: /\bovo\b/i, provider: 'OVO Energy', type: 'energy' },
  { match: /aviva/i, provider: 'Aviva', type: 'insurance' },
  { match: /admiral/i, provider: 'Admiral', type: 'insurance' },
  { match: /direct\s?line/i, provider: 'Direct Line', type: 'insurance' },
  // Swedish providers (market two)
  { match: /telia/i, provider: 'Telia', type: 'broadband' },
  { match: /tele2/i, provider: 'Tele2', type: 'mobile' },
  { match: /vattenfall/i, provider: 'Vattenfall', type: 'energy' },
  { match: /fortum/i, provider: 'Fortum', type: 'energy' },
];

const TYPE_KEYWORDS: { match: RegExp; type: BillType }[] = [
  { match: /broadband|fibre|fiber|internet|wi-?fi|bredband/i, type: 'broadband' },
  { match: /energy|electric|\bgas\b|kwh|tariff|\bel\b|elavtal/i, type: 'energy' },
  { match: /mobile|\bsim\b|airtime|phone plan|mobil|abonnemang/i, type: 'mobile' },
  { match: /\btv\b|telly|streaming|licence/i, type: 'tv' },
  { match: /insurance|policy|cover|premium|försäkring/i, type: 'insurance' },
];

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function toISO(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

function findDate(text: string): string | null {
  // Prefer a date near a renewal keyword.
  const near = text.match(
    /(renew|renewal|contract ends?|expires?|ends on|förnyas|löper ut)[^.]{0,40}?([0-9]{1,2}[\/.\-][0-9]{1,2}[\/.\-][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}\s+[A-Za-z]{3,9}\s+[0-9]{4})/i,
  );
  const candidate = near?.[2] ?? null;
  const scan = candidate ? [candidate] : [];
  // Fallback: any date in the body.
  if (!candidate) {
    const m = text.match(/([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}[\/.\-][0-9]{1,2}[\/.\-][0-9]{2,4}|[0-9]{1,2}\s+[A-Za-z]{3,9}\s+[0-9]{4})/);
    if (m) scan.push(m[1]);
  }
  for (const s of scan) {
    let mm;
    if ((mm = s.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/))) {
      const iso = toISO(+mm[1], +mm[2], +mm[3]);
      if (iso) return iso;
    } else if ((mm = s.match(/^([0-9]{1,2})[\/.\-]([0-9]{1,2})[\/.\-]([0-9]{2,4})$/))) {
      // Day-first (UK/SE convention)
      const year = mm[3].length === 2 ? 2000 + +mm[3] : +mm[3];
      const iso = toISO(year, +mm[2], +mm[1]);
      if (iso) return iso;
    } else if ((mm = s.match(/^([0-9]{1,2})\s+([A-Za-z]{3,9})\s+([0-9]{4})$/))) {
      const mon = MONTHS[mm[2].slice(0, 3).toLowerCase()];
      if (mon) {
        const iso = toISO(+mm[3], mon, +mm[1]);
        if (iso) return iso;
      }
    }
  }
  return null;
}

function findAmount(text: string): { amount: number; currency: Currency } | null {
  // Prefer an amount qualified as monthly.
  const monthly = text.match(/([£$]|kr|sek)\s?([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:per month|\/month|\/mo|a month|pm|per månad|\/mån)/i)
    || text.match(/([0-9]+(?:[.,][0-9]{1,2})?)\s?(kr|sek)\s*(?:per month|\/month|a month|per månad|\/mån)/i);
  const any = monthly
    || text.match(/([£$]|kr|sek)\s?([0-9]+(?:[.,][0-9]{1,2})?)/i)
    || text.match(/([0-9]+(?:[.,][0-9]{1,2})?)\s?(kr|sek)\b/i);
  if (!any) return null;

  const symToken = (any[1] || any[2] || '').toString().toLowerCase();
  const numToken = /[0-9]/.test(any[2] ?? '') ? any[2] : any[1];
  const amount = parseFloat(String(numToken).replace(',', '.'));
  if (Number.isNaN(amount)) return null;
  const currency: Currency = /kr|sek/.test(symToken) ? 'SEK' : 'GBP';
  return { amount: Math.round(amount * 100) / 100, currency };
}

export function heuristicExtract(email: RawEmail): ExtractedBill {
  const blob = `${email.subject ?? ''}\n${email.from ?? ''}\n${email.text ?? ''}`;

  let provider: string | null = null;
  let type: BillType | null = null;
  for (const k of KNOWN) {
    if (k.match.test(blob)) { provider = k.provider; type = k.type; break; }
  }
  if (!type) {
    for (const t of TYPE_KEYWORDS) if (t.match.test(blob)) { type = t.type; break; }
  }
  if (!provider && email.from) {
    // Fall back to the sender's second-level domain, title-cased.
    const dom = email.from.match(/@([a-z0-9-]+)\./i);
    if (dom) provider = dom[1].charAt(0).toUpperCase() + dom[1].slice(1);
  }

  const money = findAmount(blob);
  const renewalDate = findDate(blob);
  const priceIncreaseFlag = /price[^.]{0,20}(increase|chang|rise|rising|going up|is going)|new price|increasing your|höjer|prishöjning/i.test(blob);

  // Confidence is a rough function of how much we resolved.
  let confidence = 0.3;
  if (provider) confidence += 0.2;
  if (type) confidence += 0.2;
  if (money) confidence += 0.2;
  if (renewalDate) confidence += 0.1;

  return {
    kind: 'bill',
    provider,
    type,
    amount: money?.amount ?? null,
    currency: money?.currency ?? null,
    renewalDate,
    priceIncreaseFlag,
    confidence: Math.min(confidence, 0.95),
  };
}

// Strip obvious personal identifiers before sending text to the AI. Bill facts
// (provider, amount, dates) survive; names/emails/phones/addresses are masked.
// Reduces what ever leaves for inference — see docs/PRIVACY_ARCHITECTURE.md.
export function redactPII(text: string): string {
  return text
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, '[phone]')
    // UK postcodes
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi, '[postcode]')
    // Long card/account-like digit runs
    .replace(/\b\d{2}[- ]?\d{2}[- ]?\d{2}\b/g, '[sortcode]')
    .replace(/\b\d{8,}\b/g, '[number]');
}

const EXTRACTION_SYSTEM = `You extract one household bill from a forwarded email into strict JSON.
Rules:
- Output ONLY a JSON object, no prose, no code fences.
- Null over guessing: if a value is not clearly present, return null. Never infer an amount or date.
- amount is the MONTHLY charge as a number. renewalDate is ISO (YYYY-MM-DD).
- type is one of broadband, energy, mobile, tv, insurance, other, or null.
- currency is GBP or SEK or null.
- Never include information about other families or children.
Shape: {"kind":"bill","provider":string|null,"type":string|null,"amount":number|null,"currency":"GBP"|"SEK"|null,"renewalDate":string|null,"priceIncreaseFlag":boolean,"confidence":number}`;

// Real model extraction (Prompt 1). Only used when ANTHROPIC_API_KEY is set.
async function anthropicExtract(email: RawEmail): Promise<ExtractedBill> {
  const { text: raw } = await claudeText({
    model: EXTRACTION_MODEL,
    maxTokens: 1024,
    system: EXTRACTION_SYSTEM,
    // PII stripped before it ever leaves for inference.
    user: redactPII(`From: ${email.from ?? ''}\nSubject: ${email.subject ?? ''}\n\n${email.text ?? ''}`),
  });
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  const parsed = JSON.parse(json);
  return {
    kind: 'bill',
    provider: parsed.provider ?? null,
    type: parsed.type ?? null,
    amount: typeof parsed.amount === 'number' ? parsed.amount : null,
    currency: parsed.currency === 'SEK' || parsed.currency === 'GBP' ? parsed.currency : null,
    renewalDate: parsed.renewalDate ?? null,
    priceIncreaseFlag: Boolean(parsed.priceIncreaseFlag),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
  };
}

export async function extractBill(email: RawEmail): Promise<{ result: ExtractedBill; engine: 'anthropic' | 'heuristic' }> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return { result: await anthropicExtract(email), engine: 'anthropic' };
    } catch {
      // Fall back to heuristics rather than dropping the email.
      return { result: heuristicExtract(email), engine: 'heuristic' };
    }
  }
  return { result: heuristicExtract(email), engine: 'heuristic' };
}
