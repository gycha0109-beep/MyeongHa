# DEPLOY-02 — Supabase production migration pipeline

## Production target

- Supabase project ref: `cnsfpcdiyofqvhpcegfc`
- Project: `MyengHa`
- Region: `ap-southeast-1`

## Release contract

Production database migrations are deployed only from GitHub `main` when files under `supabase/migrations/**` change.

The workflow:

1. pins the Supabase CLI version,
2. links the exact production project,
3. shows local/remote migration state,
4. performs `supabase db push --dry-run`,
5. applies pending migrations with `supabase db push`,
6. verifies migration state after deployment.

The workflow uses GitHub's `production` environment and requires encrypted secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

No production seed is applied.

## One-time history bootstrap

The production database already contains the schema represented by `0010_auth_owner.sql`, but its remote migration history was recorded as version `20260830072444` with name `0010_auth_owner`.

Before the first normal production migration push, run the workflow manually once with `bootstrap_history=true`. This executes only migration-history repair commands:

- mark `20260830072444` reverted in migration history,
- mark local version `0010` applied,
- then dry-run and apply the remaining pending migrations.

This bootstrap does not re-run the `0010_auth_owner.sql` DDL.

## Vercel boundary

Vercel deployment remains restricted by `vercel.json` to the `main` branch. Feature, evidence, and other non-main branches do not trigger Vercel deployments.
