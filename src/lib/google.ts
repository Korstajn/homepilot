/**
 * Gmail OAuth 2.0 — the "let GiGi read the bills in my inbox" grant.
 *
 * Deliberately hand-rolled over `fetch` rather than pulling in googleapis or an
 * auth library. Two reasons: the CSP in next.config.mjs is self-only, so no
 * Google browser SDK could load anyway, and a server-side redirect flow is both
 * smaller and safer than a client-side one. Nothing here runs in the browser.
 *
 * WHAT IS AND ISN'T STORED
 * The refresh token is a live credential. It is sealed (AES-256-GCM, see
 * src/lib/secrets.ts) into an httpOnly cookie and never written to the store,
 * so it lives in the user's own browser and not in our memory. That is a
 * genuinely better privacy position than a database row — and it is also the
 * only option while the store is in-memory, since a token kept there would
 * vanish between serverless instances.
 *
 * The trade-off, stated plainly: a token that lives in the user's cookie cannot
 * be used by a server-side job. The nightly 02:00 digest therefore cannot read
 * Gmail yet. That needs the Postgres swap (db/schema.sql) plus an encrypted
 * google_connections table.
 *
 * SCOPE
 * gmail.readonly is one of Google's RESTRICTED scopes: publishing it needs
 * verification plus a CASA security assessment. In Testing mode (up to 100 test
 * users) none of that applies, but refresh tokens expire after 7 days — so
 * expect to re-consent weekly. See docs/GMAIL_OAUTH.md and docs/DECISIONS.md §1.
 */

import { seal, unseal } from './secrets';
import { htmlToText, extractStructuredInvoice, type StructuredInvoice } from './email-content';

export const GMAIL_COOKIE = 'gigi_gmail';
export const OAUTH_STATE_COOKIE = 'gigi_oauth_state';

export const GMAIL_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
  secure: process.env.NODE_ENV === 'production',
};

// 10 minutes is plenty to get through a consent screen, and short enough that a
// stale state cookie can't be replayed later.
export const OAUTH_STATE_COOKIE_OPTS = { ...GMAIL_COOKIE_OPTS, maxAge: 60 * 10 };

/**
 * `openid email` so we can show WHICH account is connected — that matters for
 * trust, and it costs nothing: both are non-sensitive. gmail.readonly is the
 * one that does the work.
 */
export const GMAIL_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
];

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
}

export function googleClient(): GoogleClient | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function googleConfigured(): boolean {
  return googleClient() !== null;
}

/**
 * The redirect URI, which must match what is registered in Google Cloud Console
 * byte for byte.
 *
 * Prefer GOOGLE_REDIRECT_URI. The derived fallback is for local dev: on Vercel
 * a preview deployment has a different hostname on every push, and none of them
 * will be registered, so guessing from the request would fail confusingly.
 */
export const CALLBACK_PATH = '/api/auth/google/callback';

export function redirectUri(req: Request): string {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) return configured;

  const url = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  return `${proto}://${host}${CALLBACK_PATH}`;
}

/**
 * A pinned GOOGLE_REDIRECT_URI that cannot match Google Cloud Console whatever
 * is registered there.
 *
 * Google compares the redirect URI byte for byte, and every way of getting it
 * subtly wrong looks right at a glance: a trailing slash, http:// on a
 * deployed host, a stray `?next=` left on the end, the callback path mistyped.
 * All of them fail identically — a bare `redirect_uri_mismatch` 400 on
 * Google's own page, which never comes back to us — so the string is worth
 * checking here, where the problem can be named instead of guessed at.
 *
 * Shape only. Whether the URI is REGISTERED is Google's to say, and a null
 * here is not a promise that connecting will work.
 */
export function redirectUriProblem(): string | null {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!configured) return null;

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return `GOOGLE_REDIRECT_URI is not a URL. It must read https://<host>${CALLBACK_PATH}`;
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    return `GOOGLE_REDIRECT_URI starts with ${url.protocol}// — Google accepts http only for localhost.`;
  }
  if (url.search || url.hash) {
    return 'GOOGLE_REDIRECT_URI has a query string or # fragment on the end. Google matches the whole string, so it must be the bare callback URL.';
  }
  if (url.pathname !== CALLBACK_PATH) {
    const slash = url.pathname === `${CALLBACK_PATH}/`;
    return slash
      ? `GOOGLE_REDIRECT_URI ends with a trailing slash. That alone is enough to fail — drop it, leaving ${CALLBACK_PATH}`
      : `GOOGLE_REDIRECT_URI ends in "${url.pathname}", but this app's callback is "${CALLBACK_PATH}".`;
  }
  return null;
}

