# Platform Integrity — Production `public` Schema ACL Provenance (2026-09-05)

## Status

- Evidence scope: production PostgreSQL `public` schema ACL provenance only.
- Evidence mode: direct catalog reads inside an explicit `BEGIN READ ONLY` transaction.
- Production mutation: **none**.
- Schema ACL migration: **not authorized by this evidence**.
- PI-P0-04: **not globally closed**. The application object/routine ACL path remains remediated and the external Data API remains contained, while the `supabase_admin` future default-ACL residual remains `OPEN-PLATFORM`.

## Repository baseline

PR #417 (`test: prove schema usage containment model`) was squash-merged to `main` as:

`571fe7d46b91798b776ea58be303008b8ede9bc5`

The PR added a CI-only disposable-schema model showing that object-level table/sequence/function grants are unusable without schema `USAGE`, while an explicitly allowlisted executor path remains usable.

Exact-head PR validation completed with 18/18 workflows successful. Merged-main push validation completed with 17/17 workflows successful; CI `foundation` and `db-authority-core` both succeeded, including the deterministic schema catalog snapshot that invokes the schema-usage authority model probe.

This model is a containment proof only. It does not by itself authorize changing production `public` schema ACLs.

## Read-only production query authority

The production catalog query reported:

- `current_user = supabase_read_only_user`
- `session_user = supabase_read_only_user`
- `transaction_read_only = on`
- current database: `postgres`
- database owner: `postgres`
- query role membership in `pg_database_owner`: false
- query role usage of `pg_database_owner`: false

The query performed catalog reads only. No `GRANT`, `REVOKE`, `ALTER`, `CREATE`, `DROP`, or other DDL/DCL was executed.

## Raw `public.nspacl`

The production `public` schema owner is `pg_database_owner`.

Raw and effective `nspacl` were identical:

```text
{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner,postgres=U/pg_database_owner,anon=U/pg_database_owner,authenticated=U/pg_database_owner,service_role=U/pg_database_owner,myeongha_birth_profile_create_owner=U/pg_database_owner,myeongha_guest_promotion_owner=U/pg_database_owner}
```

Exploded ACL entries show `pg_database_owner` as grantor for every current schema ACL entry:

| Grantee | Privilege | Grantable |
| --- | --- | --- |
| `PUBLIC` | `USAGE` | false |
| `anon` | `USAGE` | false |
| `authenticated` | `USAGE` | false |
| `service_role` | `USAGE` | false |
| `postgres` | `USAGE` | false |
| `myeongha_birth_profile_create_owner` | `USAGE` | false |
| `myeongha_guest_promotion_owner` | `USAGE` | false |
| `pg_database_owner` | `USAGE` | false |
| `pg_database_owner` | `CREATE` | false |

There are no direct `public.nspacl` entries for `myeongha_runtime` or `myeongha_api_executor`, although both currently have effective `USAGE` on `public`.

## Initial privilege provenance

`pg_init_privs` contains an initial privilege record for `pg_namespace` object `public`:

```text
{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner}
```

Therefore:

1. `PUBLIC USAGE` is present in the recorded initial schema privilege baseline.
2. The direct `anon`, `authenticated`, `service_role`, `postgres`, and narrow MyeongHa-owner `USAGE` entries are additions beyond that initial record.
3. The catalog proves current grantor and initial-vs-current ACL state, but it does not provide a timestamped historical audit trail identifying which external platform operation added each post-initial direct grant.

## Effective schema access

Production effective checks currently report `USAGE=true`, `CREATE=false` for:

- `anon`
- `authenticated`
- `authenticator`
- `service_role`
- `myeongha_runtime`
- `myeongha_api_executor`
- `myeongha_birth_profile_create_owner`
- `myeongha_guest_promotion_owner`
- `supabase_auth_admin`
- `supabase_storage_admin`
- `supabase_realtime_admin`
- other inspected Supabase managed roles

`postgres`, `pg_database_owner`, and `supabase_admin` also have effective `CREATE` through their privileged ownership/role context.

