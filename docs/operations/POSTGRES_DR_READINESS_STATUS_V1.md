## 2026-11-07 current isolated restore proof

The newest governed encrypted Production backup [#42309503582](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42309503582)
(artifact `13548176984`, source SHA `8ccf60d89eb6d3fab789fb34e0d479c51d84b9af`)
was restored on **disposable isolated PostgreSQL 17.6** by the successful
[one-shot restore #42375717923](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375717923)
(main SHA `61736e57979d886559451d15a853292fb3bf586e`).
The restore uploaded artifact `13575965386` with GitHub Actions ZIP
SHA-256 `a474462113eeb780f30f7bb996d7a400ac81fa6538657199cfd891ac3ab504b9`.
Its sanitized restore evidence confirmed source backup run `42309503582`,
backup migration frontier `20261105075227`, 241 source catalog versions and
catalog fingerprint `b1076fcf360f3f12c1e3fcdadb34adec87e2f8c02b7592915bb6298db2e98600`.
A separate **read-only** Production migration query on 2026-11-07 returned
241 applied versions and the same highest version `20261105075227`.
The repository's latest numeric migration **file** version is `20261029185500`;
this is intentionally distinct from the remote-applied frontier and does
**not** imply source/ACL equivalence.

## 2026-11-07 verified restore status (latest observation)

```yaml
verified_isolated_restore_run_id: 42375717923
verified_isolated_restore_result: SUCCESS
verified_isolated_restore_head_sha: 61736e57979d886559451d15a853292fb3bf586e
verified_isolated_restore_backup_run_id: 42309503582
verified_isolated_restore_backup_source_sha: 8ccf60d89eb6d3fab789fb34e0d479c51d84b9af
verified_isolated_restore_backup_migration: 20261105075227
verified_isolated_restore_artifact_id: 13575965386
verified_isolated_restore_artifact_sha256: a474462113eeb780f30f7bb996d7a400ac81fa6538657199cfd891ac3ab504b9
verified_isolated_restore_artifact_expires_at: 2026-12-07T13:11:05Z
verified_isolated_restore_authoritative_privacy: not_exercised_without_production_ledger
verified_isolated_restore_synthetic_privacy: PASS
verified_isolated_restore_serving_gate: BLOCKED
observed_live_production_migration_version: 20261105075227
repository_latest_migration_file_version: 20261029185500
verified_restore_matches_observed_migration_version: true
verified_full_schema_catalog_equivalence: false
verified_provider_rows_skipped_in_loopback: 138
verified_provider_rows_projected_in_loopback: 77
verified_provider_rows_replayed_in_loopback: 257
verified_provider_source_counts_include_payloads: false
provider_managed_data_full_restore: false
future_safe_privacy_reconciliation: false
dr_ready: false
```

**Exact evidence limitation:** 27 provider data COPY blocks were skipped and
3 blocks were projected (138 skipped rows / 77 projected-column rows;
257 Provider rows replayed, with projected rows already included). The
Source migration catalog fingerprint was verified, but the complete
provider-managed migration ledger, hosted Auth/Storage and independent
post-backup Production privacy deletion/revocation continuity were **not**
restored/proven. Synthetic-only privacy replay (four synthetic events)
passed in isolation and must not be described as Production reconciliation.
The approved whole-service RPO/RTO and the DR serving gate remain BLOCKED:
`dr_ready=false`, `serviceResumptionAllowed=false`.
The [historical 2026-10-29 observation](#2026-10-29-verified-restore-status-historical-observation)
below is preserved for provenance, **not** used as current DR readiness evidence.

## 2026-11-07 — newer backup, privacy ledger and freshness evidence (read-only metadata)

- **Newer backup verified:** protected Production PostgreSQL Logical Backup [#42309503582](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42309503582) completed SUCCESS; governed encrypted artifact `13548176984` (`myeongha-postgres-20261106T230639Z`) was created 2026-11-06T23:09:49Z and expires 2026-12-06T23:09:48Z. Source SHA `8ccf60d89eb6d3fab789fb34e0d479c51d84b9af`; migration frontier `20261105075227` remains unchanged. It is newer than #42130737153. **Subsequent verified evidence:** exact-backup isolated PostgreSQL 17 restore [#42375717923](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375717923) SUCCESS using this artifact, with sanitized restore evidence artifact `13575965386`; see the 2026-11-07 latest verified restore YAML above. This observation does not prove complete Provider/Hosted recovery, authoritative privacy continuity or service resumption.
- **Newer encrypted privacy ledger capture:** [#42352614447](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42352614447) SUCCESS, artifact `13566018275`, uploaded 2026-11-07T07:46:14Z, expires 2026-12-07T07:46:13Z. Its source SHA is the same `8ccf60d89eb6d3fab789fb34e0d479c51d84b9af`; ledger job completed 2026-11-07T07:46:16Z. **Event count and complete independent continuity have not been authenticated from this encrypted payload**. A newer capture does not prove nonzero replay or source completeness.
- **Freshness RED:** the latest inspected [watcher #42363914282](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42363914282) reported last successful snapshot age **9,582 seconds** versus the **7,200-second** maximum and concluded `CAPTURE_COMPLETION_STALE`. The preceding [watcher #42331476303](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42331476303) had passed at **6,132 seconds**. The 7,200-second gate remains unchanged; do not describe the ledger freshness monitor as GREEN.
- **DR acceptance unchanged:** source migration ledger, Provider-managed Auth/Storage, independent privacy continuity/future-safe replay and PT24H/PT6H whole-service proof are still incomplete. `drReady=false`, `serviceResumptionAllowed=false`, Issue #1887 OPEN. Production privacy canary still requires explicit `RUN_SYNTHETIC_PRODUCTION_PRIVACY_CANARY` approval.
- This entry inspected existing run metadata and sanitized job logs only. No Production SQL mutation, canary, backup dispatch, Hosted resource or traffic change.

# PostgreSQL DR Readiness Status v1

> Issue: #389  
> Historical baseline date: 2026-09-27 KST; latest verified isolated restore addendum: 2026-11-07
> Purpose: record measured recovery evidence, bounded authoritative privacy reconciliation, approved RPO/RTO comparisons, and the remaining provider-equivalence boundary.

## 2026-11-07 — post-merge current-frontier recheck; migration pair resolved at SQL layer, Hosted DR remains BLOCKED

- **Source baseline:** PR #3092 merged into main `2f04f8f2a0d912e42bf348781e17d20ff7094675`. All Production SQL below was executed in an explicit read-only transaction and rolled back; no DDL/DML, migration repair/deploy, role/ACL mutation or provider setting change occurred.
- **Current migration catalog:** Supabase Production PostgreSQL 17.6 returned 241 migration versions; current main has 276 SQL migration files. Exact version-ID comparison found 41 remote-only and 76 repository-only versions. Eight same-name pairs are version-shifted. Four pairs are byte-exact; four remote statements exactly match the repository SQL after removing the repository's final 10-byte `\n\ncommit;\n` suffix. All eight retain distinct migration version IDs.
- **Same-name migration pair audit:** the eight pairs are listed in [`POSTGRES_MIGRATION_METADATA_OBSERVATION_20261107.json`](POSTGRES_MIGRATION_METADATA_OBSERVATION_20261107.json). Byte-exact pairs: `20261027004434` ↔ `20261026110300`, `20261027004544` ↔ `20261026100200`, `20261027011650` ↔ `20261027101000`, and `20261029012948` ↔ `20261029012000`. Four other pairs have exact prefix equality after removing only the repository's final `\n\ncommit;\n` suffix; their SQL framing and migration identity remain separate disposition items.
- **Resolved SQL-body pair:** remote `20261029012948` and current-main `20261029012000_owner_kcp_sandbox_remove_daily_limit_v1.sql` are exactly byte-equal at 7,349 bytes (MD5 `c13c8ae6680c9c5aef35909ba81b7b1b`, SHA-256 `b544d06947b31d3d6593ef29e611ac062fe86455caf23ac2f91925b839de86e6`). Normalized SHA-256 is `0cfe257bb188bb8d40961959db6e0ca28f50236115e543eb72d0f283ea3bd53d`. This resolves the SQL-content mismatch for this pair only; the remote/local version identity and authenticated application provenance still require a governed disposition.
- **Current historical bundle state:** remote `20261008090417` remains one 104,021-byte statement (MD5 `f70776d8c0f6369f6f13484ba9fa2271`, SHA-256 `4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894`). Its 1460–1510 markers are 6/6 present with 6/6 empty statement arrays. Unlike the older October snapshot, 1520–1640 now has 13 applied versions; two Pin columns and the pinned context-ready function are present. The current read-only lineage query therefore returns `HOLD_CHANGED_RUNTIME_SCHEMA_REASSESS`.
- **Current R2 runtime ACL observation:** 19/19 tracked RPCs are present. `myeongha_api_executor` has effective EXECUTE on 17/19; `service_role`, `anon` and `authenticated` have 0/19. The two API-executor-denied entries are the assert helper and legacy context-ready RPC. The current pinned replacement is one overload, SECURITY DEFINER, owned by `myeongha_seyeon_chat_runtime_owner`, with `myeongha_api_executor` EXECUTE and no `service_role`/browser-role EXECUTE. This does not establish full remote bundle, owner, role-membership, DDL or policy equivalence.
- **Latest backup and isolated restore:** encrypted Production backup [#42130737153](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42130737153), artifact `13463805796`, frontier `20261105075227` / 241 migration entries. Exact-backup isolated PostgreSQL 17.6 restore [#42247589352](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42247589352), artifact `13518507454`, SUCCESS in 4 seconds. The restore still excludes 27 Provider-managed COPY blocks and projects 3; it is not a full Supabase provider restore.
- **Privacy freshness remains RED:** latest confirmed ledger [#42242496615](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42242496615), artifact `13516196702`, reports zero replay-supported events. Freshness watcher [#42262739511](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42262739511) failed at 7,828 seconds against the 7,200-second threshold. No new privacy canary was run; exact approval `RUN_SYNTHETIC_PRODUCTION_PRIVACY_CANARY` remains required.
- **DR decision unchanged:** `providerManagedDataFullRestore=false`, `hostedProviderRecoveryProven=false`, `independentPrivacyContinuityProven=false`, `futureSafePrivacyReconciliation=false`, `wholeServiceRpoRtoProven=false`, `drReady=false`, `serviceResumptionAllowed=false`. #1887 remains OPEN. The 11/07 sanitized migration snapshot is [`POSTGRES_MIGRATION_METADATA_OBSERVATION_20261107.json`](POSTGRES_MIGRATION_METADATA_OBSERVATION_20261107.json).

### 2026-11-07 — current-frontier owner, RLS and migration-source reassessment

- The 104,021-byte historical `20261008090417` bundle contains 19 routines, 18 owner transfers and 19 policies. Current Production has 19/19 routine names, 18/18 owner transfers matching their target owner, and 19/19 historical policies matching by policy name, relation, command and target role. The related live policy inventory is 38 because 19 policies were added by later migrations; the count difference is expected and not a historical-bundle parity failure.
- The 19 tracked routines have `search_path=pg_catalog, public`; 17 are SECURITY DEFINER and two are invoker functions. `myeongha_api_executor` has effective EXECUTE on 17/19; `anon`, `authenticated`, and `service_role` have 0/19. The two denied entries are the legacy assert/context-ready helpers. The current pinned replacement is separately present and API-executor executable.
- The chat runtime owner has two `postgres` membership rows: `supabase_admin` grantor with ADMIN=true / INHERIT=false / SET=false, and `postgres` grantor with ADMIN=false / INHERIT=false / SET=false. Effective role checks are MEMBER=true, USAGE=false, SET=false. The second row is explained by applied remote-only migration `20261104043413` (`chat_owner_visible_history_private_rls_runtime_checker_20261104`), which temporarily grants SET TRUE and then revokes SET OPTION. The remote statement is 15,075 bytes, SHA-256 `689ec756ba696f9e62450a27d52370cdfb202e7f5b4fb9889665666170eb85a4`; no matching current-main migration file exists. This is a current-frontier membership shape, not effective role-switch privilege.
- The older `20261008090417` and `20261026025332` one-row membership prechecks are not current-frontier acceptance criteria after `20261104043413`. The historical `20261008090417` preflight also requires its six markers, owner roles, and policies to be absent, whereas all are now present. Do not replay it.
- Applied remote `1640` is 10,303 bytes / SHA-256 `ce347be8446be958c4ed6d5f2b9f527b1910032076652e3ffd021eebc9721b50`; current-main `1640_seyeon_zero_personal_source_pre_model_pin_v1.sql` is 10,147 bytes / SHA-256 `77fe56de1d0c51c538c0cf80189708ff385923438209e97fecc6ba460de78cd5`. The applied source uses `SET ROLE` / `RESET ROLE` and `REVOKE ... FROM postgres GRANTED BY postgres`; main uses `REVOKE ... FROM current_user` and direct legacy RPC revocation. Treat this as material applied-source drift. Do not rewrite the applied migration or replay it; resolve through a governed forward-only disposition if any change is needed.
- `20261026025332` is stored as nine remote statements. Reconstructed remote text is 6,987 bytes vs the 6,986-byte main file; whitespace-stripped token streams match. This is formatting/framing variance only under that comparison, while version identity remains distinct.
- All SQL used for this reassessment ran in explicit read-only transactions and rolled back. No Production DDL/DML, migration repair, ACL/role change, RLS policy change, or provider resource mutation occurred.
- Remaining Phase 8 work: classify remote-only authority migrations including `20261104043413`; compare current table/schema grants and complete policy expressions; reconcile `1640` applied-source drift without rewriting history; then complete provider-managed Auth/Storage and independent privacy continuity/RPO/RTO evidence.

### 2026-11-07 — remote-only S0 sequence and current data-access boundary

- Twelve S0/Se-yeon migrations from `20261025193416` through `20261104043413` are applied in the Production migration ledger but have no current-main SQL files. Two migration bodies explicitly say no Production migration/deployment (`20261025193416`, `20261031182926`); one says disposable S0/staged source (`20261031182505`). The first migration's guard checks only postgres user/database, PostgreSQL 17 and absence of `seyeon_private`; it does not bind execution to a project/environment identity. This is a material remote-only source/provenance and deployment-guard discrepancy. It is not, by itself, proof of who authorized execution.
- Current G0/recovery RPCs (`qry_seyeon_g0_current_source_recent_messages_v1`, `qry_seyeon_g0_current_source_relationship_history_v1`, `qry_seyeon_recover_exact_failed_user_turn_v1`, `cmd_seyeon_supersede_stale_failed_turn_v1`) are SECURITY DEFINER under the no-login chat runtime owner and executable by `myeongha_api_executor` only among the checked application/public roles. The inspected query paths validate subject/thread and source provenance; the supersede path only abandons an exact retryable uncommitted turn after confirming no attempt, assistant output or provider execution. `anon`, `authenticated`, and `service_role` have no EXECUTE on these RPCs.
- The history-reader path uses an invoker public wrapper and a `chat_private` SECURITY DEFINER function owned by `myeongha_chat_history_reader_v1`, with `row_security=on`. The reader role is NOLOGIN and NOBYPASSRLS; the API executor has no direct message-table table/column SELECT and only the scoped history function is executable. Service/anonymous/authenticated roles are denied.
- RLS is disabled on `chat_turns` and `chat_turn_attempts` despite three policy definitions each; API executor has no direct table/column access and the inspected S0 functions apply explicit subject/thread predicates. `ai_execution_groundings` and `ai_execution_logs` also have policies while RLS is disabled; API executor, anon and authenticated have no direct table/column access.
- `memory_proposals` has two policy definitions but RLS is disabled, so those policies are not enforced. API executor/anon/authenticated have no table or column privileges; chat runtime owner has only selected column SELECT/UPDATE; the S0 proposal-accept function is not executable by API/service/anon/authenticated and has no catalog callers; the positive-source registry remains `enabled=false` / `writable_enabled=false`. This is currently fail-closed at the new S0 entrypoint, but RLS must be enabled or an explicitly accepted equivalent row-scope control proven before the type is enabled. The legacy `cmd_commit_chat_turn_legacy_v1` remains a separate service_role-only user-choice proposal path and does not consult the new registry.
- A reusable sanitized current-frontier audit script is now in mainline review: [`production-authority-frontier-readonly.sql`](../../scripts/operations/production-authority-frontier-readonly.sql). It captures role/membership, schema/table/column ACL hashes, RLS/policy hashes, RPC execution boundaries and selected migration metadata. It was executed against Production with `transaction_read_only=on` and rolled back; it emits no application rows or raw function source.
- No Production changes were made. The remote-only S0 sequence, disabled RLS tables and applied `1640` source divergence remain Phase 8 disposition items; no migration repair or RLS/ACL mutation is authorized by this observation.

## 2026-11-06 — privacy capture timing and alert evidence

- The completion watcher reported ages of 9,569 and 8,763 seconds against its 7,200-second alert boundary. The next check passed at 6,463 seconds using workflow-run metadata. These are separate observations of the hourly capture schedule. [First stale check](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42027806260), [second stale check](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42105916304), [passing check](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42145108286).
- The passing check's source attempt completed its capture job at `2026-11-05T23:50:24Z`. Its encrypted artifact was created at `23:50:22Z`, during the successful upload step. The watcher now measures age from the verified job completion and requires the encrypted artifact's creation time to fall inside that attempt's upload step. Replaying the passing check's timestamp with the same GitHub metadata yielded 6,465 seconds. [Source capture](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42132365347).
- A separate scheduled encrypted PostgreSQL backup succeeded with artifact `13463805796`. Provider-equivalent Hosted Auth/Storage restoration, independent privacy continuity and measured whole-service `PT24H` RPO / `PT6H` RTO still gate DR and service resumption. [Backup run](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42130737153), [P0 #1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887).

## 2026-11-05 — Production migration metadata review and one verified version pair

The read-only Supabase migration catalog and `main` `d08636181b0957721b5a318898510f4045264b96` contained 241 and 276 version strings respectively. The exact-version comparison found 41 remote-only and 76 repository-only versions. The latest versions were `20261105075227` remotely and `20261029185500` in Git. Some repository-only versions may still be pending or represent a separate workstream. The [sanitized version diff](POSTGRES_MIGRATION_METADATA_OBSERVATION_20261105.json) has SHA-256 `bcef0bfeb0356dd92b66f8304cce8bf64d5c457bc5042af96f37cd6635045535`. [P0 #1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887).

- For remote `20261029012948` and repository `20261029012000`, the stored statement and Git migration had the same SHA-256 `0cfe257bb188bb8d40961959db6e0ca28f50236115e543eb72d0f283ea3bd53d` after LF and outer whitespace normalization. The deployed routine body also matched the repository at SHA-256 `d654e890562b7b7f2859f53b1153e974ada47d3cf3f512a4e9d5c74dd42fe30a`. Effective execute was allowed for `myeongha_api_executor` and denied for `anon`, `authenticated`, `service_role` and `PUBLIC`.
- Remote-only `20261008090417` still has one recorded statement with normalized SHA-256 `4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894`. A repository counterpart and its application/rollback authority still need review.
- To repeat the version comparison, fetch `origin/main`, save a Supabase migration list with only `version` and `name` fields outside the repository, then run `node scripts/operations/compare-postgres-migration-catalog-readonly.mjs <main-sha> <metadata.json>`. The comparator reads Git and the supplied file and reports version IDs without migration names or SQL. Same-name pairs require separate statement and live-catalog verification before any repair proposal.
- A repair decision still needs a version-by-version disposition for the unmatched set, source ownership and an approved forward plan. Hosted Auth/Storage, independent privacy continuity and whole-service PT24H/PT6H remain blocked. `dr_ready=false` and `serviceResumptionAllowed=false`.

## 2026-11-01 — real local synthetic Auth/Storage PASS, privacy freshness FAIL→PASS; Hosted DR still blocked

- **Actual service-level local synthetic proof:** merged [PR #2851](https://github.com/gycha0109-beep/MyeongHa/pull/2851) (exact-head integration [#41311230427](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41311230427) SUCCESS, merge `822c20e8713103618d360a292015c94e45246269`). Fresh disposable Supabase CLI 2.122.0 Ubuntu local stack [#41312145388](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41312145388) **SUCCESS**, artifact `13086046643` verified: 7/7 real local synthetic login, negative/deleted login, refresh/logout revocation, private-file byte hash, anonymous denial. **No Production Auth/Storage provider data, Hosted account, credentials or original sessions were restored.**
- **Freshness red-to-green proof:** [#41312147367](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41312147367) RED correctly found the last privacy-ledger completed backup to be `16133` seconds old versus `7200`-second monitoring limit. Existing protected ledger was manually dispatched once [#41312262633](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41312262633), **SUCCESS**, new capturedAt `2026-11-01T13:39:08Z`, 0 supported events, artifact `13086116443`; [#41312435995](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41312435995) GREEN, new run 117 seconds old with exact encrypted artifact. Manual refresh does **not** retrospectively prove continuity during the previous multi-hour capture gap.
- **No recovery promotion:** `hostedProviderRecoveryProven=false`, `independentPrivacyContinuityProven=false`, `futureSafePrivacyReconciliation=false`, `providerManagedDataFullRestore=false`, `wholeServiceRpoRtoProven=false`, `drReady=false`, `serviceResumptionAllowed=false`, `gate=BLOCKED`. Real Hosted provider-equivalent destination and independent actual deletion/revocation continuity, full-service RPO `PT24H` / RTO `PT6H`, S8 acceptance still needed. #1887 remains OPEN.

## 2026-11-01 — 228-version source-catalog fingerprint backup + isolated restore PASS, Hosted DR still BLOCKED

- **Code authority:** [PR #2845](https://github.com/gycha0109-beep/MyeongHa/pull/2845) completed full integration [#41238368751](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41238368751) SUCCESS and merged as `3790702aa3ab3966e478dad15a178842a10e32e4`. The actual backup ran on later `main` `578ff2a9fe9aad963ba040b28dfe1c59569a9a8e`.
- **New protected backup:** [#41240435451](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41240435451) **SUCCESS**, encrypted artifact `13056669660` (archive `myeongha-postgres-20261031T204644Z`, expires `2026-11-30T20:49:36Z`). Public artifact manifest inspected independently: `migration_frontier=20261031192427`, `migration_catalog_version_count=228`, `migration_catalog_sha256=584da6dc169e3a96d7e5f010e69835c7bf67f30a776e08e7ef8cf7fd60b2df84`. Source manifest contains no raw migration SQL text. Independent live SELECT returned the same count and version; the query's preceding read-only catalog hash matched the manifest at observation.
- **New isolated actual restore:** [#41240770891](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41240770891) **SUCCESS** on disposable PG17, sourced from exact backup run `41240435451`. Sanitized evidence artifact `13057426497` (SHA-256 `de560640d8fce3048450eec6cb4774060a2e6752234b664728e512e5188adcfa`; expires `2026-11-30T20:51:16Z`) reports source manifest count **228**, matching SHA-256 and `backup_migration_catalog_fingerprint_verified=true`. Early six relationship-history pairs, 11 public RPC/6 RLS, rate-limit metadata/ACL and synthetic admission passed. Isolated restore validation duration **5 seconds**; reference-vs-backup synthetic window **4 seconds**. **Neither is an end-to-end service RTO/RPO measurement.**
- **Still expressly unproven:** `supabase_managed_migration_ledger_fully_restored=false`, `full_migration_ledger_restoration_proven=false`: the *source* catalog was fingerprinted, not transplanted into the isolated provider. Hosted Auth sessions/refresh-token signing context, Storage metadata/object bytes and current independent privacy revocation/delete ledger were not fully recovered. The sealed admission evidence says `gate=BLOCKED`, `providerManagedDataFullRestore=false`, `futureSafePrivacyReconciliation=false`, `serviceResumptionAllowed=false`, `drReady=false`. #1887 remains OPEN and approved full-service `PT24H` RPO / `PT6H` RTO still require a dedicated safe Hosted recovery target.
- **No Production mutation:** backup/catalog inspection used read-only SQL and existing permitted backup jobs. No migration repair/DDL, provider setting changes, secret rotation, cloning, hosted cutover or paid project creation occurred.

## 2026-11-01 — newer Production encrypted backup + isolated PG17 restore PASS, Hosted DR still BLOCKED

- **Current inspected source window:** existing Production Supabase project `cnsfpcdiyofqvhpcegfc`; `supabase_migrations.schema_migrations` SELECT-only independently confirmed latest numeric version **`20261031185454`** and 227 rows. The remote-only latest name is `seyeon_owner_legacy_room_archive_preserving_history_20261101`. This was a point-in-time observation and does not make remote/Repo SQL/DDL/ACL identical.
- **Encrypted actual Production backup:** [workflow #41231798713](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41231798713) **SUCCESS** on `main` `a71851de0f29db81e5891ed9ecf470450a59b5a9`. Governed GitHub artifact **`13054460230`**, created archive name `myeongha-postgres-20261031T185653Z`, expiration `2026-11-30T19:00:05Z`. Its logged `migration_frontier=20261031185454` equaled the separate live SQL observation. Backup does not include all provider-managed Auth/Storage content or the entire remote migration ledger.
- **Protected isolated restore of that exact backup:** [workflow #41232195180](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41232195180) **SUCCESS** on disposable Supabase-compatible PostgreSQL 17, source checkout `c16538d9ba55fb6066b6b037926cfec2d96bdc40`. Restore evidence artifact **`13053338927`**, digest `sha256:5d971573d819695baa206f62b2db3c92d9d82037e7d75d9329bcb54a8588cf8a`, expires `2026-11-30T19:02:11Z`. Exact source run ID `41231798713`, restored frontier `20261031185454`, incident reference `2026-10-31T19:00:15Z`. Six 1400–1450 migration name/version entries, 11 public RPC/6 RLS objects, auth-rate-limit schema/owner/ACL and synthetic admission tests passed.
- **What did NOT pass:** the restore replayed **synthetic** privacy mechanisms only; no actual incident-era continuous independent Production deletion/revocation ledger was supplied. The sanitized admission report explicitly says `providerManagedDataFullRestore=false`, `futureSafePrivacyReconciliation=false`, `serviceResumptionAllowed=false`, `drReady=false`, `gate=BLOCKED`; no Hosted Auth sessions/tokens or Storage object/policy restoration was exercised. Restore duration is not whole-service RTO. Approved `PT24H` RPO and `PT6H` RTO remain unproven for complete service recovery.
- **Technical ACL follow-up:** current Production PG17 read-only catalog inspection found 19/19 tracked Se-yeon functions with zero `anon`/`authenticated` EXECUTE; direct grant edges **38** vs 2026-10-29 baseline **37**. Exact authorization of the one-edge delta requires classification before claiming full ACL equivalence. Historical 2026-10-08 actor request-ID/COMMIT forensics remain `CLOSED_RISK_ACCEPTED` per the existing owner decision; do not reopen as a coding blocker. No Production DDL/DML/migration repair or secret configuration change was made in this checkpoint.

## 2026-10-29 — latest backup restored on isolated PostgreSQL 17; Hosted service remains BLOCKED

Read-only Production migration-history observation on 2026-10-29 recorded `20261029012948` (`owner_kcp_sandbox_remove_daily_limit_v1`). The repository migration filename is `20261029012000_owner_kcp_sandbox_remove_daily_limit_v1.sql`; the separately investigated SQL-body match does not establish full remote ledger/DDL/ACL equivalence. Remote-only `20261008090417` remains unresolved in [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887). The observation is time-bounded, not a continuous Production proof.

[Governed encrypted backup #40812111605](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40812111605) **SUCCESS**, source head `028a6a8568a776f7392a6dffcb9f21f8bf2a1fe8`, backed-up migration `20261029012948`, source artifact `12871016812` (expires `2026-11-28T03:29:12Z`). [Protected isolated restore #40817391430](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40817391430) **SUCCESS** on merged main `ae53cfaf8e89d8fd458162ea94d5b0fca01503ef`, artifact `12872589146` (ZIP SHA-256 `38dc5b4024cdb45d7e69ef5793bd89010b67089602217bdb4413082a390b79fb`; expires `2026-11-28T04:23:26Z`). The restored backup itself reports migration `20261029012948`, matching the earlier read-only Production version observation. This is **version agreement and disposable PostgreSQL restoration**, not Hosted-equivalence authority.

Sanitized decrypted-backup source counts for this exact backup: **27 skipped Provider COPY blocks / 112 skipped rows**; **3 projected blocks / 53 partially projected rows**; **54 total replayed Provider rows** (the 53 are included in 54). The evidence has `provider_source_counts_include_payloads=false`. Isolated validation took **4 seconds**, which is not a full-service RTO. Synthetic-only privacy replay/finalization passed; no real incident-era Production privacy ledger was replayed for this backup. Recovered admission artifact shows `gate=BLOCKED` and `serviceResumptionAllowed=false`.

Earlier [source-row-count restore #40811556214](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40811556214) used a **different** backup `40780751650` at migration `20261028011357`, with 92 skipped / 42 projected / 43 replayed Provider rows. Do not transfer those older row counts or historical bounded real privacy replay authority to the newest restore.

`dr_ready=false`, `future_safe_privacy_reconciliation=false`, `provider_managed_data_full_restore=false`, `sourceContinuityProven=false`, `continuousCaptureProven=false`, `serviceResumptionAllowed=false`. Production SQL writes/migration repair, Hosted Auth/Storage recovery, provider-level cutover and S8 service admission are not authorized.

## 2026-10-29 verified restore status (historical observation)

```yaml
verified_isolated_restore_run_id: 40817391430
verified_isolated_restore_result: SUCCESS
verified_isolated_restore_head_sha: ae53cfaf8e89d8fd458162ea94d5b0fca01503ef
verified_isolated_restore_backup_run_id: 40812111605
verified_isolated_restore_backup_source_sha: 028a6a8568a776f7392a6dffcb9f21f8bf2a1fe8
verified_isolated_restore_backup_migration: 20261029012948
verified_isolated_restore_artifact_id: 12872589146
verified_isolated_restore_artifact_sha256: 38dc5b4024cdb45d7e69ef5793bd89010b67089602217bdb4413082a390b79fb
verified_isolated_restore_artifact_expires_at: 2026-11-28T04:23:26Z
verified_isolated_restore_authoritative_privacy: not_exercised_without_production_ledger
verified_isolated_restore_synthetic_privacy: PASS
verified_isolated_restore_serving_gate: BLOCKED
observed_live_production_migration_version: 20261029012948
repository_latest_migration_file_version: 20261029012000
verified_restore_matches_observed_migration_version: true
verified_full_schema_catalog_equivalence: false
verified_provider_rows_skipped_in_loopback: 112
verified_provider_rows_projected_in_loopback: 53
verified_provider_rows_replayed_in_loopback: 54
verified_provider_source_counts_include_payloads: false
provider_managed_data_full_restore: false
future_safe_privacy_reconciliation: false
dr_ready: false
```

[Historical isolated restore #40799522511](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40799522511)
**SUCCESS** on merged main commit `cd2152d35784dc610a82fc4ccfead01ef7c84ea7`
using the exact [governed encrypted Production backup #40780751650](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40780751650),
artifact `12857586148`. Its source backup manifest/workflow recorded
`migration_frontier=20261028011357`, matching the independent read-only
Production migration ledger observation made on 2026-10-29. The
isolated restore itself logged `backup_migration_frontier=20261028011357`,
`seyeon_early_history_restore_proof=restored_scoped_version_name_snapshot_6_pass`,
`seyeon_early_functions_restore_proof=restored_public_function_catalog_11_and_rls_6_pass`,
and all six rate-limit schema/ownership/ACL/synthetic-admission checks passing.

The restored database ran **synthetic** privacy replay and finalization,
built the self-contained restore evidence envelope, then emitted fail-closed
`recovered-serving-admission.json` with `gate=BLOCKED`. Immutable restore
evidence artifact `12865611458` has SHA-256
`74ad1108805187228f73f124a8ddee5868e248c0b7fe451d21b25c43a5fe950e`
(expiration `2026-11-28T01:18:19Z`).

**Precise scope:** this proves disposable PostgreSQL restore from a backup
whose recorded migration *version* equals the observed Production version
as of 2026-10-29. It does **not** prove that the actual remote migration
ledger was restored intact, that the differently numbered repository SQL
is DDL/ACL-equivalent, that live deletion/revocation events were reconciled
for this incident, or that Hosted Auth login/session/token and Storage
objects/policies or S8 service operation were recovered. The 2026-10-28
bounded **real** privacy event replay below is retained as *separate,
older-backup evidence*, and is not transferred to this newer restore.
The approved RPO/RTO cannot be promoted from this isolated execution.

## 2026-10-28 verified restore status (historical bounded authoritative privacy window)

```yaml
verified_bounded_restore_run_id: 40655447574
verified_bounded_restore_result: SUCCESS
verified_bounded_restore_head_sha: 39fc280b393d15e39c47fa24596573eacd697f47
verified_bounded_restore_backup_run_id: 40468157715
verified_bounded_restore_backup_migration: 20261027043527
verified_bounded_restore_privacy_ledger_run_id: 40468500587
verified_bounded_restore_read_only_completion_run_id: 40633679630
verified_bounded_restore_original_failed_canary_run_id: 40468086758
verified_bounded_restore_artifact_id: 12801666793
verified_bounded_restore_artifact_expires_at: 2026-11-27T08:16:04Z
verified_bounded_restore_artifact_sha256: 59ea25bf3d29b7a06e9f26bd1616c41c10f651ee11da56a0d7342717b6b5ab6d
verified_bounded_privacy_replay_events: 1
verified_bounded_privacy_replay: PASS
verified_bounded_privacy_idempotency: PASS
verified_bounded_privacy_access_nonresurrection: PASS
verified_bounded_privacy_commerce_p5y: PASS
verified_bounded_authoritative_source_scope: captured-window-only
observed_live_production_migration_version_20261028: 20261028011357
repository_latest_migration_file_version_20261028: 20261028110500
verified_restore_covers_live_frontier: false
provider_managed_data_blocks_projected: 3
provider_managed_data_blocks_skipped: 27
provider_managed_data_full_restore: false
future_safe_privacy_reconciliation: false
dr_ready: false
```

The successful [protected isolated restore 40655447574](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40655447574) used the exact [backup 40468157715](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40468157715), [privacy ledger 40468500587](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40468500587), and separately successful read-only completed-canary proof [40633679630](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40633679630). The **original canary 40468086758 remains FAILURE**. Evidence artifact `12801666793` contains three sanitized restore/privacy JSON reports; their completed captured-window replay, repeat idempotency, Commerce P5Y and non-resurrection checks passed. This demonstrates application-data restore/ACL/Auth identity-reference continuity and bounded privacy finalization, **not** full Hosted Auth/Storage service recovery.

Read-only Production ledger inspection on 2026-10-28 found `20261028011357`, newer than the selected backup's `20261027043527`. Repository filename `20261028110500` is separately observed, not assumed to match the live ledger. Consequently current-live-schema freshness, post-capture privacy completeness and future-safe DR remain **HOLD**, tracked in [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887). No migration repair/deployment or destructive canary was performed by this documentation update. Approved `PT24H`/`PT6H` and historical comparison `5536s`/`67s` remain unchanged; three-second isolated database execution is **not** service RTO.

## 2026-10-29 — historical pre-execution note for prior backup 40780751650

The scheduled [Production encrypted PostgreSQL backup #40780751650](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40780751650)
completed successfully on main `422d5b1374157ebe0c660abda40f02c70485184d`,
uploading governed artifact `12857586148`
(`myeongha-postgres-20261028T223305Z`, expires
`2026-11-27T22:36:09Z`). The workflow recorded
`migration_frontier=20261028011357`. A separate **read-only**
Production migration ledger query on 2026-10-29 again returned
`max(version)=20261028011357`. Thus this *selected backup* matches
the **observed Production migration version**; it does not establish DDL
equivalence against the repository's differently numbered migration files,
or prove restore results.

A narrowly scoped one-shot isolated PG17 restore is prepared against exact
backup run `40780751650` and fixed synthetic incident reference
`2026-10-28T22:37:00Z` (after successful backup completion). The existing
protected workflow only runs on the explicit reviewed main-marker merge,
with a 24-hour self-expiring gate and no Production SQL writes.
It exercises synthetic privacy finalization on the disposable restored DB;
a real captured-window privacy ledger is **not** supplied as a substitute
for independently completed recovery evidence.

**Evidence boundary until runtime succeeds:** backup migration match =
READ-ONLY OBSERVED, isolated restore on this backup = NOT YET PROVEN.
Even a successful isolated PG17 restore cannot establish Hosted Auth/Storage,
independent incident-time deletion/revocation completeness or final S8
serving E2E. `provider_managed_data_full_restore=false`,
`future_safe_privacy_reconciliation=false`, `dr_ready=false`.

## 2026-10-28 — migration frontier authority in the executable DR guard

`scripts/verify-postgres-dr-readiness-authority.mjs` now reads the
**single latest dated verified restore YAML block above** for currently known
repository/Production/restore evidence. It **does not** treat the
`production_schema_latest_deployed_migration: 1310` field in the 2026-09-27
historical section as a current Production observation.

The 2026-10-28 read-only Production observation is `20261028011357`;
the selected successful isolated restore is bound to the older backup
migration `20261027043527`. The latest repository migration filename
observation is `20261028110500`; that different filename/version is **not**
automatically equivalent to the remote migration ledger, even though separate
read-only inspection found the stored SQL body of remote `20261028011357`
matching the source file prefix except for the trailing transaction terminator.
Remote-only `20261008090417` remains unresolved under [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887).

The guard enforces `verified_restore_covers_live_frontier=false`,
`provider_managed_data_full_restore=false`,
`future_safe_privacy_reconciliation=false`, and `dr_ready=false`.
A later repository migration filename on a PR is treated as an **unverified
candidate**, not proof of deployed Production or a fresh restore. Main-branch
repository advancement requires the dated observation to be refreshed;
no historical 1310 assertion is allowed to serve as that refresh. Existing
historical evidence assertions are retained **only as provenance checks**.

This is a classification/false-positive correction. It neither repairs
Supabase migration history nor authorizes live-schema DR, Hosted provider
recovery, or service resumption.

## Historical evidence snapshot — 2026-09-27 (fields below are not current 2026-10-28 Production authority)

```yaml
latest_governed_backup_run_id: 36294430134
latest_governed_backup_source_sha: 1d67dda2c17d35b7bf089d733981bd2425a0a0c5
latest_governed_backup_artifact_id: 10923756192
latest_governed_backup_artifact_name: myeongha-postgres-20260927T042920Z
latest_governed_backup_artifact_expires_at: 2026-10-27T04:32:16Z
latest_governed_backup_artifact_digest: sha256:d273f0fc8f95e8b4711a5e1ec29c3fa35cf275f6981e5f7930e0a1edaba6c4a3
latest_governed_backup_encrypted_sha256: 71347286bb3e2717bf480a1e6a0022d889cb98d5069dd05c261a8177f859a88b
latest_governed_backup_completed_at_utc: 2026-09-27T04:32:15Z
latest_proven_backup_migration_frontier: 1310
production_schema_latest_deployed_migration: 1310
production_schema_deploy_run_id: 36292944993
production_schema_deploy_head_sha: b65339d2cc694e89552b0d076018b550e81e656d
current_repository_migration_frontier: 1310
backup_schema_freshness: CURRENT_FOR_DEPLOYED_MIGRATION_1310
backup_refresh_required: false

latest_isolated_restore_run_id: 36295215761
latest_isolated_restore_result: SUCCESS
latest_isolated_restore_target: github-actions-loopback-supabase-postgres
latest_isolated_restore_runtime_head_sha: 195fe1fb0af5c3d2f2ef1556085710d669bec50e
latest_isolated_restore_backup_run_id: 36294430134
latest_isolated_restore_incident_reference_utc: 2026-09-27T04:33:00Z
latest_isolated_restore_evidence_artifact_id: 10923587751
latest_isolated_restore_evidence_artifact_expires_at: 2026-10-27T04:45:58Z
latest_isolated_restore_evidence_artifact_digest: sha256:f80ce049750fd7539e5a69bdb2b6b78b19286b2de1af829f0561ade8e9b081d1
latest_isolated_restore_backup_migration_frontier: 1310
restore_evidence_envelope_runtime: PROVEN_ON_RUN_36295215761
isolated_restore_validation_duration_seconds: 3
manual_drill_workflow_elapsed_seconds: 54
synthetic_data_loss_window_seconds: 45
provider_managed_data_full_restore: false
provider_managed_data_blocks_projected: 3
provider_managed_data_blocks_skipped: 27
member_auth_rate_limit_schema_restore: PASS
member_auth_rate_limit_unlogged: true
member_auth_rate_limit_ephemeral_data_restore: EXCLUDED
member_auth_rate_limit_owner_restore: PASS
member_auth_rate_limit_acl_restore: PASS
member_auth_rate_limit_synthetic_admission: PASS

historical_post_backup_privacy_delta_count_audit_workflow: RUNTIME_PROVEN
historical_post_backup_privacy_delta_count_audit_run_id: 35353128407
historical_post_backup_privacy_delta_count_audit_result: SUCCESS
historical_post_backup_privacy_delta_count_audit_runtime_head_sha: 532a92e061506bfac8f9485e84ebbab8d756f1db
historical_post_backup_privacy_delta_count_audit_artifact_id: 10550013004
historical_post_backup_privacy_delta_count_audit_artifact_name: postgres-privacy-delta-count-audit-35353128407
historical_post_backup_privacy_delta_count_audit_artifact_expires_at: 2026-10-18T13:56:23Z
historical_post_backup_privacy_delta_count_audit_artifact_digest: sha256:87010c5c12b2ac319f1b6ef71b0829ab713c13a70189d294a8af720e9a2d6374
historical_post_backup_privacy_delta_count_audit_backup_completed_at_utc: 2026-09-18T09:23:19Z
historical_post_backup_privacy_delta_count_audit_completed_at_utc: 2026-09-18T13:56:22Z
historical_privacy_delta_audit_observed_delta_total: 0
historical_privacy_delta_audit_observed_deltas: false
historical_privacy_delta_audit_authority: COUNT_ONLY_OBSERVATION_NON_AUTHORITATIVE

privacy_recovery_ledger_workflow: RUNTIME_PROVEN
privacy_recovery_ledger_run_id: 35539838537
privacy_recovery_ledger_result: SUCCESS
privacy_recovery_ledger_runtime_head_sha: 5bb5de08ef211f78565d06c1f9c4ff0c0ec8a956
privacy_recovery_ledger_backup_run_id: 35536655149
privacy_recovery_ledger_backup_completed_at_utc: 2026-09-20T20:50:05Z
privacy_recovery_ledger_artifact_id: 10614412005
privacy_recovery_ledger_artifact_name: myeongha-privacy-ledger-20260920T214938Z
privacy_recovery_ledger_artifact_expires_at: 2026-10-20T21:49:39Z
privacy_recovery_ledger_artifact_digest: sha256:c048023ae254a8aa176a4c0c23f0853c699f902711bfefe350200ab4718f70ef
privacy_recovery_ledger_authority_class: AUTHORITATIVE_CAPTURED_WINDOW_V1
privacy_recovery_ledger_scope: governed_backup_completion_lt_event_lte_captured_at
privacy_recovery_ledger_retention: P30D
authoritative_post_backup_source: true_bounded_captured_window_only

account_deletion_finalizer_runtime: IMPLEMENTED_AND_PROVIDER_MECHANICS_SEPARATELY_PROVEN
recovered_state_finalization_drill: IMPLEMENTED_MERGED_POST_MERGE_CI_GREEN
recovered_state_finalization_restored_backup_runtime: PROVEN_ON_RUN_36295215761

authoritative_privacy_reconciliation_run_id: 35659483080
authoritative_privacy_reconciliation_result: SUCCESS
authoritative_privacy_reconciliation_runtime_head_sha: 31746f635ae249811842b8d225c2734e4d1b4c51
authoritative_privacy_reconciliation_backup_run_id: 35643472159
authoritative_privacy_reconciliation_backup_completed_at_utc: 2026-09-21T19:16:17Z
authoritative_privacy_reconciliation_ledger_run_id: 35653303484
authoritative_privacy_reconciliation_canary_run_id: 35653222211
authoritative_privacy_reconciliation_incident_reference_utc: 2026-09-21T20:48:33Z
authoritative_privacy_reconciliation_evidence_artifact_id: 10666580699
authoritative_privacy_reconciliation_evidence_artifact_expires_at: 2026-10-21T21:51:40Z
authoritative_privacy_reconciliation_evidence_artifact_digest: sha256:58d56b54f1b3ffe1d21fd1934bf3c2edce0826bb624bf261fad30b766f127c28
authoritative_privacy_reconciliation: true
authoritative_privacy_reconciliation_scope: BOUNDED_CAPTURED_WINDOW_ONLY
future_safe_privacy_reconciliation: false
privacy_reconciliation: PRODUCTION_NONZERO_AUTHORITATIVE_CAPTURED_WINDOW_PROVEN

full_authoritative_data_loss_window_seconds: 5536
full_authoritative_recovery_duration_seconds: 67
rpo_authority: PRODUCT_OWNER_APPROVED_PT24H
rpo_full_authoritative_comparison: PASS_5536S_LE_PT24H
rto_authority: PRODUCT_OWNER_APPROVED_PT6H
rto_full_authoritative_comparison: PASS_67S_LE_PT6H
dr_ready: false
```

The latest governed backup is run `36294430134`, source SHA `1d67dda2c17d35b7bf089d733981bd2425a0a0c5`, artifact `10923756192` (`myeongha-postgres-20260927T042920Z`). Its exact manifest completion cutoff is `2026-09-27T04:32:15Z`, and the artifact records migration frontier `1310`. Production deployment run `36292944993` applied migration `1310_member_auth_rate_limit_runtime_authority.sql` on head `b65339d2cc694e89552b0d076018b550e81e656d`. The backup preserves the Member Auth rate-limit schema while excluding `public.member_auth_rate_limit_buckets` counter rows as ephemeral data. Governed backup freshness and current-frontier isolated restore execution are therefore proven through frontier `1310`; remaining recovery authority is not blocked on backup/restore freshness.

The latest isolated restore runtime evidence is run `36295215761` against governed backup `36294430134`, covering migration frontier `1310`. Artifact `10923587751` contains restore and synthetic privacy-reconciliation evidence; the run passed application-data portability, projected provider COPY handling, Auth identity continuity for the supported loopback scope, synthetic captured-window coverage, governed account-deletion finalization/completion mechanics, idempotency, non-resurrection, revoked P5Y Commerce retention, identifier-free evidence, and the negative terminal-revoke fail-closed case. It additionally proved that `public.member_auth_rate_limit_buckets` restores as UNLOGGED with zero restored counter rows, that the dedicated owner and API-executor ACL survive restore, and that a synthetic admission succeeds after assuming `myeongha_api_executor`. The isolated restore validation took 3 seconds, the workflow elapsed 54 seconds, and the synthetic incident reference was 45 seconds after the backup cutoff; these remain diagnostics only, not approved RTO/RPO. The separate Production non-zero authoritative privacy reconciliation remains evidenced by run `35659483080` for its exact bounded captured window and is not reclassified as current-frontier evidence by this synthetic refresh.
Approved objective authority: Product Owner approved **RPO `PT24H` (24 hours)** and **RTO `PT6H` (6 hours)** on 2026-09-21 KST under #389. The latest synthetic 45-second data-loss-window diagnostic and 54-second workflow elapsed diagnostic are numerically inside those objectives, but they are not the full authoritative recovery procedure and therefore do not close the comparison gate or promote `dr_ready`.


Historical count-only audit run `35353128407` remains valid evidence for its exact 2026-09-18 observation interval only: it observed zero deltas across the seven audited timestamp-authoritative surfaces and is retained as `COUNT_ONLY_OBSERVATION_NON_AUTHORITATIVE`. It no longer defines current post-backup source authority; the promoted bounded ledger below supersedes that source-authority question.

The promoted encrypted off-primary-DB privacy recovery ledger has a newer scheduled runtime proof bound to the current-frontier backup. Production PostgreSQL Privacy Recovery Ledger run `35539838537` completed successfully from repository SHA `5bb5de08ef211f78565d06c1f9c4ff0c0ec8a956`, selected governed backup run `35536655149` and artifact `10612622254`, used cutoff `2026-09-20T20:50:05Z`, executed the read-only export path, and uploaded encrypted artifact `10614412005` (`myeongha-privacy-ledger-20260920T214938Z`) with P30D retention. The ledger remains authoritative only for its exact captured window under `AUTHORITATIVE_CAPTURED_WINDOW_V1`; it is not unbounded or future-safe, and incident references later than coverage remain fail-closed.

The governed account-deletion finalizer, hosted Auth deletion adapter/canary path, completion authority, worker identity, and recovered-state synthetic finalization mechanics remain runtime-proven on the current-frontier restore run `36295215761`. The Production non-zero authoritative boundary is now separately runtime-proven by isolated restore run `35659483080`, which bound governed backup `35643472159`, authoritative ledger `35653303484`, and Production canary `35653222211`, replayed the captured-window ledger idempotently, executed DB finalization and completion, preserved revoked P5Y Commerce evidence, and uploaded identifier-free evidence artifact `10666580699`. Authoritative privacy reconciliation is therefore true for that exact captured window only; it is not future-safe or an assertion of full hosted provider recovery equivalence.

## Promotion blockers

The privacy/legal-retention policy, bounded captured-window source authority, current-frontier governed backup, isolated restore, recovered-state finalization mechanics, Production non-zero authoritative reconciliation, and full-procedure RPO/RTO comparisons are now runtime-proven. DR still remains blocked because provider-managed Auth/Storage full-restore equivalence is not proven; `future_safe_privacy_reconciliation=false` and `dr_ready=false` therefore remain mandatory.

Canonical authority remains unresolved in the existing source documents:

- `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md`: Product Owner approved `RPO = PT24H` and `RTO = PT6H` on 2026-09-21; no DR Ready claim is allowed until full authoritative recovery evidence is compared against those objectives.
- `docs/P0_DECISION_REGISTER.md`: parent `P0-PR-01` is `DECIDED`; the current reachable policy baseline is 39 DELETE / 4 ANONYMIZE / 9 RETAIN(P5Y), with P30D encrypted backup handling and bounded captured-window privacy recovery source authority.
- `docs/AUTH_RLS_PRIVACY_SPEC.md`: account deletion keeps personalization erase separate from the approved nine-table `P5Y` Commerce retention baseline; destructive runtime finalization is implemented, while recovered-state authoritative execution evidence remains separately gated.
- `docs/SOURCE_AUTHORITY_GAPS.md`: `SRC-06` remains blocking before the final standalone Birth/Target deletion DDL baseline.
- GitHub issue `#964`: its remaining Production non-zero authoritative reconciliation boundary is now runtime-proven by run `35659483080`; issue closure can consume this evidence without claiming full hosted provider equivalence.

Therefore restore success must remain classified as mechanics evidence only:

```text
latest governed backup             = yes — run 36294430134
backup current-schema freshness    = yes — backup/deployed/repository frontier 1310
isolated application restore       = yes — run 36295215761, frontier 1310
application integrity/auth baseline= yes — run 36295215761, supported loopback scope
self-contained evidence envelope   = runtime-proven on current frontier 1310
bounded privacy source authority   = yes — run 35539838537 / AUTHORITATIVE_CAPTURED_WINDOW_V1
account-deletion finalizer runtime = implemented
recovered finalization mechanics   = implemented / post-merge CI green
recovered finalization on current-frontier governed restore = proven — run 36295215761
authoritative privacy reconciliation= yes — run 35659483080 / bounded captured window only
future-safe privacy reconciliation = false
approved RPO                       = yes — PT24H / full authoritative comparison PASS (5536s)
approved RTO                       = yes — PT6H / full authoritative comparison PASS (67s)
DR Ready                           = false
```

## Change rule

Do not flip `dr_ready` to true merely because another restore succeeds or because measured diagnostic values improve.

Promotion requires all of the following authority changes to be reviewed together:

1. The approved `P0-PR-01` finalization policy is implemented as an idempotent, FK-safe destructive finalizer and hosted Auth cleanup path.
2. The applicable deletion/revocation/finalization reconciliation procedure is exercised against an isolated recovered state with non-zero or intentionally constructed authoritative deltas.
3. Numeric RPO and RTO objectives remain explicitly approved by the owning product/business authority (`PT24H` / `PT6H`).
4. Full authoritative recovery achieved evidence is compared against those approved objectives.
5. The #389 closure contract is updated with the exact evidence and only then may DR readiness be reconsidered.

`scripts/verify-postgres-dr-readiness-authority.mjs` fail-closes repository CI while the canonical authority remains in the current OPEN state.


## Privacy reconciliation replay foundation

A policy-neutral replay planner now exists at:

```text
scripts/build-postgres-privacy-reconciliation-plan.mjs
```

It can deterministically compile post-backup account-deletion-start and revocation events into existing idempotent PostgreSQL command calls. Direct destructive DML remains outside the planner. Account-deletion finalization is executed by the separately governed worker/finalizer authority, and Commerce retention remains governed by the approved P5Y policy rather than by planner inference.

This advances recovery mechanics but does not remove the promotion blockers:

```text
revocation replay plan mechanics     = implemented
bounded post-backup source authority = runtime-proven — run 35539838537
destructive account finalization     = implemented under governed worker authority
recovered-state finalization drill   = implemented / post-merge CI green
fresh governed restore execution     = proven — run 36295215761 / backup 36294430134
commerce legal retention             = decided — approved 9-table P5Y baseline
authoritative privacy reconciliation = proven — run 35659483080 / Production non-zero bounded captured window
future-safe privacy reconciliation   = false
RPO full-procedure comparison        = PASS — 5536s <= PT24H
RTO full-procedure comparison        = PASS — 67s <= PT6H
DR Ready                             = false
```

The planner output report is identifier-free; the executable SQL contains required resource identifiers and must remain an ephemeral operator artifact rather than uploaded DR evidence.