/**
 * Detect the one misconfiguration that is guaranteed to fail, before we send
 * the user to Google: GOOGLE_REDIRECT_URI pinned to a different host than the
 * one being browsed.
 *
 * This is not a theoretical case — it is what happens the moment you pin the
 * variable to production and then open a preview deployment. Google rejects it
 * with a bare `redirect_uri_mismatch` 400 on its own error page, which never
 * comes back to us, so the app cannot explain what went wrong. Even if the URI
 * *were* registered it would still break: Google would return the browser to
 * the other host, where the state cookie does not exist.
 *
 * Returns the two hosts when they disagree, so the caller can say so plainly.
 */
export function redirectHostMismatch(req: Request): { pinned: string; actual: string } | null {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!configured) return null; // derived from the request — cannot disagree
  try {
    const pinned = new URL(configured);
    const url = new URL(req.url);
    const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
    const actual = new URL(`${proto}://${host}`);
    if (pinned.host === actual.host) return null;
    return { pinned: pinned.host, actual: actual.host };
  } catch {
    return null;
  }
}

export function authUrl(opts: { client: GoogleClient; redirectUri: string; state: string; loginHint?: string }): string {
  const params = new URLSearchParams({
    client_id: opts.client.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    // offline + consent: Google only returns a refresh token on a fresh
    // consent, so without `prompt=consent` a second connect attempt silently
    // yields an access token that expires in an hour and nothing to renew it.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: opts.state,
  });
  if (opts.loginHint) params.set('login_hint', opts.loginHint);
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    cache: 'no-store',
  });
  return (await res.json().catch(() => ({}))) as TokenResponse;
}

export async function exchangeCode(
  client: GoogleClient,
  code: string,
  uri: string,
): Promise<TokenResponse> {
  return tokenRequest({
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: uri,
    grant_type: 'authorization_code',
  });
}

export async function refreshAccessToken(
  client: GoogleClient,
  refreshToken: string,
): Promise<{ accessToken: string } | { error: string }> {
  const json = await tokenRequest({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  if (json.access_token) return { accessToken: json.access_token };
  // `invalid_grant` is the one to expect: in Testing mode Google expires
  // refresh tokens for restricted scopes after 7 days.
  return { error: json.error ?? 'refresh_failed' };
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(REVOKE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }).toString(),
    cache: 'no-store',
  }).catch(() => {
    // Revocation is best-effort: we clear our own cookie regardless, so the
    // user is disconnected here even if Google's endpoint is unreachable.
  });
}

/**
 * The email address from the id_token.
 *
 * Reading the payload without verifying the signature is safe *here* and only
 * here: the token came straight back from Google's token endpoint over TLS, not
 * from the browser. Google documents this exact exception.
 */
export function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { email?: unknown };
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

// --- The connection, as held in the sealed cookie ---------------------------

export interface GmailConnection {
  refreshToken: string;
  email: string | null;
  scope: string;
  connectedAt: string;
}

export function sealConnection(conn: GmailConnection): string {
  return seal(conn);
}

export function openConnection(cookieValue: string | undefined): GmailConnection | null {
  const conn = unseal<GmailConnection>(cookieValue);
  if (!conn || typeof conn.refreshToken !== 'string' || !conn.refreshToken) return null;
  return conn;
}

// --- Read-only probe --------------------------------------------------------

export interface ProbeMessage {
  from: string | null;
  subject: string | null;
  date: string | null;
}

/**
 * The bill-hunting terms, without the guards that bound every search. Includes
 * Swedish because the second market is Sweden (DECISIONS.md §2).
 */
export const BILL_TERMS =
  'invoice OR bill OR receipt OR renewal OR faktura OR kvitto OR förnyelse';

/**
 * Compose a Gmail query from caller-supplied terms plus the guards that must
 * hold on every search GiGi makes.
 *
 * The parentheses around `terms` are load-bearing, not decoration. Gmail's
 * implicit AND binds tighter than OR, so `a OR b newer_than:30d` parses as
 * `a OR (b AND newer_than:30d)` — the time bound silently stops applying to the
 * first branch, and a search meant to cover one month quietly returns the whole
 * mailbox. Wrapping the terms keeps the bound over all of them.
 */
export function buildGmailQuery(opts: { terms?: string; days: number; unreadOnly?: boolean }): string {
  const terms = (opts.terms ?? BILL_TERMS).trim() || BILL_TERMS;
  const days = Math.min(Math.max(Math.round(opts.days) || 30, 1), 365);
  const unread = opts.unreadOnly ? ' is:unread' : '';
  return `(${terms}) newer_than:${days}d${unread} -in:spam -in:trash`;
}

/** The default search GiGi would use, built through the same guards. */
export const DEFAULT_GMAIL_QUERY = buildGmailQuery({ days: 60 });

