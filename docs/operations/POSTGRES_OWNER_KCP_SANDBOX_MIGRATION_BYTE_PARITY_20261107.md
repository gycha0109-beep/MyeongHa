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

## Four additional same-name remote version pairs — exact framing difference

Verified on exact `main` `dba6f436e90e9a83c27137fa218ab5115d048cf4`
without any migration-file changes since the source SHA above.
Each file was independently fetched from this Git revision and passed as a
**string literal only** to a Production `BEGIN TRANSACTION READ ONLY`
comparison against the exact applied ledger entry (one stored statement each).
The query did not execute the migration text.

| Git version | Applied remote version | Git bytes | Remote bytes | Exact comparison |
|---|---|---:|---:|---|
| `20261027125500` | `20261027043527` | 4,776 | 4,766 | Git source has final `\\n\\ncommit;\\n` only |
| `20261027163500` | `20261027074247` | 4,320 | 4,310 | Git source has final `\\n\\ncommit;\\n` only |
| `20261027185000` | `20261027081929` | 12,365 | 12,355 | Git source has final `\\n\\ncommit;\\n` only |
| `20261028110500` | `20261028011357` | 9,270 | 9,260 | Git source has final `\\n\\ncommit;\\n` only |

For every pair, all comparable character positions matched (first difference
position `null`); the remaining 10 UTF-8 bytes of the Git file were exactly
the trailing two line breaks, `commit;`, and final newline. The remote SQL
is therefore the Git file content with only that suffix omitted.

| Applied remote version | Git SHA-256 | Applied remote SHA-256 |
|---|---|---|
| `20261027043527` | `f7e5c9ddf7beda8b3438d2683f30a6287c085a25ff2dc9a20935ed84fe508ad2` | `c493715f0ecdac66e18b8649dce1ab79d15b20c926811b5399d1f735fb6af235` |
| `20261027074247` | `7ecf4d7c31dae19bd91aa88e090ba361f103b3a25e8a5f699f9fc1c715bd6368` | `3e44a8b80c97274760f64d655d3f596862041401003ecc108907e6fd04242186` |
| `20261027081929` | `6592feb9dbe20243ebe1b6f876cf0e82c74d313934d1187d3fa648e77fdbd89f` | `3673df5921fd53443623130dc37036b23da8b331ad2232d4911515a1a93b4176` |
| `20261028011357` | `f1f051cadc4745a599d1eb31f370567376d12f07f1a4ceecd19185da22082b6c` | `e248ae6880f6765305274c4541763a3a93d12ab6822540ef6f1b2f3e1e0967c4` |

The executable source-byte regression anchor is
`test/ops/owner-kcp-sandbox-migration-terminator-parity.test.mjs`;
it checks the four Git SHA-256 values and recomputes the remote digest after
removing exactly the 10-byte suffix. This does **not** prove deployed actor,
migration history version identity, full catalog parity, or Hosted restore
readiness. It does not authorize removal of the suffix from source files or
any Production SQL/migration action.

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
