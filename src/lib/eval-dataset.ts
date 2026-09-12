import type { BillType, Currency } from './types';

// A small hand-labeled evaluation set for bill extraction (Prompt 1). This is
// the "≥200 real emails" gate from the plan, in miniature: enough shapes to
// measure precision/recall per field and prove the null-over-guessing behaviour.
// Grow it with real (anonymised) beta emails over time.

export interface EvalCase {
  id: string;
  note: string;
  email: { from: string; subject: string; text: string };
  gold: {
    provider: string | null;
    type: BillType | null;
    amount: number | null;
    currency: Currency | null;
    renewalDate: string | null;
    priceIncreaseFlag: boolean;
  };
}


// Dates are computed relative to today so the set does not quietly rot: the
// validation gate rejects a renewal date more than two years out, so a fixed
// 2027 date in a test written in 2026 starts failing on its own in 2028 and the
// gate would look like a regression it is not.
function inDays(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
const iso = (n: number) => inDays(n).toISOString().slice(0, 10);
const dmy = (n: number) => {
  const d = inDays(n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const monthDayYear = (n: number) => {
  const d = inDays(n);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};

export const EVAL_SET: EvalCase[] = [
  {
    id: 'vm-price-rise',
    note: 'Clear broadband price increase, DD/MM/YYYY date',
    email: {
      from: 'billing@virginmedia.com',
      subject: 'Your broadband price is changing',
      text: 'From next month your broadband package will cost £59 per month. Your current contract renews on 15/10/2026.',
    },
    gold: { provider: 'Virgin Media', type: 'broadband', amount: 59, currency: 'GBP', renewalDate: '2026-10-15', priceIncreaseFlag: true },
  },
  {
    id: 'octopus-energy',
    note: 'Energy, ISO date, no increase',
    email: {
      from: 'hello@octopus.energy',
      subject: 'Your energy plan',
      text: 'Your fixed energy plan is £84 per month and renews on 2026-11-01. Thanks for being with us.',
    },
    gold: { provider: 'Octopus Energy', type: 'energy', amount: 84, currency: 'GBP', renewalDate: '2026-11-01', priceIncreaseFlag: false },
  },
  {
    id: 'vodafone-mobile-longdate',
    note: 'Mobile, "03 December 2026" date',
    email: {
      from: 'service@vodafone.co.uk',
      subject: 'Your airtime plan',
      text: 'Your airtime plan is £28 a month. Your contract ends 03 December 2026.',
    },
    gold: { provider: 'Vodafone', type: 'mobile', amount: 28, currency: 'GBP', renewalDate: '2026-12-03', priceIncreaseFlag: false },
  },
  {
    id: 'sky-null-amount',
    note: 'Amount NOT present — must return null, not guess',
    email: {
      from: 'noreply@sky.com',
      subject: 'Changes to your package',
      text: 'We are making some changes to your TV package. Please log in to your account to see your new price.',
    },
    gold: { provider: 'Sky', type: 'tv', amount: null, currency: null, renewalDate: null, priceIncreaseFlag: true },
  },
  {
    id: 'aviva-insurance',
    note: 'Insurance renewal, amount + date',
    email: {
      from: 'renewals@aviva.co.uk',
      subject: 'Your home insurance renewal',
      text: 'Your home insurance premium for the coming year is £41 per month, due to renew on 26/09/2026.',
    },
    gold: { provider: 'Aviva', type: 'insurance', amount: 41, currency: 'GBP', renewalDate: '2026-09-26', priceIncreaseFlag: false },
  },
  {
    id: 'bt-annual-to-monthly',
    note: 'Given as annual — monthly amount is not stated, must be null',
    email: {
      from: 'billing@bt.com',
      subject: 'Your BT bill',
      text: 'Your annual broadband charge will be £540 this year. Contract renews 01/12/2026.',
    },
    gold: { provider: 'BT', type: 'broadband', amount: null, currency: null, renewalDate: '2026-12-01', priceIncreaseFlag: false },
  },
  {
    id: 'not-a-bill',
    note: 'Marketing email, not a bill — provider/amount/date all null',
    email: {
      from: 'newsletter@somebrand.com',
      subject: 'Weekend deals just for you',
      text: 'Check out our latest offers on trainers and jackets. Free delivery this weekend only!',
    },
    gold: { provider: null, type: null, amount: null, currency: null, renewalDate: null, priceIncreaseFlag: false },
  },
  {
    id: 'telia-se',
    note: 'Swedish broadband, SEK, kr suffix',
    email: {
      from: 'faktura@telia.se',
      subject: 'Din bredbandsfaktura',
      text: 'Ditt bredband kostar 399 kr per månad. Avtalet förnyas 2026-10-20.',
    },
    gold: { provider: 'Telia', type: 'broadband', amount: 399, currency: 'SEK', renewalDate: '2026-10-20', priceIncreaseFlag: false },
  },
  {
    id: 'ee-increase',
    note: 'Mobile increase phrased "going up"',
    email: {
      from: 'no-reply@ee.co.uk',
      subject: 'An update to your plan',
      text: 'Your monthly price is going up to £22 from April. Your plan renews 05/04/2027.',
    },
    gold: { provider: 'EE', type: 'mobile', amount: 22, currency: 'GBP', renewalDate: '2027-04-05', priceIncreaseFlag: true },
  },
  {
    id: 'ovo-no-date',
    note: 'Amount present, no renewal date — date must be null',
    email: {
      from: 'team@ovoenergy.com',
      subject: 'Your monthly statement',
      text: 'Your latest energy statement is ready. Your current monthly payment is £120.',
    },
    gold: { provider: 'OVO Energy', type: 'energy', amount: 120, currency: 'GBP', renewalDate: null, priceIncreaseFlag: false },
  },

  // --- Failure shapes found by testing the old parser -------------------------
  // Every case below is one the previous implementation got wrong. They are here
  // so it cannot silently start getting them wrong again.
  {
    id: 'uk-thousands-annual',
    note: 'Thousands separator + annual period. Old parser read £1,234.56 as 1.23.',
    email: {
      from: 'service@aviva.com',
      subject: 'Your renewal',
      text: `Your annual premium is £1,234.56 for the year ahead. Your policy renews on ${dmy(120)}.`,
    },
    // Annual, so there is no stated monthly charge — the figure is kept as
    // sourceAmount, but `amount` must not be an inferred twelfth.
    gold: { provider: 'Aviva', type: 'insurance', amount: null, currency: 'GBP', renewalDate: iso(120), priceIncreaseFlag: false },
  },
  {
    id: 'decoy-marketing-amount',
    note: 'A marketing figure appears before the real one. Old parser returned 5.',
    email: {
      from: 'hello@octopus.energy',
      subject: 'Save £5 when you switch',
      text: `Save £5 when you refer a friend! Your monthly price is £62.00. Your contract renews on ${dmy(40)}.`,
    },
    gold: { provider: 'Octopus Energy', type: 'energy', amount: 62, currency: 'GBP', renewalDate: iso(40), priceIncreaseFlag: false },
  },
  {
    id: 'zero-balance-first',
    note: 'A £0.00 balance precedes the charge. Old parser returned 0.',
    email: {
      from: 'billing@virginmedia.com',
      subject: 'Your bill',
      text: `Balance: £0.00. Your new monthly price is £74.50. Contract ends on ${dmy(70)}.`,
    },
    gold: { provider: 'Virgin Media', type: 'broadband', amount: 74.5, currency: 'GBP', renewalDate: iso(70), priceIncreaseFlag: true },
  },
  {
    id: 'label-before-amount',
    note: 'Monthly qualifier precedes the figure, as most UK bills write it.',
    email: {
      from: 'billing@bt.com',
      subject: 'Your bill is ready',
      text: `Monthly charge: £62.00. Your contract ends on ${dmy(200)}.`,
    },
    gold: { provider: 'BT', type: 'broadband', amount: 62, currency: 'GBP', renewalDate: iso(200), priceIncreaseFlag: false },
  },
  {
    id: 'sek-monthly',
    note: 'Swedish monthly price. Old parser labelled every SEK amount as GBP.',
    email: {
      from: 'faktura@telia.se',
      subject: 'Ditt nya pris',
      text: `Ditt nya pris är 449 kr/mån. Ditt avtal förnyas ${iso(90)}.`,
    },
    gold: { provider: 'Telia', type: 'broadband', amount: 449, currency: 'SEK', renewalDate: iso(90), priceIncreaseFlag: false },
  },
  {
    id: 'sek-space-thousands',
    note: 'Space-grouped SEK with no stated period. Old parser read 1 234,50 as 234.5.',
    email: {
      from: 'faktura@vattenfall.se',
      subject: 'Faktura',
      text: 'Fakturabelopp: 1 234,50 kr att betala.',
    },
    gold: { provider: 'Vattenfall', type: 'energy', amount: null, currency: 'SEK', renewalDate: null, priceIncreaseFlag: false },
  },
  {
    id: 'quarterly-total',
    note: 'A quarterly total is not a monthly charge. Old parser stored 186 as monthly.',
    email: {
      from: 'billing@talktalk.co.uk',
      subject: 'Your quarterly bill',
      text: `Total due for this quarter: £186.00. Your contract renews on ${dmy(150)}.`,
    },
    gold: { provider: 'TalkTalk', type: 'broadband', amount: null, currency: 'GBP', renewalDate: iso(150), priceIncreaseFlag: false },
  },
  {
    id: 'foreign-currency',
    note: 'A dollar subscription. Old parser filed $50.00 as £50.',
    email: {
      from: 'billing@example.com',
      subject: 'Your subscription',
      text: 'Your subscription renews at $50.00 per month.',
    },
    gold: { provider: 'Example', type: null, amount: null, currency: null, renewalDate: null, priceIncreaseFlag: false },
  },
  {
    id: 'us-date-format',
    note: 'Month-first date, which the old date parser could not read at all.',
    email: {
      from: 'no-reply@sky.com',
      subject: 'Your plan',
      text: `Your monthly price is £38.00. Your plan renews on ${monthDayYear(95)}.`,
    },
    gold: { provider: 'Sky', type: 'tv', amount: 38, currency: 'GBP', renewalDate: iso(95), priceIncreaseFlag: false },
  },
  {
    id: 'table-shaped-body',
    note: 'An HTML bill flattened with cell boundaries kept — the common real shape.',
    email: {
      from: 'billing@edfenergy.com',
      subject: 'Your energy bill',
      text: `Account | 12345678 |\nMonthly charge | £148.00 |\nContract ends | ${dmy(300)} |`,
    },
    gold: { provider: 'EDF', type: 'energy', amount: 148, currency: 'GBP', renewalDate: iso(300), priceIncreaseFlag: false },
  },
  {
    id: 'stray-date-no-cue',
    note: 'Dates present but none is a renewal. Old parser returned the send date.',
    email: {
      from: 'billing@bt.com',
      subject: 'Thanks for your payment',
      text: `Thanks for your payment of £62.00 per month. Sent ${dmy(-2)}. © 2019 BT Group.`,
    },
    gold: { provider: 'BT', type: 'broadband', amount: 62, currency: 'GBP', renewalDate: null, priceIncreaseFlag: false },
  },
  {
    id: 'renewal-in-the-past',
    note: 'A parseable but impossible renewal date must be dropped by the gate.',
    email: {
      from: 'billing@bt.com',
      subject: 'Your bill',
      text: `Your monthly charge is £62.00. Your contract renewed on ${dmy(-400)}.`,
    },
    gold: { provider: 'BT', type: 'broadband', amount: 62, currency: 'GBP', renewalDate: null, priceIncreaseFlag: false },
  },
];