/**
 * School-hunting terms.
 *
 * Deliberately narrower than the bill terms and aimed at SENDERS and school
 * vocabulary rather than at generic words: "trip" and "form" on their own match
 * half an inbox. Swedish included because the second market is Sweden.
 */
export const SCHOOL_TERMS = [
  'school OR academy OR nursery OR preschool OR "class teacher"',
  'OR parentpay OR parentmail OR classdojo OR seesaw OR arbor OR satchel',
  'OR "parents evening" OR "school trip" OR "permission slip" OR "consent form"',
  'OR "PE kit" OR "inset day" OR "half term" OR homework',
  'OR skola OR förskola OR fritids OR föräldramöte OR skolresa OR utvecklingssamtal',
].join(' ');

/**
 * "Is there anything in my inbox that needs me?"
 *
 * Wider than BILL_TERMS and narrower than the whole mailbox. The line this
 * draws matters: GiGi answering "do I have new mail?" must not become GiGi
 * reading every personal message someone received this week, so the query is
 * still a list of terms rather than an unbounded `newer_than:7d`. What is here
 * is the vocabulary of an obligation — something with a deadline, a payment, a
 * date, a form or a reply attached to it. Personal correspondence has none of
 * those words in its subject line, which is exactly why it stays out.
 *
 * Swedish alongside English, because the second market is Sweden and a
 * household there gets "förfaller" and "påminnelse", not "due" and "reminder".
 */
export const ATTENTION_TERMS = [
  BILL_TERMS,
  'OR "action required" OR "action needed" OR reminder OR overdue OR "due date"',
  'OR deadline OR expires OR expiring OR "final notice" OR "payment failed"',
  'OR confirm OR confirmation OR booking OR appointment OR "please reply" OR rsvp',
  'OR delivery OR "your order" OR passport OR visa OR insurance OR "direct debit"',
  'OR påminnelse OR förfaller OR "sista dag" OR "åtgärd krävs" OR obetald OR försenad',
  'OR bokning OR bekräftelse OR tidsbokning OR "svara senast" OR autogiro',
  `OR ${SCHOOL_TERMS}`,
].join(' ');

async function listMessageIds(
  accessToken: string,
  query: string,
  max: number,
): Promise<{ ids: string[]; total: number | null } | { error: string }> {
  const listUrl = new URL(`${GMAIL_API}/messages`);
  listUrl.searchParams.set('q', query);
  listUrl.searchParams.set('maxResults', String(max));

  const res = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: { status?: string } };
    return { error: detail.error?.status ?? `gmail_list_${res.status}` };
  }
  const list = (await res.json()) as {
    messages?: { id: string }[];
    resultSizeEstimate?: number;
  };
  return {
    ids: (list.messages ?? []).slice(0, max).map((m) => m.id),
    total: list.resultSizeEstimate ?? null,
  };
}

/**
 * List matching messages and return only their From/Subject/Date headers.
 *
 * `format=metadata` with an explicit header allow-list is the point: Gmail never
 * sends us a message body, so this cannot leak content even by accident. This is
 * data minimisation at the API call, not in a later filter.
 *
 * Reading message CONTENT is a separate, louder act with its own function
 * (`fetchMessageContent`) and its own trust-log entry. Keeping them apart is
 * deliberate: a search that only ever sees headers must stay provably so.
 */
export async function probeMessages(
  accessToken: string,
  query: string,
  max: number,
): Promise<{ total: number | null; messages: ProbeMessage[] } | { error: string }> {
  const auth = { Authorization: `Bearer ${accessToken}` };

  const listed = await listMessageIds(accessToken, query, max);
  if ('error' in listed) return { error: listed.error };
  const { ids, total } = listed;

  const messages = await Promise.all(
    ids.map(async (id) => {
      const url = new URL(`${GMAIL_API}/messages/${encodeURIComponent(id)}`);
      url.searchParams.set('format', 'metadata');
      for (const header of ['From', 'Subject', 'Date']) {
        url.searchParams.append('metadataHeaders', header);
      }
      const res = await fetch(url, { headers: auth, cache: 'no-store' });
      if (!res.ok) return { from: null, subject: null, date: null };
      const msg = (await res.json()) as {
        payload?: { headers?: { name: string; value: string }[] };
      };
      const header = (name: string) =>
        msg.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? null;
      return { from: header('from'), subject: header('subject'), date: header('date') };
    }),
  );

  return { total, messages };
}

// --- Reading message content (the louder act) --------------------------------
//
// Everything above this line sees headers only. Everything below requests the
// message itself, which is a materially different thing to do to somebody's
// mailbox — different consent, a different trust-log action (`mailbox_read`),
// and a different line in the subprocessor list. The split is kept visible on
// purpose so neither side can quietly grow into the other.

