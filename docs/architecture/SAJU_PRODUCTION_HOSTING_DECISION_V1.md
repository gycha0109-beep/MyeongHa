# Saju Production Hosting Decision v1

> Parent: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md`  
> Decision date: 2026-09-04 KST  
> MyeongHa baseline: `0fcd9f2b0dd18e6a9a97edc408b5a10204bdbbfd`  
> Saju baseline at decision: `2f92f59c3f27c471127bfe3dad8260b192bc8c31`  
> Decision status: **CLOUD RUN TARGET SELECTED / HISTORICAL DEPLOYMENT AND ROLLBACK VERIFIED / CURRENT WORKER COMPATIBILITY AND ROTATION NOT ACCEPTED**

---

## 현재 적용 범위 (2026-11-06) — Cloud Run 현행 Revision lineage와 과거 배포·복귀 증거

**Cloud Run은 Saju 계산 서비스의 선택된 호스트이며, 현재 서비스의 실제 100% 트래픽 Revision까지 read-only로 확인됐다. 다만 이 증거는 새 유료 리소스, 새 배포, Secret 회전 또는 현재 MyeongHa Worker와의 양성 E2E 승인이 아니다.**

- 2026-09-04 결정은 Saju Calculation Service의 호스트로 Google Cloud Run `asia-southeast1`(Singapore)을 선택했다. 실제 [Production Cloud Run #35622856668](https://github.com/gycha0109-beep/Saju/actions/runs/35622856668)은 2026-09-21 exact-digest 후보를 배포하고 candidate smoke 후 100% 트래픽으로 승격했으며 post-promotion smoke를 통과했다. [Rollback drill #35724573502](https://github.com/gycha0109-beep/Saju/actions/runs/35724573502)은 2026-09-22 manifest에 고정된 이전 Revision으로 전환·인증 smoke 후 원래 Revision으로 트래픽을 복원하고 다시 smoke를 통과했다.
- 최신 [read-only lineage #42207998063](https://github.com/gycha0109-beep/Saju/actions/runs/42207998063)은 2026-11-06 현재 `saju-production-00013-lar`가 Ready이고 **100% 트래픽**을 받는다고 확인했다. 활성 OCI digest는 `sha256:a911e244d91fd03b72cf94553c90cf72cc2bbb51a9b82255fb45379e53c37d67`, source tag는 `candidate-54667c70e461`, Cloud Audit history는 읽을 수 있었고 선택 트래픽 이벤트 54건을 확인했다. 39,017-byte 원본 JSON과 SHA-256은 MyeongHa `docs/operations/SAJU_CLOUD_RUN_LINEAGE_OBSERVATION_20261106.json`에 보존했다. 이 read-only capture는 `rollbackTargetAuthorized=false`를 유지한다.
- 현재 Saju `main`은 배포 source commit `54667c70e46140b004d3b81c5797191538f6cbc3`보다 861 commits 앞서 있다. Dockerfile, production server entrypoint, service Bearer authorizer, calculation HTTP response schema, calculation authority/runtime 및 `/api/calculations` handler는 source 비교상 동일하다. 이후 추가된 reading/face 경로와 process 조합 차이는 남아 있으므로, 이것만으로 현재 MyeongHa Worker의 양성 E2E나 모든 서비스 호환성을 수용하지 않는다.
- MyeongHa 제품 API는 Cloudflare Worker이며 `workers/cloudflare-saju-calculation.mjs`가 계산 전용 Saju 경로를 제공한다. 이 경로는 정확한 Saju origin/Bearer, 별도 Auth/DB/TLS/RLS 승인과 kill switch를 요구한다. 현재 Worker secret 값은 소스에서 확인할 수 없으며 읽거나 변경하지 않았다. 마지막으로 문서화된 positive Member/DB/Saju E2E는 Worker #122에 고정된 [run #40261086788](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40261086788)이다. 그 이후/current Worker version은 별도 증거가 필요하다. 기존 positive E2E workflow는 명시적 confirmation과 production Member credential을 사용하고 synthetic Guest fixture를 생성하므로 사용자 승인 없이 실행하지 않는다.
- 2026-10-28 사용자 운영 지시에 따라 추가 유료 인프라를 새로 만들거나 Cloud Run 재배포·트래픽 변경·Secret Manager 변경/회전을 수행할 권한은 과거 배포 성공으로부터 추론하지 않는다. 이번 2026-11-06 확인은 read-only이며 Production mutation은 없었다.
- GitHub 설정 read-only 확인에서 MyeongHa와 Saju `main`은 모두 branch protection이 없다. Saju `production-saju` 환경은 `main` allowlist만 있으며 required-reviewer 보호는 확인되지 않았다. 이를 controlled promotion gate로 간주하지 않는다.

[설계 충돌 원장](ARCHITECTURE_AUTHORITY_COLLISION_REGISTER_20261028.md) AR-04/05를 참조한다. Cloud Run 호스트 선택과 과거 배포/rollback evidence는 유지한다. 현재 credential rotation, current Worker positive E2E, release compatibility, current capacity/SLO, Hosted DB restore/RPO/RTO는 별도 수용 조건이다. Production 배포, traffic migration, IAM/Secret Manager 변경은 필요한 사용자 승인과 해당 트랙의 필수 조건을 충족하기 전에는 실행하지 않는다.
## 1. Decision

Saju Calculation Service의 production hosting target으로 **Google Cloud Run service**를 선택한다.

Initial region은 **Singapore `asia-southeast1`** 로 한다.

이 결정은 hosting/runtime 선택만 확정한다. 다음 항목은 아직 production-ready 증거가 아니다.

- Google Cloud project / billing / IAM provision
- Artifact Registry repository provision
- GitHub Actions Workload Identity Federation
- Secret Manager binding
- actual Cloud Run service deployment
- production service URL
- MyeongHa `MYEONGHA_SAJU_SERVICE_ORIGIN` binding
- active/previous Bearer rotation production proof
- authenticated production E2E
- cold-start / latency baseline
- rollback drill
- monitoring / alerting

---

## 2. Required Fit

`PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md`가 요구하는 Saju runtime capability:

```text
Node 24-compatible OCI container
linux/amd64
long-running HTTP process
PORT injection
0.0.0.0 bind
public HTTPS origin
GET /healthz
Bearer-authenticated POST /api/calculations
restart / instance replacement
non-root image runtime
immutable artifact identification
secret injection
logs / resource metrics
rollback to exact previous artifact
bounded concurrency / scaling
Singapore or similarly suitable APAC region
low idle cost at early traffic
```

Current Saju container already satisfies the application-side container contract:

- `node:24-bookworm-slim`
- runtime `USER node`
- `PORT` support
- default bind `0.0.0.0`
- `/healthz`
- `/api/calculations`
- active Bearer + optional previous Bearer
- container smoke for non-root/auth/secret non-reflection

Hosting provider must therefore preserve this contract instead of introducing a new application model.

---

## 3. Provider Comparison

Scoring is architectural fit, not vendor reputation. `5` is strongest fit for this specific service.

| criterion | Cloud Run | Railway | Render | Fly.io | AWS App Runner |
|---|---:|---:|---:|---:|---:|
| OCI / Docker fit | 5 | 5 | 5 | 5 | 5 |
| Singapore deployment | 5 | 5 | 5 | 5 | 3 |
| immutable deployment identity | 5 | 4 | 4 | 4 | 4 |
| candidate-before-traffic verification | 5 | 4 | 4 | 4 | 3 |
| rollback / traffic control | 5 | 4 | 4 | 4 | 3 |
| startup/liveness health controls | 5 | 3 | 5 | 5 | 4 |
| secret-management integration | 5 | 4 | 4 | 4 | 4 |
| explicit min/max/concurrency controls | 5 | 4 | 4 | 5 | 4 |
| scale-to-zero / low-idle option | 5 | 3 | 2 | 5 | 2 |
| operational simplicity | 3 | 5 | 5 | 3 | 3 |
| production observability primitives | 5 | 4 | 4 | 5 | 4 |
| fit with exact-SHA/digest promotion | 5 | 4 | 4 | 4 | 4 |

### Result

Cloud Run wins because it gives the strongest combination of:

1. existing OCI runtime compatibility,
2. immutable revisions,
3. no-traffic revision testing and explicit traffic migration,
4. startup/liveness/readiness probe model,
5. Secret Manager integration,
6. min/max instance and concurrency controls,
7. Singapore region,
8. request-based billing with scale-to-zero,
9. revision-level rollback without changing Saju semantic architecture.

---

## 4. Why not Railway as primary target

Railway is the simplest operational alternative and remains the first fallback.

Strengths:

- Singapore region available.
- Docker deployment is straightforward.
- healthcheck-gated activation exists.
- rollback restores prior deployment image/config while retained.
- Hobby plan has a low minimum monthly commitment.

Reasons not selected:

- Railway healthcheck is primarily deployment activation gating; its documented healthcheck does not continue as a general post-live health monitor.
- rollback image retention is plan-window dependent.
- revision/traffic migration semantics are less explicit than Cloud Run's immutable revision model.
- early operational simplicity is better, but the architecture already requires exact candidate verification, rollback proof, bounded scale, and later capacity testing; Cloud Run maps more directly to those requirements.

Fallback condition:

> If Google Cloud account/IAM complexity blocks implementation materially and the product remains very low traffic, Railway Singapore may be reconsidered without changing the Saju application contract.

---

## 5. Why not Render as primary target

Strengths:

- Singapore region.
- Docker/prebuilt image support.
- HTTP health checks gate a new deploy before traffic.
- unhealthy running instances can be removed/restarted.
- direct rollback support.
- smallest paid web-service class is operationally simple.

Reasons not selected:

- always-on paid compute is less efficient for an initially sparse calculation API when scale-to-zero is acceptable.
- image-backed rollback depends on the original registry image/digest remaining available.
- Cloud Run provides stronger revision tagging/no-traffic verification/traffic migration primitives for exact artifact promotion.

---

## 6. Why not Fly.io as primary target

Strengths:

- low-cost small Machines.
- strong region placement model.
- health checks and machine control.
- explicit machine sizing and autoscaling options.

Reasons not selected:

- more VM/Machine operational surface than required for the current single stateless calculation service.
- rollback is effectively redeploying a known previous image and image retention needs explicit management.
- Cloud Run offers a simpler managed revision abstraction for the same stateless HTTP workload.

---

## 7. Why not AWS App Runner as primary target

Strengths:

- managed container service.
- autoscaling and health checks.
- straightforward AWS integration.

Reasons not selected:

- default provisioned-instance model is less attractive for sparse early traffic.
- target topology already has no AWS dependency.
- Cloud Run provides a more precise candidate/no-traffic revision and traffic migration workflow for this service.
- adopting AWS here would add an additional cloud control plane without a compensating product requirement.

---

## 8. Region Decision

Selected:

```text
Cloud Run region = asia-southeast1 (Singapore)
```

Rationale:

- Supabase project is already in `ap-southeast-1` Singapore.
- Saju requests originate server-side from MyeongHa and perform pure calculation without direct database dependency, but Singapore keeps future DB-adjacent/service latency options coherent.
- Korea-facing latency remains acceptable for an API whose current end-to-end caller budget is seconds rather than tens of milliseconds.
- choosing Seoul instead would move the calculation service farther from current database authority without evidence that user-network latency dominates the server-to-server path.

This is not a latency SLO claim. Singapore vs Seoul must be re-evaluated only if measured end-to-end latency shows region placement is material.

---

## 9. Network / Authentication Decision

Initial Cloud Run ingress remains publicly reachable over HTTPS because MyeongHa runs outside Google Cloud.

Application authorization remains the existing Saju service Bearer contract.

```text
Vercel MyeongHa API
  -> HTTPS
  -> Cloud Run public service URL
  -> Saju Bearer verification
  -> /api/calculations
