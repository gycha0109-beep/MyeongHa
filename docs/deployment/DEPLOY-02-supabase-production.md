# DEPLOY-02 — Supabase production migration pipeline

## Production target

- Supabase project ref: `cnsfpcdiyofqvhpcegfc`
- Project: `MyengHa`
- Region: `ap-southeast-1`

## Release contract

Production database migrations are deployed only from GitHub `main` when files under `supabase/migrations/**` change. Changes to the production workflow itself also trigger the workflow so deployment-contract changes are exercised immediately after merge.

The workflow:

1. pins the Supabase CLI version,
2. links the exact production project,
3. inspects local/remote migration state,
4. repairs the single known legacy `0010` history mismatch only when its exact old version is present,
5. performs `supabase db push --dry-run`,
6. applies pending migrations with `supabase db push`,
7. verifies migration state after deployment.

The workflow uses GitHub's `production` environment and requires encrypted secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

No production seed is applied.

## One-time history bootstrap

The production database already contains the schema represented by `0010_auth_owner.sql`, but its remote migration history was recorded as version `20260830072444` with name `0010_auth_owner`.

The workflow detects that exact legacy version automatically. When present, it repairs only migration tracking:

- mark `20260830072444` reverted in migration history,
- mark local version `0010` applied,
- then dry-run and apply the remaining pending migrations.

After the old version disappears, this repair path becomes a no-op. An unrelated migration-list failure is not swallowed and fails the deployment.

This bootstrap does not re-run the `0010_auth_owner.sql` DDL.

## Vercel boundary

Vercel deployment remains restricted by `vercel.json` to the `main` branch. Feature, evidence, and other non-main branches that already contain this policy do not trigger Vercel deployments. Branches created before DEPLOY-01 retain their older branch-local configuration until they absorb current `main`.