Relevant memberships include:

- `myeongha_runtime` is a member of `myeongha_api_executor`.
- `authenticator` is a member of `anon`, `authenticated`, and `service_role` with `NOINHERIT` behavior on `authenticator` itself.
- multiple Supabase managed roles participate in platform-managed memberships.

## Security interpretation

### 1. Revoking only `PUBLIC USAGE` would not contain `anon` or `authenticated`

Both roles have direct `USAGE` entries in production `public.nspacl`. A `REVOKE USAGE ON SCHEMA public FROM PUBLIC` by itself would leave those direct grants intact.

### 2. Revoking only direct `anon` / `authenticated` schema `USAGE` would also not contain them

`PUBLIC` itself has `USAGE`, and every role receives privileges granted to `PUBLIC`. Removing only the direct entries would therefore leave effective schema `USAGE` through `PUBLIC`.

### 3. Removing `PUBLIC USAGE` is not an application-only ACL change

Several application and Supabase-managed roles currently have effective `public` schema `USAGE` without a direct `public.nspacl` entry. A production `PUBLIC USAGE` revoke would therefore alter the shared schema-access baseline for more than the two Data API roles unless explicit replacement grants and platform dependencies were established first.

### 4. Schema `USAGE` is not the current external data exposure boundary

Current governed production evidence already establishes:

- PostgREST `db_schema` is empty, so the external Data API is contained.
- existing `anon` / `authenticated` / `PUBLIC` application table privileges in `public` are zero.
- existing `anon` / `authenticated` / `PUBLIC` application routine privileges in `public` are zero.
- current `supabase_admin` ownership of public application objects/routines is zero.

Schema `USAGE` alone does not restore missing object privileges. The residual risk remains future privilege recurrence, especially `supabase_admin` default ACL behavior, rather than a current object-level exposure.

## Decision

**HOLD production schema ACL mutation.**

Do not add a migration that revokes `PUBLIC`, `anon`, `authenticated`, or managed-role `USAGE` on `public` from this evidence alone.

Required reasons:

- `PUBLIC USAGE` is part of the recorded initial schema privilege baseline.
- `anon` and `authenticated` also have direct schema `USAGE`, so a single revoke is insufficient.
- application runtime roles and multiple Supabase-managed roles currently depend on effective schema `USAGE` without equivalent direct ACL entries.
- removing the baseline would require an explicit replacement-grant matrix plus authoritative platform compatibility and rollback evidence.
- current external containment and current object/routine grant remediation do not require this production schema mutation.

## Classification after provenance audit

```text
External Data API
→ CONTAINED

Existing anon/authenticated/PUBLIC application object ACL
→ REMEDIATED / production verified zero

postgres-owned future public default ACL
→ REMEDIATED / production verified

schema-usage containment model
→ CI PROVEN / merged-main verified

production public.nspacl provenance
→ READ-ONLY EVIDENCE COMPLETE

production public schema USAGE mutation
→ HOLD / NOT AUTHORIZED

supabase_admin public future default-ACL recurrence
→ OPEN-PLATFORM

PI-P0-04 umbrella
→ APPLICATION PATH REMEDIATED
→ EXTERNAL SURFACE CONTAINED
→ SCHEMA ACL PROVENANCE RESOLVED TO HOLD
→ PLATFORM DEFAULT-ACL FOLLOW-UP OPEN
```

## Follow-up boundary

A future proposal to remove production `public` schema `USAGE` must first provide all of the following:

1. an explicit replacement-grant matrix for every MyeongHa runtime/owner role that still needs schema lookup;
2. evidence covering Supabase-managed roles that currently rely on effective `public` schema `USAGE`;
3. a rollback procedure that does not depend on an authority unavailable to the production migration principal;
4. exact-head CI covering the proposed production role matrix;
5. a fresh read-only production preflight immediately before any mutation.

Until those conditions exist, the correct action is evidence retention and drift monitoring, not schema ACL mutation.
