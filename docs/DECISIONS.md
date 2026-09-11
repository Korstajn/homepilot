# GiGi — build decisions (how the critique shaped this build)

The original MVP doc was reviewed and a set of beta-blocking issues were raised.
This build takes positions on them so the test version doesn't inherit the traps.
Each item below is reflected in the code, not just noted.

## The four things that could stop the beta

### 1. Google OAuth is underestimated → **skip Gmail API in the beta**
`gmail.readonly` is a *restricted* scope: CASA third-party security assessment
on top of normal verification, realistically 6–10 weeks. Testing-mode refresh
tokens also expire after 7 days with sensitive/restricted scopes — a nightly
02:00 job would fail weekly per household.
**Build choice:** no OAuth anywhere. The "Connect" step (`/onboarding/connect`)
gives the user a **forward-to-GiGi address**; bills also enter via **manual add**.
Zero OAuth, zero verification, off the critical path.

### 2. Two markets in one 50-household beta → **single-market default**
The bills vertical is UK-shaped (£, ICO, comparison platforms). Sweden is a
different world (SEK, IMY, Konsumentverket).
**Build choice:** market is a household field (`uk`/`se`) that drives currency
and timezone, but the beta ships **UK-default** (`GIGI_DEFAULT_MARKET=uk`). Sweden
is switchable for testing but is "market two," not run in parallel.

### 3. Insurance switching is likely regulated → **no fee, no in-app execution**
Arranging insurance for a fee looks like FCA-regulated insurance distribution.
**Build choice:** `EXECUTABLE_BILL_TYPES = ['broadband','energy','mobile']`.
Insurance surfaces as *"cheaper option found — here's the link"* with **no
approve/execute button and no success fee**, pending legal review.

### 4. DPIA missing + an EU-data contradiction → **stated, and inference pinned to EU**
Processing family (incl. children's) email is high-risk under UK GDPR art. 35 —
DPIA is mandatory. The doc also contradicts itself: "EU data only" vs. running
the extraction prompt against a non-EU API.
**Build choice:** the privacy page states EU/UK storage **and** EU-region
inference; `ANTHROPIC_REGION=eu` is the documented default, and Render deploys to
`frankfurt`. DPIA is called out in the privacy copy as a pre-onboarding gate.

## Product-logic contradictions resolved

- **Silent assistant can't build a habit** → **minimum mode.** A quiet day still
  emits one line ("All calm today. Next: X in N days.") — see `digest.ts`.
- **Open rate is gameable** → the digest carries a `delivered` flag so
  *delivered-digest rate* can be measured alongside open rate.
- **Max-4 vs. carry-forward** → the digest has an explicit **priority score**
  (carried-forward items get a boost) and an **overflow surface** below the four,
  so nothing disappears silently while the top stays ≤4.
- **Success fee drives noise** → executable savings are ranked but never
  fabricated; `estimateSaving` returns null below a floor so GiGi stays quiet
  rather than inventing a switch to earn a fee.

## P0 gaps that were closed

- **Timezone** is in the household profile (needed for 02:00/07:00 jobs).
- **Manual add-bill is P0**, present in onboarding *and* the bills register.
- **Degraded states**: a dead connection / failed extraction shows as a plain
  digest line and a settings banner — never silence. (Demo toggle in Settings.)
- **Instrumentation from day one**: `analytics_events` + `/api/events`, fired on
  every meaningful action, viewable at `/app/metrics`.
- **In-app feedback channel**: per-item "⚑ report" and a settings form → training
  data for extraction quality.
- **Trust log** (`/app/data`): a per-household, plain-language, hash-chained
  record of everything done with the user's data — the data flow, never the
  content. Doubles as the GDPR record of processing and makes the EU-inference
  question visible rather than hidden. See `docs/DATA_TRUST.md`.
- **Privacy architecture** (pseudonymity by design): strong identifiers (email,
  password, recovery) live in a separate **identity vault** keyed by an opaque
  `subjectId`; the content store (bills/digests/processing) is keyed by opaque
  ids only, so a content dump isn't linkable to a person. Sessions are opaque
  server-side tokens (the cookie holds no id/PII), first-party and strictly
  necessary (no cookie banner); a strict CSP + zero third parties enforce no
  tracking; text is PII-stripped before AI; accounts can be email-free with a
  one-time recovery code. See `docs/PRIVACY_ARCHITECTURE.md`.
- **Family accounts** (`/app/family`): the household is the shared unit; auth
  moved from household to **member**. Three login roles — owner (manages
  members), adult/co-parent (can approve + manage bills), teen (limited view:
  no finances, no approvals, enforced server-side). Younger **children** are
  profiles with no login, for school/passport association. Invites are share
  links (`/join/<token>`; emailed in production). Adding a person is a
  data-governance event and is written to the trust log; children's details are
  treated as special-category data — minimal, never shared with other families,
  erased on request.

## Still open (flagged, not silently dropped)

- **Voice agent** ("Sign up + Voice agent" in §4.1) is undesigned — left out of
  this build deliberately; needs a spec before it's P0.
- **Calendar write-back** requires a second consent flow; out of this build.
- **Extraction eval set** (≥95% precision target on amount/renewal) is a
  data/ops task, not a screen — tracked as a launch gate, not built here.
- **Founder capacity** (onboarding calls, concierge switches, invoicing) is the
  real bottleneck and lives in ops, not this repo.
