# GiGi

**A proactive chief of staff for a household.** Bills, school, travel and the
family calendar, watched around the clock, reduced to one morning digest of at
most four things — each of which is an action, and none of which happens without
a tap.

The product's whole claim is that it **reduces** what a parent has to hold in
their head. Every decision in this repo is downstream of that: four items, not
forty; a null rather than a guessed amount; silence on a calm day.

---

## The seven standing rules

These apply to every session, every change, without being restated.

### 1. No bugs. Fix what you find, even when it isn't yours.

If you notice a bug while working on something else — a missing authorization
check, an unawaited promise, an input that reaches the database unvalidated —
**fix it in the same change**. Do not note it for later; later does not come.
Say in the commit message that you did and why.

"It was already broken" is not a reason to leave it broken. "It is out of scope"
applies to features, never to defects.

### 2. Build for many households, from the first line.

Assume this runs for a hundred thousand households, not for the one in front of
you. Concretely:

- **No N+1.** A screen that needs bills, children and events makes one round
  trip, not three. A list of members fetches their emails in a join, not a query
  per member.
- **Scope in the WHERE clause**, never by filtering in JavaScript afterwards.
  A query that fetches a table and filters in memory is a query that stops
  working at scale and leaks rows when it has a bug.
- **Every query an index can serve.** If you write a new one, check there is an
  index for it; if you add an index, name the query that needs it.
- **Concurrency is the normal case.** Two requests will hit the same row at the
  same time. Read-modify-write in application code is a lost update; do it in
  SQL, or under a lock, and say which.
- **Bound everything.** Every list query has a LIMIT. Every external fetch has a
  timeout. Every loop over user input has a ceiling.

### 3. Quality over speed of delivery.

Working, readable, and correct at the edges — not "it renders". If a change
needs a validation path, an error state and an empty state, it needs all three
before it is done. Comments explain **why**, never what; the code already says
what.

### 4. Use current techniques.

Next.js App Router, React Server Components where they fit, modern TypeScript,
the Claude API's current features (strict tool schemas, tool use, EU inference
pinning). When two approaches work, prefer the one that will still be the right
answer in two years. Do not add a dependency that earns less than it costs.

### 5. Speed is a feature.

The digest is opened on a phone, before breakfast, on a bad connection. Latency
budget comes first:

- one round trip beats three, always;
- signed session tokens beat a session-table lookup on every request;
- nothing is fetched before a question needs it;
- cache what is stable (the forecast is cached for an hour, per postal district,
  shared between households in it).

### 6. Think about how requests route, and do not waste compute.

Before adding a call, ask what it costs and whether the answer is already in
hand:

- A model call is the most expensive thing in this codebase. Deterministic code
  answers first; the model is asked only what only a model can answer. See the
  extraction cascade and the assistant's tools.
- Reads that fall back to the demo household must not become writes.
- `React.cache` dedupes per-request work (`currentMember` is resolved once per
  request however many times it is asked for).
- Do not prefetch on the chance it is needed. Do not re-derive what you already
  computed.

### 7. Test before release. Everything.

Nothing ships on "it compiles". For any non-trivial change:

1. `npx tsc --noEmit` — clean.
2. `npm run build` — clean.
3. **Run it against a real Postgres** and exercise the paths you touched
   end to end. `createdb gigi_dev && DATABASE_URL=postgresql://localhost/gigi_dev npm run dev`.
4. For anything concurrent, prove it under concurrency — fire 40 parallel
   requests at it and check the invariant still holds.
5. For anything visual, look at it, at desktop width and at 390px.

Report what you actually ran. If you could not test something, say so and say
why — never imply coverage you do not have.

---

## What the thing is

```
Marketing (/, /story, /privacy)  ──►  Sign-up  ──►  /app
   landing.css design system          AuthFrame     phone-shaped shell
```

- **Public pages** — `src/app/page.tsx`, `/story`, `/privacy`. All three use the
  `landing.css` design system scoped under `.landing`, and share `LandingNav` /
  `LandingFooter`. A new public page uses that system; it does not invent one.
- **Auth + onboarding** — `AuthFrame`, CSS-only two-column on desktop.
- **The app** — `/app/*`. Every screen is a **client component** that talks to
  `/api/*`. No server component touches the store, which is what keeps the data
  layer in one place.