/** Hard ceilings, so one pathological email cannot blow up a request. */
export const MAX_BODY_CHARS = 20_000;
export const MAX_PDFS_PER_MESSAGE = 2;
export const MAX_PDF_BYTES = 4 * 1024 * 1024;

export interface MessageAttachment {
  filename: string;
  mediaType: string;
  /** Standard base64 (not base64url) — what the Anthropic document block wants. */
  data: string;
}

export interface MessageContent {
  id: string;
  from: string | null;
  subject: string | null;
  date: string | null;
  text: string;
  /**
   * schema.org billing data the sender published, when there was any. Read
   * BEFORE the HTML is flattened, because flattening destroys it — and it is
   * the most reliable statement of the amount and dates in the whole message.
   */
  structured: StructuredInvoice | null;
  attachments: MessageAttachment[];
  /** PDFs found but skipped (too large, or past the per-message cap). */
  skippedAttachments: number;
}

/** Gmail encodes body and attachment payloads base64url, without padding. */
function decodeB64Url(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
}

/**
 * Walk the MIME tree once, collecting the best text and any PDF attachments.
 *
 * text/plain wins over text/html when a message offers both — that is the whole
 * point of a multipart/alternative, and the plain part costs far fewer tokens.
 */
function walkParts(
  part: GmailPart | undefined,
  acc: { plain: string[]; html: string[]; pdfs: { id: string; filename: string; size: number }[] },
): void {
  if (!part) return;
  const mime = (part.mimeType ?? '').toLowerCase();

  if (mime === 'text/plain' && part.body?.data) {
    acc.plain.push(decodeB64Url(part.body.data).toString('utf8'));
  } else if (mime === 'text/html' && part.body?.data) {
    acc.html.push(decodeB64Url(part.body.data).toString('utf8'));
  }

  // An invoice is usually the attachment, not the email. Only PDFs: they are
  // what providers actually send, and every other type is either noise
  // (tracking pixels, logos) or something we have no business opening.
  if (mime === 'application/pdf' && part.body?.attachmentId) {
    acc.pdfs.push({
      id: part.body.attachmentId,
      filename: part.filename || 'attachment.pdf',
      size: part.body.size ?? 0,
    });
  }

  for (const child of part.parts ?? []) walkParts(child, acc);
}

async function fetchAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<string | null> {
  const url = `${GMAIL_API}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: string };
  if (!json.data) return null;
  // Re-encode as standard base64: the Anthropic document block rejects base64url.
  return decodeB64Url(json.data).toString('base64');
}

/**
 * Fetch one message in full — headers, body text, and its PDF attachments.
 *
 * `format=full` is the deliberate opposite of the metadata probe above: it
 * returns the message. Callers must have told the user that, and must record
 * `mailbox_read` in the trust log.
 */
export async function fetchMessageContent(
  accessToken: string,
  id: string,
): Promise<MessageContent | { error: string }> {
  const url = new URL(`${GMAIL_API}/messages/${encodeURIComponent(id)}`);
  url.searchParams.set('format', 'full');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: { status?: string } };
    return { error: detail.error?.status ?? `gmail_get_${res.status}` };
  }

  const msg = (await res.json()) as { payload?: GmailPart; snippet?: string };
  const header = (name: string) =>
    msg.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? null;

  const acc = { plain: [] as string[], html: [] as string[], pdfs: [] as { id: string; filename: string; size: number }[] };
  walkParts(msg.payload, acc);

  const html = acc.html.join('\n\n');
  const structured = html ? extractStructuredInvoice(html) : null;
  // The HTML part is preferred over text/plain when there is one: its table
  // structure survives as "label | value", which is exactly what says which of
  // the six numbers on the page is the monthly charge. The plain part has
  // already thrown that away.
  const body = html ? htmlToText(html) : acc.plain.join('\n\n');
  const text = (body || acc.plain.join('\n\n') || msg.snippet || '').slice(0, MAX_BODY_CHARS);

  const wanted = acc.pdfs.filter((p) => p.size <= MAX_PDF_BYTES).slice(0, MAX_PDFS_PER_MESSAGE);
  const attachments: MessageAttachment[] = [];
  for (const pdf of wanted) {
    const data = await fetchAttachment(accessToken, id, pdf.id);
    if (data) attachments.push({ filename: pdf.filename, mediaType: 'application/pdf', data });
  }

  return {
    id,
    from: header('from'),
    subject: header('subject'),
    date: header('date'),
    text,
    structured,
    attachments,
    skippedAttachments: acc.pdfs.length - attachments.length,
  };
}

/** Message ids for a query — the entry point for a content-reading import. */
export async function searchMessageIds(
  accessToken: string,
  query: string,
  max: number,
): Promise<{ ids: string[]; total: number | null } | { error: string }> {
  return listMessageIds(accessToken, query, max);
}
