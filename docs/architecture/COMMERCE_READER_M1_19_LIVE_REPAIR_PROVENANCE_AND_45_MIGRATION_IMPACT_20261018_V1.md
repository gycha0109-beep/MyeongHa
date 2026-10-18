# M1-19 — Live-only SeYeon ACL recovery provenance and all 45 unapplied migrations: impact/approval audit

> 2026-10-18 (Asia/Seoul) · `commerce` · Project: connected production Supabase `MyengHa` · **strictly read-only production inspection; NO production migration/grant/history repair**

## Executive determination

**`HOLD_LIVE_REPAIR_OVERLAY_AND_45_CROSS_TRACK_MIGRATIONS`**. The owner's approval covers a **minimal read-only Receipt status capability**, not the production rollout of dozens of SeYeon, Saju, Character/Face, private cancellation, or private D2 Writer migrations. The M1-17 SQL/ACL was proven on isolated PostgreSQL15/17 and M1-18 passed all CI, but production remains at the earlier migration baseline.

As of this inspection:
- **217** migration SQL files in source; **173** installed migration versions in live Supabase; **45** checked-in versions are not installed; **1** installed version has no corresponding source migration filename.
- 1460, 1470, 1480, 1490, 1500 and 1510 exist in **both** migration ledgers. These are not six of the 45 missing versions.
- Live **1820 D2 issuer / binder functions** and **1970 minimal Receipt read function** do not exist. The live M1-18 SELECT-only catalog gate returned **`HOLD_MISSING_PRIVATE_D2_BASELINE`**. Existing `myeongha_api_executor` SELECT on protected source ledgers remains DENIED.

## Recovered live-only migration: factual findings

Version `20261008090417` exists in `supabase_migrations.schema_migrations`, name `seyeon_runtime_1460_1510_acl_before_owner_recovery`. Contrary to the earlier incomplete identification, **the live ledger stores its actual SQL**, and we inspected it with read-only SQL. This gives the migration's *content provenance*; it does not independently prove the human author, deploy command, deployment review or equivalence to current GitHub files.

| Observed attribute | Exact evidence |
|---|---|
| SQL statements in ledger | **1**, containing a large multi-command SQL string |
| SQL length | **104,021 characters** |
| `md5(array_to_string(statements, E'\n'))` | `f70776d8c0f6369f6f13484ba9fa2271` |
| `CREATE OR REPLACE FUNCTION` occurrences | **19** |
| `ALTER FUNCTION` occurrences | **18** |
| `CREATE POLICY` / `DROP POLICY` occurrences | **19 / 19** |
| `GRANT` / `REVOKE` keyword occurrences | **86 / 34** |
| Objects currently present | All **19 named functions** and all **19 named policies** |
| Function security / owner signals | **17** function names have SECURITY DEFINER variants; **18** function names have an existing `myeongha_*` owner (catalog-level name counts) |

The SQL begins with an explicit `$safe_pre$` preflight referring to 1460–1510, dedicated SeYeon runtime owner roles, affected RLS policies and the existing Chat command. Its body contains SeYeon runtime relationship reads, relationship Outbox sync, personal-context queries, governed Chat commands, post-turn analysis and ownership/ACL repair. This is a **substantial historical recovery overlay**, not an empty/benign migration marker, not a minimal Receipt read grant, and not a one-line schema migration.

**Do not re-run or delete/repair the history row.** Its 19 installed functions and 19 policies have live definitions and ACLs that may differ from checked-in 1460–1510 source. Mere matching names do not prove bytewise, transactional or security equivalence. Source/SQL comparison and live `pg_get_functiondef`, `pg_get_userbyid`, `pg_policies` and `pg_proc.proacl` evidence must be reviewed by the owners before any future history repair. We deliberately did not copy the 104 KB privileged SQL into a new deployable migration; we captured its digest, explicit object-name inventory and the 173 installed versions in `docs/architecture/evidence/M1_19_LIVE_MIGRATION_HISTORY_20261018.json`.

## The 45 unapplied migrations: nine independent impact classes

**All files were checked in GitHub and the categories are domain/authority labels, not blanket safe-to-run assertions.** The executable M1-19 script reads every source SQL, emits the exact 45 filenames, wave, owning review and conservative SQL-lexical indicators (CREATE TABLE/ROLE/FUNCTION, RLS, GRANT/REVOKE, owner changes, possible writer code). SQL appearing *inside a dormant stored procedure* is not proof the statement has run against live data.

| Gate | Exact versions | Count | Impact / release owner |
|---|---|---:|---|
| P0 — privacy finalizer | `1520` | **1** | Replaces account deletion finalizer; privacy/DB approval, destructive *on invocation* |
| P1 — Character/Face artifact | `1530` | **1** | New durable artifact, private function, RLS; Character/Face/privacy/DB |
| P2 — Saju proof | `1540` | **1** | Nonce replay table, proof roles/RLS; Saju Bridge/Security |
| P3 — SeYeon AI cost/governor | `1550–1650`, `1670–1710` (step 10) | **16** | Cost ledger, admission, settlement, governed role, provider outcome queue; AI Cost/Character Memory/Security |
| P4 — dormant Reader discovery | `1660`, `1720` | **2** | Existing Character thread locator, server-owned Reader product-scope read; Reader/Product/DB |
| P5 — private Reader locks + D2 | `1740–1820` (step 10) | **9** | Ordered product/Reader locking and private verified Receipt issue/bind; Commerce/DB/Security **no runtime issuer** |
| P6 — cancellation + Writer ACL closure | `1830–1900` (step 10) | **8** | Private verified cancellation/revoke, review bridge, legacy Writer Execute fence; Commerce Payment/DB/Security |
| P7 — private cancel operations | `1910–1960` (step 10) | **6** | Durable cancel inbox, worker claims, ops reviews, alert outbox, dual approval, retry; Commerce Operations/Security |
| P8 — approved minimal read | `1970` | **1** | Subject-scoped HOLD-only Receipt projection; **approved design**, production prerequisites unsatisfied |

