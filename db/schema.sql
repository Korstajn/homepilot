-- =============================================================================
-- GiGi — database schema (Postgres / Supabase EU-West or EU-North)
-- =============================================================================
-- The beta test build ships with an in-memory store (src/lib/store.ts) so it
-- boots on Render with zero setup. This file is the real schema to migrate to
-- when you graduate: the in-memory types in src/lib/types.ts mirror it 1:1, so
-- swapping the store is a localized change behind the same API.
--
-- Principle: UK + EU data only. No user *content* (email bodies) is stored — we
-- persist only extracted, structured fields plus the household's own inputs.
-- =============================================================================

create extension if not exists "pgcrypto";

-- --- Households --------------------------------------------------------------
create table households (
  id                 uuid primary key default gen_random_uuid(),
  owner_name         text not null,
  email              text not null unique,
  market             text not null default 'uk' check (market in ('uk','se')),
  currency           text not null default 'GBP' check (currency in ('GBP','SEK')),
  timezone           text not null default 'Europe/London', -- IANA; drives 02:00/07:00 jobs
  adults             text not null check (adults in ('1','2','3+')),
  children           text not null check (children in ('none','1-2','3+')),
  postcode           text,
  forwarding_address text not null unique,                  -- forward-to-GiGi (no OAuth in beta)
  connection_status  text not null default 'pending'
                       check (connection_status in ('pending','active','degraded')),
  digest_time        text not null default '07:00',
  digest_paused      boolean not null default false,
  created_at         timestamptz not null default now()
);

-- --- Members (family accounts) ----------------------------------------------
-- Adults (owner + co-parents) and teens who can log in. Auth lives here, not on
-- households. Younger children are profiles (below) with no login.
create table members (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,
  email         text not null,
  role          text not null check (role in ('owner','adult','teen')),
  status        text not null default 'invited' check (status in ('active','invited')),
  password_hash text,               -- set when they accept the invite
  invite_token  text unique,        -- present while invited
  created_at    timestamptz not null default now()
);
create unique index on members (lower(email)) where status = 'active';
create index on members (household_id);

-- --- Children (profiles, no login) ------------------------------------------
-- Special-category data — kept minimal (see docs/DECISIONS.md, DPIA).
create table children (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  name            text not null,
  year_group      text,
  passport_expiry date,
  created_at      timestamptz not null default now()
);
create index on children (household_id);

-- --- Calendar events (iCalendar-compatible) ---------------------------------
create table calendar_events (
  id                   text primary key,       -- also the iCal UID
  household_id         uuid not null references households(id) on delete cascade,
  summary              text not null,
  description          text,
  location             text,
  category             text not null default 'other'
                         check (category in ('school','travel','bill','appointment','other')),
  start_at             text not null,          -- 'YYYY-MM-DD' (all-day) or ISO datetime
  end_at               text,
  all_day              boolean not null default true,
  tzid                 text,
  rrule                text,                   -- recurrence (reserved)
  alarm_minutes_before int,
  source               text not null default 'manual' check (source in ('manual','derived')),
  related_child_id     uuid references children(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index on calendar_events (household_id);
-- households.calendar_token holds the secret, revocable ICS-feed token:
alter table households add column if not exists calendar_token text unique;

-- --- Bills -------------------------------------------------------------------
create table bills (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references households(id) on delete cascade,
  provider            text not null,
  type                text not null default 'other'
                        check (type in ('broadband','energy','mobile','tv','insurance','other')),
  amount              numeric(10,2),           -- null over guessing
  currency            text not null default 'GBP',
  renewal_date        date,                    -- null over guessing (ISO)
  price_increase_flag boolean not null default false,
  source              text not null default 'extracted'
                        check (source in ('extracted','manual','seed')),
  confirmed           boolean not null default false,
  created_at          timestamptz not null default now()
);
create index on bills (household_id);
create index on bills (renewal_date);

-- --- Digests + items ---------------------------------------------------------
create table digests (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  digest_date   date not null,
  quiet_line    text,                          -- minimum-mode line when 0 items
  delivered     boolean not null default false,
  opened_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (household_id, digest_date)
);
create index on digests (household_id, digest_date desc);

create table digest_items (
  id                 uuid primary key default gen_random_uuid(),
  digest_id          uuid not null references digests(id) on delete cascade,
  category           text not null check (category in ('bill','school','travel','system')),
  urgency            text not null check (urgency in ('today','soon','upcoming')),
  line               text not null,            -- <=10 word action line
  detail             text,
  executable         boolean not null default false,
  is_overflow        boolean not null default false, -- beyond the top 4
  saving_annual      numeric(10,2),
  current_price      numeric(10,2),
  new_price          numeric(10,2),
  related_bill_id    uuid references bills(id) on delete set null,
  status             text not null default 'open'
                       check (status in ('open','approved','done','dismissed')),
  first_surfaced_at  timestamptz not null default now(),
  carry_forward_count int not null default 0
);
create index on digest_items (digest_id);

-- --- Action log (approve-to-execute) ----------------------------------------
create table action_logs (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  item_id       uuid,
  action        text not null check (action in ('approve','done','dismiss')),
  outcome       text not null,
  saving_annual numeric(10,2),
  created_at    timestamptz not null default now()
);
create index on action_logs (household_id, created_at desc);

-- --- Instrumentation (every §7 metric depends on this) ----------------------
create table analytics_events (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid references households(id) on delete set null,
  name          text not null,
  props         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index on analytics_events (name);
create index on analytics_events (created_at desc);

-- --- Feedback (wrong-extraction reports = training data) --------------------
create table feedback (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid references households(id) on delete set null,
  kind            text not null check (kind in ('wrong_extraction','general')),
  message         text not null,
  related_bill_id uuid references bills(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- --- Waitlist (two-step segmentation) ---------------------------------------
create table waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  segment    text not null check (segment in ('household','company')),
  source     text not null default 'landing',
  created_at timestamptz not null default now()
);
create index on waitlist (segment);

-- --- Trust log (user-facing processing lineage) -----------------------------
-- What the USER sees: exactly what happened with their data, in plain language.
-- Metadata only — never email bodies or amounts. Hash-chained so it is provably
-- append-only (each row hashes the previous one).
create table processing_events (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  at           timestamptz not null default now(),
  action       text not null check (action in (
                 'account_created','email_received','analyzed_on_server','sent_to_ai',
                 'ai_returned','stored','digest_generated','shared_for_execution',
                 'connection_changed','data_deleted')),
  category     text not null check (category in ('bill','digest','account','system')),
  actor        text not null check (actor in ('you','gigi_server','gigi_ai','email_service','concierge')),
  detail       text not null,   -- plain-language, metadata only
  purpose      text not null,   -- why it happened
  legal_basis  text not null,   -- GDPR basis in plain words
  region       text not null,
  duration_ms  int,
  prev_hash    text not null,
  hash         text not null
);
create index on processing_events (household_id, at);
-- Note: on erasure, content tables cascade-delete, but the processing_events
-- row recording the deletion is written *after* and deliberately kept as proof.

-- Row-level security is expected once Supabase Auth is wired: each household
-- reads only its own rows. Omitted here since the beta build is single-tenant.
