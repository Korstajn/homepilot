import { extractBill } from './extraction';
import { EVAL_SET, EvalCase } from './eval-dataset';

interface FieldScore {
  // For abstain-able fields (amount, renewalDate): treat null as "abstain".
  tp: number; fp: number; fn: number; tn: number;
  precision: number; recall: number; nullRate: number; accuracy: number;
}

interface CaseResult {
  id: string;
  note: string;
  engine: string;
  gold: EvalCase['gold'];
  predicted: { provider: string | null; type: string | null; amount: number | null; renewalDate: string | null; priceIncreaseFlag: boolean };
  correct: { amount: boolean; renewalDate: boolean; provider: boolean; type: boolean };
}

function scoreAbstain(rows: { pred: unknown; gold: unknown }[]): FieldScore {
  let tp = 0, fp = 0, fn = 0, tn = 0, nulls = 0;
  for (const { pred, gold } of rows) {
    const p = pred ?? null, g = gold ?? null;
    if (p === null) nulls++;
    if (p !== null && g !== null && p === g) tp++;
    else if (p !== null && p !== g) fp++; // wrong value (or gold was null) = a guess we didn't want
    else if (p === null && g !== null) fn++; // abstained but there was an answer
    else tn++; // both null = correctly abstained
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const accuracy = rows.length === 0 ? 1 : (tp + tn) / rows.length;
  return { tp, fp, fn, tn, precision, recall, nullRate: nulls / rows.length, accuracy };
}

function providerMatch(pred: string | null, gold: string | null): boolean {
  if (gold === null) return pred === null;
  if (pred === null) return false;
  const p = pred.toLowerCase(), g = gold.toLowerCase();
  return p.includes(g) || g.includes(p);
}

export async function runEval() {
  const cases: CaseResult[] = [];
  const amountRows: { pred: unknown; gold: unknown }[] = [];
  const dateRows: { pred: unknown; gold: unknown }[] = [];
  let typeCorrect = 0, providerCorrect = 0, engine = 'heuristic';

  for (const c of EVAL_SET) {
    const { result, engine: e } = await extractBill(c.email);
    engine = e;
    amountRows.push({ pred: result.amount, gold: c.gold.amount });
    dateRows.push({ pred: result.renewalDate, gold: c.gold.renewalDate });
    const typeOk = (result.type ?? null) === (c.gold.type ?? null);
    const provOk = providerMatch(result.provider, c.gold.provider);
    if (typeOk) typeCorrect++;
    if (provOk) providerCorrect++;
    cases.push({
      id: c.id, note: c.note, engine: e, gold: c.gold,
      predicted: { provider: result.provider, type: result.type, amount: result.amount, renewalDate: result.renewalDate, priceIncreaseFlag: result.priceIncreaseFlag },
      correct: {
        amount: (result.amount ?? null) === (c.gold.amount ?? null),
        renewalDate: (result.renewalDate ?? null) === (c.gold.renewalDate ?? null),
        provider: provOk, type: typeOk,
      },
    });
  }

  const amount = scoreAbstain(amountRows);
  const renewalDate = scoreAbstain(dateRows);
  const n = EVAL_SET.length;

  // Gate from CLAUDE.md: ≥95% precision on amount and renewal date.
  const GATE = 0.95;
  const gate = {
    threshold: GATE,
    amountPass: amount.precision >= GATE,
    datePass: renewalDate.precision >= GATE,
    pass: amount.precision >= GATE && renewalDate.precision >= GATE,
  };

  return {
    engine,
    total: n,
    fields: {
      amount,
      renewalDate,
      provider: { accuracy: providerCorrect / n },
      type: { accuracy: typeCorrect / n },
    },
    gate,
    cases,
  };
}
