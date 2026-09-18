# Database

The schema lives in `db/migrations/`, and it is the only description of it.
There used to be a `db/schema.sql` here that described a database nothing ran
against; it drifted from `src/lib/types.ts` within weeks, which is what a second
source of truth always does.

## How migrations run

They run themselves. `src/lib/db.ts` applies anything in `db/migrations/` that
is not yet recorded in `gigi_migrations`, on first use, once:

- a per-instance promise, so concurrent requests on one instance await one run;
- a Postgres **advisory lock**, so a deploy rolling out to ten lambdas at once
  serialises across the whole cluster;
- each migration inside its own transaction, so a failure leaves the database on
  the previous version rather than half-way into a new one.

There is no deploy step to remember, which is the point: a migration someone has
to run by hand is a migration that eventually does not get run.

## Adding one

Create `db/migrations/000N_what_it_does.sql`. Files are applied in filename
order, so the number is the ordering. Two rules:

1. **Never edit an applied migration.** It has already run everywhere; editing
   it changes only what a fresh database gets, and the two silently diverge.
   Write another one.
2. **Keep it forward-compatible for one deploy.** Vercel serves old and new code
   at the same time during a rollout, so a migration must not break the version
   that is still running: add a column before writing to it, stop writing to one
   before dropping it.

## Local

```
createdb gigi_dev
DATABASE_URL=postgresql://localhost/gigi_dev npm run dev
```

The demo household and any `GIGI_DEV_USERS` accounts seed themselves the same
way, under the same kind of lock (`src/lib/store.ts`).
