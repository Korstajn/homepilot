# The trust log — total data transparency

Trust is GiGi's moat. The trust log turns the abstract principles ("read-only,
EU data only, approve-to-execute") into something the user can **see and verify**.
Every household has a plain-language record of exactly what happened with their
data, and it doubles as the GDPR record of processing (Art. 15 & 30).

## The one rule: log the data flow, not the data

The log must never become a privacy liability. It records **what happened and
where it went — never the contents**:

- ✅ "A broadband email you forwarded arrived" · "GiGi read it on our server —
  no AI, nothing left the server" · "A broadband bill from BT was saved"
- ❌ never the email body, never the amount, never extracted free text

A provider name or a category is allowed (it helps the user recognise the event);
sensitive figures and raw content are not.

## What each entry carries

Timestamp · **actor** (you / GiGi server / GiGi AI (EU) / email service /
concierge) · **action** · **category** · plain-language **detail** · **why**
(purpose) · **legal basis** · **region** · duration where relevant.

Every external hop is its own entry — especially the AI extraction call, which
is the one moment content leaves for processing, and the moment a household's
name + address is shared to execute an approved switch.

## Tamper-evidence (hash chain)

Each entry stores `hash = sha256(prevHash + canonical(entry))`, chaining to the
one before it (`prevHash`). The API recomputes the whole chain on read and shows
a badge: **"Append-only log · N events · verified unaltered."** Editing or
reordering any past entry breaks the chain and the badge flips. It's a concrete
signal that we can't quietly rewrite history.

## Where it lives

- **User screen:** `/app/data` — timeline grouped by day, plus the full
  subprocessor registry ("Who can touch your data — nothing hidden") and the
  integrity badge. Reachable from Home and Settings.
- **API:** `GET /api/processing` returns the events, the integrity check and the
  subprocessor list.
- **Instrumented steps:** account creation, email received, analysis (AI vs.
  on-server, truthfully), storage, digest generation, approval/execution
  sharing, connection changes, and erasure.

## Erasure closes the loop

`POST /api/account/delete` clears the household's content (bills, digests,
history) **and writes a final `data_deleted` entry** to the log. The record that
deletion happened is itself a trust signal, so it is kept by design — it is
metadata, not content.

## Two logs, not one

Don't confuse this with `analytics_events`:

| | `analytics_events` | trust log (`processing_events`) |
|---|---|---|
| Audience | the founder | the user |
| Content | product metrics | data-processing steps |
| Language | event names | plain language + "why" |
| Purpose | improve the product | transparency / GDPR Art. 15 & 30 |

## Distinct from analytics — and honest about the engine

The subprocessor registry reflects what the build actually does: with no API key,
analysis runs on our server and the **GiGi AI** processor shows **"Not in use"**.
Set `ANTHROPIC_API_KEY` and it flips to active, and forwarded emails then log a
`sent_to_ai` / `ai_returned` pair instead of `analyzed_on_server`.
