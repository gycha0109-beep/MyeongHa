# #1887 — Official Reader Production DB read-only reconciliation checkpoint (2026-10-26)

Status: **HOLD — evidence collected, no Production reconciliation or DR acceptance**.
Scope: current MyeongHa Reader branch PR #2301, existing issue #1887. This file is an observation, not a Production deployment approval or a substitute for the live migration ledger.

## Exact production migration-ledger observation

Connected Supabase project: `cnsfpcdiyofqvhpcegfc`, PostgreSQL 17.6.
SELECT-only, with no Production SQL body, customer row, ACL listing or secret exported.

- Remote-only version `20261008090417`: one persisted statement, name `seyeon_runtime_1460_1510_acl_before_owner_recovery`, UTF-8 byte count **104021**, SHA-256 **4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894**. Matches the existing investigation fingerprint.
- Individual versions `1460..1510`: **6/6** registered with empty statement arrays (these are markers; NOT independently executed SQL proofs).
- `1520..1640`: **13/13** registered; `1650..1720`: **8/8** registered. Thus `1520..1720` currently have **21/21 registration**. This supersedes stale prose calling all 21 absent; registration alone is not exact DDL/ACL or rollback equivalence.
- Historical actor identity research is already `CLOSED_RISK_ACCEPTED` by the product owner under #1887. Do not reopen it as a development prerequisite. This does not authorize a replay, rewrite, or `migration repair`.

## Exact 19-function PostgreSQL catalog comparison

Read-only `pg_catalog` functions were executed against Production and an isolated, disposable `postgres:17.6` instance applying the current checked-out repository migrations (the established PG17 test harness skips managed-principal 0860). The comparable scope is **19 Se-yeon runtime functions**, **not** the whole database or the original 104KB SQL source chronology.

Use `scripts/operations/seyeon-r2-rpc-per-function-parity-readonly.sql` in both environments. It exports ONLY function names, SHA-256 catalog fingerprints and two browser EXECUTE booleans. Do not export definitions, role/ACL text, migration SQL or user data.

| Comparison at measurement | Result |
| --- | --- |
| 19 named functions present | 19/19 both |
| Signatures equal | 19/19 |
| Function owner equal | 19/19 |
| Volatility/security and anon/authenticated execute flags equal | 19/19 |
| Anonymous/authenticated EXECUTE exposed | 0/19 both |
| Raw `pg_get_functiondef` SHA-256 equal | **0/19** (19 mismatches) |
| Raw `pg_proc.prosrc` SHA-256 equal | **0/19** |
| `prosrc` after removing whitespace SHA-256 equal | **19/19** (lexical diagnostic, not semantic proof) |
| Function `proconfig` equal | **19/19** |
| `proacl` SHA-256 equal | **18/19**, mismatch: `assert_seyeon_chat_thread_runtime_v1` |
| Effective `service_role` EXECUTE on mismatching function | **Production true**, isolated repository DB false |
| Effective `anon` / `authenticated` EXECUTE on mismatching function | Both false in Production and isolated repository DB |

**Classification:** `HOLD_R2_PRODUCTION_REPO_DDL_PARITY_UNVERIFIED`. The 19 raw-function-body differences are isolated to whitespace characters by the stripped-whitespace fingerprint, but stripping whitespace can also hide differences **inside string literals**; that observation is *not* full semantic parity approval. The one **effective** ACL difference is a Production-only `service_role` EXECUTE permission for `assert_seyeon_chat_thread_runtime_v1` (3 explicit ACL EXECUTE entries in Production versus 1 in the isolated DB). Other tested non-browser roles have the same effective rights. Resolve this exact difference through an authorized forward-only ACL decision; do not silently revoke it or mistake an extra legitimate production grant for proof of compromise. The already established historical SHA is *identity evidence*, not permission to execute that historical statement again. There is no basis for blindly applying later migrations or changing Production roles.

## 2026-10-26 direct-call authority decision: REMOVE EXTRA GRANT IN FORWARD MIGRATION

Owner direction: check exact call path first; if `service_role` direct invocation is unnecessary, align with the original repository's least-privilege design.

