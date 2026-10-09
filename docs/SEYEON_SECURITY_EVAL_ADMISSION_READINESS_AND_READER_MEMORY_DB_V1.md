# Se-yeon Security V1/V2 — paid-eval admission readiness & Reader Memory PostgreSQL gate

Watchtower-Track: security
Status: OFFLINE PLAN + REAL POSTGRES TEST; PAID MODEL EVAL **HOLD**
Parent: #1816; previous security PRs #1812 and #1822.

## 1. Current blocker and track boundary

At implementation time, `.github/workflows/seyeon-dialogue-path-real-api-eval-v1.yml` and `.github/workflows/seyeon-model-eval-v1.yml` both hold paid evaluation with `if: ${{ false }}` due to a **cost incident**. This change preserves both locks and never routes around them.

`apps/api/src/seyeon-cost-governor-contract-v1.ts` explicitly describes a **reference state machine, not a Production admission port**. Character-memory must independently show atomic cross-Subject DB reservation, per-call model/price version, reservation/dispatch/settlement/unknown-usage accounting, global/subject/day budget ceiling, unknown usage held, duplicate suppression, timeouts, and a reviewed cost-incident restart authorization. Security does not activate paid inference or modify their code.

No inference-call count, Production prompt, entitlement, relationship, Saju, Memory mutation, or role grants change in this patch. No workflow creation.

## 2. Four-cell offline plan executor

`node scripts/run-seyeon-security-four-cell-offline-v1.mjs`

Reads current V1 and shadow V2 boundary source text without importing the provider or opening network access. Reports **only the synthetic case IDs and plan metadata** for A (5/V1), B (5/V2), C (3/V1), D (3/V2). Runs with no API key; no prompt or raw conversation is stored. 4 pilot IDs at 5+5+3+3 calls = **64 planned maximum calls**, but **zero actual calls**. Full 16 IDs would mean **256 planned maximum calls**, not the old 128-call 2-route budget. Both plans have:
- `verdict: HOLD_PAID_EVAL_LOCKED`
- `estimatedCostUsd: null`, actual input/output/cached tokens `null`
- no P50/P95, no character quality or model-security assertion, `paidEvaluationPermitted: false`.

`test/seyeon-security-four-cell-eval-plan-v1.test.mjs` verifies the runner and locked workflow state. The existing `test/seyeon-security-four-cell-offline-v1.test.ts` remains the **fake transport request-contract** exercise. This change does not implement a paid runner or substitute fake responses for real security evidence.

A future separately reviewed **character-memory-owned** adapter may connect the approved evaluation harness to a paid Provider only after authorizing the exact model matrix, max output tokens, worst-case cost ceiling (not an unreliable estimate calculated after requests), per-cell budget reservation and hard stop. For validity, hold the model routing identical within A/B and C/D, cross over case ordering, and prevent retries. All security violations must be categorized using server-verified facts, not grader-self-reported model text.

## 3. Real PostgreSQL Reader Memory tenant test

`test/db/reader_memory_tenant_boundary_v1.sql` runs in a rolled-back transaction after standard migrations with **myeongha_api_executor** (`NOBYPASSRLS`) and server-pinned `myeongha.subject_id`. Tests:
- own Subject current memory query succeeds only for nonrevoked record;
- cross-Subject memory list and foreign-memory grant lookup fail with expected PostgreSQL constraints;
- revoked Reader B grant excluded while Reader A current grant remains;
- revoked Memory cannot yield an active grant despite historic grant row;
- changing the trusted Subject context changes owner-only visible memory.

The existing runtime DB suite is extended through `scripts/ci/db-suites.json` and `test/db/run_ci_case.sh`, with no new Action. These are actual PostgreSQL permission/RLS checks, **not** a web auth-bypass test, not Council agent-to-agent security proof, not a live-model jailbreak test. Superuser does fixture setup; read checks are under the dedicated API executor role.

## 4. Exit

A: Paid-lock remains, 4-cell dry run and fake transport stage accounting, PG security RLS test, existing CI and integration PASS.
B: Production atomic Cost Governor and approved paid experiment adapter — HOLD; requires character-memory review and a separate approval.
C: Changing V1 Production prompt, using real API before approval, new paid workflow, increasing real chat inference count or leaking private data — FAIL.
