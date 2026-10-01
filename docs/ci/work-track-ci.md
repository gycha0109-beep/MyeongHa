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

Each selected DB suite has its own reusable CI job and one runner, replacing
the shared PG15/PG17 case queues. Each case creates a fresh service-local DB,
runs the existing `run_ci_case.sh`, and drops that DB. Cases continue after a
failure, and the suite fails if any case fails. PostgreSQL images remain 15
and 17.6. The suite case lists remain owned by the existing main regression
workflows; there is no duplicate case registry. The shared DB authority core
remains required for schema and DB-authority changes.

The required check names remain `CI Verify`, `Governance Verify`, and
`Web PR Verify`. Main suite matrices and production workflows are unchanged.
Grouping cases reduces runner allocations; it does not guarantee a hosted
runner start time or a specific total duration.

Validation at the implementation baseline:

- Full `npm run check`: 424 files / 2821 tests passed (2 files / 4 tests skipped); all typechecks, both builds,
  and deployment configuration checks passed.
- Router and Work Track plan: 19 tests passed.
- Scoped static contract gate: 88 files / 437 tests passed.
- Character orchestration import consumers: 34 files / 352 tests passed.
- Changed workflows: actionlint 1.7.12 passed.
- CI responsibility map and Actions trust-boundary verifiers passed.
- PostgreSQL service execution requires the PR's GitHub Actions run; the local
  Docker engine was unavailable. This is not a production deployment.
