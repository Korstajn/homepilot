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
**Build choice:** forwarding is the primary path and the only one on the
critical path. The "Connect" step (`/onboarding/connect`) gives the user a
**forward-to-GiGi address**; bills also enter via **manual add**. Neither needs
Google.

**Amended:** Gmail OAuth now exists as an *optional* second route
(`docs/GMAIL_OAUTH.md`), for testers who would rather not set up a filter. It
changes nothing about the analysis above — it is offered **in Testing mode**, so
verification and CASA do not apply, and the 7-day refresh-token expiry is
accepted as the cost. Consequences we own rather than hide:

- The nightly 02:00 job **cannot** read Gmail. The refresh token is sealed into
  the user's own cookie, never stored server-side, so no server job can use it.
  That is the honest shape of this until the Postgres swap. It is also, for now,
  a useful constraint rather than only a limitation: it makes "GiGi reads your
  mailbox only while you are in the app, having pressed a button" true by
  construction rather than by policy.
- Forwarding stays the recommended route in onboarding copy. Gmail is never the
  step a household has to complete.
- Publishing the restricted scope (verification + CASA, 6–10 weeks) is **not**
  started and should not be until the product has earned it.

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

**Open contradiction, deliberately left visible:** connecting Gmail means a
mailbox read on Google's infrastructure, which is not EU-resident. Storage and
inference stay in the EU, but "EU data only" is not the whole truth for a
household that connects Gmail. The trust log records those events with the
region as **"Google (not EU-resident)"** and the subprocessor list on
`/app/data` names Gmail whenever the deployment can offer the grant — but the
privacy *copy* still needs rewriting, and the DPIA needs extending, before this
is offered beyond a closed beta.

**Amended — Gmail import reads message content.** `/api/gmail/import` requests
`format=full` and downloads PDF invoices. The earlier claim that GiGi "never
requests message bodies" now holds only for the search paths, and every place
that said otherwise has been corrected rather than left to age. What this costs,
stated plainly so the DPIA extension has something to work from:

- **Body text is redacted before inference; a PDF is not.** `redactPII` masks
  addresses, phone numbers, postcodes and long digit runs in text. An attached
  invoice goes to the model as it is, and invoices routinely carry a name, a
  postal address and an account number. This is the single biggest gap.
- **A mailbox contains other people's data.** Bill emails are the target, but
  the search is a keyword match, and a household's inbox holds correspondence
  about children and third parties. Prompt 1 is instructed never to extract
  information about other families' children; an instruction is a mitigation,
  not a guarantee.
- **Email content is attacker-controllable.** Anyone can email a household.
  Content read out of a mailbox is now untrusted input reaching a model, so the
  extraction system prompt states that the email is data and never instructions.
  That boundary matters more, not less, the day an extracted bill drives an
  executable action — it is written in now, while the blast radius is a wrong
  row in a register.

The mitigations that hold today: the read is user-triggered only (no scheduled
path exists, and none can while the token lives in the user's cookie), capped at
12 messages per run, logged per message as `mailbox_read`, and everything
extracted lands **unconfirmed**. **The DPIA must be extended before this is
offered beyond a closed beta** — this amendment records what it has to cover.

## Extraction rebuilt around evidence (amended)

The first extractor was measured against realistic billing text and got **one
case in ten right**. The failures were not tuning problems, they were structural:

- `[0-9]+(?:[.,][0-9]{1,2})?` cannot express a thousands separator, so
  `£1,234.56` parsed as **1.23**.
- `text.match()` without `/g` over `subject + from + body` took the FIRST
  currency token, which in a real billing email is a marketing line or a zero
  balance, not the charge. "Save £5 … your monthly price is £62.00" gave **5**.
- The monthly qualifier had to FOLLOW the amount, but UK bills write
  "Monthly charge: £62.00" — label first — so that branch never fired.
- Currency detection picked the wrong capture group in the number-first branch,
  so **every SEK amount was labelled GBP**; `$` mapped to GBP outright; `€`
  returned null.
- A quarterly or annual total was stored as a monthly charge and then multiplied
  by twelve by the savings estimate.
- `findDate` fell back to "any date in the body" — the send date, a footer date
  — which is precisely the guessing the contract forbids.

Two more were worse for being invisible, and only affected the AI path — the one
the product actually ships:

- **`redactPII` destroyed ISO dates before inference.** Its phone pattern
  matched `2027-03-14`, so renewal dates reached the model as `[phone]`.
- **`htmlToText` deleted the machine-readable answer.** Stripping `<script>`
  removed the sender's schema.org `Invoice` markup — exact amount, exact due
  date — and then asked a model to infer both from the remaining prose.

**Build choice:** extraction is now a cascade (schema.org markup → a scored read
of the document → the model) behind one validation gate, and the model is asked
to **locate and quote** values rather than transcribe them, with every quote
re-parsed in code. Amounts are never divided into a monthly figure they did not
state, and a currency outside the household's market is withheld rather than
relabelled. Every value carries its source and the exact text it came from, and
that provenance is shown to the user. The eval set carries each failure above as
a regression case.

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
  necessary (no cookie banner); a strict CSP enforces no tracking, with one
  named exception — a waitlist email also goes to Formspree, client-side, so it
  can send the visitor's confirmation; text is PII-stripped before AI; accounts
  can be email-free with a one-time recovery code. See
  `docs/PRIVACY_ARCHITECTURE.md`.
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
