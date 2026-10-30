# Production migration provenance comparison — 2026-10-29 (read-only)

> Track: `ops` · Authority issue: [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)
> Scope: production migration-history evidence and local SQL **mismatch identification**, not a `migration repair`, DDL deployment, or proof of restored Hosted services.

## Observed production history

Production project `cnsfpcdiyofqvhpcegfc` was queried through read-only `SELECT` over
`supabase_migrations.schema_migrations` on 2026-10-29.
The latest registered migration observed on 2026-10-29 is `20261029012948`; `20261028011357` is an older, separately measured entry.

| Remote version | Registered name | `length(statements[1])` | `md5(statements[1])` |
| --- | --- | ---: | --- |
| `20261008090417` | `seyeon_runtime_1460_1510_acl_before_owner_recovery` | 104021 | `f70776d8c0f6369f6f13484ba9fa2271` |
| `20261028011357` | `owner_sandbox_signed_receipt_persistence_v1_20261028` | 9260 | `205e865779731b90eefa39a50d893628` |
| `20261029012948` | `owner_kcp_sandbox_remove_daily_limit_v1` | 7349 | `c13c8ae6680c9c5aef35909ba81b7b1b` |

The current repository does **not** contain a migration file with version
`20261008090417`. Its six related numbered migration files are listed below;
the combined remote SQL is **not** a byte-for-byte concatenation of these
current files. A local file named
`20261028110500_owner_sandbox_signed_receipt_persistence_v1.sql` has a
different version identity from remote `20261028011357`. An earlier
read-only prefix comparison found the latter remote body equal to the
repository file up to its final local `\n\ncommit;\n` terminator, which
explains a ten-character length difference **without** making the migration
IDs equivalent.

The registered migration catalog has `created_by` and `idempotency_key` fields. A 2026-10-29 read-only metadata check found the **same nonempty `created_by` value** on these three records, and NULL idempotency keys and empty rollback statement arrays on all three. The recorded `created_by` identifier is intentionally not copied into this document; it is only a ledger attribute, **not authenticated proof of which workflow, source commit or actor applied the SQL**. The older `20261008090417` still lacks its original bundled SQL source and trustworthy deployment chain.

## Remote-only `20261008090417` vs current repository sources

The following positions are **1-based character positions** in the stored
single remote SQL string. `first local mismatch` is relative to the
matched local file beginning at its first 170-character prefix; these
comparisons used read-only `strpos` and character-by-character `substring`
via `SELECT`, not reapplication of any SQL.

| Repository file prefix | Local chars | Remote prefix offset | First local mismatch | Directly observed divergence |
| --- | ---: | ---: | ---: | --- |
| `1460_seyeon_production_relationship_runtime_read_v1.sql` | 4986 | 639 | 3695 | Local role grant; remote goes to function comment |
| `1470_seyeon_relationship_sync_outbox_v1.sql` | 16192 | 5520 | 13642 | Local role grant; remote goes to function comment |
| `1480_seyeon_production_context_runtime_v1.sql` | 9584 | 21552 | 8213 | Local role grant; remote goes to function comment |
| `1490_seyeon_production_chat_execution_runtime_v1.sql` | 36434 | 31006 | 29923 | Local owner grant; remote contains a pre-owner ACL installation comment |
| `1500_seyeon_post_turn_analysis_runtime_v1.sql` | 31663 | 67421 | 26114 | Local owner grant; remote contains a pre-owner ACL installation comment |
| `1510_seyeon_production_runtime_composition_v1.sql` | 2153 | 98893 | Not observed in earlier full containment check | Full local file previously found within remote body; this does not establish full remote-bundle equivalence |