**Total: 45.** The full source filenames are already enumerated in M1-18's cutover report; the M1-19 executable emits them as individual records with their own feature flags and required reviewer.

Material non-commerce risks:
- `1520`: modifying account-deletion finalization is a privacy/destructive operation *when invoked* even though applying its `CREATE OR REPLACE FUNCTION` does not itself delete rows. Requires account lifecycle regression.
- `1530`/`1540`: new Character/Face and Saju proof storage/ACLs; unrelated to the read capability approval.
- `1550–1710` excluding `1660`: SeYeon cost admission, legacy settlement replacement, new roles and queue ownership; do **not** silently turn AI billing/governor modes ON.
- `1740–1900`: private D1/D2 and refund/cancel functions are *not* authorized operational payment Workers; preserving runtime Writer EXECUTE denial and lock order is mandatory.
- `1910–1960`: new durable cancellation operations surfaces must not receive service credentials, schedules, alerts or provider callbacks simply by being staged.
- `1970`: only narrow read EXECUTE is owner-approved; no raw source table SELECT, D2 Writer, provider charge/refund, paid T2 or saleability approval.

## Required staged ordering, not an automatic migration batch

1. **Provenance gate:** Archive the live `20261008090417` SQL digest and 19/19 object inventory (done). Obtain deployment ticket/actor/source provenance and review actual live function definitions/owners/ACL/RLS against 1460–1510 source. No `supabase migration repair` or re-run of the historical restoration overlay until reconciled.
2. **Cross-domain independent reviews:** Run throwaway PG17 migrations for `1520` privacy finalizer, `1530` Character/Face and `1540` Saju proof, then the SeYeon cost/governor chain `1550–1710` with `1660` tracked to Reader ownership. Review data retention, legacy compatibility, roles and `SECURITY DEFINER` implications, not just SQL syntax.
3. **Reader-read prerequisites:** Review `1720` and Reader Product policy/selection under its own approval, with private Writer and paid Reader still denied.
4. **Private D1/D2 stage:** Review/execute `1740–1820` **only in a disposable or non-production PG17 target**. Preserve D1 lock ordering, verified Receipt provenance and M1-02..16 idempotency, MVCC and ACK-loss acceptance.
5. **Cancellation/ACL stage:** Review `1830–1900` as a separate migration and authorization boundary; mandatory `1900` function surface closure must be verified. No live provider cancellation or refund.
6. **Private operations stage:** Independently review `1910–1960`. New private inboxes/queue/outbox must stay without operational triggers, credentials, cron or callbacks.
7. **M1-17 minimum read:** After staged prerequisite parity, stage only `1970` and validate exact API-role EXECUTE under server-verified subject context; verify anon/auth/service roles and direct ledger SELECT remain blocked. All results continue HOLD-only, no paid T2.
8. **Promotion gate:** Re-evaluate the **fresh**, not archived, live Supabase migration ledger AND read-only M1-18 catalog gate; require owner/DB/Security approval of migration wave, backup/restoration proof, rollback boundary and CI. Only then consider live deployment. No bulk replay, `db reset`, manual version insertion, or out-of-order `1970` GRANT.

**The above describes a constrained dependency investigation and staged test order, not a grant of authority to apply all migrations.** If a narrower Reader-only production cutover is desired, that would require redesigning and verifying an independent schema/ACL contract rather than skipping middle version dependencies or silently modifying live history.

## Reproducibility and acceptance

`scripts/commerce/m1-19-live-migration-impact-audit.mjs` reads the exact captured 173-version ledger and each current checked-in migration. It fails closed on duplicate versions, new source mismatch, missing ownership wave, recovered 104KB SQL fingerprint drift or stale count assumptions, outputs nine impact classes and all 45 source file details, and **never** authorizes deployment. `scripts/commerce/m1-19-live-migration-impact-audit.test.mjs` checks counts, real key SQL signals, exception/HOLD behavior and prevents a false 'release approved' result.

Run this matrix in the existing isolated PostgreSQL15 Content gate alongside M1-18 catalog and permission-drift probes. At exact PR HEAD require Commerce Work Track, PG15 Content, db-authority-core, Governance, Web PR and CI Verify; skipped PG17/payment/entitlement/runtime jobs are not proof of success.

**Live project mutations for M1-19: zero.** All Supabase operations were read-only SQL and migration-list inspection. No migration repair or GRANT, PR merge, private D2 credentials, live payment/refund, Saju authority promotion or paid Reader exposure.
