## 2026-11-14 23:28 KST — exact deployed Worker/main Phase 13 read-only acceptance snapshot

**Evidence source:** Cloudflare read-only deployments, exact Worker-version Builds metadata, GitHub main read-only collector, and anonymous/no-credential HTTP header/status checks. This snapshot is specific to version `a3f08d90-7034-4a1b-b339-0cec91e74325`; a later deployment invalidates its claim to be *current*. No provider setting, Worker, DB, authentication identity, paid action, or other Production state was modified.

- Cloudflare Worker `myeongha`: 100% deployed version `a3f08d90-7034-4a1b-b339-0cec91e74325` (deployment observation `2026-11-14T14:28:46.602935Z`); linked successful Worker Build `507047e2-a861-4f84-9148-c5cbdbc7b867`. Build trigger `push_event` from `main` at exact source SHA `333dc44b314ca6f8da6c0d2cd84295d0eb913e5b`, which matched GitHub main at that observation.
- Existing read-only `scripts/operations/inspect-main-operations-acceptance.mjs --sha 333dc44b314ca6f8da6c0d2cd84295d0eb913e5b`: `sourceIsCurrentMain=true`. Exact-main workflow SUCCESS: [CI #43604877652](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43604877652), [Governance #43604877545](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43604877545), [Web Browser Smoke #43604877452](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43604877452), [Supabase Production #43604877474](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43604877474). **Supabase deploy-migrations job = SKIPPED**, not evidence of an applied migration. The collector itself reports `acceptanceDecision=NOT_EVALUATED_BY_COLLECTOR`.
- Cloudflare Worker logging settings read-only inspection: observability/log persistence `enabled=true`, `head_sampling_rate=1`, invocation logs `false`, traces `false`, **`redact_query_string=false`**. Cloudflare [current configuration reference](https://developers.cloudflare.com/workers/wrangler/configuration/) defines this flag as whether query strings are removed from request URLs in logs/traces; the configured false value is a **privacy redaction gap to assess**, not evidence that any specific personal data was logged. Account-level Worker metric export list returned **0 exports**; this does **not** imply no built-in platform metrics. No raw logs or URL query values were requested, and no production setting was changed. §33 items 12/13 remain not accepted.
- No-credential live probes, all with exact same `x-myeongha-worker-version` header and `Cache-Control: no-store`: `GET /api/health` `200`, `GET /api/readiness` `200`, `GET /api/me` `401`, `GET /api/me/shared-memory` `404`, `GET /api/me/saju/calculation` `405` (method fence), `POST /api/me/saju/calculation` `401`. No request supplied a bearer token, real user identifier, birth data, payment, message body or personal record. **404 on shared memory is an unconnected route, not proof of authorized private read.**

| §33 | Requirement | Exact-version evidence and remaining acceptance boundary |
|---|---|---|
| 1 | expected source SHA / OCI digest | **Worker SHA verified** through 100% deployed version→Build→GitHub main. Saju OCI/digest equivalence **not observed** |
| 2 | provider deployment state | **Worker 100% deployment and successful build observed**. Other provider services not accepted |
| 3 | configuration preflight without secrets | **Not accepted**; live full secret/config preflight not observed |
| 4 | liveness | **Observed** `/api/health 200` at pinned version |
| 5 | readiness/capability for assigned traffic | **Configuration readiness 200 observed**, DB/Auth/Saju actual dependency readiness not observed |
| 6 | negative auth smoke | **Observed limited anonymous Member and Saju POST 401**; not a complete role/method coverage |
| 7 | positive authenticated synthetic smoke | **Not observed** at pinned version; no synthetic login or mutation run |
| 8 | required dependency check | **Not observed** as live positive Auth/DB/Saju request path |
| 9 | MyeongHa ↔ Saju contract | **Not observed** at pinned production version; prior isolated Saju tests remain separate |
| 10 | user-private no-store/cache | **Observed no-store on six tested responses**; full authenticated private path/CDN isolation not accepted |
| 11 | secret non-reflection | **Not accepted**; public status/header checks do not prove full body/log redaction |
| 12 | log presence/redaction | **Not observed** for pinned deployment |
| 13 | metrics presence | **Not observed** for pinned deployment and dependencies |
| 14 | identified rollback candidate | Previous 100% Worker version `bb6b06aa-c842-40ed-86eb-93e86863e697`, successful Build from `main=ffc908adf3d190da0b86ca2b2c63baf437fae966` is a **historical candidate only**. Compatibility, rollback authority and actual switch **not accepted** |

**Non-promotion:** `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`, `ROADMAP_COMPLETE=false`, `productionCapacityProven=false`. The source/Provider/limited ingress portions have immutable observation evidence; positive authenticated smoke, dependency health, Saju compatibility, full private cache/log/metrics, safe rollback, Production DB normalization and Hosted/Privacy DR remain separate requirements. Do not rerun prior accepted isolation tests or interpret `readiness 200` as dependency readiness. A future main/Worker version must be re-pinned.

Watchtower-Track: ops

# Phase 13 — Main-commit production operations acceptance evidence

Source: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md` §33, §38 Phase 13.

The executable `scripts/operations/inspect-main-operations-acceptance.mjs` gathers **actual GitHub evidence at an exact 40-character commit SHA**, rather than treating a successful PR CI or a generic deployed marker as acceptance of Production operations.

## Use

```sh
GH_TOKEN=<read-only GitHub token> node scripts/operations/inspect-main-operations-acceptance.mjs --sha <full-main-commit-sha>
```

The same script supports `GITHUB_TOKEN` in GitHub Actions. It **only** performs GET requests on the fixed MyeongHa repository and never changes a run, issue, branch, deployment, DB, provider or resource. Access tokens are not printed in error or evidence output.

It pins each observed CI, Governance, Web Browser Smoke and Supabase Production run to `head_sha == requestedSha`, `head_branch == main` and `event == push`. It uses the latest run per workflow so an old green run does not conceal a newer RED, cancellation, or pending run. The exact selected run IDs and links are part of the output.

For a historical SHA, the collector also compares it with the immutable `main` tip captured for that invocation. GitHub must report the requested SHA as the merge base and the pinned tip as strictly ahead, with zero commits behind. A PR-only SHA or an unavailable comparison prevents an evidence report.

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
