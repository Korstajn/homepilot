/**
 * Turning one email into something worth extracting from.
 *
 * The order here is the whole point. A billing email usually states its amount
 * and due date THREE times, in descending reliability:
 *
 *   1. schema.org markup (`<script type="application/ld+json">`), which Gmail
 *      documents and billers embed — exact, typed, unambiguous.
 *   2. an HTML table, where the label and the value are adjacent cells.
 *   3. prose, where a model has to work it out.
 *
 * The previous implementation went straight to (3) and, worse, destroyed (1) on
 * the way: stripping `<script>` blocks removed the JSON-LD before anything read
 * it, and collapsing every tag to a space dissolved (2) into a word soup where
 * "Monthly charge" and "£62.00" were no longer visibly related.
 *
 * So this module extracts (1) before any stripping happens, preserves cell
 * boundaries for (2), and only then hands the remainder on as text.
 */

/** What schema.org markup told us, when an email carried any. */
export interface StructuredInvoice {
  provider: string | null;
  amount: number | null;
  /** Raw ISO 4217 code as published, e.g. 'GBP'. Not narrowed — see money.ts. */
  currency: string | null;
  /**
   * When the next payment falls due (ISO date). NOT a contract renewal — the
   * two are different facts and conflating them is a precision bug, so they
   * stay separate fields all the way through.
   */
  paymentDueDate: string | null;
  /** When the contract/subscription runs out (ISO date) — the renewal date. */
  validThrough: string | null;
  /** ISO 8601 duration as published, e.g. 'P1M'. */
  billingPeriod: string | null;
}

export interface ParsedEmail {
  /** Table-aware plain text: cells joined by ' | ', rows by newline. */
  text: string;
  /** Present only when the sender published machine-readable billing data. */
  structured: StructuredInvoice | null;
}

const LD_JSON = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  // A published price is meant to be a plain decimal, but senders do ship
  // "£62.00" and "1,234.56". Strip anything that isn't part of a number and
  // let the money parser deal with separators.
  const cleaned = value.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned.replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object') {
    const name = (value as { name?: unknown }).name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return null;
}

function asISODate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}

/** Flatten `@graph`, arrays and nested objects into a list of candidate nodes. */
function flattenNodes(root: unknown, out: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (depth > 6 || !root) return out;
  if (Array.isArray(root)) {
    for (const item of root) flattenNodes(item, out, depth + 1);
    return out;
  }
  if (typeof root !== 'object') return out;
  const node = root as Record<string, unknown>;
  out.push(node);
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'orderedItem', 'partOfInvoice', 'referencesOrder']) {
    if (node[key]) flattenNodes(node[key], out, depth + 1);
  }
  return out;
}

function typeOf(node: Record<string, unknown>): string[] {
  const t = node['@type'];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  return [];
}

/**
 * Read the price out of a node, whether it sits in a nested PriceSpecification
 * (the correct shape) or directly on the node (the shape senders actually ship).
 */
function readPrice(node: Record<string, unknown>): { amount: number | null; currency: string | null } {
  for (const key of ['totalPaymentDue', 'priceSpecification', 'totalPrice', 'price']) {
    const raw = node[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      const spec = raw as Record<string, unknown>;
      const amount = asNumber(spec.price ?? spec.value ?? spec.amount);
      const currency = asString(spec.priceCurrency ?? spec.currency);
      if (amount !== null) return { amount, currency: currency?.toUpperCase() ?? null };
    } else {
      const amount = asNumber(raw);
      if (amount !== null) {
        const currency = asString(node.priceCurrency);
        return { amount, currency: currency?.toUpperCase() ?? null };
      }
    }
  }
  return { amount: null, currency: null };
}

/**
 * Pull schema.org billing data out of an HTML email.
 *
 * Deliberately forgiving: one malformed block must not lose a well-formed one,
 * and an email carrying unrelated markup (an Event, a ParcelDelivery) simply
 * yields nothing rather than nonsense.
 */
export function extractStructuredInvoice(html: string): StructuredInvoice | null {
  const nodes: Record<string, unknown>[] = [];

  LD_JSON.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LD_JSON.exec(html)) !== null) {
    const body = match[1].trim();
    if (!body) continue;
    try {
      flattenNodes(JSON.parse(body), nodes);
    } catch {
      // A single unparsable block is normal in the wild — keep going.
    }
  }
  if (nodes.length === 0) return null;

  const billing = nodes.filter((n) => {
    const types = typeOf(n).map((t) => t.replace(/^https?:\/\/schema\.org\//, ''));
    return types.some((t) => t === 'Invoice' || t === 'Order' || t === 'Subscription');
  });
  // Prefer an explicitly-typed billing node; fall back to any node that looks
  // like one, since `@type` is the field senders most often get wrong.
  const candidates = billing.length
    ? billing
    : nodes.filter((n) => n.totalPaymentDue !== undefined || n.paymentDueDate !== undefined);
  if (candidates.length === 0) return null;

  const result: StructuredInvoice = {
    provider: null,
    amount: null,
    currency: null,
    paymentDueDate: null,
    validThrough: null,
    billingPeriod: null,
  };

  for (const node of candidates) {
    if (result.amount === null) {
      const { amount, currency } = readPrice(node);
      if (amount !== null) {
        result.amount = amount;
        result.currency = currency;
      }
    }
    result.paymentDueDate ??= asISODate(node.paymentDueDate) ?? asISODate(node.paymentDue);
    result.validThrough ??= asISODate(node.validThrough) ?? asISODate(node.endDate);
    result.provider ??= asString(node.provider) ?? asString(node.broker) ?? asString(node.seller) ?? asString(node.merchant);
    if (result.billingPeriod === null && typeof node.billingPeriod === 'string') {
      result.billingPeriod = node.billingPeriod;
    }
  }

  const empty =
    result.amount === null &&
    result.paymentDueDate === null &&
    result.validThrough === null &&
    result.provider === null;
  return empty ? null : result;
}

/**
 * HTML → text, keeping the structure that carries meaning.
 *
 * Cells are joined with ' | ' rather than a space: in a billing table the label
 * and the amount are adjacent cells, and that adjacency is the only thing that
 * says which of the six numbers on the page is the monthly charge. Losing it
 * was a large part of why extraction had to guess.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)\s*>/gi, ' | ')
    .replace(/<\/(p|div|tr|table|h[1-6]|li|ul|ol)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&pound;/gi, '£')
    .replace(/&euro;/gi, '€')
    // Tidy the separators we just introduced, without collapsing the rows.
    .replace(/[ \t ]+/g, ' ')
    .replace(/(?:\s*\|\s*)+/g, ' | ')
    .replace(/\|\s*\n/g, '\n')
    .replace(/\n\s*\|\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim();
}

/** Parse one HTML part: structured data first, then text that kept its shape. */
export function parseEmailHtml(html: string): ParsedEmail {
  return { text: htmlToText(html), structured: extractStructuredInvoice(html) };
}
