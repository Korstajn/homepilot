# AI features — email extraction, eval, and voice

All three turn on with one env var: `ANTHROPIC_API_KEY`. Set it in Render →
Environment (or `.env` locally). Without it, extraction uses the heuristic
baseline and voice is disabled — the app still runs.

Model: `claude-sonnet-5` (the repo standard for GiGi's AI — fast, cheap, strong at
strict JSON). Inference is pinned to the EU region (`ANTHROPIC_REGION=eu`).

## 1. How well does Claude read email? — the eval

`/app/eval` (from Metrics → "Extraction eval") runs the extractor over a
hand-labeled set (`src/lib/eval-dataset.ts`) and reports, per field:

- **precision / recall / null-rate** for `amount` and `renewalDate`
- **accuracy** for `provider` and `type`
- pass/fail against the **CLAUDE.md gate: ≥95% precision on amount & renewal date**

It runs against Claude when the key is set, else the heuristic baseline — so you
can compare. The set deliberately includes traps: an amount that is annual-only
(must return `null`, not a guessed monthly figure), a "see your account for the
price" email (null amount), a non-bill marketing email (all null), and a Swedish
SEK bill. Grow the set with real anonymised beta emails; the gate is the
go/no-go for trusting the register.

> Baseline result (heuristic, no key): amount precision ~88% (it wrongly reads an
> annual-only figure as monthly) — it **fails** the gate. That's the point: the
> eval discriminates. Run it with your key to see Claude's number.

## 2. Voice assistant

`/app/voice` ("Talk to GiGi" on Home). Uses the browser's built-in speech
recognition (best in Chrome) for speech-to-text and speech synthesis to talk
back — no telephony, no extra service. The reasoning is a Claude call
(`/api/assistant`).

**Safety posture (on-brand):**
- **Read/answer only.** The assistant can tell you what's on today, what renews
  soon, and how much you've saved — but it **never acts, approves, switches, or
  pays**. Ask it to act and it tells you to tap Approve. Approve-to-execute is
  never bypassed by voice.
- **Least context.** It's given only a compact, factual summary of the signed-in
  member's own household. A **teen** session gets no financial context at all.
- **Transparent.** Every voice question is content sent to the AI, so it's
  recorded in the trust log (`/app/data`) like any other AI hop.
- **Grounded.** The system prompt forbids inventing numbers, dates or providers.

Browser support: speech-to-text needs a Chromium-based browser; everywhere else
the screen falls back to a text box (still Claude-answered and spoken where TTS
is available).

## Privacy

The same rules apply as everywhere: text is **PII-stripped** (`redactPII`) before
extraction calls, inference stays in the **EU**, raw email is not retained, and
every AI hop is in the user's trust log. See `docs/PRIVACY_ARCHITECTURE.md`.
