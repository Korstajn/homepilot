# GiGi — AI contract (two-prompt architecture)

GiGi runs on two prompts. The test build implements the **output contracts**
deterministically (no API key needed); this file is the spec to wire the real
Anthropic calls against. Inference must run in an **EU region**
(`ANTHROPIC_REGION=eu`) to keep "EU data only" true.

Recommended model: the latest Claude Sonnet for both prompts (fast, cheap,
strong at strict JSON). Use `claude-sonnet-5`.

## Prompt 1 — Extraction (runs per forwarded email)

**Job:** turn one email into a strict bill/school/travel JSON object.

Extraction is a **cascade**, not a single model call (`src/lib/extraction.ts`):

1. **schema.org markup** the sender published (`<script type="application/ld+json">`),
   which Gmail documents and billers embed. Exact and typed — where it exists it
   wins outright, and no model reading of those fields is used.
2. **The document**, scanned deterministically: every money token is enumerated
   and scored by the words around it, rather than taking the first one found.
3. **The model**, asked to **locate** values and quote them, never to transcribe
   them.

Everything then passes one **validation gate** before it can be stored. That is
what makes "null over guessing" a property of the code rather than a line here.

**Hard rules:**
- The model answers with a **tool call against a strict schema** (`strict: true`),
  not prose to be dug out of a text block.
- For every value, return the **exact source substring** it was read from. The
  caller re-parses that quote, so a paraphrased quote silently loses the value.
  Numbers are what models transcribe least reliably, so they never transcribe one.
- **Null over guessing.** If a value isn't clearly present, return `null`. Never
  infer an amount or date. This is measured — a wrong value is worse than a null.
- **Never assume a period.** `amount` is the monthly charge *as stated*. A
  quarterly or annual figure is returned with its period and is NOT divided down
  into a monthly amount: that division is an inference, and an annual plan is
  rarely twelve equal payments.
- A currency outside the household's market (EUR, USD) means the amount is
  **withheld**, never converted or relabelled.
- Dates are **ISO 8601** (`YYYY-MM-DD`). A renewal date is when the contract
  ends; a payment due date is a different field.
- Never extract information about **other families' children**; ignore personal
  parent-to-parent messages.

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

**Output shape (school)** — `src/lib/school.ts`, one email to a list of things
a parent has to do:

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
and a coach leaving the next. A school date written without a year ("Thursday 8
October") resolves forward — unlike a bill's renewal date, a school date with no
year is unambiguously the next one.

**The privacy rule is enforced in code, not in the prompt.** A school email is
full of other families' children — class lists, "well done to", quoted parent
replies — and an instruction to a model is a mitigation, not a guarantee. So:

- the only names GiGi ever looks for are children the household has already
  entered, so a name it does not know is a name it cannot record;
- and because the evidence quote stores the SENTENCE, any sentence naming a
  child who is not in this household is dropped whole, on both the model and the
  deterministic path. `ignored_for_privacy` counts them and the count is shown to
  the user; nothing else about them is kept.

**Nothing is created without a tap.** A school scan reads and PLANS: it returns
what it read, which child it matched, what it would put in the calendar and the
sentence behind each value, and writes nothing. A second call creates only the
items the household ticked, and only from the plan the server itself produced.

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
- The digest ranks the **calendar** alongside bills: school and travel events at
  their lead time, a trip checked against every child's passport expiry, and an
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

The deterministic reference implementation of this contract lives in
`src/lib/digest.ts` (`buildDigest`). Swapping in the model call is a single
function replacement there.
