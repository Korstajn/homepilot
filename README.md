# GiGi

A proactive chief of staff for the household. One 7am digest, never more than
four things, one-tap approvals.

This repo holds **both** the product spec and the running app.

| | |
| --- | --- |
| **Run it** | `npm install && npm run dev` → http://localhost:3000 |
| **The app** | Next.js 14, `src/` — Postgres (Supabase) via `DATABASE_URL`; migrations in `db/migrations/` apply themselves. Guided tour: [docs/BETA_BUILD.md](docs/BETA_BUILD.md) |
| **The landing design** | [docs/reference/landing-reference.html](docs/reference/landing-reference.html) — the approved design, ported 1:1 to `src/app/page.tsx` + `src/app/landing.css` |
| **Deploying** | dev.getgigiapp.com, optional beta code: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| **Why it looks like this** | [docs/MIGRATION_ANALYSIS.md](docs/MIGRATION_ANALYSIS.md) |
| **AI contract** | [CLAUDE.md](CLAUDE.md) — the two prompts and their output contracts |
| **Architecture & privacy** | [docs/](docs/) |

The development build can be **gated by a beta code**, and currently is not.
Set `GIGI_BETA_GATE=on` to raise the gate; testers then type `GIGI_BETA_CODE`
once per browser. Asking for the gate without setting a code refuses to serve
rather than falling open. Either way the build is never indexable: that is
`GIGI_SITE_ENV`, not the gate — see `src/lib/beta.ts`.

---

## MVP Feature Set

**Version:** 1.0 · Aug 2026  
**Owner:** Kerstin Skjefstad Larsson  
**Status:** Draft for build

