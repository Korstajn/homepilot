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
export function redirectUri(req: Request): string {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) return configured;

  const url = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  return `${proto}://${host}/api/auth/google/callback`;
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
 * The default search GiGi would use. Bounded in time, skips spam and trash, and
 * includes Swedish terms because the second market is Sweden (DECISIONS.md §2).
 */
export const DEFAULT_GMAIL_QUERY =
  '(invoice OR bill OR receipt OR renewal OR faktura OR kvitto OR förnyelse) newer_than:60d -in:spam -in:trash';

/**
 * List matching messages and return only their From/Subject/Date headers.
 *
 * `format=metadata` with an explicit header allow-list is the point: Gmail never
 * sends us a message body, so the probe cannot leak content even by accident.
 * This is data minimisation at the API call, not in a later filter.
 */
export async function probeMessages(
  accessToken: string,
  query: string,
  max: number,
): Promise<{ total: number | null; messages: ProbeMessage[] } | { error: string }> {
  const auth = { Authorization: `Bearer ${accessToken}` };

  const listUrl = new URL(`${GMAIL_API}/messages`);
  listUrl.searchParams.set('q', query);
  listUrl.searchParams.set('maxResults', String(max));

  const listRes = await fetch(listUrl, { headers: auth, cache: 'no-store' });
  if (!listRes.ok) {
    const detail = (await listRes.json().catch(() => ({}))) as { error?: { status?: string } };
    return { error: detail.error?.status ?? `gmail_list_${listRes.status}` };
  }
  const list = (await listRes.json()) as {
    messages?: { id: string }[];
    resultSizeEstimate?: number;
  };

  const ids = (list.messages ?? []).slice(0, max).map((m) => m.id);
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

  return { total: list.resultSizeEstimate ?? null, messages };
}