```

Do not replace the existing service contract with a Google-specific identity protocol in Phase 2.

Reason:

- changing to Cloud Run IAM/OIDC would require a new cross-cloud credential/token-minting architecture in MyeongHa.
- the existing active/previous Bearer contract already supports bounded rotation and keeps provider choice replaceable.
- provider IAM still protects deployment/admin operations; public invoke permission does not imply application authorization.

Future migration to workload identity for request authentication requires a separate architecture decision.

---

## 10. Secret Decision

Cloud-side Saju Bearers must be stored in **Google Secret Manager**, not plaintext deployment configuration.

Target secret bindings:

```text
SAJU_PRODUCTION_SERVICE_BEARER
SAJU_PRODUCTION_PREVIOUS_SERVICE_BEARER   # optional during rotation only
```

Rules:

- no GitHub repository secret contains the Saju runtime Bearer if Cloud Run can resolve it directly from Secret Manager.
- secret environment bindings pin an explicit secret version for reproducible deployment.
- `latest` is not the production provenance authority.
- old secret version remains available only for the bounded rotation window and is then disabled/destroyed according to the credential runbook.
- deployment logs must not print resolved values.

---

## 11. Artifact / Registry Decision

Use **Artifact Registry** for the production Saju OCI image.

Canonical artifact identity:

```text
<region>-docker.pkg.dev/<project>/<repository>/saju-production@sha256:<digest>
```

Human-searchable source tag may also exist:

```text
git-<full-or-bounded-SHA>
```

But deployment acceptance uses the **digest**, not a mutable tag.

Build requirements:

- `linux/amd64` image.
- source SHA recorded.
- existing container verification runs before image promotion.
- digest captured after push.
- Cloud Run deploy references the digest.

---

## 12. GitHub -> Google Cloud Authentication

Deployment automation must use **GitHub Actions OIDC / Google Workload Identity Federation**.

Long-lived Google service-account JSON keys are rejected as the normal deployment mechanism.

Minimum GitHub workflow permissions:

```yaml
permissions:
  contents: read
  id-token: write
