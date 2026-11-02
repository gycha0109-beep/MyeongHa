# Phase 13 — Main-commit production operations acceptance evidence

Source: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md` §33, §38 Phase 13.

The executable `scripts/operations/inspect-main-operations-acceptance.mjs` gathers **actual GitHub evidence at an exact 40-character commit SHA**, rather than treating a successful PR CI or a generic deployed marker as acceptance of Production operations.

## Use

```sh
GH_TOKEN=<read-only GitHub token> node scripts/operations/inspect-main-operations-acceptance.mjs --sha <full-main-commit-sha>
```

The same script supports `GITHUB_TOKEN` in GitHub Actions. It **only** performs GET requests on the fixed MyeongHa repository and never changes a run, issue, branch, deployment, DB, provider or resource. Access tokens are not printed in error or evidence output.

It pins each observed CI, Governance, Web Browser Smoke and Supabase Production run to `head_sha == requestedSha`, `head_branch == main` and `event == push`. It uses the latest run per workflow so an old green run does not conceal a newer RED, cancellation, or pending run. The exact selected run IDs and links are part of the output.

For the Supabase Production workflow, a green workflow is **not** interpreted as a successful SQL deployment: the script additionally looks up its `deploy-migrations` job and reports `SUCCESS`, `SKIPPED`, `FAILURE` or `NOT_OBSERVED` independently. `sourceIsCurrentMain` also distinguishes a successfully checked historical merge SHA from a newer current main.

The §33 fourteen-point Production acceptance list is included with **observed only** evidence; it does not automatically turn local CI/browser tests into live liveness, authenticated synthetic smoke, metric visibility, Saju compatibility, provider deployment state or rollback proof. The command emits `acceptanceDecision=NOT_EVALUATED_BY_COLLECTOR`; no extra promotion or DR gate is installed.

## Practical next execution

After merging, invoke the collector for the verified merge SHA and attach its identifier-free output to the operations record. When specific production smoke, hosting and rollback evidence exists, it can be recorded explicitly in its respective workstream; the collector deliberately never guesses those results.

This closes the **read-only exact-commit CI/deployment-workflow evidence inventory implementation** portion of Phase 13, not all of Production operational acceptance. No production changes or external provider resources are requested by this step.

Watchtower-Track: ops

## 2026-10-30 bounded Cloudflare provider source/deployment observation

Read-only Cloudflare API queries for Worker \`myeongha\` returned the following **specific deployment and build** evidence (observation window: 2026-10-30 ~15:30 KST). This records a historical exact-version observation; it is not an ongoing health or deployment monitor.

| Evidence | Verified observed value |
|---|---|
| Worker | \`myeongha\` |
| Deployment | \`fb825c74-eca9-4ea5-ab64-9e3606876255\` |
| Deployment timestamp (UTC) | \`2026-10-30T06:18:33.154265Z\` |
| Deployed version, traffic split | \`4a548d7a-f997-4a96-9305-0ff4db4458e9\`, 100% |
| Linked Workers Build | \`a7cf88d0-1b37-4d48-8811-eb895eaac9dc\` |
| Build outcome | \`success\` (build status \`stopped\`, i.e. completed) |
| Build trigger | GitHub \`push_event\`, branch \`main\` |
| Source SHA | \`486041a9c9fc4e70d3541c57fce934a6d05374ad\` |
| Repository main SHA at observation | \`486041a9c9fc4e70d3541c57fce934a6d05374ad\` |
| Build deploy command | \`node scripts/cloudflare-main-web-cd.mjs\` |

The source SHA matches the independently read GitHub \`main\` head **at that observation**, and the build is linked by exact deployed Worker version. This meets the **provenance evidence portion** of §33 items 1 and 2 at that historical point; a successful build and 100% allocation **do not** prove application liveness, readiness, correct runtime configuration, cross-service compatibility, privacy-safe caching, metrics, logs, rollback execution or full Production acceptance.

Read-only Cloudflare API endpoints used: \`GET /accounts/{account_id}/workers/scripts/myeongha/deployments\`, \`GET /accounts/{account_id}/workers/scripts/myeongha/versions/{version_id}\` and \`GET /accounts/{account_id}/builds/builds?version_ids={version_id}\`. No Cloudflare deployment or settings mutation was performed. A local DNS request to \`https://myeongha.gycha0109.workers.dev/api/health\` and \`/api/readiness\` failed with \`Temporary failure in name resolution\`; this is **NOT_OBSERVED**, not evidence of live service failure.

**Explicit acceptance boundary:** This evidence is only applicable to the pinned Worker version and observation time. It does not turn any of the other §33 requirements to PASS, nor supersede Phase 8 \`dr_ready=false\` and \`serviceResumptionAllowed=false\`. Real authenticated synthetic Member/Saju checks and provider-level rollback proofs remain governed, separately scoped operations. This record must not trigger production writes, external load tests, SQL repairs or release gates.

Watchtower-Track: ops

## Phase 13 live read-only ingress admission

The existing `Cloudflare Primary Worker E2E` workflow now runs `scripts/verify-cloudflare-primary-e2e.mjs` in `operations` mode for the path-scoped PR/main triggers. The mode sends **only anonymous or deliberately invalid public diagnostic requests** to the pinned production Worker origin; no login, token, paid calculation, DB mutation, account creation, or provider chat request occurs.

The probe rejects missing/mismatched Worker version headers between governed API responses. It requires health `200`, configuration readiness `200`, and `401` denials on anonymous Member and both Saju endpoints. The existing envelope still verifies no-store, no reflective cookies/CORS headers, security headers, method fencing and cross-origin login rejection. It intentionally skips the protected Chat HOLD probes, which are owned by their own security/product track rather than an operations-readiness admission.

**Evidence rule:** cite an actual successful live workflow run (URL, timestamp, Worker version, request/result summaries) before marking the observed health/config readiness, negative-auth and no-store behaviors verified. A mocked unit test or this workflow definition is not live evidence. Live `readiness` is **configuration-only**, not DB/Auth/Saju connectivity proof, and this mode does not perform positive authenticated synthetic smoke, metrics inspection, rollback or DR recovery. The complete §33 Production acceptance status is still **NOT_ACCEPTED** until its independent prerequisites are satisfied. The status is tied to the observed Worker version and is invalidated by a later deployment.

Watchtower-Track: ops
