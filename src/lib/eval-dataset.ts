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
];
