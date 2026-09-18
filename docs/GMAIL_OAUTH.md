# Connecting Gmail (OAuth 2.0)

GiGi's default way in is still **forward-to-GiGi** (`docs/FORWARDING.md`): zero
account access, nothing to verify with Google, off the critical path. This page
covers the *optional* second route — letting GiGi read bill emails straight from
a Gmail inbox.

## First: an API key is not what Gmail needs

A Google **API key** identifies your *app* and only opens public data. Gmail has
none. Reading somebody's mailbox needs **OAuth 2.0** — a Client ID, a Client
Secret and the user's explicit consent. `users.messages.list` with only an API
key returns `401 UNAUTHENTICATED`, every time.

So the two variables below are a Client ID and Client Secret from
**Credentials → OAuth client ID**, not from **Credentials → API key**.

## Environment variables

| Variable | Required | What it does |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | for Gmail | OAuth 2.0 client ID (`…apps.googleusercontent.com`). |
| `GOOGLE_CLIENT_SECRET` | for Gmail | The matching client secret. |
| `GOOGLE_REDIRECT_URI` | on any host | Must equal the redirect URI registered in Google Cloud Console **byte for byte**. |

Leave all three unset and the Connect-Gmail card renders as "Unavailable" and
every Gmail route refuses — forwarding is unaffected.

`GOOGLE_REDIRECT_URI` is derived from the incoming request when unset, which is
fine locally but wrong on Vercel: preview deployments get a new hostname on
every push and none of them are registered with Google. Set it explicitly.

## Google Cloud Console setup

1. **APIs & Services → Library → Gmail API → Enable.**
2. **OAuth consent screen**, User type *External*. Fill in the app name, support
   email, and the privacy policy + terms URLs.
3. **Google Auth Platform → Audience → Test users → + Add users**: the Google
   accounts that may connect (max 100). Anyone not on this list is refused with
   `403: access_denied`, **the project owner included** — add yourself here too.
   Takes effect immediately; nothing to redeploy.
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   Under *Authorized redirect URIs* add exactly:
   `https://<your-domain>/api/auth/google/callback`
5. Copy the client ID and secret into the environment variables above, then
   **redeploy** — a dashboard change never reaches a deployment that already
   exists.

### Scopes GiGi asks for

| Scope | Sensitivity | Why |
| --- | --- | --- |
| `openid`, `email` | non-sensitive | So the app can show *which* account is connected. |
| `gmail.readonly` | **restricted** | Read bill emails. Read-only: GiGi cannot send, delete or modify anything. |
| `calendar.calendarlist.readonly` | sensitive | List which calendars the account has, so the household can pick. Names only — no events. |
| `calendar.events.readonly` | sensitive | Read events on the calendars they ticked. Read-only: GiGi cannot add, move or delete anything. |

The two calendar scopes are the **granular pair**, not the blanket
`calendar.readonly`. They cannot touch sharing, ACLs or settings, and neither
can write. The blanket scope would also have worked and would have asked for
more than the feature needs.

**Mail access is not calendar access, and the reverse.** A connection made
before the calendar scopes were added works perfectly for Gmail and cannot read
a single calendar. `missingScopes()` in `src/lib/google.ts` is what detects that;
`/api/calendar/google` reports it as `needsReconnect` so the UI can say
"reconnect to add calendar access" rather than the untrue "not connected".
Google also lets a user untick individual scopes on the consent screen, so
"connected" never implies "connected for everything".

## Testing mode vs. publishing — read this before planning around it

`gmail.readonly` is one of Google's **restricted** scopes. That has two
consequences, and the first one bites during a beta:

- **In Testing mode, refresh tokens expire after 7 days.** Every connected
  household has to re-consent weekly. A nightly 02:00 job would fail weekly per
  household, which is exactly why `docs/DECISIONS.md` §1 kept OAuth off the
  critical path.
- **Testers see an "unverified app" warning** (Advanced → Go to … (unsafe)).

Publishing removes both, but requires Google verification **plus a CASA
third-party security assessment** — realistically 6–10 weeks. Do not start that
before the product has earned it.

**Recommendation for the beta:** stay in Testing mode, keep forwarding as the
recommended route in onboarding, and treat Gmail as a convenience for testers
who would rather not set up a filter.

### The domain constraint

Google requires an *authorized domain* you can verify ownership of in Search
Console. `*.vercel.app` is a shared domain and cannot be verified, so before
verification you need a real custom domain
(`dev.getgigiapp.com`) pointed at the deployment. Redirect URIs on
`*.vercel.app` are usually accepted while in Testing mode — enough to develop
against, not enough to publish.

