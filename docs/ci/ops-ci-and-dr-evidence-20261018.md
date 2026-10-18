# Ops CI / PostgreSQL DR evidence checkpoint — 2026-10-18

> **Read-only observation.** Watchtower-Track: ops. Sampled GitHub Actions run/job logs and artifact metadata in UTC on 2026-10-17/18. Evidence is bounded and time-dependent. This report does not change CI/workflows, trigger a load test, access Production SQL or secrets, approve a deployment, or claim DR readiness.

## A. Frozen-HEAD PR and latest-main status

- [PR #2257](https://github.com/gycha0109-beep/MyeongHa/pull/2257) (main-CI outcome classifier) was **merged** as `3d5bffad997a53f80dae325eeb9040f53b69dbed`. Its exact-head [integration #39035871844](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39035871844) succeeded with **11/11 jobs**, including `CI Integration Verify`. This closes that P2 tooling task; the former in-progress status is historical.
- At observation time, main SHA was `97be23aada7fae38e94c4e2bd217dfaf03a875d4`. [Main CI #39061837563](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39061837563) succeeded and its `CI Verify` and `db-authority-core` jobs succeeded. Latest-head status must be re-read after subsequent pushes.
- [Supabase Production #39061837472](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39061837472) completed successfully at that SHA, **but** `deploy-migrations` and `governed-seyeon-relationship-backfill-1400-1450` both **skipped**. Workflow success is **not** deployment proof. `main` superseded CI cancellations are not failures or success on the latest SHA. See [main-ci-outcomes-20261017.md](main-ci-outcomes-20261017.md).

## B. Actual 40-case / seven-stage authority-core profiling

Five **distinct completed, successful PR-event integration runs**, each with all 11 integration jobs successful, produced exactly one fresh `AUTHORITY_CORE_TEMPLATE source=created`, 40 indexed `AUTHORITY_CORE_PHASE` records (1..40), 40 case records and seven stage markers. Values below are sums parsed from those exact job logs; **milliseconds are Bash EPOCHREALTIME deltas, script seconds are Bash SECONDS**. Workloads and host performance are not a controlled A/B experiment.

| PR | Integration run / authority job | Script seconds | Migration ms | Clone ms (40) | Command ms (40) | Pre-drop + cleanup ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| #2257 | [39035871844](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39035871844) / 117405486617 | 253 | 7,814 | 3,079 | 173,396 | 3,202 |
| #2271 | [39043783182](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39043783182) / 117428450112 | 272 | 8,996 | 4,321 | 183,725 | 3,995 |
| #2272 | [39044294598](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39044294598) / 117429911393 | 229 | 6,380 | 3,836 | 160,255 | 2,990 |
| #2275 | [39060896203](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39060896203) / 117478546942 | 268 | 8,577 | 4,296 | 182,130 | 3,858 |
| #2274 | [39061047335](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39061047335) / 117479836323 | 286 | 9,942 | 5,589 | 190,499 | 4,638 |

Each fresh template `createdb` cost another 50–81 ms (not in migration column). The **command** portion is approximately 95–97% of the *measured per-case phases*; it is **not** 94–96% of whole-script runtime. From whole-script SECONDS minus the summed detailed phases and template create/migrate, roughly **55–75 seconds per run remain outside those measured phases**, including direct script-level tests and process/setup work; integer-second rounding applies. No unmeasured time is automatically idle or removable.

Across these runs, frequent costly cases included `myeongha_reader_birth_scope_lock_candidate_preflight_test` (12.58–12.94 s command), `myeongha_reader_new_grant_insert_phantom_preflight_test` (~10.38–10.63 s), and governed Se-yeon collision/race cases. These waits/interleavings assert real security and transaction behavior. **Decision:** preserve all 40 isolated tests, seven stages, template cloning, lock/wait semantics and required check names. Do **not** claim a speedup or shorten sleeps. If performance work resumes, instrument currently unmeasured direct script-level commands first and verify test equivalence before a bounded change. The minimum-three-new-detailed-run **profiling-evidence gate is now met**; an optimization-result gate has not been attempted.

## C. Integration queue 1 / 3 / 6 — bounded observation only

The most recent 100 `event=pull_request` workflow runs returned **13** `.github/workflows/ci-integration.yml` PR-event runs at sampling. Their `created_at`–`updated_at` lifetime intervals had a maximum **three overlapping recorded workflow lifetimes**; this is not an account-wide runner concurrency measurement. All 13 completed successfully. Earlier verified natural three-run queue evidence remains in [integration-queue-measurement-20261017.md](integration-queue-measurement-20261017.md).

| Candidate count | Evidence verdict |
| --- | --- |
| 1 | Historical natural sample, not controlled baseline |
| 3 | Historical natural overlap and recent sampled overlap; serialization observable |
| 6 | **UNVERIFIED**. Six eligible independent frozen PR heads, owner-reviewed bounded budget, and real timestamps are still required. Never generate synthetic PRs or toggle labels to manufacture the result |

Sampling 100 runs out of a larger population **cannot prove** no six-way event happened elsewhere.

## D. Backup, isolated restore, privacy ledger, Production deployment

**Actual source-to-restore pairing matters more than run SUCCESS alone.** Evidence obtained from Actions run metadata, job logs, artifacts and the checked-in workflow definitions:

| Evidence | Observed | What it proves / does not prove |
| --- | --- | --- |
| [Backup #38809117944](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38809117944), 2026-10-15 21:20 UTC | Success; encrypted artifact `myeongha-postgres-20261015T212111Z`, expiry **2026-11-14 21:23:39 UTC** | This is the exact source consumed by restore #38834238520, per its job log |
| [Restore #38834238520](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38834238520), 2026-10-16 01:16 UTC | Success; job log `BACKUP_RUN_ID: 38809117944`, `backup_migration_frontier=20261008090417`, scoped version snapshot `6_pass`; evidence artifact expiry **2026-11-15 01:17:32 UTC** | Proves isolated loopback Supabase PG17 restore of **that earlier backup**, with scoped checks. Job log explicitly prints `authoritative_privacy_reconciliation=not_exercised_without_production_ledger` and `dr_ready=false`. **Not** latest-backup replay or full privacy DR readiness |
| [Backup #38966874424](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38966874424), 2026-10-16 21:05 UTC | Success; artifact `myeongha-postgres-20261016T210546Z`, expiry **2026-11-15 21:07:57 UTC** | Newer successful backup, **no matching subsequent successful isolated restore established in sampled dispatch/push evidence** |
| [Ledger #39054186037](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39054186037), 2026-10-17 17:32 UTC | Success; `myeongha-privacy-ledger-20261017T173232Z`, expiry **2026-11-16 17:32:32 UTC** | Ledger export exists, **not** proof that this ledger was replayed against a restored backup, that canary prerequisites were met, or that Production privacy recovery is ready |
| [Latest-head Supabase Production #39061837472](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39061837472) | Workflow SUCCESS; `detect-production-db-relevance=success`, `deploy-migrations=skipped` | Change-gate outcome only. No actual deployment or remote migration-history reconciliation |

- Current open [P0 Ops #1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) describes the remote-only migration version `20261008090417`, repository/history divergence and required DB Authority decision. The scoped restore's matching frontier **does not validate remote lineage or approve migration repair**.
- [Incident #2200](https://github.com/gycha0109-beep/MyeongHa/issues/2200) reports missing held pinned RPC in Production. The 1520–1720 migration backlog and G0–G6 gates remain separate DB/Security/Integration-owner decisions. No fallback RPC, guessed `supabase migration repair`, Production SQL, schema write, environment approval, manual protected run or paid AI call is authorized by this report.
- Restore workflow source **always emits `dr_ready=false`**, even when its isolated restoration and synthetic replay finish successfully. Do not override this with a workflow SUCCESS. Protected `production` environment binding is visible in YAML, but run success alone does not certify the approval chain or actual recovery-point/time-objective owner signoff.

**Next governed acceptance:** DB Authority reconciles lineage and explicit migration approval; Ops/DB owner approves and executes a new *exact-backup-ID* isolated restore for the current deployed frontier, with matched artifact digest and retention; if authoritative privacy replay is required, also supply the ledger + corresponding successful Production canary and validate the replay proof. RPO/RTO and G6 require separate owner approval. A read-only report cannot clear those gates.

## E. Intentional HOLD workflows and scope

The [65-workflow responsibility inventory](workflow-responsibility-map.json) and [full audit](full-ci-audit-20261017.md) distinguish ordinary PR-required jobs, conditional Production jobs, scheduled ops jobs, and Se-yeon manual/one-shot workflows intentionally held at job level. A skipped `if: false` job is **not passed coverage**. Do not activate, delete, consolidate, or add paid/live model or Production workflows under an ops documentation PR. P3 owner mapping/reactivation decisions remain **HOLD pending track-owner signoff**, not silently closed.

## F. Evidence-state handoff

| Work item | Status after this checkpoint | Next actor |
| --- | --- | --- |
| Main CI cancellation/skip classifier (#2257) | **DONE**, merged/11-of-11 | Ops: continue latest-SHA read-only verification |
| Detailed authority 40/7 performance profiling | **MEASUREMENT DONE**, optimization unproven | Ops/DB: measure uninstrumented script-level steps before risk-reviewed changes |
| Serial queue 1/3/6 | **1 and 3 observed; 6 HOLD** | CI owner: explicit real-candidate/budget approval, or natural six-way evidence |
| Successful backup and scoped restore linkage | **PARTIAL**, older-backup pairing verified | Ops/DB owner: new exact-backup restore and current deployed-frontier proof |
| Authoritative privacy recovery | **HOLD** | Privacy/DB owner: governed canary/ledger matched replay, RPO/RTO |
| Production migration-history divergence | **P0 HOLD** (#1887) | Production DB Authority: non-destructive reconciliation and explicit approval |
| Intentional paused workflows | **HOLD** | Each owner: release conditions and signoff |

No change to checks, workflows, role/ACL, Production schema/history, queue settings, secrets, tokens, or externally triggered workload.


## G. Follow-up: exact-head CI and newer backup-to-ledger source binding (2026-10-18 KST)

This is a **subsequent read-only checkpoint** and does not retroactively revise the sampled evidence in sections A–F. These runs were checked against GitHub Actions run status, first-page job results, decoded job logs and unexpired artifact metadata. Any subsequent \`main\` push needs its own SHA-matched assessment.

### Exact-head CI / deployment distinction

- [Main CI #39066237847](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39066237847) completed **SUCCESS** for \`d5f431542c292d18a83f8373ca99c7238bac6f05\`. Its \`Work Track · main-regression\`, \`db-authority-core\`, and final \`CI Verify\` jobs succeeded; conditional DB-dependency jobs were **skipped**, not executed coverage.
- Newer \`main\` \`b836543f34201ddb305cfe2b18664f0638931078\` completed [CI #39066664973](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39066664973) **SUCCESS**, including the same three required job outcomes. Governance #39066664867 **SUCCESS**.
- [Supabase Production #39066664862](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39066664862) completed **SUCCESS**, **but** \`deploy-migrations=skipped\` and \`governed-seyeon-relationship-backfill-1400-1450=skipped\`. This is **not** evidence of any Production migration rollout or repair of remote/local migration history.

### Newer encrypted backup, exact source selection, and recovery ledger

| Evidence | Observed source/identity and transport | Limit |
| --- | --- | --- |
| [Production backup #39067271230](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39067271230) | Scheduled **SUCCESS**, job \`encrypted-logical-backup=success\`; \`strict_dump_transport=pass\` for roles, schema and data with TLS \`verify-full\`. Logs report \`migration_frontier=20261008090417\`. Artifact \`myeongha-postgres-20261017T203445Z\`, **ID 12113811530**, 181,631 bytes, uploaded SHA-256 \`a0490b1e0ac6ecdcae008482e283f31a77d83a2df6d3034995a876f1829daddd\`, expires **2026-11-16 20:36:52 UTC**. | Artifact success is evidence of encrypted backup creation, not tested restore or approved RPO/RTO. A remote frontier marker does not close lineage divergence. |
| [Privacy ledger #39104521694](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39104521694) | Scheduled **SUCCESS**; job \`encrypted-off-db-privacy-recovery-ledger=success\`. Its job log explicitly resolves **BACKUP_RUN_ID=39067271230**, backup artifact **ID 12113811530**, backup SHA \`b836543f34201ddb305cfe2b18664f0638931078\`, and confirms a GitHub artifact download SHA-256 identical to the backup upload digest above. Ledger artifact \`myeongha-privacy-ledger-20261018T063450Z\`, **ID 12128175913**, 2,803 bytes, uploaded SHA-256 \`4a041f46d1097091d6a27266fb5e353f44cb2e437382fc6cb62deda3fc3e2c31\`, expires **2026-11-17 06:34:50 UTC**. | **Backup-to-ledger provenance and outer artifact transfer integrity proven**. No successful same-pair isolated restore, authoritative ledger replay, non-zero privacy deletion canary or full DR readiness is established by this run. Ledger workflow success alone does not attest event count or a completed replay. |

The repository's [isolated restore workflow](../../.github/workflows/postgres-isolated-restore-drill.yml) requires an **explicit protected** \`workflow_dispatch\` with exact \`backup_run_id\`, UTC incident reference, \`watchtower_track=ops\`, and—**when authoritative privacy replay is sought**—both the ledger run ID and a separately successful Production privacy canary run ID. The [Production privacy canary workflow](../../.github/workflows/production-privacy-recovery-canary.yml) is a protected manual operation with its own confirmation and Production-side synthetic mutations; this checkpoint does **not** authorize launching it. The restore workflow prints \`dr_ready=false\` even after scoped success. No documented matching restore or canary for the new pair was verified in the sampled recent runs.

### Owner handoff / controls still binding

1. **Ops + Production DB Authority**: review current remote/local migration provenance for [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) and decide whether/when to approve a governed exact-backup-ID isolated restore. Never infer approval from a successful CI, backup, or scheduled ledger.
2. **Privacy + DB owners**: if authoritative replay is required, separately authorize and capture the correct successful Production privacy canary and matched ledger, then execute protected isolated replay and review evidence; request RPO/RTO/DR signoff. Do not claim non-zero replay from a scheduled ledger artifact.
3. **Application/Security owner**: [#2200](https://github.com/gycha0109-beep/MyeongHa/issues/2200) remains a separate Production send incident with pinned-RPC rollout dependencies. Keep its safe readiness and deployment gates distinct.

**No** Production SQL/DDL/DML, migration repair, workflow dispatch, credentials, external paid calls, CI protection changes, synthetic load generation, or DR readiness assertion was performed to produce this addendum.
