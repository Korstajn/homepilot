-- =============================================================================
-- 0002_google_calendar — one-way, read-only import of a household's Google
-- calendars.
-- =============================================================================
-- Google is the source of truth and GiGi holds a reflection. That is the whole
-- shape of this, and the schema says so: imported rows carry `source='google'`
-- and the calendar they came from, so a sync can reconcile its own rows without
-- ever touching one a person typed in.
-- =============================================================================

-- --- Which calendars a household has chosen to bring in -----------------------
create table if not exists google_calendars (
  household_id     text not null references households(id) on delete cascade,
  -- Google's own calendar id, which for a personal calendar is an email
  -- address. It is an identifier, not a mailbox we would ever write to.
  calendar_id      text not null,
  summary          text not null,
  time_zone        text,
  is_primary       boolean not null default false,
  background_color text,
  -- Off by default. Connecting an account must not silently pull in every
  -- calendar Google has attached to it — the holidays, the birthdays, a
  -- colleague's shared diary — so a calendar arrives listed and unselected and
  -- the household ticks the ones it wants.
  selected         boolean not null default false,
  -- What GiGi should treat events from this calendar AS. The digest ranks by
  -- category, so a calendar called "School" mapped to 'school' is the
  -- difference between the feature working and a pile of undifferentiated
  -- entries. Chosen by the household, never guessed from the name.
  category         text not null default 'other'
                     check (category in ('school','travel','appointment','other')),
  last_synced_at   timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  primary key (household_id, calendar_id)
);
-- The sync reads only the selected ones, on every run.
create index if not exists google_calendars_selected_idx
  on google_calendars (household_id) where selected;

-- --- Imported events -----------------------------------------------------------
-- 'google' joins 'manual' and 'derived'. A check constraint has to be replaced
-- rather than extended, and it is named explicitly so this is idempotent and so
-- the next migration can find it.
alter table calendar_events drop constraint if exists calendar_events_source_check;
alter table calendar_events
  add constraint calendar_events_source_check
  check (source in ('manual','derived','google'));

-- Which Google calendar a row came from. The source_ref already encodes it, but
-- parsing an identifier out of a string to decide what to delete is how a
-- reconcile ends up deleting the wrong thing.
alter table calendar_events add column if not exists external_calendar_id text;

-- The reconcile asks, per calendar: "which of my rows in this window is Google
-- no longer sending me?" That is this index.
create index if not exists calendar_events_external_idx
  on calendar_events (household_id, external_calendar_id, start_at)
  where external_calendar_id is not null;
