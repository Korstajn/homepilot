import type { Currency } from './types';

const LOCALE: Record<Currency, string> = {
  GBP: 'en-GB',
  SEK: 'sv-SE',
};

export function formatMoney(amount: number | null, currency: Currency): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat(LOCALE[currency], {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'SEK' ? 0 : 2,
  }).format(amount);
}

export function formatMoneyPerYear(amount: number | null, currency: Currency): string {
  if (amount === null || amount === undefined) return '—';
  return `${formatMoney(amount, currency)}/yr`;
}

// --- Parsing ---------------------------------------------------------------
//
// A currency GiGi can see in an email but does not run a market for. Keeping
// these distinct from `Currency` matters: the previous parser mapped '$' to GBP,
// so a dollar subscription entered the register as a pound bill. Naming the
// currency we actually saw lets the extractor return null instead of a number
// that is wrong by an exchange rate.
export type DetectedCurrency = Currency | 'EUR' | 'USD';

export function isMarketCurrency(c: DetectedCurrency | null): c is Currency {
  return c === 'GBP' || c === 'SEK';
}

/**
 * Parse the numeric part of a money token, in either separator convention.
 *
 * This is the fix for the single worst extraction bug: the old pattern
 * `[0-9]+(?:[.,][0-9]{1,2})?` cannot express a thousands separator at all, so
 * "£1,234.56" matched as "1" + ",23" and a £1,234.56 premium was stored as 1.23.
 *
 * The rules, which cover en-GB and sv-SE without needing to know which is in
 * play:
 *   - spaces (including NBSP and narrow NBSP) are always grouping, never decimal
 *   - if BOTH '.' and ',' appear, the LAST one is the decimal separator
 *   - if only one appears more than once, it is grouping
 *   - if only one appears once, three trailing digits mean grouping
 *     ("1,234" / "1.234" = 1234) and one or two mean decimal ("62.00", "39,90")
 */
export function parseAmount(raw: string): number | null {
  const token = raw.replace(/[\s   ]/g, '');
  const digits = token.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(digits)) return null;

  const negative = /^-/.test(digits);
  const body = digits.replace(/-/g, '');

  const lastDot = body.lastIndexOf('.');
  const lastComma = body.lastIndexOf(',');
  let normalised: string;

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalAt = Math.max(lastDot, lastComma);
    normalised = body.slice(0, decimalAt).replace(/[.,]/g, '') + '.' + body.slice(decimalAt + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const occurrences = body.split(sep).length - 1;
    const trailing = body.length - body.lastIndexOf(sep) - 1;
    if (occurrences > 1 || trailing === 3) {
      normalised = body.replace(/[.,]/g, ''); // grouping
    } else {
      normalised = body.slice(0, body.lastIndexOf(sep)) + '.' + body.slice(body.lastIndexOf(sep) + 1);
    }
  } else {
    normalised = body;
  }

  const value = Number.parseFloat(normalised);
  if (!Number.isFinite(value)) return null;
  return Math.round((negative ? -value : value) * 100) / 100;
}

/**
 * Which currency a money token is in, from the symbol or code attached to it.
 * Returns null when nothing says — a bare "62.00" is not a pound.
 */
export function detectCurrency(token: string): DetectedCurrency | null {
  if (/[£]|\bGBP\b/i.test(token)) return 'GBP';
  if (/kr\b|\bSEK\b|:-/i.test(token)) return 'SEK';
  if (/[€]|\bEUR\b/i.test(token)) return 'EUR';
  if (/[$]|\bUSD\b/i.test(token)) return 'USD';
  return null;
}
