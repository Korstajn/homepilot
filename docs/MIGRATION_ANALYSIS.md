# Analysis — moving the GiGi demo app into this repo

**Date:** Sep 2026 · **Scope:** move the working build from
`robinandreeklund-collab/test` into `Korstajn/homepilot`, make its landing page
match the approved design, and put the whole thing behind a beta code at
dev.getgigiapp.com.

---

## 1. What the two repos were

| | `Korstajn/homepilot` (this repo, before) | `robinandreeklund-collab/test` |
| --- | --- | --- |
| Contents | `README.md` (the MVP feature set spec) + a single static `index.html` | a complete Next.js 14 app: 24 API routes, 20 screens, seeded in-memory store, 8 design/architecture docs |
| Role | the **specification** and the **approved landing design** | the **running product** |
| Deploy | static (`vercel.json`) | Render blueprint, EU/Frankfurt |

They are the same product described from two ends. Nothing in them conflicted
except the landing page, which existed in both — as a finished design here, and
as an earlier working version there.

**Decision: this repo becomes the single home.** The spec, the design reference,
the app and the deployment config now live together, so the MVP feature table in
`README.md` and the code that has to satisfy it can no longer drift apart.

## 2. What moved, and what happened to the old landing

Moved verbatim: `src/` (app, components, lib), `db/schema.sql`, `docs/*.md`,
`CLAUDE.md`, `next.config.mjs`, `tsconfig.json`, `package.json` +
`package-lock.json`, `.env.example`, `render.yaml`. The beta build's README is
kept as `docs/BETA_BUILD.md`; this repo's `README.md` stays the product spec.

The old `index.html` was **not deleted**. It is the approved design and it is
now the reference the code is checked against:

```
docs/reference/landing-reference.html   ← the design, unchanged
src/app/landing.css                     ← its <style> block, ported 1:1
src/app/page.tsx + components/landing/  ← its <body>, ported 1:1
```

Change the design in the reference first, then port. That rule is written at the
top of `landing.css` so the next person finds it.

## 3. The landing page port

### How the port was done

The reference's stylesheet was transformed mechanically, not retyped: every
selector is prefixed with `.landing`, `:root`/`body` fold onto the `.landing`
wrapper, and the three font stacks resolve through CSS variables. That means the
cascade cannot collide with the in-app design tokens in `globals.css` — the two
design systems (marketing page vs. product UI) now coexist in one app without
either being able to reach into the other. The old landing's CSS was deleted
from `globals.css`; nothing outside the old landing used it.

The markup became one component per section with the copy in arrays
(`WhatGigiDoes.tsx` is six objects, `Proof.tsx` is three stats and two quotes),
so a copy change is an edit to a list, not surgery on markup — the structure the
`/test` repo already used for its own landing.

### Verified

Screenshots of the reference file and the rendered route at 1280×800 and 1440
full-page put every element in the same place: nav, hero badge, headline, phone
mock and its two float cards, manifesto, six verticals, three steps, the dark
proof band, FAQ + waitlist card, final CTA, contact form, footer. At 390 px the
page has no horizontal overflow.

### Four deliberate differences

| # | Reference | Here | Why |
| --- | --- | --- | --- |
| 1 | `<link>` to Google Fonts (a dead relative path in the saved file, so it renders in Georgia/system faces) | `next/font` self-hosts DM Sans, Instrument Serif, JetBrains Mono | It renders the design **as specified**. It also keeps the self-only CSP in `next.config.mjs` intact and stops a visitor's IP reaching a third party — `docs/PRIVACY_ARCHITECTURE.md` promises exactly that. |
| 2 | All three forms POST to Formspree | They POST to `/api/waitlist` and a new `/api/contact` | Same-origin (the CSP forbids third-party `form-action`), no third-party processor to add to the privacy docs, and signups land in the store `/app/metrics` already reads. |
| 3 | FAQ rows are clickable `<div>`s; inputs set `outline:none` | Rows are `<button aria-expanded>`; a `:focus-visible` ring is restored | Keyboard and screen-reader access, with zero visual change for mouse and touch. |
| 4 | No way into the product (it is the public marketing page) | A fixed "Beta build · Open the app →" pill, bottom right | A tester who just typed a code needs a door. It is `position:fixed`, outside the page flow, so **no element of the design moves**, and it disappears when the gate is off — i.e. it can never appear on the public site. |

Two links the reference leaves as dead `#` anchors: *Privacy policy* now points
at the real `/privacy` page; *Terms of service* is inert text until that page
exists, rather than a link that 404s.

## 4. The beta code gate

### Shape

`src/middleware.ts` fronts every path except the gate screen, its API route,
Next's static assets and `robots.txt`. No cookie ⇒ pages redirect to `/beta`
(carrying `?next=`), API routes get a `401` instead of an HTML redirect.
`POST /api/beta` checks the code and sets a 30-day `httpOnly` cookie;
`DELETE /api/beta` clears it so the gate itself can be re-tested.

