# CI / Operations — Se-yeon paid/live workflow HOLD inventory (2026-10-17)

> Read-only P3 closeout for the ops track. Authoritative ownership for the jobs below is **character-memory** (and applicable security/Production approvers), **not ops**. Intentional disabled jobs are **not** CI defects. No workflow was enabled, dispatched, rerun or modified.

## Explicit job-level disabled controls

The review of current main workflow sources and the existing [paid evaluation hold regression](../../test/seyeon-paid-eval-hold-v1.test.mjs) confirms a literal `if: ${{ false }}` for the following exact jobs. That test already enforces fail-closed behavior; a second parallel guard is unnecessary.

| Workflow | Disabled job(s) | Why held / required handoff |
| --- | --- | --- |
| [Se-yeon dialogue path real API eval](../../.github/workflows/seyeon-dialogue-path-real-api-eval-v1.yml) | `compare` | Paid model cost incident HOLD; separately reviewed approval PR and experiment budget before enabling, even on manual dispatch |
| [Se-yeon C06 model eval](../../.github/workflows/seyeon-model-eval-v1.yml) | `compare` | F01 overclassification; prior paid attempts already consumed. Lifetime carry-forward budget and character-memory owner review required |
| [Se-yeon unified shadow](../../.github/workflows/seyeon-unified-shadow-v1.yml) | `compare` | Paid model cost HOLD; exact experiment and budget approval |
| [First meeting live main bridge](../../.github/workflows/seyeon-first-meeting-live-main-bridge.yml) | `live` | Real Provider + Production/member secrets; paid live-model hold and owner approval |
| [Predeploy final validation](../../.github/workflows/seyeon-first-meeting-predeploy-final-validation.yml) | `luna`, `terra` | Paid live-model hold; source-build is a separate job and must not be mistaken for model validation |
| [Predeploy quality main bridge](../../.github/workflows/seyeon-first-meeting-predeploy-quality-main.yml) | `quality` | Paid live-model hold; review and cost approval required |
| [Production turn-send smoke](../../.github/workflows/production-seyeon-turn-send-smoke.yml) | `verify` | Real Production member/paid turn risk; explicit Production and character-memory authorization |

**Do not change:** literal job-level `if: ${{ false }}`, `production` environments, credentials, one-shot gates, cancellation/concurrency or trigger files. Existing Vitest guard `test/seyeon-paid-eval-hold-v1.test.mjs` asserts these disabled jobs; any intended reactivation must update both the appropriate workflow and the protective test in a separately reviewed PR.

## Manual, guarded, or one-shot ≠ globally disabled

Do not mislabel the following two manual-only bounded experiments as unconditional HOLD:

- [C06 F01 two-call recheck](../../.github/workflows/seyeon-c06-f01-v2-manual-eval.yml) has `workflow_dispatch` and explicit `confirm_cost_limit` admission, main-only, Production environment; this is a *guarded paid job*, not an always-false job. Prior calls and budget must be independently reconciled; never dispatch as part of ops CI improvement.
- [C07 six-call model recheck](../../.github/workflows/seyeon-c07-six-call-model-eval-v1.yml) has `workflow_dispatch` and explicit `confirm_total_100_krw_budget` admission, main-only, Production environment; a stated budget is not a provider billing hard cap.

Also [Se-yeon Production publication](../../.github/workflows/seyeon-production-publication-v1.yml) is a guarded, potentially mutating Production workflow, not a disabled CI check; its confirmation and environment authority are separate from any ops CI acceptance.

## Re-enable decision contract

1. **Track ownership:** character-memory owner must name the exact workflow, job, reviewed source SHA and paid/Production scope; security/Production owner approval when credentials, private member data or database changes are involved.
2. **Budget and action:** record actual prior usage, maximum new calls, retry/concurrency limit and enforceable provider cost controls. Manual confirmation is not automatic authorization or billing cap.
3. **Safety:** confirm G0/G1/G2/G3 authorization boundaries as applicable. Offline/isolated DB R1/R2 or current CI success **does not** approve positive Projectors, live provider calls or public Reveal.
4. **Evidence:** separate reviewed PR lifting a specific HOLD, tests updated to express its new contract, ordinary checks, frozen-HEAD integration 11/11, human-approved Production action if required and auditable receipt.
5. **Rollback:** explicit owner and abort condition; no blanket re-enable or re-run of previously billed tests.

## Status / next action

- **P3 workflow inventory and disablement regression:** documented; the already-present test guard covers exact jobs.
- **P3 activation/re-enable:** intentionally **NOT DONE**, blocked on respective track-owner, budget and Production approvals. It is not an ops-owned cleanup task.
- **P2 six simultaneous candidate integration:** still unverified and requires owner-approved scope/cost; never activate paid workflows or fabricate PRs to obtain queue samples.
