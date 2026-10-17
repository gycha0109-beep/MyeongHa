# Main CI outcomes: current HEAD versus cancelled, skipped and failed runs — 2026-10-17

> Read-only ops tool. No changes to workflow selection, production access, deployment, branch rules, Actions concurrency or GitHub secrets. A successful GitHub Actions run does not by itself prove all nested jobs executed.

## Execute against GitHub's current main

From a checkout with an authenticated gh CLI that can read Actions runs and job metadata:

    node scripts/ci/main-ci-evidence-report.mjs gycha0109-beep/MyeongHa 30

The tool reads the main branch SHA, at most 30 recent push workflow runs (allowed 1–100), and exact job inventories. It reads main again after all requests. If main moved mid-read or job pagination is incomplete, it fails closed. It cannot launch, relabel, retry, cancel, or deploy anything.

Output contracts:

- latest_main_full_ci_proven: true only when a completed, successful latest-SHA CI workflow has successful CI Verify and db-authority-core jobs. Independent DB suites are separate evidence.
- latest_main_workflows: newest run per workflow, with each nested job outcome including success, failure, cancelled, skipped and in_progress. A missing workflow was not observed in the window: this is NOT a skipped or successful job.
- previous_main_runs and previous_main_cancelled: prior SHA outcomes, never promoted into current-main success. Earlier cancellation caused by newer pushes is not an actual failure.
- production_migration_job_outcome: the actual deploy-migrations job. production_migration_execution_proven is false for workflow success paired with skipped/missing deployment work.

The window is bounded; it is not exhaustive history. A successful workflow cannot establish actual Production DB state or restore capability.

## Verified live distinctions (2026-10-17 UTC)

- Previous main CI runs at f2fdb5a3… and 6c24aee7… were cancelled by later pushes, not successful.
- Main 8d1a22dc… had successful CI, Governance and db-authority-core results before PR #2247 merged.
- PR #2247 merged as 69033e9e8cf88538cb716118550bd553fd0c0a92 and started new push CI and Governance runs. The initial in_progress outcomes were NOT counted as success. They subsequently completed successfully on the exact merge SHA: CI run 39034522832 (including CI Verify and db-authority-core), Governance run 39034522716, and Web Browser Smoke run 39034522689. Supabase Production 39034522823 succeeded, but deploy-migrations and the backfill job were skipped.
- Supabase Production run 39029625313 was successful but deploy-migrations was skipped. This proves the change gate, not a deployed migration.
- Encrypted backup run 38966874424 succeeded; its artifact was unexpired at inspection. Isolated restore drill 38090483306 succeeded but restored an older backup (38088591661), and did not exercise an authoritative Production privacy ledger. Do not claim latest-backup recoverability or privacy-DR completeness.

## Boundaries and next work

This complements integration-queue-report.mjs (PR-event admission) and authority-core-profile-report.mjs (isolated DB costs). Keep cancel-in-progress unchanged. Investigate genuine failures before any rerun. Six-way integration load testing still requires bounded budget approval and independent real candidate PR heads.

Regression tests must cover stale-SHA success inference, skipped migration promotion, incomplete/missing job evidence, malformed status and branch drift.
