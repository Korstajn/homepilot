# GiGi — API endpoints (development build)

All endpoints are Next.js route handlers under `src/app/api`. The build is
single-tenant (one seeded household), so no auth header is required; production
gates every route behind Supabase Auth and scopes to the caller's household.

When the **beta gate** is raised (`GIGI_BETA_GATE=on`, `src/middleware.ts`),
every route below also sits behind it: without the `gigi_beta` cookie they
answer `401` with `{ error: … }`. `POST /api/beta` is the only exception — it is
what sets that cookie. The gate is opt-in and currently down, so on the dev
deployment and locally these routes answer directly.

| Method | Path                    | Purpose                                                        |
|--------|-------------------------|----------------------------------------------------------------|
| GET    | `/api/household`        | Current household profile.                                     |
| PATCH  | `/api/household`        | Update profile (name, market→currency+tz, adults, children, digest time/pause, connection status). |
| GET    | `/api/bills`            | Bill register + monthly total + currency.                     |
| POST   | `/api/bills`            | **Add a bill manually** (P0). `provider` required; amount/date optional. |
| PATCH  | `/api/bills/:id`        | Confirm/edit a bill; regenerates today's digest.              |
| DELETE | `/api/bills/:id`        | Remove a bill; regenerates today's digest.                    |
| GET    | `/api/digest`           | Today's digest (`?open=1` marks it opened + tracks event).    |
| POST   | `/api/digest/generate`  | Simulate the 02:00 nightly run for the household.             |
| POST   | `/api/actions`          | Approve-to-execute loop: `{itemId, action: approve\|done\|dismiss}`. Writes the action log. |
| GET    | `/api/value`            | Value tracker: `{savedAnnual, handled, currency}`.            |
| POST   | `/api/events`           | Client instrumentation sink: `{name, props}`.                 |
| GET    | `/api/events`           | Founder metrics: totals + per-event counts + recent events. **Founder-only** (see below). |
| POST   | `/api/feedback`         | In-app feedback: `{kind: wrong_extraction\|general, message}`.|
| GET    | `/api/feedback`         | List feedback (founder view). **Founder-only** (see below).   |
| POST   | `/api/waitlist`         | Two-step waitlist: `{email, segment: household\|company}`.    |
| GET    | `/api/waitlist`         | Waitlist totals by segment + entries (founder view). **Founder-only** (see below). |
| POST   | `/api/contact`          | Landing "get in touch": `{name, email, message}`.             |
| GET    | `/api/contact`          | Message count only — the messages themselves are personal data.|
| POST   | `/api/beta`             | Open the beta gate: `{code}`. Sets the `gigi_beta` cookie for 30 days. Rate-limited per IP. |
| DELETE | `/api/beta`             | Clear the beta cookie — lock this browser out again.          |
| GET    | `/api/auth/me`          | Session + household + capabilities. `session` is `none` \| `active` \| `stale`; `publicSite` says whether this deployment is the public one. |
| GET    | `/api/auth/invite`      | Whether sign-up asks for an invite code: `{required, closed}`. Never returns the codes. |
| GET    | `/api/auth/dev-users`   | Test accounts on this deployment (addresses + names only, never the password). Empty unless `GIGI_DEV_PASSWORD` is set. **404 on the public site.** |
| GET    | `/api/auth/google/start`| Redirect to Google's Gmail consent screen. Needs a real session; refuses the demo household. |
| GET    | `/api/auth/google/callback` | OAuth return leg. Failures redirect back with a fixed `?gmail=<reason>`. |
| GET    | `/api/auth/google`      | Gmail connection status. Never returns the token.             |
| DELETE | `/api/auth/google`      | Revoke the Gmail grant at Google and clear the cookie.        |
| GET    | `/api/gmail/probe`      | Read-only proof the grant works: `From`/`Subject`/`Date` of up to 10 bill-looking emails. Message bodies are never requested. |
| GET    | `/api/gmail/search`     | Search the connected inbox (`days`, `max`, optional `q`). Headers only — still no message bodies. |
| POST   | `/api/gmail/import`     | **Reads message bodies and PDF attachments** for up to 12 emails and adds them as unconfirmed bills. User-triggered; never scheduled. |

## Sign-up and invite codes

`POST /api/auth/signup` takes an `inviteCode` alongside `name`, `email` and
`password`. The invite is checked **first**, before the request is validated at
all, so an uninvited caller cannot use the route's "that email already exists"
answer to test addresses.

| Situation | Status | `code` |
| --- | --- | --- |
| No code sent, one required | 400 | `invite_required` |
| Code sent, not one of ours | 403 | `invite_invalid` |
| Public site with no codes configured | 403 | `signup_closed` |

`POST /api/auth/login` never asks for an invite code: the invite buys the
account, and rotating the codes must not lock out the people who already used
one. See `src/lib/invite.ts` and `.env.example` for `GIGI_INVITE_CODES`.

## Founder-only endpoints

`/api/waitlist` (GET), `/api/feedback` (GET), `/api/events` (GET) and
`/api/diagnostics` are founder tooling — the first two hand out other people's
email addresses and words.

- On a **non-public** build they answer anyone, exactly as before.
- On the **public site** they answer **404** unless the caller presents
  `GIGI_ADMIN_TOKEN`, as an `x-gigi-admin` header or `?token=`.

404 rather than 401 on purpose: a 401 confirms the endpoint exists and invites
guessing at the token.

`/api/auth/demo` and `/api/auth/dev-users` are dev-build only and 404 on the
public site with no token accepted — the demo household is fixture data, and
the test accounts all share one password. See `src/lib/internal.ts`.

## Response conventions

- Success: `{ ok: true, ... }` or the requested resource.
- Validation errors: HTTP 4xx with `{ error: "human message" }`.
- All data-returning GETs are `force-dynamic` where needed so they reflect live
  store state rather than a build-time snapshot.

## Example flows

```bash
# Approve a saving proposal
curl -X POST /api/actions -H 'Content-Type: application/json' \
  -d '{"itemId":"item_xyz","action":"approve"}'

# Add a bill by hand
curl -X POST /api/bills -H 'Content-Type: application/json' \
  -d '{"provider":"BT","type":"broadband","amount":"55","renewalDate":"2026-10-01"}'

# Simulate tonight's nightly run
curl -X POST /api/digest/generate
```