The remote statement's 170-character starting and ending fragments of
1460–1500 match, but each contains intervening differences. The actual
difference can change owner/ACL installation ordering, so do not replace
`20261008090417` with the current six files or silently repair remote
migration history. A ledger `created_by` value is now observed, but SQL source origin, deployment workflow/commit, authenticated deploy actor, change approval,
and complete DDL/ACL equivalence remain **unidentified/unproven**. However, the user's 2026-10-16 [R2-G historical-actor risk-acceptance decision](SEYEON_R2_G_OWNER_RISK_ACCEPTANCE_20261016.md) **closed the actor/request-ID/COMMIT forensic pursuit as a development blocker** (`CLOSED_RISK_ACCEPTED`). Its unverified history is retained as an accepted risk, not a renewed mandate to reconstruct the original actor before further code, tests or PRs. Technical catalog/ACL parity and Production deployment authorization remain separate gates.

## 2026-10-29 — bounded read-only R2 RPC technical ACL drift

Using the already-reviewed read-only catalog queries
[`seyeon-r2-rpc-set-fingerprint-readonly.sql`](../../scripts/operations/seyeon-r2-rpc-set-fingerprint-readonly.sql)
and [`seyeon-r2-acl-grants-canonical-readonly.sql`](../../scripts/operations/seyeon-r2-acl-grants-canonical-readonly.sql),
the existing **Production** project was observed again without reading function bodies, customer rows, raw ACL entries, role identities or secret values into this evidence. The comparison baseline is the **separate earlier 2026-10-13 Production observation**, not an assumption that no intervening grants/revocations were made.

| Read-only comparison to 2026-10-13 Production baseline | 2026-10-29 observation |
| --- | --- |
| 19 RPC catalog names / resolved functions | **19/19**, none missing |
| PostgreSQL major | **17** |
| Function names, signatures, Owner, `pg_get_functiondef` DDL, flags aggregate fingerprints | **5/5 unchanged** |
| `pg_proc.proacl::text` aggregate fingerprint | **CHANGED** — historical `e0576c2bcd9c0826cf2799017f1a2396a7d14a11aaf094209ea40547bb1f9e88`, current `82becfaf8de44fc8eff96bff753f969d71a5a91768a149c2f2f09d7cb3416880` |
| Explicit grant-edge count for these RPCs | **38 → 37** |
| Functions with per-function raw or canonical ACL digest changes | **2/19** |
| Browser `anon` / `authenticated` effective EXECUTE | **0/19** in the current observation |

The two **historically changed ACL snapshot functions** are `assert_seyeon_chat_thread_runtime_v1` and `cmd_mark_seyeon_chat_context_ready_runtime_v1`. The former's removal of direct `service_role EXECUTE` is **not an unresolved unauthorized drift**: [approved scoped change #2634](https://github.com/gycha0109-beep/MyeongHa/pull/2634) was followed by [protected one-shot Production workflow #40437384664](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40437384664), **SUCCESS** in its exact single-function revoke job. Current Production SELECT confirmed that migration `20261026025332` is recorded exactly **once**, the helper retains direct runtime-owner access, and `service_role` has neither a direct grant nor effective EXECUTE. This is an authorized historical comparison change, not a reopened security incident.

The second historical difference is scoped to the **legacy** `cmd_mark_seyeon_chat_context_ready_runtime_v1`: explicit grants **2 → 1**, with `myeongha_api_executor` direct and effective EXECUTE currently **false** and the runtime owner still **true**. Three peer chat execution RPCs (`cmd_receive_seyeon_chat_turn_runtime_v1`, `cmd_allocate_seyeon_chat_attempt_runtime_v1`, `cmd_fail_seyeon_chat_attempt_runtime_v1`) currently retain both explicit owner/API grants (two each). The legacy grant change's precise deployment reason remains **unverified**, but the repository's actual `apps/api/src/postgres-seyeon-production-chat-execution-v1.ts` **does not call this legacy function for context-ready**. It binds `public.cmd_mark_seyeon_chat_context_ready_pinned_v1` instead. A separate Production read-only catalog inspection confirmed the pinned RPC has **one** overload, is **SECURITY DEFINER**, and grants effective `myeongha_api_executor` and runtime-owner EXECUTE. This resolves the mistaken implication that the observed legacy grant removal by itself proves the current repository API context-ready call is denied. Actual deployed runtime/positive transaction E2E **was not performed** and cannot be inferred from static code plus role checks.

