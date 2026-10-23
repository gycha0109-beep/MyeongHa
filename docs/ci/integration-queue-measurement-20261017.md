# Frozen-HEAD integration CI queue — read-only measurement (2026-10-17)

> Existing required checks, GitHub ruleset, runner concurrency and production safety boundaries are unchanged. This is an observation procedure only; it **does not** intentionally submit any workflows, change labels, rebase PR heads, or create a six-PR load test.

## Purpose and command

The repository's integration workflow is serialized under one repository-scoped concurrency group. To make queue delays and test runtime visible without repeated CI submissions, run from an authenticated checkout with a token allowed to **read Actions runs/jobs**:

    node scripts/ci/integration-queue-report.mjs gycha0109-beep/MyeongHa 30

The optional final argument is the maximum number of recent PR-event integration runs to inspect (1–100). It fetches workflow runs and their jobs via read-only GitHub API calls using the installed \`gh\` CLI and emits JSON to stdout. It neither reads secrets nor mutates the repository or runner settings.

Interpret output fields strictly:

- \`first_job_wait_seconds\` = first job **created** minus workflow **created**. This includes concurrency admission delay *and* any GitHub scheduling delay. It does **not** isolate runner queue time.
- \`completed_wall_seconds\` = last **completed job** minus workflow creation. It is null while unfinished or if a completed job lacks completion metadata.
- \`runner_job_seconds\` = summed observable job started-to-completed durations (parallel jobs deliberately count separately); null if none was measurable.
- \`longest_job\` = job with largest measured runtime. This is a helpful proxy, but not a true DAG critical-path computation.
- \`candidates_open_at_submission\` and \`max_observed_overlapping_candidates\` = observed overlapping workflow lifetimes, not simultaneous runner usage or an account-wide quota.
- \`duplicate_pr_head_pairs\` = multiple eligible integration run records for an exact PR/head in the sampled time window. It cannot prove atomic deduplication.
- \`all_11_passed\` requires one completed workflow, eleven successful jobs and complete job completion metadata. A generic workflow PASS does not substitute for missing evidence.
- \`sample_truncated\` and \`limitations\` must accompany metrics when published. A sample bounded at the most recent 100 runs cannot prove historic absence of duplicates.

This intentionally excludes diagnostic \`workflow_dispatch\` runs because those **cannot** satisfy the PR-event required check.

## Verified real-world samples

From read-only GitHub Actions run/job timestamps on October 17, 2026 (UTC):

| PR | Run | Start-to-first-job created | Workflow created to last completed job | DB authority core elapsed | Result |
| --- | --- | ---: | ---: | ---: | --- |
| #2214 | [39012330800](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39012330800) | 29s | 391s | 318s | 11/11 PASS |
| #2215 | [39012379041](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39012379041) | 344s | 694s | 313s | 11/11 PASS |
| #2216 | [39012428980](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39012428980) | 645s | 1004s | 314s | 11/11 PASS |
| #2219 | [39013758297](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39013758297) | 340s | 672s | 311s | 11/11 PASS |
| #2221 | [39014181754](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39014181754) | 273s | 626s | 305s | 11/11 PASS |

#2214, #2215 and #2216 are a **natural three-overlapping-PR sample**: their workflow creation times were 07:05:23, 07:06:11 and 07:07:01, before the first completed at 07:11:54. #2219 and #2221 provide a separate two-overlapping-PR observation. These timings are empirical; they do not prove exact runner allocation time or GitHub-hosted capacity limits.

The 305–318s DB authority core timing is consistent across the five observations. In #2221, step logs show \`test/db/run_authority_core.sh\` dominating this job, rather than dependency installation or migration setup. The authority core runs many serial negative, race/concurrency, RLS and ACL proofs and reuses a disposable PostgreSQL template database; optimizing it must not remove tests or weaken isolation.

## 1 / 3 / 6 acceptance status

| Load | Evidence available | Status |
| --- | --- | --- |
| One candidate | #2214 with quick first-job creation, 29s | Observed, **not** a controlled single-run baseline |
| Three overlapping candidates | #2214/#2215/#2216 29s/344s/645s first-job waits | Observed, queue serializes as designed |
| Six overlapping candidates | No reviewed controlled or natural six-run sample documented | **Not verified** |

A genuine six-candidate benchmark requires owner-approved scope, a bounded expense/rate budget, six **independent real PR heads** that already passed ordinary checks, immutable base/head recording, and no artificial label churn. Do **not** run six fake candidate requests or alter the global concurrency group merely to make this table green.

For a controlled acceptance run, record each PR number, head SHA, base SHA, run ID, run created time, first job created/started, each suite's completion, terminal outcome, stale rejection, duplicates, and job coverage. Follow the [frozen-head protocol](parallel-track-frozen-head-protocol-20261016.md) before any merge.

## Follow-on optimization

- First establish baseline and profiling of \`test/db/run_authority_core.sh\` from existing logs. It includes many serial isolated-case invocations that must keep their data, owner/role, and migration isolation.
- Compare measured wall and summed job runner-seconds before/after any optimization, with the same 11/11 gates and full RLS/ACL/authority coverage.
- Do not alter production credentials, status-check requirements, existing loose branch freshness, or integration concurrency to speed up an audit.
- On a moving main branch, the push CI deliberately cancels superseded main checks; record cancelled vs success separately and require successful validation on the **current** main SHA.