### Directory map

```
src/app/
  page.tsx, story/, privacy/   marketing — landing.css design system
  login/, signup/, onboarding/ AuthFrame
  app/                         the product (client components, fetch /api)
  api/                         every route handler; the ONLY store consumers
src/lib/
  db.ts            connection, pooling, self-applying migrations
  store.ts         every read and write, async, Postgres
  auth.ts          sessions, roles, capabilities; writeSession for mutations
  require-session.ts  the guard every mutating route goes through
  types.ts         the domain model — mirrors db/migrations 1:1
  digest.ts        the ranking contract (Prompt 2, deterministic reference)
  extraction.ts    the bill cascade (Prompt 1)
  school.ts / school-ingest.ts   school email → planned calendar items
  weather.ts       forecast → what to dress a child in
  inbox.ts         subject-line triage for the assistant
  assistant-tools.ts   what GiGi may go and look up (Prompt 3)
  calendar.ts / ics.ts   the family calendar and its feed
  google-calendar.ts     the read-only Google Calendar client (an interface)
  calendar-sync.ts       window reconcile: Google in, nothing ever out
db/migrations/     the schema. See db/README.md.
docs/              longer-form design notes per subsystem
```

---

## The data layer

**Postgres (Supabase), through `postgres.js`.** There is no in-memory fallback
and there must never be one: a store that silently degrades to memory loses a
household's data while reporting success.

- `src/lib/db.ts` resolves the connection string from `DATABASE_URL`,
  `POSTGRES_URL`, `SUPABASE_DB_URL`, `POSTGRES_PRISMA_URL` or
  `POSTGRES_URL_NON_POOLING`, in that order.
- **Use the transaction pooler (port 6543) in production.** Prepared statements
  are disabled automatically when the URL points at one — they cannot work in
  transaction mode, and the failure is intermittent and badly named.
- The pool is **small per instance** (3). Concurrency comes from there being
  many instances.
- **Migrations apply themselves**, once, under an advisory lock, each in its own
  transaction. Never edit an applied migration; add another. See `db/README.md`.
- **Seeding** (the demo household, `GIGI_DEV_USERS`) is idempotent and runs under
  its own lock. It must never call back through `conn()` — that path is the seed
  promise itself, and re-entering it deadlocks the whole instance.
- `/api/diagnostics` reports whether the database is configured, reachable, and
  **in the EU**. `/privacy` promises EU storage; that page has to stay true.

### Rules for touching data

- Every store function is `async` and starts from `conn()`.
- Row mappers are the only place a column becomes a field. `numeric` comes back
  as a string; `date` as a UTC-midnight `Date`. Do not parse a row anywhere else.
- **Reads may fall back to the demo household. Writes may not.** Mutating routes
  go through `requireSession()` and answer 401 without one — with one shared
  database, the old `resolveMember()` fallback let an anonymous caller edit the
  demo household for everybody.
