# CI and disaster-recovery evidence checkpoint — 2026-10-17

> Read-only GitHub Actions metadata checkpoint (UTC). Evidence is bounded to the specific runs and artifact metadata below, not a certification of deployed Production behavior or database recoverability. Do not mutate Production DB, secrets, approvals, runner concurrency, or required-check settings based on this document.

## Current main SHA and main-push execution

Observed `main` at `8e37eae99af3488817d8223eeb2ebf00f5d76472` when recording this checkpoint.

| Run | Workflow | Observed result | Important job-level distinction |
| --- | --- | --- | --- |
| [39038391127](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39038391127) | CI / push | completed: success | `CI Verify`, `db-authority-core`, `Work Track · main-regression` successful; five `DB dependency · …` jobs skipped (not counted as run) |
| [39038391122](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39038391122) | Governance / push | completed: success | Current-SHA Governance evidence; check nested jobs again for any later claim requiring a particular job |
| [39038391125](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39038391125) | Supabase Production / push | completed: success | `detect-production-db-relevance` success; `deploy-migrations` **skipped**; `governed-seyeon-relationship-backfill-1400-1450` **skipped** |

The current-main CI run is a real success for its executed jobs, but does not convert independently skipped database suites into coverage. Supabase Production success **does not** mean migration deployment occurred. Main SHA may advance; re-check exact current SHA before any release decision. See [main CI outcome semantics](main-ci-outcomes-20261017.md).

## Backup, restore and privacy ledger: independent evidence, not an end-to-end DR proof

| Evidence | Workflow run / job | Verified scope | Not established |
| --- | --- | --- | --- |
| Encrypted logical backup | [38966874424](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38966874424), `encrypted-logical-backup` success | One backup artifact `myeongha-postgres-20261016T210546Z`; `expired=false` at inspection; API `expires_at=2026-11-15T21:07:57Z` | That this exact backup was restored or contains every authoritative Production ledger |
| Isolated PG17 restore drill | [38090483306](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38090483306), `isolated-supabase-postgres-17-restore` success | An earlier isolated restore passed | It used older backup run **38088591661**, not backup 38966874424; cannot certify latest-backup recoverability |
| Encrypted off-DB privacy recovery ledger | [39027649713](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39027649713), `encrypted-off-db-privacy-recovery-ledger` success | Scheduled ledger job succeeded | No proof that this ledger was replayed as part of an isolated restore of current backup |

**DR readiness classification: incomplete / HOLD.** Evidence supports successful independent backup, historical restore and ledger generation jobs; it does **not** support a single end-to-end restored current-backup + authoritative privacy-ledger test. An artifact's expiration timestamp is retention metadata, not recoverability.

## Integration and authority-core performance boundary

- Frozen-head integration [#2257 / run 39035871844](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39035871844) finished **11/11 successful**, including `full / db-authority-core`. PR #2257 subsequently merged as `3d5bffad997a53f80dae325eeb9040f53b69dbed`.
- Another natural integration [run 39037533688](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39037533688) also finished **11/11 successful** with `full / db-authority-core` successful. These are integration pass observations, **not** comparable phase-timing measurements.
- Historical 38-case/5-stage authority-core phase samples in [phase-cost report](authority-core-phase-costs-20261017.md) cannot be compared directly to current 40-case/7-stage profiles. Before recommending a speedup, extract at least **three successful, complete, identical 40/7 detailed profiles** with per-case clone/command/cleanup measurements. No tests, lock waits, role-isolation or concurrency assertions should be removed or shortened without equivalence proof.
- One- and three-candidate queue examples are historical observations; six overlapping real candidate heads remain **unverified**. Do not launch synthetic stress or duplicate label requests without owner approval and a runner-cost cap; see [queue protocol](integration-queue-measurement-20261017.md).

## Safe next acceptance steps

1. Reconfirm the latest `main` SHA, primary CI and individual job results using the read-only report: `node scripts/ci/main-ci-evidence-report.mjs gycha0109-beep/MyeongHa 30`. Repeat whenever `main` moves.
2. Collect three comparable 40-case/7-stage **real PR-event** authority-core detailed profiles from already occurring integrations, using `scripts/ci/authority-core-profile-report.mjs`; keep GitHub job elapsed times distinct from script and per-case phase sums.
3. Plan an approved, isolated **same-artifact** restore exercise for encrypted backup 38966874424, explicitly testing authoritative privacy-ledger replay and retention. It requires the relevant owner/environment permissions; do not treat the historical restore as a substitute.
4. Obtain explicit track-owner approval before changing intentionally disabled paid/live Se-yeon workflows. Record owner, reason for HOLD, activation gate and cost/safety impact first.

## Provenance and limits

This checkpoint uses GitHub Actions REST run/job metadata and one backup artifact metadata record. It did not read secrets or DB data, download/decrypt an artifact, inspect Production migrations, trigger CI, request integration, restore a database, or claim a six-way queue benchmark. GitHub records may change and retention may expire. Where prior report evidence is reused (older restore backup ID), it is explicitly labeled as historical rather than re-proven by this checkpoint.