[www.getgigiapp.com](https://www.getgigiapp.com)

---

## 1. What the MVP must prove

GiGi is a proactive chief of staff for the household. It takes items off the user's checklist on its own initiative — while the user stays in control through one-tap approvals.

The MVP exists to prove three things with a 50-household private beta:

1. **The digest habit forms.** Users open the 7am daily digest most mornings and keep doing so at week 8 (target: 70%+ week-8 retention against the 90% aspiration).
2. **Execution is trusted.** Users approve GiGi-proposed actions (bill switches, calendar additions) rather than just reading about them (target: 50%+ of proposed executable actions approved).
3. **Value is felt in money and time.** At least one executed bill saving per household in the first 90 days, and users self-report reduced mental load.

Everything in scope serves one of these three. Everything else waits.

---

## 2. Target user

**Primary ICP:** Women 30+, affluent, UK + Sweden households — typically families with children, dual-income, high admin burden, shops at Ocado/Waitrose/Sainsbury's.

**Secondary:** Men 40+ in the same household profile.

**Channel for MVP:** Personal onboarding of 50 households (waitlist + founder network), with waitlist tagging for the future employer-benefit channel.

---

## 3. MVP principles

- **Approve-to-execute, always.** GiGi never takes an external action without an explicit user tap. The AI recommends; the human decides.
- **Read-only by default.** Minimum OAuth scopes. GiGi can never send, delete, or modify anything in a connected account.
- **Four items, maximum.** The daily digest never exceeds 4 items. If nothing needs attention, no notification is sent. Signal-to-noise is the product.
- **Null over guessing.** If the AI is not confident in an extracted value (a date, an amount), it returns nothing rather than a hallucination.
- **UK + EU data only.** All storage in Supabase EU-West (London) or Sweden. No user content in logs. One-tap full data deletion.

---

## 4. Feature set

Priorities: **P0** = must exist for beta launch · **P1** = fast follow within beta · **P2** = post-beta.

### 4.1 Onboarding & account

| Feature | Description | Priority |
| --- | --- | --- |
| Sign up + Voice agent | Email + password via Supabase Auth. Name capture. | P0 |
| Household profile | Adults (1/2/3+), children (none/1–2/3+), postcode. Tap-to-select UI. | P0 |
| Connect Google | Gmail + Google Calendar OAuth, read-only scopes. | P0 |
| Connect Microsoft | Outlook + calendar via Microsoft Graph, read-only. | P1 |
| Manual bill upload | PDF/photo upload with AI extraction as fallback for non-Google users. | P1 |
| Bills-found confirmation | "Here's what we found" screen; user confirms/edits detected bills before monitoring starts. | P0 |
| Add bill manually | Simple form: provider, type, amount, renewal date. | P1 |
| Post-onboarding dashboard | "GiGi is running" state, bills tracked, next renewal, first-digest expectation set. | P0 |

### 4.2 Bills & contracts (Vertical 1)

| Feature | Description | Priority |
| --- | --- | --- |
| Bill detection from email | AI extraction prompt runs on emails from known bill senders (broadband, energy, insurance, mobile, TV). Extracts provider, type, amount, renewal date, price-increase flag. | P0 |
| Bill register | All confirmed bills with amounts and renewal dates, monthly total. | P0 |
| Renewal monitoring | Agent wakes at 30 days pre-renewal; renewal alerts surface in digest. | P0 |
| Deal search | On renewal trigger, search market for better deals (comparison-platform affiliate integration; manual/assisted search acceptable for first beta cohort). | P0 |
| Saving proposal | Digest item with current price, new price, annual saving, one-tap approve. | P0 |
| Switch execution | On approval, GiGi executes the switch. MVP: founder-assisted/concierge execution behind the button; automated later. User sees confirmation state. | P0 |
| Success-fee handling | 10% of first-year saving recorded on executed switches (billing automation P2; tracked manually in beta). | P1 |

### 4.3 School & children (Vertical 2)

| Feature | Description | Priority |
| --- | --- | --- |
| School email reading | AI extracts actions (forms, payments, kit), dates (trips, inset days), and reminders from school senders. Child-name association from household profile. | P0 |
| WhatsApp via forwarding | User forwards class-group messages to their GiGi address (set up on onboarding call). Parsed like email. No WhatsApp API in MVP. | P1 |
| Daily school items in digest | Due-today actions and tomorrow's needs (PE kit, costume) in the 7am digest. | P0 |
| Calendar write-back | School dates added to user's calendar on one-tap approval (first write-scope feature; explicit consent flow). | P1 |
| Privacy guardrail | Never extract or store information about other families' children; personal parent-to-parent messages ignored. | P0 |

### 4.4 Travel & social (Vertical 3)

| Feature | Description | Priority |
| --- | --- | --- |
| Calendar reading | 7-day and 8-week horizon scan of connected calendar. | P0 |
| Pre-event nudges | Event-linked prompts at the right lead time: babysitter for evening events, travel prep for trips. | P0 |
| Document expiry tracking | Passport/EHIC expiry dates entered at onboarding; nudges triggered when a trip is detected within the risk window (e.g. "Ella's passport expires July — renew before August trip"). | P1 |
| Recurring pattern awareness | Learn regular commitments to reduce noise (don't nudge for routine events). | P2 |

### 4.5 The daily digest (core surface)

| Feature | Description | Priority |
| --- | --- | --- |
| Nightly agent run | 2am Inngest job per household: gather signals → AI ranks by urgency → rewrite as ≤10-word action lines → save digest. | P0 |
| 7am push notification | One notification; tap opens digest directly. No notification if nothing needs attention. | P0 |
| Digest screen | Greeting, date, up to 4 items with urgency dot (today/soon/upcoming), category badge, and inline approve button on executable items. | P0 |
| Mark done / dismiss | One-tap resolution per item; "all caught up" state. | P0 |
| Carry-forward | Unactioned items re-surface after 3 days with a gentle nudge; nothing silently disappears. | P0 |
| Digest history | Scroll back through past digests. | P1 |
| Weekly preview | Sunday-evening week-ahead view (school week, events, renewals). | P2 |

### 4.6 Actions & control

| Feature | Description | Priority |
| --- | --- | --- |
| Approve-to-execute loop | Every external action gated by explicit tap; action log stored (what, when, outcome). | P0 |
| Action confirmation states | Immediate in-app confirmation ("✓ Switch confirmed — saving £168/yr"). | P0 |
| Value tracker | Running "GiGi has saved you £X and handled Y tasks" — makes invisible value visible; core to retention and the employer report later. | P1 |

### 4.7 Settings, privacy & trust

| Feature | Description | Priority |
| --- | --- | --- |
| Connected accounts management | View and disconnect any account instantly. | P0 |
| Data deletion | One-tap "delete everything," executed within 30 days, confirmed by email. | P0 |
| Notification controls | Digest delivery time adjustment; pause. | P1 |
| Privacy policy & ICO registration | Live at `/privacy`; ICO registration completed before beta launch. | P0 |

### 4.8 Growth & B2B-lite (no product build beyond tagging)

| Feature | Description | Priority |
| --- | --- | --- |
| Two-step waitlist | Email capture → "household or company benefit?" segmentation; stored with source. | P0 (live on site) |
| Employer lead handling | Company-path signups routed to founder for demo booking. Manual. | P0 |
| Referral invite | "Invite another household" link for beta members. | P2 |

---

## 5. Explicitly out of scope for MVP

- **Phase 2 verticals:** Clean groceries (basket building, NOVA food scoring, retailer ordering), clean supplements, clean beauty. These appear on the landing page as "coming soon" and in the roadmap — not in the build.
- **WhatsApp API integration.** Forward-to-email only; no WhatsApp Web bridges (ToS risk).
- **Automated bill switching for all providers.** Concierge execution behind the approve button is acceptable and invisible to the user; automation follows demand.
- **Payments/subscription billing automation.** Beta is free for two weeks then manually invoiced or comped; Stripe integration is a fast-follow, not a launch blocker.
- **Employer dashboard and impact reports.** Manual, founder-produced for pilot conversations.
- **Android-first polish.** Build cross-platform via Expo, but QA priority is iOS (ICP skew); Android ships when stable.
- **Web app.** Mobile app only — push notifications and the morning habit require it.

---

## 6. Technical foundation (agreed stack)

React Native via Expo (mobile) · Next.js on Vercel (backend) · Supabase EU-West London (database, auth) · Inngest (2am nightly job, 7am notification event) · Anthropic API (extraction prompt + digest prompt) · Gmail API / Microsoft Graph (read-only) · Expo Notifications (push).

**Two-prompt AI architecture:**

- **Prompt 1 (extraction)** runs per email, outputs strict JSON, nulls over guesses, ISO dates.
- **Prompt 2 (digest)** runs per household per night, max 4 items, ≤10 words per line, action-first phrasing, executable flag drives the approve button.

Full specifications live in `CLAUDE.md`.

**Critical path items (external dependencies):** Google OAuth app verification (1–2 weeks), Apple Developer + Play Store accounts and first app review (1–2 weeks), ICO registration, Supabase project in EU-West London.

---

## 7. Success metrics for the beta

| Metric | Target | Why it matters |
| --- | --- | --- |
| Week-8 retention | ≥70% | Proves the habit; the core moat |
| Digest open rate | ≥60% of delivered digests | Proves the morning routine |
| Executable-action approval rate | ≥50% | Proves trust in execution |
| Households with ≥1 executed saving in 90 days | ≥60% | Proves felt monetary value |
| Average saving per switching household | ≥£100/yr | Anchors the pricing story |
| Onboarding completion (signup → bills confirmed) | ≥70% | Proves the connect flow isn't scary |
| NPS / satisfaction | ≥4.5/5 | Fuel for referral growth and employer pilots |

---

## 8. Build sequence

Matches the Claude Code playbook (`PROMPTS_PLAYBOOK.md`):

1. Supabase schema
2. Bill extraction prompt
3. Gmail OAuth
4. Inngest nightly job
5. Digest prompt
6. Push notifications
7. Onboarding screens
8. Digest screen

→ end-to-end test with real emails → TestFlight to first 10 households → iterate → 50.