- A route that takes an id must check the row belongs to the caller's household,
  and answer **404** when it does not (not 403 — "not yours" and "does not
  exist" must be indistinguishable).

---

## Google Calendar sync

One direction, read-only, and it must stay that way. Google is the source of
truth; GiGi holds a reflection. There is no write path in
`src/lib/google-calendar.ts` and none may be added — "keeping both sides in
step" is how a sync deletes somebody's dentist appointment because our copy was
stale.

- **Gmail access is not calendar access.** `gmail.readonly` grants a mailbox and
  nothing else. Calendar needs its own scopes, so every connection made before
  this feature existed works for mail and cannot read a calendar. That state is
  reported as `calendarAccess: false, needsReconnect: true` and gets its own
  sentence — telling someone "not connected" would send them looking for a
  setting that is already on.
- **Nothing is imported until a calendar is ticked**, and the household says what
  each one IS (school / travel / appointment / other). The digest ranks by
  category, so GiGi does not guess that a calendar called "Skola" is the school
  one.
- **Window reconcile, not sync tokens.** Every run makes the window match
  Google, so any drift — a bug, a failed run, a missed page — is repaired on the
  next sync rather than persisting invisibly. Deletion is scoped to the calendar
  AND the window: an event outside it was not in this response and must not be
  read as "Google no longer has this".
- **Imported rows are not editable**, in the store as well as the UI
  (`source = 'manual'` in the update and delete clauses). An edit would be
  overwritten on the next sync and a delete would reappear.
- **Sync runs when the household is here.** The refresh token lives in an
  encrypted cookie in their browser, not on our server, so there is no
  background sync and the 02:00 digest uses whatever the last visit brought in.
  Changing that means holding a live credential per household in the database —
  a trade to make deliberately, not by accident.

`scripts/test-calendar-sync.mjs` drives the whole thing against a stub Google
and a real Postgres. Run it when you touch any of this.

---

## Privacy is architecture, not copy

These are enforced in code, and a change that weakens one is a change that needs
a conversation, not a commit:

- **The identity vault is separate.** Email, password hash and recovery hash
  live in `identities`, joined to content only by an opaque `subject_id`. No
  content table carries a strong identifier.
- **Data minimisation at the call.** The weather service gets an outward postcode
  ("SW1A"), never a full one. Gmail search asks for `format=metadata` with a
  header allow-list, so a body cannot be returned even by accident.
- **Reading headers and reading a message are different acts**, with different
  functions and different trust-log entries. Keep them apart.
- **Other families' children are dropped in code**, not asked of the model. The
  only names GiGi looks for are children the household entered; any sentence
  naming an unknown child is dropped whole and counted.
- **The trust log is hash-chained and append-only.** Appends take a per-household
  advisory lock inside a transaction, ordered by `seq`. Anything that writes on
  a household's behalf writes a plain-language entry — metadata only, never an
  amount or an email body.
- **Nothing acts without a tap.** GiGi has no ability to send, reply, pay, book
  or switch. Do not give it one.

---

## AI contract

Inference runs in an **EU region** (`ANTHROPIC_REGION=eu`). The model is
`claude-sonnet-5` for all three prompts (`src/lib/anthropic.ts`, env-overridable).

### Prompt 1 — Extraction (per forwarded email)

Turn one email into a strict bill/school/travel JSON object. Extraction is a
**cascade**, not a single model call (`src/lib/extraction.ts`):

1. **schema.org markup** the sender published (`<script type="application/ld+json">`).
   Exact and typed — where it exists it wins outright.
2. **The document**, scanned deterministically: every money token enumerated and
   scored by the words around it, rather than taking the first one found.
3. **The model**, asked to **locate** values and quote them, never to transcribe
   them.

Everything passes one **validation gate** before it can be stored. That is what
makes "null over guessing" a property of the code rather than a line here.

**Hard rules:**
- The model answers with a **tool call against a strict schema** (`strict: true`),
  not prose to be dug out of a text block.
- For every value, return the **exact source substring** it was read from. The
  caller re-parses that quote, so a paraphrased quote silently loses the value.
  Numbers are what models transcribe least reliably, so they never transcribe one.
- **Null over guessing.** If a value isn't clearly present, return `null`. Never
  infer an amount or date. A wrong value is worse than a null, and it is measured.
- **Never assume a period.** `amount` is the monthly charge *as stated*. A
  quarterly or annual figure is returned with its period and is NOT divided down.
- A currency outside the household's market (EUR, USD) means the amount is
  **withheld**, never converted or relabelled.
- Dates are **ISO 8601**. A renewal date is when the contract ends; a payment due
  date is a different field.

**Output shape (bills):**
```json
{
  "kind": "bill",
  "provider": "string | null",
  "type": "broadband | energy | mobile | tv | insurance | other | null",
  "amount": "number | null",
  "source_amount": "number | null",
  "billing_period": "monthly | quarterly | annual | one_off | null",
  "currency": "GBP | SEK | null",
  "renewal_date": "YYYY-MM-DD | null",
  "payment_due_date": "YYYY-MM-DD | null",
  "price_increase_flag": "boolean",
  "evidence": {
    "amount": { "source": "json-ld | table | model | heuristic", "quote": "string" },
    "renewal_date": { "source": "…", "quote": "string" }
  },
  "confidence": "number 0-1"
}
```

**Output shape (school)** — `src/lib/school.ts`, one email to a list of things a
parent has to do:

```json
{
  "kind": "school",
  "school": "string | null",
  "child_name": "string | null",
  "items": [
    {
      "type": "form | payment | kit | event | absence",
      "title": "action-first, ≤10 words",
      "due_date": "YYYY-MM-DD | null",
      "event_date": "YYYY-MM-DD | null",
      "event_time": "HH:MM | null",
      "amount": "number | null",
      "evidence": { "source": "model | heuristic", "quote": "the exact sentence" }
    }
  ],
  "ignored_for_privacy": "number",
  "confidence": "number 0-1"
}
```

`due_date` and `event_date` are different facts: a trip has a form due one week
and a coach leaving the next.

**Every date resolves against the day the email was SENT, never the day it is
read.** A letter sent on 1 September saying "the trip is on Friday" means
4 September, whether it is read that afternoon or three weeks later. The sent
date is passed to the model, used by the deterministic reader, is what the year
is chosen against, and is shown to the user — a wrong reference frame is the one
kind of date error that looks entirely correct.

**Nothing is created without a tap.** A school scan reads and PLANS: it returns
what it read, which child it matched, what it would put in the calendar and the
sentence behind each value, and writes nothing. A second call creates only the
items the household ticked, and only from the plan the server itself produced.

**Eval gate before launch:** hand-label ≥200 real bill emails; measure precision
and recall per field; gate P0 on **≥95% precision on amount and renewal_date**,
null-rate reported separately.

### Prompt 2 — Digest (per household per night, 02:00 local)

Rank the household's open signals and write the morning digest.

**Hard rules:**
- **Max 4 items** in the digest body.
- Each line is an **action, ≤10 words**, action-first phrasing.
- `executable: true` only for switchable verticals (**broadband, energy,
  mobile** — never insurance in the beta).
- The digest ranks the **calendar** alongside bills: school and travel events at
  their lead time, a trip checked against every child's passport expiry, an
  evening out that needs cover arranged. `home` covers household logistics that
  are neither a bill nor a school or travel matter.
- If nothing needs attention, return `items: []` and a single **minimum-mode**
  `quiet_line` ("All calm today. Next: X in N days.").
- Everything ranked but not in the top 4 goes to `overflow` — nothing vanishes.
- Carried-forward items (unactioned ≥3 days) rank above equally-urgent new items.

**Output shape:**
```json
{
  "items": [
    {
      "category": "bill | school | travel | home | system",
      "urgency": "today | soon | upcoming",
      "line": "≤10 words",
      "detail": "one sentence",
      "executable": "boolean",
      "saving_annual": "number | null"
    }
  ],
  "overflow": [ "…same shape…" ],
  "quiet_line": "string | null"
}
```

The deterministic reference implementation lives in `src/lib/digest.ts`
(`buildDigest`). Swapping in a model call is a single function replacement.

### Prompt 3 — The assistant (when someone asks GiGi something)

Answer one spoken or typed question, out loud. Unlike the two above, this one may
**go and look** (`src/lib/assistant-tools.ts`). Two tools, no others:

- `check_weather` — the household's forecast and the clothing advice derived from
  it (`src/lib/weather.ts`).
- `check_inbox` — a header-only Gmail search: **senders and subject lines, never a
  message body**, triaged deterministically in `src/lib/inbox.ts` before the
  model sees it.

**Hard rules:**
- **Nothing is fetched until the question needs it.** Prefetching an inbox scan
  into every question means reading mail nobody asked to have read.
- **The guards live in the executor, not the prompt.** The model picks a tool and
  arguments; it never receives a token, a household id or a URL.
- **The reach is bounded.** At most 30 days and 25 subject lines per question,
  and only mail whose subject carries an obligation (`ATTENTION_TERMS`).
- **The trust log records what ran**, built from the executor's return value,
  never from the model's account of itself. The same list is shown to the user.
- GiGi still **never acts**, and says so when asked to.
- A tool that cannot answer returns `available: false` with a reason. GiGi says
  what is missing and the one thing that would fix it.

---

## Commands

```
npm run dev      # needs DATABASE_URL
npm run build
npx tsc --noEmit
npm run test:calendar-sync   # needs DATABASE_URL; stub Google, real Postgres
```

Local database:
```
createdb gigi_dev
DATABASE_URL=postgresql://localhost/gigi_dev npm run dev
```

`/api/diagnostics` is the first place to look when a deployment misbehaves: it
reports presence, never values, for every variable that matters, and names what
is actually wrong rather than leaving a table to interpret.
