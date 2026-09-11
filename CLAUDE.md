# GiGi — AI contract (two-prompt architecture)

GiGi runs on two prompts. The test build implements the **output contracts**
deterministically (no API key needed); this file is the spec to wire the real
Anthropic calls against. Inference must run in an **EU region**
(`ANTHROPIC_REGION=eu`) to keep "EU data only" true.

Recommended model: the latest Claude Sonnet for both prompts (fast, cheap,
strong at strict JSON). Use `claude-sonnet-5`.

## Prompt 1 — Extraction (runs per forwarded email)

**Job:** turn one email into a strict bill/school/travel JSON object.

**Hard rules:**
- Output **strict JSON only**, no prose.
- **Null over guessing.** If a value isn't clearly present, return `null`. Never
  infer an amount or date. This is measured — a wrong value is worse than a null.
- Dates are **ISO 8601** (`YYYY-MM-DD`).
- Never extract information about **other families' children**; ignore personal
  parent-to-parent messages.

**Output shape (bills):**
```json
{
  "kind": "bill",
  "provider": "string | null",
  "type": "broadband | energy | mobile | tv | insurance | other | null",
  "amount": "number | null",
  "currency": "GBP | SEK | null",
  "renewal_date": "YYYY-MM-DD | null",
  "price_increase_flag": "boolean",
  "confidence": "number 0-1"
}
```

**Eval gate before launch:** hand-label ≥200 real bill emails; measure precision
and recall per field; gate P0 on **≥95% precision on amount and renewal_date**,
null-rate reported separately.

## Prompt 2 — Digest (runs per household per night, 02:00 local)

**Job:** rank the household's open signals and write the morning digest.

**Hard rules:**
- **Max 4 items** in the digest body.
- Each line is an **action, ≤10 words**, action-first phrasing.
- Set `executable: true` only for switchable verticals
  (**broadband, energy, mobile** — never insurance in the beta).
- If nothing needs attention, return `items: []` and a single **minimum-mode**
  `quiet_line` ("All calm today. Next: X in N days.").
- Everything ranked but not in the top 4 goes to `overflow` — nothing vanishes.
- Carried-forward items (unactioned ≥3 days) rank above equally-urgent new items.

**Output shape:**
```json
{
  "items": [
    {
      "category": "bill | school | travel | system",
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

The deterministic reference implementation of this contract lives in
`src/lib/digest.ts` (`buildDigest`). Swapping in the model call is a single
function replacement there.