**Scoped decision:** the known authorized assert-helper revoke is **CLOSED**; the remaining legacy RPC ACL difference is **recorded but not automatically restored**. If any current or external caller still binds the legacy function, its authority/call-path must be independently identified before relying on it. No `GRANT`, `REVOKE`, migration repair or Production mutation was issued in this review. The 2026-10-16 [historical actor risk-acceptance decision](SEYEON_R2_G_OWNER_RISK_ACCEPTANCE_20261016.md) stays `CLOSED_RISK_ACCEPTED`; current Hosted/DR/privacy service readiness is separately blocked.

## Backup/restore provenance boundary

- The older governed [backup #40780751650](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40780751650) recorded `20261028011357`, equal to an earlier read-only Production version observation. That snapshot is historical; it is **not** the latest observed Production migration.
- The latest governed encrypted [backup #40812111605](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40812111605) recorded `20261029012948`. Independent read-only Production inspection on 2026-10-29 observed the same version. Its [isolated PostgreSQL 17 restore #40817391430](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40817391430) **SUCCEEDED** with artifact `12872589146` (SHA-256 `38dc5b4024cdb45d7e69ef5793bd89010b67089602217bdb4413082a390b79fb`, expires `2026-11-28T04:23:26Z`). The [DR Readiness Authority #40824378258](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40824378258) **PASSED its fail-closed checks** after [PR #2721](https://github.com/gycha0109-beep/MyeongHa/pull/2721) merged.
- These are real current-version **PostgreSQL-only isolated restoration** results, not remote DDL/ACL equivalence, a restored live migration ledger, full Hosted Auth/Storage, captured-window authoritative future-safe privacy reconciliation, or serving approval. The repository's separately numbered `20261029012000_owner_kcp_sandbox_remove_daily_limit_v1.sql` is not automatically identical to remote `20261029012948`.
- Actual source-row measurements on the latest encrypted backup: **112 Provider rows skipped**, **53 projected-column rows**, **54 total Provider rows replayed** (53 included in 54); full Hosted provider data recovery remains disproven for this isolated route. See [gap matrix](HOSTED_AUTH_STORAGE_DR_GAP_MATRIX_V1.md).
- `provider_managed_data_full_restore=false`, `future_safe_privacy_reconciliation=false`, `sourceContinuityProven=false`, `continuousCaptureProven=false`, `serviceResumptionAllowed=false`, `gate=BLOCKED` and `dr_ready=false` remain mandatory.

## Remaining technical authority before any Production mutation

The 2026-10-16 [user risk-acceptance decision](SEYEON_R2_G_OWNER_RISK_ACCEPTANCE_20261016.md) explicitly ended repeated historical actor/request-ID/COMMIT provenance investigation as a **development blocker**. Preserve the existing remote SQL/history unchanged, but **do not condition future code, isolated tests, documentation PRs or evidence reviews on reconstructing that accepted historical evidence**.

Before any **Production** DDL/Role/ACL/history change or new migration deployment, separately establish the presently relevant **function/owner/effective-grant parity**, justify the observed 2-RPC ACL discrepancy, determine the approved forward-only migration order and rollback/restore boundary, and obtain the specific user authorization for the actual Production mutation. An isolated PostgreSQL successful replay or historical risk acceptance does not authorize `supabase migration repair`, remote history rewrite, guessed DDL/GRANT, hosted recovery or serving promotion.

Maintain `dr_ready=false`, `future_safe_privacy_reconciliation=false`, `provider_managed_data_full_restore=false`, `gate=BLOCKED`, and `serviceResumptionAllowed=false` while independent Hosted Auth/Storage, privacy continuity and S8 evidence remain absent.
