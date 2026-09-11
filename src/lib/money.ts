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
