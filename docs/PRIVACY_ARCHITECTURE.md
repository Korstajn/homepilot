# Privacy architecture — pseudonymity by design

True anonymity is impossible for an assistant that reads your email and switches
your contracts — those need real identifiers at the edges. What GiGi does instead
is **separate who you are from what GiGi knows**, so the sensitive dataset isn't
linkable to a person without a key held separately. This is GDPR pseudonymisation
(Art. 4(5)) done seriously. Goal: *unlinkable, not invisible.*

## Identity / content split (P1)

Two stores that never mix:

- **Identity vault** (`identities`, keyed by an opaque `subjectId`): the only place
  strong identifiers live — email (optional), password hash, recovery-code hash.
- **Content store** (bills, digests, processing log, members-as-relations): keyed
  by opaque ids only (`householdId`, `subjectId`). **No login email, no password,
  no recovery code.**

A `Member` record now holds only `{id, householdId, role, status, subjectId, name}`
— the login email and secrets moved to the vault. A dump of the content store is
therefore not linkable to a person without the vault.

> `name` stays on the member as a low-sensitivity display handle (for greetings).
> Strong identifiers do not.

## IDs in transit, never persons

Analytics events, the trust log's machine fields, queue-style calls and the AI
call reference ids, never name/email. The founder analytics (`analytics_events`)
carry only ids + counts. The AI extraction call additionally runs through
`redactPII()` first (below).

## PII stripping before AI (P1)

`redactPII()` masks emails, phone numbers, UK postcodes, sort codes and long
digit runs before any text is sent for inference. Bill facts (provider, amount,
dates) survive; personal identifiers are replaced with `[email]`, `[phone]`,
`[postcode]`, etc. Combined with EU-region inference and no raw-email retention,
this minimises what ever leaves for processing.

## Opaque sessions, no tracking (P0)

- The session cookie holds a **random opaque token**, resolved server-side to a
  member. It carries no member id and no PII (previously it held the member id —
  an identifier leak, now fixed).
- It is **first-party, httpOnly, SameSite=Lax, strictly necessary** — exempt from
  consent under ePrivacy, so there is **no cookie banner** and no tracking cookie.
- **No third parties**: no analytics SDKs, no Google Fonts, no CDNs, no trackers.
  A strict **Content-Security-Policy** (`default-src 'self'`, self-only script/
  style/img/font/connect, `frame-ancestors 'none'`) is set in `next.config.mjs`
  and enforces it. The only outbound call is the optional Anthropic API, made
  server-side (never from the browser).

## Login options (more anonymous, opt-in)

- **Email + password** (default) — with a one-time **recovery code** minted at
  signup (shown once, stored only as a hash).
- **Email-free account** — sign up with no email at all; the recovery code is the
  only way back in. Most private; no email provider ever sees the account.
- Recovery-code login works from the login screen for either mode.
- *Roadmap:* passkeys / WebAuthn (device-bound, no shared secret, phishing-
  resistant) as the strongest no-email option.

## What we can't hide (stated plainly)

Email content is read (that's the product); a real name + address is needed to
execute an approved switch (a just-in-time, minimised, trust-logged disclosure);
email and push providers see metadata; lawful requests still apply.

## Not done here (honest scope)

- **Encryption at rest per subject** is a Supabase/KMS-time step — meaningless in
  the in-memory test store, so it is documented, not faked. The vault is the seam:
  per-subject keys live there in production.
- **True client-side E2EE** is incompatible with the core product (GiGi must read
  content to extract and summarise). The middle ground is per-subject keys in a
  KMS with access logging.