```

Trust must be scoped to the intended repository and production deployment workflow/ref/environment.

Deployment principal receives only permissions required to:

- push the production image to the designated Artifact Registry repository,
- create/update the designated Cloud Run service/revision,
- bind the designated runtime service account when required,
- read deployment metadata required for verification.

It does not receive broad project Owner/Editor authority.

---

## 13. Deployment Strategy

Target promotion sequence:

```text
Saju exact source SHA
-> existing test/container CI
-> build linux/amd64 image
-> push Artifact Registry
-> capture digest
-> deploy Cloud Run revision with NO production traffic
-> startup probe / liveness
-> authenticated synthetic /api/calculations smoke against tagged candidate URL
-> wrong/missing Bearer negative smoke
-> secret non-reflection check
-> record revision + image digest
-> migrate 100% traffic to candidate
-> post-promotion smoke
-> retain previous healthy revision as rollback candidate
```

This intentionally does not use `latest -> automatic production` as authority.

---

## 14. Cloud Run Health Strategy

Current Saju `/healthz` is process liveness.

Phase 2 Cloud Run configuration:

- startup probe may use `/healthz` to prevent traffic before the HTTP process is alive.
- liveness probe may use `/healthz` for stuck-process replacement.
- application capability readiness is proven by authenticated synthetic calculation before traffic promotion.
- do not depend on an expensive real-user calculation for provider health polling.
- Cloud Run readiness-probe-specific features are not required for v1 acceptance; startup + candidate smoke is sufficient for the initial contract.

If a cheap deterministic internal readiness endpoint is later implemented, it can be added without changing provider choice.

---

## 15. Initial Scaling / Cold Start Policy

Initial production policy:

```text
billing mode: request-based
minimum instances: 0 initially
maximum instances: explicit finite safety cap REQUIRED before activation
concurrency: explicit finite value REQUIRED before activation
```

Exact `max instances`, CPU, memory and concurrency values are **TBD-BY-MEASUREMENT**.

`min=0` is selected initially because:

- traffic is currently early-stage and unknown,
- service is stateless,
- idle-cost minimization is valuable,
- Cloud Run supports scale-to-zero.

However `min=0` is conditional:

- cold-start + calculation latency must remain safely within the MyeongHa caller timeout under production-like measurement.
- if cold starts materially consume the current request budget, set service-level minimum instances to `1` and record the resulting cost/latency tradeoff.

The current MyeongHa Saju adapter default `5s` timeout is not changed by this hosting decision.

---

## 16. Cost Decision

No fixed monthly Cloud Run cost is asserted before traffic measurement.

Relevant model:

- request-based CPU/memory billing,
- request billing,
- free tier exists,
- Singapore is a Tier 2 pricing region,
- idle minimum instances are billed when configured,
- min=0 avoids intentional warm-idle instance billing but introduces cold-start risk.

Comparison anchors at decision time:

- Railway Hobby: `$5/month` minimum commitment, usage included up to that amount.
- Railway resource list price: `$20/vCPU-month`, `$10/GB RAM-month`, egress `$0.05/GB`.
- Render 0.5 CPU / 512 MB always-on web-service class: `$7/month` according to Render's current comparison documentation.
- Fly small shared CPU machine pricing starts in the low-single-digit USD/month range depending on region/RAM.
- AWS App Runner keeps provisioned capacity by default and charges active CPU/memory separately.

Cloud Run is selected for control-plane fit first; low-idle economics are an additional benefit, not the only reason.

---

## 17. Required Production Values Before First Deploy

The following values are intentionally not invented in Git:

```text
GCP_PROJECT_ID
GCP_PROJECT_NUMBER
GCP_BILLING_ACCOUNT / billing-enabled project evidence
ARTIFACT_REGISTRY_REPOSITORY
CLOUD_RUN_SERVICE_NAME
CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT
GITHUB_WIF_POOL
GITHUB_WIF_PROVIDER
GITHUB_DEPLOYER_PRINCIPAL / service account if indirect WIF is selected
SAJU_PRODUCTION_SERVICE_BEARER secret resource/version
optional previous bearer secret resource/version
```

Implementation must fail closed if required values are absent.

---

## 18. Acceptance Gate for Phase 2

Phase 2 is complete only when all are proven:

- [x] provider comparison complete.
- [x] hosting target selected.
- [x] region selected.
- [x] artifact/registry authority selected.
- [x] GitHub-to-cloud auth model selected.
- [x] secret model selected.
- [x] candidate-before-traffic strategy selected.
- [x] health strategy selected.
- [x] scale-to-zero/cold-start policy selected.
- [ ] Google Cloud project/billing prerequisites verified.
- [ ] Artifact Registry provisioned.
- [ ] WIF trust provisioned and repository scoped.
- [ ] runtime/deployer IAM least privilege verified.
- [ ] Secret Manager secrets provisioned.
- [ ] exact Saju image pushed and digest recorded.
- [ ] no-traffic Cloud Run candidate deployed.
- [ ] candidate positive/negative smoke passed.
- [ ] traffic promoted.
- [ ] MyeongHa origin/bearer binding completed.
- [ ] production authenticated E2E passed.
- [ ] rollback drill passed.
- [ ] cold-start/latency baseline recorded.

Therefore current state is:

```text
HOSTING DECISION = CLOSED
HOSTING IMPLEMENTATION = OPEN
SAJU PRODUCTION ACTIVATION = BLOCKED
```

---

## 19. Provider Reconsideration Triggers

Do not reconsider provider based on preference alone.

Re-open this decision only if one of these becomes true:

- Google Cloud account/IAM setup cannot be completed without disproportionate operational burden.
- measured Cloud Run cold-start behavior cannot meet the approved latency budget at acceptable min-instance cost.
- Cloud Run concurrency/runtime behavior conflicts with deterministic Saju execution.
- legal/compliance/data residency requirements change.
- provider availability/cost materially changes.
- a future private-network architecture makes a different runtime materially simpler.

Fallback order:

```text
1. Railway Singapore
2. Render Singapore
3. Fly.io Singapore/APAC
```

---

## 20. External Evidence Snapshot

Verified on 2026-09-04 from provider documentation.

Google Cloud:

- Cloud Run runtime contract / OCI / `PORT` / `0.0.0.0`: https://cloud.google.com/run/docs/container-contract
- Cloud Run revisions / rollback / traffic migration: https://cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration
- Cloud Run health checks: https://cloud.google.com/run/docs/configuring/healthchecks
- Cloud Run scaling: https://cloud.google.com/run/docs/configuring/min-instances and https://cloud.google.com/run/docs/configuring/max-instances
- Cloud Run concurrency: https://cloud.google.com/run/docs/configuring/concurrency
- Cloud Run secrets: https://cloud.google.com/run/docs/configuring/services/secrets
- Cloud Run pricing: https://cloud.google.com/run/pricing

Railway:

- Regions: https://docs.railway.com/deployments/regions
- Healthchecks: https://docs.railway.com/deployments/healthchecks
- Restart policy: https://docs.railway.com/deployments/restart-policy
- Rollback: https://docs.railway.com/deployments/deployment-actions
- Pricing: https://docs.railway.com/pricing

Render:

- Regions: https://render.com/docs/regions
- Web services / Docker: https://render.com/docs/web-services
- Health checks: https://render.com/docs/health-checks
- Rollbacks: https://render.com/docs/rollbacks
- Compute plans: https://render.com/docs/compute-plans

Fly.io:

- Pricing: https://fly.io/docs/about/pricing/
- Rollback guide: https://fly.io/docs/blueprints/rollback-guide/

AWS:

- App Runner pricing: https://aws.amazon.com/apprunner/pricing/

---

## 21. Decision Verdict

```text
Selected provider: Google Cloud Run
Selected region: asia-southeast1 / Singapore
Selected artifact store: Google Artifact Registry
Selected deployment auth: GitHub OIDC -> Google Workload Identity Federation
Selected runtime secret store: Google Secret Manager
Selected promotion model: immutable digest -> no-traffic revision -> synthetic smoke -> traffic migration
Initial min instances: 0, conditional on measured cold-start budget
Exact sizing/concurrency/max instances: TBD-BY-MEASUREMENT
Production activation: NOT COMPLETE
```
