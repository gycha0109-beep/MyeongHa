# M1-21 — Disposable PG17 four-boundary atomic fault / ACL / idempotence rehearsal

> 2026-10-17 · Watchtower-Track: commerce · **Draft only**. No production DDL, grants, migration-history repair, charges/refunds, private issuer execution, or paid Reader publication.

## Scope and inherited safety state

M1-19 #2240 classified **45 missing repository migration versions** in nine Owner/risk groups; the live-only `20261008090417` SeYeon 104,021-byte restore statement is identified but not reconciled. M1-20 #2248 pinned the exact reviewed SQL blobs and proved that the complete repository source replay works in fresh PG17 (explicitly excluding 0860 managed-principal authority). This is *not* historical production migration/data parity.

M1-21 preserves the same `HOLD_M1_20_OWNER_STAGING_AND_RESTORE_EVIDENCE_REQUIRED` source gate and adds executable recovery/security evidence at four key SQL source boundaries: **1820 private D2 issuer/binder, 1890 legacy cancel writer fence, 1900 remaining private writer closure, 1970 minimal read**. These are source-tree candidate milestones and **not** a deployable rollout recipe.

## Executable proof

- `test/db/official_reader_m1_21_pg17_fault_replay.sh`: requires `CI=true`, `PGHOST=localhost`, `PGUSER=postgres`, `PGDATABASE=myeongha_ci_case_*`, PG17 and no production connection settings. Before any SQL, checks the 45 pinned blob sources, unknown/altered versions, known live-only history marker, and explicit HOLD/non-authorization. Starts in a **fresh disposable database** and applies the actual repository migrations in order, with the inherited **0860 skip**.
- For each **1820, 1890, 1900, 1970** migration, hashes the current public function definitions/ACL/owner, relation ACL/RLS and role membership metadata, then executes the **actual candidate SQL inside a single transaction** followed by a synthetic division-by-zero. The exact synthetic error must be observed; an ordinary source error does not pass. The test requires a matching pre-/post-failure catalog fingerprint (no partially surviving object/ACL change).
- Executes each identical SQL file in a transaction successfully, immediately checks private/legacy writer EXECUTE closure after 1820/1890/1900, then replays the same SQL **once more** and requires the catalog/ACL fingerprint and Writer closure to be identical. This tests *schema/ACL replay idempotence in this fixture only*; not double-application of live commerce effects.
- `test/db/official_reader_m1_21_pg17_stage_acl.sql`: explicit expected functions at each stage, exactly one function per name, PUBLIC default EXECUTE revoked, and all six non-owner runtime identities without inherited EXECUTE. This does not call any Writer or live Provider integration.
- At the end the existing `test/db/official_reader_m1_18_live_cutover_readonly_gate.sh` rechecks that API can EXECUTE **only** the approved minimal read and cannot SELECT original source tables or execute private D2 Writers; four deliberately widened ACL cases must each HOLD and roll back. The positive gate says `CATALOG_READY_MIGRATION_HISTORY_STILL_REQUIRED`, **not production ready**.
- Routed via existing shared `scripts/ci/db-suites.json` / `test/db/run_ci_case.sh` PG17 suite. No new one-off workflow, fake green result or CI skip.

## Limits and remaining HOLDs

1. The 104KB remote-only SeYeon restore statement and its unusual empty 1460–1510 markers are **not replayed**; no migration ledger parity is claimed. Continue #1887 SeYeon Owner/DR reconciliation.
2. CI uses `postgres:17.6` stock service superuser and bootstrap auth stubs, *not* production Supabase's managed non-superuser role chain, actual production backup or data. Fingerprints cover the deliberately selected catalogs, not all data, triggers, policies, dependencies, session grants or Supabase-enforced metadata.
3. Synthetic failure occurs **after** the source SQL before commit. It does **not** simulate server crash, individual statement timeouts, mid-transaction kill, connection loss, partial autocommit migration runners, external side effects or compensating refunds. Repeat execution proves only catalog-stable replay under this isolated fixture.
4. Database/security, Privacy/Identity, Saju/Reader, SeYeon and Commerce Owners must independently approve their migration groups and a data-safe nonproduction restore + DR and rollback practice. M1-18 catalog and history parity must both pass on the agreed target state; `SKIPPED` is not PASS.
5. **Deployment remains HOLD.** No production SQL/ACL/ledger modification; no purchase, refund, issuer, provider worker, entitlement writer or paid Reader activation. Explicit operational release permission is required independently of this Draft PR and CI.

**Expected CI evidence:** four `PASS_M1_21_FAULT_ROLLBACK`, four `PASS_M1_21_COMMIT_REPLAY_ACL`, successful final M1-18 catalog/negative ACL probes, and `HOLD_M1_21` line. Until the exact HEAD runs finish, do not claim PASS.