### The decisions inside it

- **Fails closed.** A build with `NODE_ENV=production` and no `GIGI_BETA_CODE`
  serves a 503 explaining itself. A forgotten variable is the most likely way
  this gate breaks, and the failure mode of "silently publishes the dev build"
  is much worse than "site is down until someone sets a variable". Opening the
  site to everyone requires the explicit `GIGI_BETA_GATE=off`.
- **The cookie never holds the code.** It holds `SHA-256("gigi-beta-v1:" +
  CODE)`, recomputed per request from the configured code and compared in
  constant time.
- **Codes are normalised** (whitespace stripped, upper-cased) because they get
  pasted out of emails and chat.
- **Web Crypto only** in `lib/beta.ts` — middleware runs on the Edge runtime,
  where `node:crypto` does not exist.
- **`?next=` is validated.** Only same-origin paths are accepted; `//evil.com`
  and absolute URLs fall back to `/`. An open redirect on a getgigiapp.com URL
  is a phishing gift.
- **Attempts are capped** at 10 per IP per 15 minutes, in memory. Honest about
  what that is: per-instance and reset by a redeploy — proportionate for a dev
  gate, and the first thing to replace if this ever fronts real data.

### What it is not

It is an **access gate for a development environment**, not authentication.
Everyone shares one code, so it establishes "you were invited", never "you are
Sarah". Account auth (`src/lib/auth.ts`, scrypt + opaque session cookies) is
untouched and still does that job. Anyone holding the code can see everything a
beta tester can see, including `/app/metrics`.

## 5. dev.getgigiapp.com

Full runbook in `docs/DEPLOYMENT.md`. The analysis behind it:

- **Render stays the primary target.** One EU region (Frankfurt) for the whole
  service is what makes "EU data only" (`docs/DECISIONS.md` §4) true without
  asterisks, and it runs the `output: 'standalone'` build unchanged.
  `render.yaml` now provisions `gigi-dev` with `GIGI_BETA_CODE` as an unsynced
  secret and `GIGI_SITE_ENV=development`.
- **Vercel remains viable** and `vercel.json` was rewritten for it (Next.js
  framework, functions pinned to `fra1`). The caveat is real and documented:
  Vercel middleware runs at the edge worldwide, so the gate check itself is not
  EU-confined. It hashes a cookie and nothing else, but it is an asterisk.
- **Not indexable.** `src/app/robots.ts` disallows everything unless
  `GIGI_SITE_ENV=production`. Indexing is opt-in, so the dev site cannot show up
  in search next to the real one by omission.

### One thing to decide before merging

The root of this repo used to be a static `index.html`. After this change it
builds a Next.js app. If a host is still wired to serve this repo's main branch
as the public site, it will start serving this app. The fail-closed gate means
the worst case is a 503 rather than an exposed dev build — but it should be a
decision, not a surprise.

## 6. Findings worth knowing before beta testers arrive

Pre-existing in the moved build; none are regressions from this move, and none
were in scope to fix here.

| Finding | Where | Impact | Suggested fix |
| --- | --- | --- | --- |
| `GET /api/waitlist` returns up to 50 signup **email addresses** with no auth | `src/app/api/waitlist/route.ts` | Any holder of the beta code can read every signup email. The gate contains it; it does not fix it. | Return counts only (as `/api/contact` now does), or require an owner session. |
| `/app/*` needs no login — `resolveMember()` falls back to the demo household's owner | `src/lib/auth.ts` | Intentional for the demo, but it means the beta code is the only real boundary. | Fine for now; revisit when real household data exists. |
| The store is in memory | `src/lib/store.ts` | Every redeploy wipes accounts, bills and waitlist entries. Testers **will** lose state and should be told. | `db/schema.sql` + Supabase is the planned swap. |
| CSP needs `'unsafe-inline'` for scripts | `next.config.mjs` | Weakens the CSP's XSS value. | Nonce-based CSP when the app leaves the test build. |
| `maximumScale: 1` in the viewport | `src/app/layout.tsx` | Blocks pinch-zoom — an accessibility problem for low-vision users. | Drop `maximumScale`. |
| Rate limiting exists only on the beta gate | `src/app/api/beta/route.ts` | Waitlist and contact endpoints can be flooded. | Shared limiter when there is a datastore to back it. |

## 7. Suggested next steps

1. Set `GIGI_BETA_CODE` on the dev service and point `dev.getgigiapp.com` at it.
2. Decide what serves the public apex domain after this merge (§5).
3. Close the `/api/waitlist` email leak — the smallest real fix on the list.
4. Swap the in-memory store for Supabase (`db/schema.sql`) so testers stop
   losing their households on every deploy.
