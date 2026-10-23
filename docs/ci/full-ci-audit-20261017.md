# MyeongHa GitHub Actions CI full-inventory audit — 2026-10-17

> Evidence snapshot: repository `gycha0109-beep/MyeongHa`, inspected `main` at `d181776c491d6258e63c168ebd7aaa02ba18b2ba` and `1a761c2f71f1bceaa6ea5d3f43f8991ee2be66fd` on 2026-10-17. CI and PR states are time-dependent. This is an inventory and evidence report, **not** a claim that every manual/live workflow was executed.

## 1. Entire inventory and enforcement

- **65 GitHub Actions YAML workflows** were present under `.github/workflows/`; the complete per-file owner/purpose inventory is maintained in [workflow-responsibility-map.json](./workflow-responsibility-map.json). `scripts/verify-ci-responsibility-map.mjs` prevents missing/stale entries.
- `main-production-guard-v1` [ruleset 23850762](https://github.com/gycha0109-beep/MyeongHa/rules/23850762) is active on `main`, forbids delete/non-fast-forward and requires linear history and PR merging; no bypass actors were listed.
- Four required check contexts all bound to GitHub Actions App ID **15368**: `CI Verify`, `Web PR Verify`, `Governance Verify`, **`CI Integration Verify`**. `strict_required_status_checks_policy=false`. This is the intentionally loose freshness policy behind the frozen-PR-HEAD parallel-track procedure, **not** a permission to bypass checks.
- Contract coverage gap fixed in this audit: `scripts/verify-ci-responsibility-map.mjs` previously asserted only the first three check-name strings although the live ruleset has four. It now asserts the integration context as well, and a regression fixture proves removal/renaming fails. This static assertion **does not** replace a live ruleset/App-binding check before merging.
- External GitHub Actions are pinned to 40-character commits by `scripts/verify-github-actions-trust-boundary.mjs`; it also rejects `pull_request_target`, unauthorized write permissions and PR-triggered secret consumers. The verifier itself runs in Governance on CI-relevant changes.

## 2. Execution paths — all 65 are inventoried, not all are continuously run

| Area | Trigger / purpose | Required for all PRs? | Observed caveat |
| --- | --- | --- | --- |
| `ci.yml` | PR (routed), main push (full), reusable full CI | Yes: `CI Verify` | A later main push cancels an unfinished older main CI |
| `governance.yml` | PR and main; policies, dependency review | Yes: `Governance Verify` | Only selected checks are required; others may skip |
| `web-pr-domain-gates.yml` | PR; routed browser contracts | Yes: `Web PR Verify` | Success with no browser scope is correct, not proof of a browser run |
| `ci-integration.yml` | `pull_request:labeled`, diagnostic dispatch | Yes: `CI Integration Verify` from PR event | Full candidate tests are serialized; dispatch checks cannot substitute |
| `ci-db-track.yml`, five `db-*-suite.yml` files | Isolated PG15/PG17 DB cases, selected in PRs and on relevant main changes | Transitively | Main `ci.yml` skips suite jobs; standalone DB suites handle main triggers |
| `mobile-pr.yml`, `web-browser-*`, `reader-grounding-cross-service-e2e.yml`, Saju bridge CI, chat-boundary smoke | Path-scoped supplemental verification | No global requirement | Check the relevant trigger and job status, not merely its absence/presence |
| `supabase-production.yml` | Main-push change gate; conditionally deploy migrations | Not a PR status substitute | A workflow SUCCESS may contain a skipped deployment |
| Backup, restore drill, PG recovery/TLS/privacy, security, auth, Android, Saju/Se-yeon operations | Mostly manual, scheduled, protected-environment or scoped one-shot | No | Production secrets and approval boundaries must remain isolated |

The authoritative file-level classification is the 65-entry responsibility map; this table deliberately does not collapse these workflows into one global required gate.

## 3. Live evidence: serialized integration queue

All times are **UTC** on 2026-10-17. Initial waiting time is workflow-created to first job-created, so it reflects concurrency admission **plus** any GitHub scheduler delay, not separately measured queue and runner capacity.

| PR | Workflow run | Created | First job created | First-job wait | Last job completed |
| --- | --- | --- | --- | --- | --- |
| #2214 | [39012330800](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39012330800) | 07:05:23 | 07:05:52 | 29s | 07:11:54 |
| #2215 | [39012379041](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39012379041) | 07:06:11 | 07:11:55 | 5m44s | 07:17:45 |
| #2216 | [39012428980](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39012428980) | 07:07:01 | 07:17:46 | 10m45s | 07:23:45 |
| #2218 | [39013157855](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39013157855) | 07:18:44 | 07:23:46 | 5m02s | in progress at sampling |

The first three runs passed all 11 required integration jobs. #2214's `db-authority-core` ran 07:06:20–07:11:38 (~5m18s); #2215's was 07:12:17–07:17:30 (~5m13s); #2216's was 07:18:13–07:23:27 (~5m14s). These were the critical-path jobs. #2214's completed job durations sum to roughly **18 runner-minutes** for about **6.5 minutes elapsed**, with DB suites parallelized. The source of the delay is therefore chiefly **serial full-suite admission and the authority core's duration**, not a proven hosted-runner shortage.

`ci-integration.yml` uses one global `ci-integration-admission` concurrency group, `queue: max` and `cancel-in-progress: false`. It does not supply a global account-wide runner quota or server-side deduplication lock. `scripts/ci/request-integration.mjs` and `integration-submission-state.mjs` reduce repeat submissions without claiming an atomic reservation.

**Concurrency 1/3/6 status:** existing live runs establish the serial queue under 3 overlapping submissions; six simultaneous candidates were **not** deliberately started, and the complete 1/3/6 acceptance matrix is still outstanding. No fabricated benchmark figures.

## 4. Main and production semantics

- Among the sampled **last 100 workflow runs**, main `CI / push` appeared eight times: four successful, three cancelled, and one still active at that sample. The workflow deliberately uses `cancel-in-progress: true` by ref. This conserves redundant work while `main` changes rapidly, but means **not every intermediate main SHA gets a completed full run**. A subsequent main SHA must pass; a cancelled SHA is never evidence of success.
- Example: [main CI 39013210395](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39013210395) was subsequently cancelled; its `db-authority-core` and `CI Verify` did not succeed. Do not promote its successful `foundation` job into a complete pass.
- Example: [Supabase Production 39013210361](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39013210361) reports workflow success while `deploy-migrations` and the special one-shot backfill job were **skipped**. Its success means the change gate ran successfully, **not** that migrations deployed.
- [Encrypted backup 38966874424](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38966874424) succeeded, including export and encrypted artifact upload. A successful backup does **not** alone prove recoverability; verify latest isolated restore drill and freshness/retention evidence before declaring DR ready.
- Several one-shot/held Se-yeon workflows have `if: ${{ false }}` at job level (e.g. turn-send smoke, dialogue real API, first-meeting bridge/predeploy quality and evaluation). Treat them as **intentionally disabled**, not as coverage. Resolve their owner and reactivation policy in their own tracks; do not silently enable production or paid model calls.
- Production workflows generally bind the protected `production` environment, separate manual/one-shot gates, and `cancel-in-progress: false`. An Actions SUCCESS alone cannot prove environment approval, deployed behavior, secrets provisioning, or that a conditional job actually ran.

## 5. Priority work and acceptance criteria

1. **P1 — static required-check contract mismatch: addressed by this PR.** Keep all four contexts intact. In CI, an intentionally renamed `CI Integration Verify` must be rejected by the new regression; live status is still checked against App ID 15368 before merge.
2. **P2 — 1/3/6 queue characterization.** Record exact candidate PR/head, run ID, workflow creation, admission/individual job start/end, cancellations, duplicate runs, and all 11 gate results. Test six only with reviewed, representative candidates and bounded runner budget; do not create synthetic PR floods in production.
3. **P2 — investigate authority-core critical path.** Profile migration replay/bootstrap/account-deletion E2E and setup overhead; optimize only with equivalent authority/RLS/ACL test coverage and unchanged required status behavior. Structural parallelization has not reduced this ~5-minute sequential gate.
4. **P2 — distinguish main check cancellations from failures.** Report `success`, `failure`, `cancelled`, `skipped`, `in_progress`, and *latest-main-only* validation separately. Decide whether full proof is required per main SHA before changing cancellation policy (cost and deploy sequencing trade-off).
5. **P2 — operations evidence.** Audit restoration drill recency, backup artifact retention, production environment approval behavior, and deploy-gate skipped outputs without accessing production credentials or DB or running destructive operations.
6. **P3 — document intentional HOLD workflows and prune only with track-owner signoff.** Do not make disabled paid/live workflows execute as an incidental CI cleanup.

## 6. Non-goals and change safety

This review did **not** modify GitHub rulesets, status-check names, tokens, permissions, branch freshness, CI queue policy, secrets, external deployments, production DB, or held/one-shot workflows. It did **not** run a six-PR stress test or recover a production database. `main` may advance under other teams while this PR is tested; freeze this PR's HEAD and follow [parallel-track-frozen-head-protocol-20261016.md](./parallel-track-frozen-head-protocol-20261016.md).
