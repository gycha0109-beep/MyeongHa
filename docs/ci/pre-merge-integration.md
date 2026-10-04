# PR feedback and pre-merge integration

## Branch validation (2026-10-01)

- Targeted admission/actual Git assembly/selection regressions: 31 tests passed.
- Root, API-client, Web and Mobile typechecks passed. Shared and Web builds passed.
- Web deployment configuration, Actions trust boundary, CI responsibility map
  and dependency supply-chain verifiers passed.
- Windows full unit run: 2885 passed, 8 failed, 4 skipped. A separate clean
  checkout of unchanged base f5a4196b reproduces all eight failures (CRLF text
  expectations and Windows file URL path handling). These unrelated application
  files were not edited. Linux PR results are required; full local check is not PASS.
- Supabase deployment configuration verification is blocked on the existing
  CRLF shell checkout (`bash -n`, line 7). The source is unchanged.
- Changed-workflow actionlint passed except the specifically documented queue
  key unsupported by actionlint 1.7.12. Live integration dispatch/queue and
  simultaneous-load timing are not yet verified.


Status: implementation merged; staged mode remains disabled during PR-event rollout.

Work Track remains attribution. It never selects test coverage. Existing main
regressions, deployment workflows, required-check names and GitHub token write
permissions are unchanged.

## Execution

`ci-integration.yml` accepts an open, non-draft PR in this repository targeting
the default branch. Submit through the local command below. It adds the dedicated
ci-integration-ready label to trigger pull_request:labeled. It pins both the
head and current default-branch SHA, checks attribution before allocating the
full regression, merges that base into the checked-out head in isolated runners,
runs the existing CI as a reusable workflow, and rechecks head/base before
`CI Integration Verify` succeeds. A conflict or changed SHA fails closed.
No branch is pushed and no PR is merged by these scripts.

From an authenticated local checkout:

```powershell
node scripts/ci/request-integration.mjs OWNER/REPOSITORY PR_NUMBER
```

The command first requires every existing required check to succeed for the
exact head, with its configured GitHub App binding. It ignores only the new
integration check that it is about to request. Draft, fork, missing, queued,
failed, skipped, cancelled and newer-failed checks are not borrowed as success.
The PR event validates its immutable number/head/base and rechecks prerequisites
before full regression and before success. The local operator can remove and
re-add the label for a new attempt; workflows have no label write permission.
Unrelated label events fail admission rather than producing a skipped required gate.

The whole integration workflow queues one regression at a time with
`queue: max` and `cancel-in-progress: false`. Up to 100 pending runs are supported;
a full queue cancels additional requests. Waiting runs do not hold a runner.
This is repository-scoped. It does not reserve a runner or enforce a shared
account-wide limit across producers. Stale requests fail admission and must be
resubmitted against a fresh head/base; arbitrary inflight deployments are not
cancelled. A duplicate manual request is still another run, so operators should
not repeatedly submit the same candidate.

## Activation and rollback

The repository variable `CI_STAGED_VERIFICATION` defaults to disabled. Deploy
and verify the integration workflow before enabling the staged path.
workflow_dispatch is retained for diagnostics, but its job checks do not satisfy
PR rulesets. Required integration evidence must come from the PR label event.
See [GitHub required-check event restrictions](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#checks-from-some-workflow-jobs-are-not-evaluated).

1. Merge the reviewed workflow implementation and run an integration request.
2. Confirm its eligible PR-event check appears in PR checks and the ruleset, not main or
   another commit; verify successful, intentionally failed, conflicting and
   stale candidates and multiple queued requests in GitHub.
3. Add `CI Integration Verify` bound to GitHub Actions (App ID 15368) to main's
   existing required checks, retaining all current contexts. Require strict
   up-to-date checks; this is necessary to prevent a passed old-base candidate
   remaining mergeable after main advances. It may require PR branch updates.
4. Verify open PRs have current required evidence, then enable
   `CI_STAGED_VERIFICATION=true`. The PR workflow rejects this mode unless both
   the integration requirement and strict policy are visible through GitHub.
5. Before every merge, verify the exact current head/base, all required checks
   and mergeability. Require BLOCKED before integration and CLEAN after a successful
   integration with all other checks current. Existing main and deployment verification remain.

Rollback: disable the variable first to restore full PR regression where
applicable, verify that restoration, then remove only the added integration
requirement. Keep historical runs and all original required checks. These
steps change merge policy and require explicit authorization; the implementation
PR does not automatically perform them.

## Limits and acceptance

For staged PR selection, retain imported consumers, changed tests and static
file/SQL/fixture/process contract tests. Shared manifests, CI, public entrypoints,
production boundaries, data/document dependencies and unknown paths keep the
full regression. Main and integration candidates always run the full unit suite.
Ordinary leaf changes may be selected only after the integration gate is required.
MyeongHa already has conservative PR selection; its candidate additionally runs
all five DB suites and the authority core against the combined source.
Saju keeps all 16 shards; quality runs before them, required failure cancels
remaining shards, and at most four shards request runners per integration
candidate. Legacy full PR/main runs retain the previous parallelism of eight
until the staged policy is activated.
No implementation cancels a different PR or new head when an old candidate fails.

Governance, browser, production-container and PIE prerequisites retain their
existing required role. Those independent workflow definitions are not all
folded into this integration runner. PIE cancellation affects only stale
executions of the same PR and does not discard edited-body triggers.

Validate PR concurrency 1/3/6: required feedback latency, queue/start delay,
runner wall time, failed-candidate waste, stale request rejection and equality
of full-suite coverage. Repository-local serialization is a fairness/capacity
control, not a guarantee of shorter single-run time or fixed latency.
No simultaneous-load speedup is claimed before those measurements.

The local actionlint 1.7.12 does not recognize GitHub's documented
`concurrency.queue` key. Other changed-workflow checks must pass with only that
specific known diagnostic excluded. GitHub runtime acceptance of this dispatch
workflow remains mandatory during activation; this limitation is not a PASS.

## Architecture Check

Docs updated: yes. No new work tracks, aliases, application runtime modes or
alternate domain normalization. One CI-only rollout variable, one integration
request path, and one additional required-check contract are introduced here.
The guarded default retains existing PR regression until activation is verified.
No extra workflow write permissions, pull_request_target, personal project
seeding, production deployment change or administrator merge bypass is added.

## PR-event correction (2026-10-01)

Live rollout showed that a successful workflow_dispatch run on the exact PR head
did not satisfy GitHub required checks. Staged mode and the added required context
were rolled back in MyeongHa; Saju was not activated. The corrected path uses an
eligible pull_request label event with the same read-only permissions and queue.
The label is CI admission metadata, never a Work Track or CI responsibility.
Reusable candidate workflows always run the full suite even though their caller
is a PR event. Admission/Git regressions: 24 tests passed per repository.
Activation remains contingent on the corrected live PR/ruleset test.
