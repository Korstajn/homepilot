# GiGi — Architecture (beta test build)

This is the **deploy-and-try** build: a single Next.js app that runs the whole
GiGi experience with seeded data and no external dependencies. It is designed so
that each seam (data, AI, notifications) is a swap, not a rewrite, when it
graduates to the production stack in the MVP doc (§6).

## System shape

```
                         ┌──────────────────────────────────────────┐
                         │            Next.js app (Render)           │
   Phone browser  ─────► │                                          │
   (mobile-framed UI)    │  App Router pages (React, client)        │
                         │    /            landing + waitlist        │
                         │    /onboarding  profile→connect→bills→done│
                         │    /app/*       digest, bills, settings   │
                         │                                          │
                         │  Route handlers (/api/*)  ── business ────┼─► src/lib
                         │    digest, actions, bills, value,        │     store.ts   (data)
                         │    events, feedback, waitlist, household  │     digest.ts  (ranking = "Prompt 2")
                         │                                          │     types.ts   (mirrors db/schema.sql)
                         └──────────────────────────────────────────┘
```

## What is real vs. simulated

| Concern            | Test build (now)                              | Production (MVP doc)                          |
|--------------------|-----------------------------------------------|----------------------------------------------|
| Data store         | In-memory singleton (`src/lib/store.ts`)      | Supabase Postgres (`db/schema.sql`)          |
| Auth               | Single seeded household                       | Supabase Auth (email + password)             |
| Email ingestion    | Forward-to-GiGi (conceptual) + manual add     | Forward-to-GiGi address, parsed by Prompt 1  |
| Extraction (P1)    | Seeded bills, `null`-over-guessing modelled   | Anthropic API, strict JSON, EU region        |
| Digest (P2)        | Deterministic ranker in `src/lib/digest.ts`   | Anthropic digest prompt, same output contract|
| Nightly 02:00 job  | `POST /api/digest/generate` (manual trigger)  | Inngest scheduled function per household     |
| 07:00 push         | In-app "today" surface                        | Expo Notifications                           |
| Switch execution   | Concierge stub behind the approve button      | Founder-assisted → automated                 |

Because the API layer only ever touches `src/lib/*`, replacing the in-memory
store with Supabase or the deterministic ranker with the Anthropic call does not
change a single route or screen.

## Why in-memory is correct here (and its limits)

Render runs a **single long-lived Node process**, so a module-level singleton is
shared across every request — unlike Vercel serverless, where it would not be.
State resets on redeploy/restart, which is exactly what you want for a throwaway
test: every deploy is a clean demo. It is **not** multi-tenant and **not**
durable — those arrive with Supabase.

## Frontend architecture

- **App Router**, all interactive screens are client components hitting `/api/*`.
- The product is mobile-only, so the app is presented inside a **phone frame**
  (`.phone` in `globals.css`) that collapses to full-bleed on real phones.
- **Design tokens** live at the top of `globals.css`. Everything visual keys off
  those CSS variables, so reskinning to the real brand is a one-file change.
- **Instrumentation** (`src/lib/analytics.ts`) fires on every meaningful action;
  it is fire-and-forget and can never block or break the UI.

## The two-prompt AI contract

See `CLAUDE.md`. Prompt 1 (extraction) and Prompt 2 (digest) are specified there
with the exact JSON contracts. In this build the digest ranker implements the
Prompt 2 output contract deterministically; wiring the real model is one function
swap in `src/lib/digest.ts`.