- Full repository exact-symbol search finds `assert_seyeon_chat_thread_runtime_v1` as an **internal PostgreSQL helper**, not in application-side SQL, PostgREST `rpc()` calls, or direct external `service_role` execution.
- Deployed Node API uses `SET LOCAL ROLE myeongha_api_executor` and calls the narrow `cmd_*_seyeon_chat_*` functions in `apps/api/src/postgres-seyeon-production-chat-execution-v1.ts`, rather than this helper directly.
- Connected Production `pg_proc` SELECT confirms **10/10 functions that reference this helper are `SECURITY DEFINER`**; each executes with its narrow owner (`myeongha_seyeon_chat_runtime_owner`, or `postgres` for the locked zero-source reveal), not with `service_role`. All 10 deny direct `service_role` EXECUTE. Observed browser rights on the helper remain denied.
- Therefore the extra direct `service_role` grant is **not needed by the known runtime call graph**. This is not a claim about inaccessible external consumers.
- New forward-only repository migration `20261026025332_seyeon_chat_helper_service_role_least_privilege.sql` revokes only this one `service_role` EXECUTE edge. It hard-stops on unexpected migration principal, function owner/SECURITY INVOKER, browser/executor privileges, any SECURITY INVOKER caller, and postcondition drift. It never rewrites `20261008090417`, moves customer data, or enables paid/AI services.
- A disposable PostgreSQL 17 test simulated exactly the unauthorized extra grant and verified removal, API wrapper EXECUTE preservation, browser deny, owner allow, and idempotent re-application. PostgreSQL 17 and 15 full-migration Reader S7 database suites also passed.
- **Production rollout is NOT done.** `#1887` still requires reconciled remote-only migration history, governed current-schema restore/DR gates, and an authorized exact production rollout; direct `execute_sql` against Production would bypass the official migration ledger and is not part of this work. Do not mark `authorizedForProduction` or `drReady` true.

## Governed backup / isolated restore / privacy recovery

| Evidence | Observed status |
| --- | --- |
| Latest successful encrypted backup | [run 40232489516](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40232489516), artifact `12613877032` (not expired), 2026-10-25 20:48 UTC, source SHA `02cfa8144fd103b38670f5966963696903f04e10`, recorded migration frontier **20261025203519** |
| Latest successful isolated restore | [run 40226477877](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40226477877), artifact `12611398051` (not expired), 2026-10-25 19:32 UTC; restored **earlier backup 40224757670**, not latest 40232489516 |
| Latest Privacy Recovery Ledger | [run 40255489032](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40255489032), artifact `12622033718` (not expired), 2026-10-26 01:42 UTC; source backup **40232489516** |
| Production privacy canary | Latest known SUCCESS [run 36863674453](https://github.com/gycha0109-beep/MyeongHa/actions/runs/36863674453) on 2026-10-01: **not** a matching fresh canary |
| DR readiness | Latest run [40188526415](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40188526415) FAILED; `docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md` still pins old deployed frontier **1310** |
| Last restore authoritative privacy replay | `authoritative_privacy_reconciliation=not_exercised_without_production_ledger` (restore log), `dr_ready=false` |

Later `main` observed at **`d1ddd426d46216183fd6bd86134d90696beedc41`**. A Git comparison from the successful backup source SHA to this `main` found **no changes in `supabase/migrations/` or the governed backup exporter/workflow**; direct Production history remains at frontier **20261025203519**, matching the successful backup log. Hence this backup is current for the *observed migration frontier*, not proof of identical main application state or a successful current-frontier restore. This file does not assume successful Production recovery or update legacy RPO/RTO evidence by inference.

## Remaining acceptance to close #1887

1. Prove/resolve live-to-repository function DDL, policies, ownership and ACL equivalence **by scope**, not by version presence or simple fingerprint matching. Preserve the accepted historical actor-risk decision.
2. Only after the proven forward-only dependency/ordering scope and current Production admission, run governed exact-head dry-run and explicitly authorized Production migration/reconciliation. No `supabase migration repair --status reverted`, blind replay, or service enablement.
3. Obtain a governed **latest relevant actual schema backup** and restore the **same backup run ID**, including authoritative deletion/privacy ledger replay, matching fresh canary, digest/provenance and RPO/RTO proof on that same recovery scope. This is **not** the S4 synthetic/PostgreSQL 15/17 E2E run.
4. Until the above evidence exists: `authorizedForProduction=false`, `drReady=false`, paid Reader/Public OFF. Issue #1887 stays OPEN.

No Production DDL/DML/ACL/history or customer data change was made by this checkpoint.
