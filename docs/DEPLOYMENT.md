# Deployment — dev.getgigiapp.com

The GiGi app in this repo is a development build. It is deployed to
**dev.getgigiapp.com**, behind a beta code, and is not indexable. The public
marketing domain (getgigiapp.com / www) is a separate deployment and is not
changed by shipping here.

| | dev.getgigiapp.com | getgigiapp.com |
| --- | --- | --- |
| Serves | this repo's Next.js app | the public site |
| Beta code | required (`GIGI_BETA_CODE`) | n/a |
| Indexable | no (`robots.txt` disallows all) | yes |
| Data | seeded, in-memory, resets on redeploy | n/a |

## Environment variables

| Variable | Value on dev | What it does |
| --- | --- | --- |
| `GIGI_BETA_CODE` | the shared code | Required to open the site. Unset in a production build ⇒ **503, fail closed**. |
| `GIGI_BETA_GATE` | *(unset)* | Set to `off` only to publish a deployment with no gate on purpose. |
| `GIGI_SITE_ENV` | `development` | Anything but `production` ⇒ `robots.txt` disallows everything. |
| `GIGI_DEFAULT_MARKET` | `uk` | Market for new households (`uk` \| `se`). |
| `NODE_VERSION` | `22` | `package.json` engines allows 20–22. |

`.env.example` documents the rest (Anthropic, Supabase) — none of them are
needed to boot.

## Render (recommended, and what `render.yaml` provisions)

Render is the primary target: one EU region for the whole service (Frankfurt),
which is what keeps "EU data only" (docs/DECISIONS.md §4) true end to end, and
it runs the `output: 'standalone'` build in `next.config.mjs` as-is.

1. Render → **New + → Blueprint**, point at this repo, **Apply**.
   `render.yaml` sets build, start, health check and region.
2. Set **`GIGI_BETA_CODE`** in the dashboard (the blueprint marks it
   `sync: false`, so it is never committed). Until it is set, the service
   answers every request with a 503 explaining why — it will not fall open.
3. Service → **Settings → Custom Domains** → add `dev.getgigiapp.com`, then
   create the CNAME Render shows you at the getgigiapp.com registrar.
4. Open `https://dev.getgigiapp.com`, type the code, and you are in for 30 days
   on that browser.

## Vercel (alternative)

`vercel.json` pins serverless functions to `fra1` (Frankfurt) and declares the
Next.js framework. If you deploy here instead:

- Set the same environment variables in **Project → Settings → Environment
  Variables**, and add `dev.getgigiapp.com` under **Domains**.
- Note that Vercel's middleware runs at the **edge worldwide**, not only in
  `fra1`. The beta gate only hashes a cookie, so no household data is processed
  there — but if the EU-only guarantee is ever extended to request handling in
  general, Render is the cleaner fit.
- `output: 'standalone'` is ignored by Vercel. Harmless.

## Before this repo ever serves the public site

The root of this repo used to be a single static `index.html`; it now builds a
Next.js app. Two consequences worth knowing:

1. Any host still wired to serve this repo's root as a static site will now
   serve the app instead. The approved landing design is preserved verbatim at
   `docs/reference/landing-reference.html` and is rendered by `src/app/page.tsx`.
2. A production deployment with no `GIGI_BETA_CODE` returns 503 by design. To
   publish the site to everyone, set `GIGI_BETA_GATE=off` **and**
   `GIGI_SITE_ENV=production` — that combination is the explicit "this is the
   public site" switch.

## Locking yourself out again (testing the gate)

```bash
curl -X DELETE https://dev.getgigiapp.com/api/beta   # clears the beta cookie
```