Note also that `src/middleware.ts` puts the whole origin behind the beta code,
`/privacy` included. Google's consent screen links to it and its reviewers must
reach it, so that path has to be excluded from the gate before you apply for
verification.

## What GiGi stores

The refresh token is **sealed (AES-256-GCM) into an httpOnly cookie** and never
written to the server store — it lives in the user's own browser. See
`src/lib/google.ts` and `src/lib/secrets.ts`.

That is a better privacy position than a database row, and it is also the only
option while the store is in-memory. The trade-off is real and worth stating:
**a token in the user's cookie cannot be used by a server-side job**, so the
nightly digest cannot read Gmail yet. That needs the Postgres swap
(`db/schema.sql`) plus an encrypted `google_connections` table.

Disconnecting calls Google's revoke endpoint and clears the cookie. Logging out
clears it too, so the next person on a shared browser does not inherit the
connection.

## Data minimisation

There are two tiers, and the split is the whole design.

**Searching never reads content.** `/api/gmail/probe` and `/api/gmail/search` ask
Gmail for `format=metadata` with a `From`/`Subject`/`Date` allow-list. Message
bodies are **never requested** on these paths — not fetched and filtered, never
asked for. Every search is bounded in time and excludes spam and trash, composed
through one function, `buildGmailQuery`.

**Importing does read content, and says so first.** `/api/gmail/import` asks for
`format=full` and downloads PDF attachments, because an amount and a renewal
date are almost never in a subject line — header-only extraction under Prompt
1's "null over guessing" rule returns a column of nulls. That is the honest
reason the tier exists, and it is gated to match: a real session, never the demo
household, a `manageBills` capability check, an explicit POST the user triggers
by pressing a button, at most 12 messages per run, and **no scheduled path at
all**. Each email opened writes a `mailbox_read` entry to the trust log,
separately from `mailbox_searched`.

`redactPII` masks emails, phone numbers, postcodes and long digit runs in body
text before it leaves for inference. **It cannot do the same to a PDF** — the
attachment goes to the model as-is. That is a real gap, stated rather than
hidden, and it is the main thing to weigh before this is offered beyond a closed
beta.

Connecting, disconnecting and each inbox search are written to the household's
trust log (`inbox_connected`, `inbox_disconnected`, `mailbox_searched`) with
Google named as the actor and the region recorded honestly as
**"Google (not EU-resident)"**. Gmail also appears in the subprocessor list on
`/app/data` whenever the deployment *can* offer the grant — not only once
somebody has taken it.

This is the one place the "EU data only" claim needs care: inference stays in the
EU and storage stays in the EU, but a mailbox read by definition involves
Google's infrastructure. `docs/DECISIONS.md` §4 should be revisited before this
is offered outside a closed beta.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /api/auth/google/start?next=…` | Redirect to Google's consent screen. Requires a real session; refuses the demo household. |
| `GET /api/auth/google/callback` | Exchange the code, seal the connection. Failures redirect back with a fixed `?gmail=<reason>` code. |
| `GET /api/auth/google` | Connection status. Never returns the token. |
| `DELETE /api/auth/google` | Revoke at Google, clear the cookie. |
| `GET /api/gmail/probe?max=5` | Read-only proof the grant works: subject lines only. |
| `GET /api/gmail/search?days=30&max=25` | Search the inbox. Subject lines only; terms stay inside the bill-hunting frame. |
| `POST /api/gmail/import` `{days}` | **Reads message content and PDF attachments** and adds unconfirmed bills. User-triggered only. |

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `redirect_uri_mismatch` | `GOOGLE_REDIRECT_URI` differs from the registered URI. They must match exactly, scheme and trailing path included. |
| `?gmail=no_refresh` | Google returned no refresh token. Normally prevented by `prompt=consent`; if it persists, remove GiGi under the account's third-party access and connect again. |
| `?gmail=state` | The state cookie expired (10 min) or the callback was reached out of band. Start again. |
| `?gmail=demo` | You are in the demo household. Log into a real account first. |
| "Google has expired this connection" | Testing-mode 7-day refresh-token expiry. Reconnect. |
| `Fel 403: access_denied` on Google's screen ("has not completed Google's verification process") | The account is not in the test-user list. Google Auth Platform → **Audience** → **Test users** → add it. Takes effect immediately, no redeploy. The project owner is not exempt — add yourself too. |
