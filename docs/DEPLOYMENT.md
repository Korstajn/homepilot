# Deployment — dev.getgigiapp.com

The GiGi app in this repo is a development build. Its home is
**dev.getgigiapp.com** and it is not indexable. The public marketing domain
(getgigiapp.com / www) is a separate deployment and is not changed by shipping
here.

**The beta gate is currently off.** While the build is reachable only at its own
`*.vercel.app` hostnames, a shared code in front of it buys nothing and costs
every tester a paste. Raising it again once the domain is attached is one
variable: `GIGI_BETA_GATE=on`. Being ungated is not being public — `robots.txt`
still disallows everything, and the app's own login still stands in front of
every household.

| | dev.getgigiapp.com | getgigiapp.com |
| --- | --- | --- |
| Serves | this repo's Next.js app | the public site |
| Beta code | opt-in (`GIGI_BETA_GATE=on`) | n/a |
| Indexable | no (`robots.txt` disallows all) | yes |
| Data | seeded, in-memory, resets on redeploy | n/a |

## Environment variables

| Variable | Value on dev | What it does |
| --- | --- | --- |
| `GIGI_BETA_GATE` | *(unset)* | The only thing that raises the gate. `on` ⇒ a code is required; anything else ⇒ the site serves openly. |
| `GIGI_BETA_CODE` | the shared code | The code testers type when the gate is up. Harmless to leave set while it is down. Gate on with no code ⇒ **503, fail closed**. |
| `GIGI_SITE_ENV` | `development` | Anything but `production` ⇒ `robots.txt` disallows everything. |
| `GIGI_DEFAULT_MARKET` | `uk` | Market for new households (`uk` \| `se`). |
| `NODE_VERSION` | `22` | `package.json` engines allows 20–22. |
| `GIGI_SESSION_SECRET` | 32 random bytes | Signs session cookies. Needed for logins to survive on serverless — see below. |
| `GIGI_DEV_PASSWORD` | the shared test password | Enables the test accounts. **Unset ⇒ no test accounts exist.** |
| `GIGI_DEV_USERS` | *(optional)* | `email:Name, email:Name`. Defaults to two accounts on `example.com`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | *(optional)* | Gmail OAuth client. Unset ⇒ Connect-Gmail shows "Unavailable". |
| `GOOGLE_REDIRECT_URI` | `https://<domain>/api/auth/google/callback` | Must match Google Cloud Console exactly. |

`.env.example` documents the rest (Anthropic, Supabase) — none of them are
needed to boot.

## Accounts on Vercel: what works and what doesn't

The store is in-memory (`src/lib/store.ts`), built for one long-lived Node
process. Vercel is serverless, so each instance has its own copy and instances
are recycled. Two consequences:

- **Test accounts work.** `GIGI_DEV_USERS` accounts are *derived* from the
  environment, not stored — every instance computes the identical household id,
  member id and subject id, so a session minted on one instance resolves on the
  next. This is the way to have a working login today.
- **Sign-up still doesn't persist.** `/api/auth/signup` creates a household in
  one instance's memory. It no longer degrades silently, though: a session cookie
  that verifies but whose member is gone reports `session: "stale"` on
  `/api/auth/me`, and the app shows "You're signed out" instead of quietly
  serving the demo household's bills as if they were the user's own.

Both go away with the Postgres swap in `db/schema.sql`.

Set **`GIGI_SESSION_SECRET`** (`openssl rand -hex 32`). Without it the signing
key falls back to `GIGI_DEV_PASSWORD`, and without that to a per-process random
key — under which every login is lost on the next request.
`GET /api/auth/dev-users` reports which of the three is in play.

## Verifying a deploy: `GET /api/diagnostics`

Open it on the deployment you just redeployed. It reports **presence, never
values** — which variables this build can see, which deployment is answering
(`VERCEL_ENV`, branch, commit), the resolved Google redirect URI to compare
against Google Cloud Console, and a `warnings` array naming what is actually
misconfigured.

It exists because the two ways this goes wrong are invisible from outside: a
variable scoped to **Production** only cannot be seen by a preview build, and a
dashboard change never reaches a deployment that already exists. Both look
exactly like never having set it.

Lock it down or remove it before this origin serves the public site.

## Getting into the app

The landing page's nav has a **Log in** link (kept outside `.nav-links`, which
is hidden under 760px, so it survives on a phone). Direct paths:

| Path | What it is |
| --- | --- |
| `/login` | Log in. Lists the `GIGI_DEV_USERS` test accounts when they are enabled. |
| `/app/settings` | **Connect Gmail** lives here, and on `/onboarding/connect`. |
| `/api/diagnostics` | Configuration check for this deployment. |

## Render (recommended, and what `render.yaml` provisions)

Render is the primary target: one EU region for the whole service (Frankfurt),
which is what keeps "EU data only" (docs/DECISIONS.md §4) true end to end, and
it runs the `output: 'standalone'` build in `next.config.mjs` as-is.

1. Render → **New + → Blueprint**, point at this repo, **Apply**.
   `render.yaml` sets build, start, health check and region.
2. To gate the service, set **`GIGI_BETA_GATE=on`** and **`GIGI_BETA_CODE`** in
   the dashboard (the blueprint marks the code `sync: false`, so it is never
   committed). With the gate on and no code, the service answers every request
   with a 503 explaining why — it will not fall open.
3. Service → **Settings → Custom Domains** → add `dev.getgigiapp.com`, then
   create the CNAME Render shows you at the getgigiapp.com registrar.
4. Open `https://dev.getgigiapp.com`. Gated, you type the code once and are in
   for 30 days on that browser; ungated, you are simply in.

## Vercel (alternative)

`vercel.json` pins serverless functions to `fra1` (Frankfurt) and declares the
Next.js framework. If you deploy here instead:

- Set the same environment variables in **Project → Settings → Environment
  Variables**, and add `dev.getgigiapp.com` under **Domains**.
- Note that Vercel's middleware runs at the **edge worldwide**, not only in
  `fra1`. The beta gate only hashes a cookie (and is a pass-through when the
  gate is down), so no household data is processed there — but if the EU-only
  guarantee is ever extended to request handling in general, Render is the
  cleaner fit.
- `output: 'standalone'` is ignored by Vercel. Harmless.

## Before this repo ever serves the public site

The root of this repo used to be a single static `index.html`; it now builds a
Next.js app. Two consequences worth knowing:

1. Any host still wired to serve this repo's root as a static site will now
   serve the app instead. The approved landing design is preserved verbatim at
   `docs/reference/landing-reference.html` and is rendered by `src/app/page.tsx`.
2. `GIGI_SITE_ENV=production` is the explicit "this is the public site" switch,
   and the only thing that makes a deployment crawlable. Taking the beta gate
   off does **not** do it — that separation is deliberate, so an ungated dev
   build can never drift into search results.

## Locking yourself out again (testing the gate)

```bash
curl -X DELETE https://dev.getgigiapp.com/api/beta   # clears the beta cookie
```
