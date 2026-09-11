# Trying the forward feature (incl. on free Render)

GiGi's "connect" model is **forward-to-GiGi** — no OAuth. You forward a bill
email and GiGi extracts the provider, amount and renewal date (Prompt 1). There
are three ways to try it, from zero-setup to real email.

## Extraction engine

- **No API key (default):** a deterministic heuristic extractor runs. Works on a
  free Render box with nothing to configure. Good enough to see the flow.
- **With `ANTHROPIC_API_KEY`:** the real model call runs (`claude-sonnet-5`, EU
  inference via `ANTHROPIC_REGION=eu`), same strict-JSON / null-over-guessing
  contract. Set the key in the Render dashboard → Environment.

Either way, a forwarded email becomes an **unconfirmed bill** you review under
**Bills** — GiGi never trusts an extraction silently.

---

## 1. Easiest — the in-app tester (zero setup)

This is the quickest way to try forwarding on your free Render server.

1. Open the app → **Bills** → **✉ Forward a bill to GiGi** (also on the
   onboarding *Connect* step). A sample bill email is pre-filled.
2. Edit it or paste a real one, hit **Send to GiGi →**.
3. You'll see exactly what GiGi extracted, and the bill appears as unconfirmed.

Under the hood this posts to `POST /api/inbound/test` and runs the identical
pipeline the real email webhook uses.

---

## 2. Real email, no domain needed — Postmark inbound

Postmark gives you an inbound address like `abc123@inbound.postmarkapp.com`
**without owning a domain**, and POSTs each email to your webhook as JSON.

1. Create a free Postmark account → add a **Server** → **Inbound** stream.
2. Set the inbound **webhook URL** to:
   `https://YOUR-APP.onrender.com/api/inbound`
3. Copy your inbound email address and forward a bill to it (or set up a filter
   in Gmail/Outlook to auto-forward known senders there).
4. Watch the bill show up in the app.

Postmark posts JSON with `From`, `Subject`, `TextBody`, `OriginalRecipient` —
all fields the webhook already understands.

---

## 3. Own domain — Cloudflare Email Routing or Mailgun/SendGrid

If you have a domain, you can use your own `@in.yourdomain.com` addresses.

**Cloudflare Email Routing (free):**
1. Add your domain to Cloudflare, enable **Email Routing**.
2. Create an **Email Worker** that forwards the message as JSON to
   `https://YOUR-APP.onrender.com/api/inbound` (a few lines of `fetch`).

**Mailgun / SendGrid Inbound Parse:**
1. Point an MX route/subdomain at the provider.
2. Set the inbound route/parse webhook to `.../api/inbound`. These post
   form-encoded fields (`from`, `subject`, `body-plain`, `recipient`) — also
   understood by the webhook.

### Securing the webhook

Set `INBOUND_SECRET` in Render. The webhook then requires it as either an
`x-gigi-secret` header or a `?secret=...` query param, so a public URL can't be
spammed. Add the query param to the webhook URL you register with the provider.

### How an email is matched to a household

Best-effort, so a single tester "just works":
1. recipient contains the household's forwarding local-part (or its id), else
2. sender matches a household's own email, else
3. if exactly one real (non-demo) household exists, use it, else the demo.

For true multi-user routing, give each household a unique inbound address (e.g.
Postmark plus-addressing `abc123+TOKEN@inbound.postmarkapp.com`) and store it as
the household's forwarding address.

---

## Free Render caveats (important)

- **Spin-down:** free web services sleep after ~15 min idle. The first request
  (or forwarded email) after sleep has a cold-start delay of a few seconds, then
  works normally.
- **Ephemeral memory:** this test build stores everything in memory, so forwarded
  bills — and accounts — **reset on redeploy or spin-down**. That's fine for
  trying the flow; wire up Supabase (see `db/schema.sql`) for persistence.
