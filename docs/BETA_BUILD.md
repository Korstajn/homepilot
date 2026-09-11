# GiGi — the development build

A tour of the app in this repo. The whole experience runs as a single Next.js
app with seeded data and **no external services or API keys required to boot**.

Deploying it (dev.getgigiapp.com, beta code, DNS) is a separate document:
[`DEPLOYMENT.md`](DEPLOYMENT.md).

> Design language note: the **product UI** is driven by design tokens at the top
> of `src/app/globals.css` — reskinning it is a one-file change. The **marketing
> landing page** is a separate, scoped system in `src/app/landing.css`, ported
> from the approved design at
> [`reference/landing-reference.html`](reference/landing-reference.html). The two
> cannot collide; see [`MIGRATION_ANALYSIS.md`](MIGRATION_ANALYSIS.md) §3.

## Run it locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Deploy it

See [`DEPLOYMENT.md`](DEPLOYMENT.md). Short version: `render.yaml` is a Render
blueprint that builds and starts the app in the EU (Frankfurt), health-checked;
set `GIGI_BETA_CODE` in the dashboard and attach `dev.getgigiapp.com`.

The only environment variable a deployment needs is the beta code.
`.env.example` lists the ones you'll add later (Anthropic, Supabase).

## The beta code

The deployed dev build is gated: every path redirects to `/beta` until a visitor
enters the shared code, which then sticks to that browser for 30 days. Locally,
with `GIGI_BETA_CODE` unset, the gate is off and the site opens normally.

Once past the gate, a **"Beta build · Open the app →"** pill in the bottom-right
corner of the landing page takes you into the product — the public landing
design has no log-in link, so that pill (and typing `/login` or `/app` directly)
is how testers get in. It never renders when the gate is off.

## Logging in

The build now has a real **sign-up / log-in** with sessions:

- **`/signup`** — create an account (name, email, password). You get your own
  fresh household (seeded with a couple of example "found" bills) and land in
  onboarding.
- **`/login`** — log back into that account, or hit **"Just show me the demo"**
  to explore the ready-made demo household with no account.
- The landing page itself has no log-in link (it is the public marketing
  design); use the beta pill, or go to `/login` or `/app` directly.
- Log out from **Settings**. Sessions are a signed cookie; passwords are scrypt-
  hashed in the in-memory store (production swaps this for Supabase Auth).

> It's a test build: accounts live in memory and reset on redeploy. No email
> verification, no password reset — those come with the real auth backend.

## What to try

- **Landing** (`/`) — the approved marketing page: hero, verticals, how it
  works, early results, FAQ + waitlist, final CTA and "get in touch". Both
  waitlist forms and the contact form post to our own API, not a third party.
- **Onboarding** (`/onboarding`) — profile → connect (forward-to-GiGi, plus optional read-only Gmail — see [`GMAIL_OAUTH.md`](GMAIL_OAUTH.md))
  → bills-found (confirm/edit + **add manually**) → "GiGi is running".
- **Today** (`/app/digest`) — the core surface: ≤4 items, urgency dots, approve /
  mark-done / dismiss, an **overflow** area, **minimum mode** on a quiet day, and
  a per-item **⚑ feedback** report.
- **Home** (`/app`) — value tracker, next renewal, and a button to **simulate
  tonight's 2am run**.
- **Family** (`/app/family`) — invite a **co-parent** (can act) or a **teen**
  (limited view — no finances, no approvals) via a share link, and add **child
  profiles** (no login) for school/passport association. Roles are enforced
  server-side; every change is in the trust log. Reachable from Settings and the
  end of onboarding; invitees join at `/join/<token>`.
- **Your data** (`/app/data`) — the **trust log**: a plain-language, hash-chained,
  append-only record of everything GiGi did with your data, plus the full
  subprocessor list. Reachable from Home and Settings.
- **Settings** (`/app/settings`) — digest time/timezone/pause, data deletion
  (which is itself recorded in the trust log), and a demo toggle to **simulate a
  dropped connection** (see the degraded state).
- **Metrics** (`/app/metrics`) — the founder view of the instrumentation.

## Project layout

```
src/
  app/
    page.tsx              marketing landing (ported from the design reference)
    landing.css           the landing's scoped design system
    beta/                 the beta-code gate screen
    privacy/              privacy page
    onboarding/           profile → connect → bills → done
    app/                  digest · bills · settings · metrics · home (tab bar)
    api/                  household, bills, digest, actions, value,
                          events, feedback, waitlist, contact, beta
  middleware.ts           the beta gate: fronts every route
  lib/
    types.ts              domain types (mirror db/schema.sql)
    store.ts              in-memory store + seed (swap for Supabase)
    beta.ts               beta-gate rules (Edge-safe: Web Crypto only)
    digest.ts            digest ranker = the "Prompt 2" output contract
    money.ts, analytics.ts
  components/
    landing/              one component per landing section
    ...                   TabBar, AddBill, OnboardingProgress
db/schema.sql             production Postgres schema
docs/                     ARCHITECTURE · API · DECISIONS · DEPLOYMENT
docs/reference/           the approved landing design, unchanged
CLAUDE.md                 the two-prompt AI spec
render.yaml               Render blueprint (dev.getgigiapp.com)
```

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system shape, real vs. simulated.
- [`API.md`](API.md) — every endpoint.
- [`DECISIONS.md`](DECISIONS.md) — **how the beta-risk critique shaped this build** (skip Gmail OAuth, single market, no insurance fee, DPIA/EU-inference, P0 gaps closed).
- [`FORWARDING.md`](FORWARDING.md) — **how to try the forward feature** (in-app tester with zero setup; real email via Postmark/Cloudflare on free Render; optional AI extraction).
- [`DATA_TRUST.md`](DATA_TRUST.md) — **the trust log**: a per-household, plain-language, hash-chained record of everything done with the user's data (`/app/data`), doubling as the GDPR record of processing.
- [`PRIVACY_ARCHITECTURE.md`](PRIVACY_ARCHITECTURE.md) — **pseudonymity by design**: identity/content split (opaque `subjectId` + identity vault), opaque sessions with no tracking cookies, strict CSP, PII-stripping before AI, and email-free accounts with recovery codes.
- [`AI_FEATURES.md`](AI_FEATURES.md) — **turning on Claude**: real bill extraction, the extraction **eval** (precision/recall vs the 95% gate at `/app/eval`), and the **voice assistant** (`/app/voice`, read/answer only — never executes). All enabled by `ANTHROPIC_API_KEY`.
- [`db/schema.sql`](../db/schema.sql) — the production schema.
- [`CLAUDE.md`](../CLAUDE.md) — extraction + digest prompt contracts.

## Graduating to production

The API layer only ever touches `src/lib/*`, so each of these is a localized swap,
not a rewrite:

| Swap | From | To |
|------|------|----|
| Data | `src/lib/store.ts` | Supabase Postgres (`db/schema.sql`) |
| Extraction | seeded bills | Anthropic Prompt 1 (EU region) |
| Digest | `buildDigest` in `digest.ts` | Anthropic Prompt 2 (same contract) |
| Nightly job | `POST /api/digest/generate` | Inngest 02:00 scheduled function |
| Push | in-app "Today" | Expo Notifications 07:00 |
