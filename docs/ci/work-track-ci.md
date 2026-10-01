# Watchtower work-track CI

PR CI attributes work to the single `Watchtower-Track:` line in the PR body.
Missing or conflicting metadata is displayed as `unattributed`; workflow names
and verification domains do not invent a Work Track. Attribution does not grant
permission to skip an actual dependency.

CI, Governance, and Web PR routing compare `base...head` (merge base to PR head).
The previous two-endpoint comparison included changes made only on an advancing
base branch. On 2026-10-01, `character/production-turn-postgres-v1` against
`origin/main` selected 486 files and all five DB suites with the old comparison;
the PR comparison selected 78 files and only content, runtime, and PostgreSQL 17.
Commerce was an unrelated dependency introduced by the comparison.

The Work Track check retains shared TypeScript compilation and API-client checks.
Web typecheck/build/deployment verification and Mobile typecheck run only when
the changed files affect those clients or shared infrastructure. Main runs the
full regression. Changes to shared packages, dependency manifests, compiler/test
configuration, or the CI implementation also require the full unit regression.

For other PRs, Vitest selects tests through its imported dependency graph.
Tests that read source, SQL, fixtures, directories, or invoke child processes
remain a common contract gate because those dependencies are absent from the
import graph. This conservative gate intentionally remains broader than the
originating Work Track. The existing `npm run check` command is unchanged.

Governance now runs scope resolution, contract verification, dependency review,
and the required result on one runner. A selected check that failed or was skipped
fails `Governance Verify`; unselected checks may be skipped. Review severity,
permissions, and policy verifiers are unchanged.

Web PR verification runs scope resolution and the selected browser scripts on
one runner. Dependencies, Web build, and Chrome are prepared once. The exact
previous script lists live in `scripts/ci/web-pr-checks.json`; selected lists are
deduplicated and run sequentially with each script's existing browser isolation.
Failures are collected while remaining scripts run, and any failure fails
`Web PR Verify`. Diagnostics are uploaded on failure as well as success.

CI, Governance, and Web PR use `scripts/ci/verification-plan.mjs` as their shared
selection entry point. Existing domain routing rules and conservative shared
contract coverage remain; no Work Track-specific workflow registration is used.

Each selected DB suite has its own reusable CI job and one runner, replacing
the shared PG15/PG17 case queues in PRs and per-case matrices in main regressions.
Existing main triggers and all 27 cases remain; shared registry, runner, router,
and reusable workflow changes also trigger every main DB suite.
Each case creates a fresh service-local DB,
runs the existing `run_ci_case.sh`, drops that DB, and removes the case-created
cluster roles and their memberships. Cases continue after a
failure, and the suite fails if any case fails. PostgreSQL images remain 15
and 17.6. The suite case lists are now owned by `scripts/ci/db-suites.json` and
consumed by both PR and main execution; the old YAML matrix parser is removed.
There is no duplicate case registry. The shared DB authority core
remains required for schema and DB-authority changes.

The required check names remain `CI Verify`, `Governance Verify`, and
`Web PR Verify`. The final CI result also requires every selected DB suite and
authority core to succeed; only unselected jobs may be skipped.
Production workflows are unchanged.
Grouping cases reduces runner allocations; it does not guarantee a hosted
runner start time or a specific total duration.

Validation of the consolidated implementation:

- Full `npm run check`: 426 files / 2834 tests passed (2 files / 4 tests skipped); all typechecks, both builds,
  and deployment configuration checks passed.
- Router and Work Track plan: 19 tests passed.
- Subsequent direct verification of shared selection, browser failure propagation,
  DB registry/callers, and required Governance/CI results: 14 tests passed.
- Scoped static contract gate: 88 files / 437 tests passed.
- Character orchestration import consumers: 34 files / 352 tests passed.
- Changed workflows: actionlint 1.7.12 passed.
- CI responsibility map and Actions trust-boundary verifiers passed.
- The first PR baseline passed all five isolated DB suite runners in GitHub
  Actions. Local Docker was unavailable. The subsequent consolidation requires
  the new PR-head CI run; a previous-head result is not reused as its proof.
- Local Governance policy execution is unverified because Git Bash lacks `jq`;
  the complete policy checks must pass on the new GitHub Linux runner.

Runner reductions are structural counts, not guarantees of total duration:
Governance up to 4 to 1; Web PR 2–6 to 1; all five main DB suites 27 to 5.
Concurrency cancellation stays scoped to a workflow and PR/ref. These changes
do not implement an account-wide runner quota or provision additional capacity.
