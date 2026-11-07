# Phase 8-A — Owner KCP sandbox migration version-pair SQL byte parity

> Date: 2026-11-07 KST
> Track: `ops`
> Exact GitHub `main` SHA: `a8f843b901d513b592f9a8ec70697f42c0ed90fd`
> Production Supabase project: `cnsfpcdiyofqvhpcegfc`
> Verdict: **EXACT SQL-BYTE EQUALITY OBSERVED; VERSION IDENTITY AND DEPLOYMENT PROVENANCE NOT PROVEN**

## Verified observation

The `main` file
`supabase/migrations/20261029012000_owner_kcp_sandbox_remove_daily_limit_v1.sql`
was fetched at the SHA above, independently of the Production history.
Its text was passed as a SQL dollar-quoted **comparison input** inside
`BEGIN TRANSACTION READ ONLY` / `ROLLBACK`; no SQL from the file was executed.

The Production comparison read
`supabase_migrations.schema_migrations` entry
`20261029012948`, which has exactly one stored statement, and used
PostgreSQL `convert_to(..., 'UTF8')`, `octet_length`, `sha256`,
`encode(..., 'hex')`, equality and the first differing character position.

| Check | Exact observed result |
|---|---|
| Git migration version | `20261029012000` |
| Applied Production migration version | `20261029012948` |
| Production ledger entry present | true |
| Stored statement count | 1 |
| Git SQL byte count | 7,349 |
| Applied SQL byte count | 7,349 |
| Git SQL SHA-256 | `b544d06947b31d3d6593ef29e611ac062fe86455caf23ac2f91925b839de86e6` |
| Applied SQL SHA-256 | `b544d06947b31d3d6593ef29e611ac062fe86455caf23ac2f91925b839de86e6` |
| Exact text equality | true |
| Trimmed text equality | true |
| First differing character (1-based) | null |
| Transaction read-only mode | on |

The earlier 2026-11-07 operations roadmap records a 7,349-byte remote
statement versus a 7,541-byte repository comparator. **That earlier observation
must not be silently reclassified as false:** its repository snapshot and/or
comparison input differ from the exact newer `main` source above. These
two dated observations can coexist. This check resolves the **current
exact-SHA source-vs-applied statement** discrepancy only.

## Residual disposition

- `SQL_BYTES_EQUAL_AT_OBSERVED_MAIN_SHA`: **proven**.
- `MIGRATION_VERSION_IDENTITY_EQUAL`: **false** (exact version IDs differ).
- `ORIGINAL_DEPLOYMENT_ACTOR_AND_APPLY_PROVENANCE_PROVEN`: **false**.
- `FULL_PROVIDER_MIGRATION_LEDGER_RESTORE_PROVEN`: **false**.
- `PRODUCTION_SCHEMA_OWNER_ROLE_POLICY_RESTORE_PARITY_PROVEN`: **false**.
- Production action: **READ_ONLY_KEEP_CURRENT_STATE**.

No repair of migration history, reapplication, forward DDL/DML, Production
role/ACL change, rollback, DR recovery or Production privacy canary was
performed or approved. Continue classifying all remaining remote-only and
repository-only versions and checking the effective live/isolated
catalog authority. Keep P0 #1887 OPEN, `dr_ready=false`,
`serviceResumptionAllowed=false`, Phase 8 BLOCKED.

Watchtower-Track: ops
