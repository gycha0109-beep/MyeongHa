# 명하 운영 인프라 아키텍처 v1

> Repository: `gycha0109-beep/MyeongHa`  
> Baseline date: 2026-09-04 KST  
> Baseline MyeongHa `main`: `0fcd9f2b0dd18e6a9a97edc408b5a10204bdbbfd`  
> Baseline Saju `main`: `1314085c9fef93ac8f533bded882d035a9b42cc3`  
> Status: **ARCHITECTURE CANDIDATE / SELF-REVIEW REQUIRED / PRODUCTION OPERATIONS NOT COMPLETE**

---

## 1. 목적

이 문서는 명하의 production runtime을 실제 장애, 배포 실패, 외부 provider 장애, credential rotation, DB 장애, latency 증가, burst traffic 상황에서도 **관찰·격리·복구·재현·측정 가능**하게 운영하기 위한 기준을 정의한다.

목표는 특정 cloud product를 많이 도입하는 것이 아니다. 목표는 다음 질문에 실행 가능한 답을 갖는 것이다.

- 어떤 서비스가 어디에서 실행되는가?
- 한 dependency가 죽을 때 전체 서비스까지 같이 죽는가?
- 장애를 몇 분 안에 감지할 수 있는가?
- 느린 요청과 실패 dependency를 구분할 수 있는가?
- bad deployment를 exact previous artifact로 되돌릴 수 있는가?
- DB 손상 또는 삭제 시 복구 가능한가?
- Saju 서비스가 장애여도 기존 product surface가 유지되는가?
- traffic 증가 시 병목 위치를 측정할 수 있는가?
- cache로 사용자별 민감 데이터가 섞이지 않는가?
- logs/traces/metrics/alerts/CI에 secret 또는 민감 데이터가 노출되지 않는가?

이 문서는 **설계 authority**이며, provider dashboard 설정이 존재한다는 이유만으로 해당 capability가 검증되었다고 간주하지 않는다.

---

## 2. 범위 / 비범위

### 범위

- hosting / compute
- deployment / provenance / rollback
- environment / secret management
- liveness / readiness / dependency health
- structured logging
- metrics / monitoring / alerting
- dependency failure isolation
- timeout / retry / circuit policy
- backup / restore / disaster recovery
- cache / CDN
- performance baseline
- load / capacity
- scaling trigger
- resource / cost boundary
- production verification
- failure / chaos validation
- operational runbook

### 비범위

다음은 별도 authority를 유지한다.

- PostgreSQL FK / UNIQUE / CHECK
- RLS / object authorization
- command idempotency semantics
- transaction / concurrency semantics
- ledger / projection semantics
- transactional outbox atomicity / dedupe
- payment entitlement semantics
- Saju semantic calculation rules
- Character semantic/presentation authority

운영 인프라는 위 영역의 **runtime deployment, retry, monitoring, recovery**만 다룬다.

---

## 3. Authority Baseline

이 문서는 다음 authority 경계를 보존한다.

```text
MyeongHa Web/API
→ user identity
→ product state
→ entitlement orchestration
→ API orchestration

Saju Calculation Service
→ deterministic / governed Saju calculation authority

Character Runtime
→ character presentation / conversational execution

Supabase/PostgreSQL
→ persistent product data authority
```

기준 문서:

- `MyeongHa Integration Spine v1 — Final Reviewed Design v1.2`
- `명하 DB ERD v0.6 — Authority-First Fifth Review`
- `Usecase_re_reviewed_v2`
- `MyeongHa UX Product Flow Architecture v0.2`
- `MyeongHa Saju Product Interpretation Architecture v1.2`
- `MyeongHa Character System Architecture — Phase C1 v0.1`
- `Myeonghwa Personalized Interpretation Architecture v1.3`

문서와 현재 production 구현이 충돌할 경우 다음 우선순위로 판정한다.

1. semantic/domain authority
2. 최신 approved architecture decision
3. 최신 `main` implementation
4. 실제 production runtime evidence
5. 본 문서에서 명시한 operations authority

Operations 문서가 domain authority를 재정의해서는 안 된다.

---

## 4. Evidence / Current-State Classification

모든 상태는 다음 네 class 중 하나로 기록한다.

```text
CONFIRMED
→ repository 또는 live provider/runtime evidence로 확인

PARTIAL
→ 일부 capability는 있으나 운영 contract 전체는 미검증

UNKNOWN
→ provider/account-level evidence를 현재 확인할 수 없음

BLOCKED
→ known dependency/decision 때문에 production-ready가 아님
```

`READY`, `green`, `200`은 독립 evidence일 뿐 production health 전체를 의미하지 않는다.

---

## 5. 현재 Production Topology

```text
Browser
  ↓
Vercel Edge / CDN
  ↓
MyeongHa Web + Node Serverless API
  ├─ /api/health
  ├─ /api/me
  ├─ /api/birth-profiles
  ├─ /api/session/bootstrap
  └─ /api/me/saju/calculation
       │
       ├─ Supabase Auth
       ├─ Supabase PostgreSQL
       └─ HTTPS + Bearer
            ↓
          Saju Calculation Service
          └─ application/container contract exists
             actual production host/binding is not verified
```

현재 확인된 provider/runtime:

- MyeongHa hosting: Vercel
- production alias: `myeongha.vercel.app`
- MyeongHa runtime: Node 24.x serverless functions
- current deployment is exact-Git-SHA attributable and rollback candidate exists
- database provider: Supabase
- database region: `ap-southeast-1`
- PostgreSQL: 17.x
- Saju: Node 24 + OCI/Docker contract exists
- Saju live production origin: **UNKNOWN / activation incomplete**

### 현재 중요 production evidence

- `/api/health` returns `200 {"status":"ok"}` but only proves route/process liveness.
- protected current-user API returns auth failure with `Cache-Control: no-store` when identity evidence is absent.
- `/api/me/saju/calculation` currently fails when `MYEONGHA_SAJU_SERVICE_ORIGIN` is missing.
- therefore Vercel deployment `READY` does not imply Saju product path readiness.

---

## 6. 목표 Production Topology

초기 제품의 minimum viable reliability 기준 target은 다음과 같다.

```text
Client
  ↓
CDN / Edge
  ↓
MyeongHa Web/API deployment unit
  ├─ Supabase Auth
  ├─ PostgreSQL
  ├─ Saju Calculation Service
  └─ external providers as explicitly required

Independent runtime units
  ├─ Saju Calculation Service
  └─ future workers / notification / webhook processors only when required
```

원칙:

- Saju를 deployment 편의 때문에 MyeongHa function 내부 semantic engine으로 합치지 않는다.
- degradable dependency는 MyeongHa 전체 readiness를 무조건 내리지 않는다.
- correctness-critical dependency failure는 bounded failure로 종료한다.
- state authority를 application-local ephemeral storage에 두지 않는다.
- worker/runtime class는 실제 use case가 존재할 때만 추가한다.

---

## 7. Service Catalog

| service_id | owner | repository | runtime | deployment unit | public/private | state | dependencies | health | criticality | data class | scaling |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `myeongha-web` | MyeongHa | `MyeongHa` | Vercel web/edge delivery | web deployment | public | stateless | Vercel/CDN | provider + page smoke | core | public + user UI | provider-managed |
| `myeongha-api` | MyeongHa | `MyeongHa` | Node 24 serverless | API functions | public ingress / server execution | stateless except DB connections | Auth, PostgreSQL, Saju | current `/api/health` liveness; target readiness/dependency telemetry | core | private/security-sensitive | serverless |
| `saju-calculation` | Saju | `Saju` | Node 24 OCI long-running HTTP | container image/process | public HTTPS endpoint with service auth; not user-public authority | stateless | internal calculation assets | `/healthz`; target readiness definition | feature-critical, not whole-product-critical | birth-derived calculation input/output | container instance |
| `postgres` | data platform | `MyeongHa` schema authority | Supabase PostgreSQL 17 | managed DB | private | stateful | provider storage/network | provider health + application DB probes | P0 | persistent private data | provider DB |
| `supabase-auth` | identity platform | external managed | Supabase Auth | managed service | public auth surface / server verification | stateful managed | provider | provider + auth verification metrics | core | identity/security-sensitive | provider-managed |
| `character-runtime` | Character | TBD current deployment unit | TBD | must remain independent semantic/presentation boundary | TBD | preferably stateless runtime over persistent authority | content, DB, AI provider | REQUIRED before activation | feature-critical | private conversation/context | TBD |
| `outbox-worker` | platform operations | future | TBD | separate worker if/when activated | private | stateless worker over DB state | PostgreSQL, delivery providers | REQUIRED before activation | background-critical | event metadata | queue/backlog driven |

Future service rows are **not evidence that those runtimes exist today**.

---

## 8. Environment Model

Initial environment model:

```text
local
→ developer-only; synthetic/local credentials

test
→ deterministic automated tests; no production secret/data

preview
→ per-PR or non-production deployment; isolated/non-production credentials

production
→ real user traffic and persistent authority
```

`staging` is not mandatory at v1. It becomes required only when one of the following becomes true:

- DB migration or multi-service promotion requires production-like coordination not safely covered by preview.
- payment/webhook/provider integration cannot be validated in preview.
- destructive/failure/load tests need a persistent shared non-production environment.

Environment invariants:

- production secrets never flow to preview/test.
- preview must not point at production PostgreSQL by default.
- synthetic or explicitly designated test data only for load/failure tests.
- environment name is explicit in logs/metrics/deployment metadata.

---

## 9. Hosting / Compute Requirements

### MyeongHa Web/API

Required capability:

- Node 24 compatibility
- static/web delivery + server API runtime
- TLS termination
- Git SHA attribution
- isolated environment variables
- runtime logs
- rollback to prior deployment
- bounded serverless/runtime concurrency behavior

Current Vercel hosting satisfies part of this requirement. Provider choice is not architecture authority.

### Saju Calculation Service

Required capability:

```text
Node 24
OCI/Docker
long-running HTTP process
PORT
0.0.0.0 bind
public HTTPS origin
GET /healthz
Bearer-authenticated /api/calculations
restart policy
non-root runtime
immutable image identification
logs
resource metrics
rollback to previous image/digest
```

Current OCI packaging is reusable. Provider selection must compare container support, secret management, health checks, restart, rollback, region, logs/metrics, scaling, cold start, and cost before activation.

---

## 10. Network / Service Connectivity

### MyeongHa → Saju

- server-owned HTTPS origin only
- exact origin, no embedded credentials/path/query/fragment
- Bearer credential injected server-side only
- client cannot choose upstream origin or credential
- redirects must not silently forward credentials to arbitrary hosts
- bounded timeout
- failure must be classified as dependency failure, not generic whole-product failure

### MyeongHa → PostgreSQL

Current runtime baseline:

- `pg.Pool`
- max connections per runtime: `4`
- connection timeout: `5s`
- idle timeout: `10s`
- TLS required by governed connection configuration
- login principal / execution role preflight

This per-runtime pool limit is not a database-wide capacity guarantee. Total possible connections depend on concurrent serverless runtime count and provider-side pool/connection limits.

---

## 11. Secret / Credential Contract

Secret classes:

```text
database credential
Supabase privileged/server credential
Saju service Bearer
payment provider secret
webhook signing secret
AI/API provider secret
CI/deployment credential
production smoke credential
```

Rules:

- git commit: forbidden
- container/image bake: forbidden
- `NEXT_PUBLIC_*` or browser exposure: forbidden for server secrets
- logs/traces/metrics labels: forbidden
- error response reflection: forbidden
- CI echo: forbidden
- environment isolation: required
- owner and rotation path: required
- active/previous overlap only when the credential protocol explicitly supports it

Current Saju naming authority:

```text
MYEONGHA_SAJU_SERVICE_ORIGIN
MYEONGHA_SAJU_SERVICE_BEARER
```

Saju producer-side active/previous Bearer rotation may be used for zero-downtime transition, but rotation completion requires old credential rejection verification.

---

## 12. Deployment / Promotion Architecture

Provider-neutral target flow:

```text
commit
→ CI
→ immutable artifact/image
→ deploy candidate
→ provider readiness
→ application health verification
→ negative auth smoke
→ positive smoke
→ dependency verification
→ production promotion/alias
→ post-promotion observation
```

Current MyeongHa reality:

```text
main push/merge
→ Vercel production deployment
```

This remains **current behavior**, not yet approved final promotion authority.

Target deployment invariants:

- every production deployment resolves to exact Git SHA.
- Saju image resolves to exact image digest plus source SHA.
- stale concurrent deployments must not silently supersede a newer approved artifact.
- unhealthy candidate must not be considered healthy because provider state is `READY`.
- rollback candidate must be identified before risky promotion.

Canary/blue-green/Kubernetes are not v1 requirements.

---

## 13. Artifact / Version / Provenance

Required metadata for every production deployment:

```text
service
source repository
source commit SHA
build identifier
artifact/image digest where applicable
deployment identifier
environment
deployed_at
```

MyeongHa may use provider deployment identity plus Git SHA.
Saju must use OCI digest plus source SHA; mutable `latest` alone is not production provenance.

---

## 14. Liveness / Readiness / Dependency Health

### Definitions

**Liveness**
: process/runtime can execute a minimal local request path.

**Readiness**
: service can safely accept the class of traffic assigned to it.

**Dependency health**
: independently measured state of Auth, DB, Saju, payment, AI, notification, etc.

**Degraded**
: one feature/dependency is unavailable while unaffected product surfaces remain serviceable.

### MyeongHa

Current `/api/health` is liveness only.

Target:

- keep a cheap public liveness endpoint with no secret/data details.
- introduce readiness/dependency instrumentation without turning optional dependency failure into whole-product failure.
- DB/Auth failure may make user-data paths unready.
- Saju failure must mark Saju capability degraded while core MyeongHa remains live.

Public health response must not reveal credentials, DB hostname, bearer state, internal stack, or user data.

### Saju

`/healthz` must have explicit semantics.

v1 requirement:

- liveness: process booted and HTTP loop responsive.
- readiness: calculation runtime initialized and able to execute governed calculation path using non-sensitive self-check or deterministic fixture.
- external dependency status, if any, must be separately instrumented.

---

## 15. Structured Logging Contract

Common fields:

```text
timestamp
service
environment
deploymentSha
requestId
traceId
route
method
status
durationMs
errorCode
dependency
dependencyStatus
```

Optional internal identifiers must be pseudonymous/stable only when operationally necessary.

Never log:

```text
Authorization header
Bearer token
session token
cookie value
database password
service-role or secret API key
raw payment credential
raw receipt payload
full Birth raw payload
full chat transcript
private conversation body
unbounded user-entered text
```

Error logs should prefer stable error codes and bounded metadata over raw exception context when the latter can contain sensitive values.

Retention and sampling are `OPEN DECISION` until provider/tool selection and traffic baseline.

---

## 16. Metrics / SLI Architecture

Minimum golden signals:

```text
latency
traffic
errors
saturation
```

### MyeongHa API

- request count by normalized route/method/status class
- 2xx / 4xx / 5xx
- p50 / p95 / p99 duration
- DB query/transaction latency
- DB connection acquisition failures/timeouts
- auth verification latency/failure
- dependency request latency/error/timeout
- serverless execution/cold-start signal when provider exposes it

### Saju

- calculation request count
- calculation p50/p95/p99
- 401 auth rejects
- calculation error count
- timeout count
- process restarts
- CPU / memory
- concurrent requests

### Dependencies

Separate dimensions for:

- PostgreSQL/Supabase
- Supabase Auth
- Saju
- payment provider
- AI provider
- notification provider

Dependency label cardinality must be bounded and must never contain URLs with secrets or user IDs.

---

## 17. SLO Catalog

No availability/latency number is authoritative until baseline and product criticality measurement are complete.

| SLO | SLI | window | target | source | user impact |
|---|---|---|---|---|---|
| Core API availability | valid core requests excluding client faults that receive non-5xx | rolling window `TBD` | `TBD-BY-MEASUREMENT` | API metrics | login/profile/core use |
| Core API latency | route-normalized p95 | rolling window `TBD` | `TBD-BY-MEASUREMENT` | API metrics | perceived responsiveness |
| Saju capability availability | eligible Saju requests completing without dependency/internal failure | rolling window `TBD` | `TBD-BY-MEASUREMENT` | MyeongHa + Saju metrics | new Saju calculation |
| Saju latency | end-to-end calculation p95 | rolling window `TBD` | `TBD-BY-MEASUREMENT` | trace/metrics | Saju wait time |
| DB dependency success | DB operations without timeout/connection failure | rolling window `TBD` | `TBD-BY-MEASUREMENT` | DB/app metrics | persistent product paths |

Target values are set only after Phase 10 baseline measurement.

---

## 18. Monitoring / Dashboard

Minimum dashboard views:

1. **Core service overview** — traffic, 5xx, p95, deployment SHA.
2. **Dependency overview** — DB/Auth/Saju/provider latency + errors + timeouts.
3. **Saju service** — request rate, auth rejects, latency, CPU/memory, restarts.
4. **Database operations** — connection acquisition, query latency, provider health, capacity signals.
5. **Deployment comparison** — before/after error and latency by SHA.
6. **Background processing** — only when workers exist; backlog/age/retry/dead-letter style signals.

A dashboard is not alerting.

---

## 19. Alert Severity / Paging

```text
P0
→ broad outage, data corruption/loss risk, credential compromise, irreversible payment/data risk

P1
→ core product unavailable or major critical feature unavailable

P2
→ bounded degradation with workaround or limited blast radius

P3
→ operational anomaly requiring investigation but no immediate user-critical impact
```

Initial alert candidates:

- sustained core 5xx regression
- DB unavailable / connection exhaustion
- Saju unavailable or timeout spike
- production deployment verification failure
- unexpected process restart loop
- backup failure
- outbox/worker backlog when activated
- payment webhook processing failures when payment runtime is activated

Thresholds and evaluation windows remain `TBD-BY-MEASUREMENT`. Single isolated warning events should not automatically page.

---

## 20. Dependency Failure Matrix

| Failure | Detection | User impact | Blast radius | Automatic recovery | Manual action | Data risk | Expected degraded state |
|---|---|---|---|---|---|---|---|
| MyeongHa API unavailable | synthetic/API metrics | API features unavailable | web static may remain | provider restart/redeploy | rollback/investigate | low unless in-flight writes | API unavailable |
| Saju unavailable | dependency timeout/health/5xx | new Saju calculation unavailable | Saju only | service restart if supported | rollback Saju / provider action | low if no partial commit | core remains available |
| Saju timeout | dependency latency/timeout | bounded Saju error | Saju request only | timeout releases request | inspect capacity/provider | low | core remains available |
| DB unavailable | DB connection errors | persistent user-data paths fail | broad API | provider recovery | incident/restore if needed | potentially high | static/non-DB surfaces only |
| DB slow | p95/query/acquire latency | API slow/timeouts | DB-dependent routes | bounded timeout | query/capacity analysis | low-to-medium | degraded core |
| Supabase Auth unavailable | verifier/provider errors | member auth flows fail | member routes | provider recovery | provider incident | low | public/static surfaces remain |
| credential mismatch | 401/explicit auth metric | service-to-service function fails | affected dependency only | none unless overlap credential valid | rotate/bind correctly | low | bounded feature outage |
| bad production deployment | smoke + regression metrics | varies | deployment unit | promotion stop/rollback | rollback or roll-forward | migration-dependent | previous healthy version |
| partial deployment | SHA/provenance mismatch | inconsistent behavior | involved services | stop promotion | align exact versions | medium | fail closed where contract incompatible |
| DNS/TLS failure | network classification | affected dependency fails | dependency only | resolver/provider recovery | provider/network action | low | bounded feature degradation |
| external AI/provider timeout | dependency metrics | generated feature degraded | AI-dependent surfaces | bounded failure | provider switch only if pre-approved | low | non-AI core remains |
| logging provider unavailable | log export health | observability reduced | operations only | local/provider buffering if supported | restore export | no product correctness impact | product continues |
| metrics provider unavailable | scrape/export health | detection reduced | operations only | retry/export recovery | restore metrics | no product correctness impact | product continues |
| worker crash | heartbeat/backlog | delayed async work | worker-owned feature | restart | inspect poison work item | depends on event semantics | synchronous core remains |
| cache failure | cache errors | slower response | cached surfaces | bypass cache | restore/invalidate | correctness must remain intact | uncached operation |

---

## 21. Failure Isolation Invariants

Mandatory invariants:

```text
Saju down
→ new Saju calculation unavailable
→ existing persisted Reading retrieval remains possible when DB is healthy
→ Character surfaces that do not require a new Saju call may remain available
→ login/home/core API must not fail solely because Saju is down

DB down
→ DB-dependent requests fail bounded
→ serverless/process connection storm must be limited
→ static assets remain available

Auth down
→ protected member paths fail closed
→ no identity fallback that trusts client-supplied subject IDs

observability down
→ product correctness unchanged

cache down/corrupt
→ correctness preserved; bypass/invalidate rather than serve uncertain private data
```

---

## 22. Timeout / Retry / Circuit Policy

### General policy

Every dependency must define:

```text
connect timeout
request timeout
retry count
retryable errors
non-retryable errors
backoff
jitter
circuit/open-state behavior if needed
```

Rules:

- no unbounded network waits.
- no automatic write retry without platform idempotency authority.
- authentication/authorization failures are non-retryable.
- schema/contract 4xx failures are non-retryable.
- retry must not multiply load during provider outage.

### Saju current implementation baseline

Current adapter baseline uses a bounded request timeout with `5s` default and `30s` maximum configuration boundary. This is implementation evidence, not an SLO.

v1 authority:

- preserve bounded timeout.
- application-level retries remain disabled unless command semantics prove retry safety.
- if retries are later enabled for transport-only safe operations, use small bounded count + exponential backoff + jitter.
- circuit breaking is introduced only after repeated dependency failure causes measurable resource pressure; not preemptively as framework complexity.

---

## 23. Rollback / Roll-forward Strategy

### Bad application deployment

```text
detect
→ smoke or post-deploy regression
contain
→ stop further promotion
rollback
→ exact previous healthy deployment/artifact
verify
→ health + negative auth + positive smoke + dependency checks
```

### Saju regression

- previous OCI digest must remain identifiable.
- rollback changes only Saju deployment unit.
- MyeongHa need not roll back unless API contract incompatibility exists.

### DB migration regression

Application rollback must not assume schema rollback is safe. Migration semantics remain DB authority; operations runbook must classify migrations as backward-compatible, forward-only, or requiring coordinated recovery.

Roll-forward is preferred when data/schema state makes code rollback unsafe.

---

## 24. Backup / Restore

Current state:

```text
Supabase project healthy
backup schedule = UNKNOWN
retention = UNKNOWN
PITR = UNKNOWN
restore procedure = UNVERIFIED
restore drill = NOT PERFORMED/NOT EVIDENCED
```

Architecture requirement:

- authoritative PostgreSQL data must have provider-supported backup.
- backup retention must be explicitly recorded.
- restore must be tested, not assumed.
- restore test must use an isolated target where feasible.
- credentials/configuration needed for restore must not exist only in one operator's local machine.
- backup status/failure must be observable.

Repository artifacts/content that can be reconstructed from Git are not a substitute for DB backup.

---

## 25. RPO / RTO

Definitions:

- **RPO**: maximum acceptable persistent-data loss window.
- **RTO**: maximum acceptable time to restore service after qualifying failure.

Current authority:

```text
RPO = OPEN DECISION
RTO = OPEN DECISION
```

Initial candidate values may be proposed only after confirming Supabase plan backup capability and running at least one restore exercise. Until then no `DR Ready` claim is allowed.

---

## 26. Incident Recovery

Every operational incident follows:

```text
detect
→ classify dependency/service
→ contain blast radius
→ preserve evidence
→ rollback/restore/recover
→ verify exact production state
→ document root cause and preventive action
```

Credential compromise adds:

```text
revoke/rotate
→ bind active credential
→ verify new credential succeeds
→ verify old credential fails
→ review logs for exposure
```

Data corruption adds:

```text
stop destructive writers if needed
→ identify corruption boundary
→ select restore/repair path under DB authority
→ verify consistency
→ reopen traffic
```

---

## 27. Cache / CDN Classification

| data class | cache policy |
|---|---|
| hashed static immutable asset | aggressive CDN cache allowed |
| public versioned content | shared cache allowed with versioned key; TTL `TBD` |
| shared dynamic public content | only after explicit freshness/correctness review |
| user-private API | `private` or `no-store`; shared cache forbidden by default |
| auth/session/security-sensitive | `no-store` |
| current-subject Saju calculation | `no-store` |
| mutation/write result | `no-store` unless explicit safe contract exists |

Current evidence already shows `no-store` on current-user/Saju route paths.

Cross-user leakage invariant:

- a shared cache key must never depend on an omitted user/subject discriminator for private content.
- where correctness is uncertain, disable shared caching rather than invent a user-key scheme.

Cache outage must reduce performance, not correctness.

---

## 28. Performance Budget

No fabricated p95 target is authoritative in v1.

Required baseline measurements:

```text
web page TTFB / load
API p50 / p95 / p99
serverless cold-start contribution
DB connection acquisition latency
DB query/transaction latency
Supabase Auth verification latency
MyeongHa → Saju network latency
Saju calculation latency
```

Performance budget values are `TBD-BY-MEASUREMENT` until Phase 10.

Performance work prioritization:

1. correctness/resource leak
2. pathological saturation
3. user-visible p95 regression
4. cost efficiency
5. micro-optimization

Supabase index advisor findings are investigation inputs, not automatic index-authority changes.

---

## 29. Load / Capacity Model

Load testing must not target production user data or perform destructive writes against production DB.

| scenario | RPS | concurrency | duration | dataset | expected p95 | expected errors | resource ceiling |
|---|---:|---:|---:|---|---|---|---|
| single-user baseline | `TBD` | 1 | 5m initial | synthetic | `TBD` | 0 unexpected | measure |
| normal concurrency | `TBD` | `TBD-BY-MEASUREMENT` | 15m initial | synthetic/staging | `TBD` | bounded | measure |
| burst | derived from normal, include 10x scenario if safe | `TBD` | 1–5m | synthetic/staging | `TBD` | bounded degradation acceptable | no resource collapse |
| dependency latency | `TBD` | `TBD` | 5m | injected latency | bounded by timeout | expected dependency errors | no leak |
| DB saturation | `TBD` | `TBD` | controlled | isolated non-prod DB | `TBD` | bounded | connection budget respected |
| Saju saturation | `TBD` | `TBD` | controlled | deterministic fixtures | `TBD` | bounded | CPU/memory ceiling measured |
| rate-limit boundary | `TBD` | `TBD` | controlled | synthetic | n/a | intended 429/limit behavior only | no cascade |

`10x` is a resilience test scenario, not a statement that production currently supports ten times traffic.

---

## 30. Scaling Strategy

### MyeongHa API

Current model is provider-managed serverless horizontal scaling.

Risk:

- each runtime may create its own small DB pool.
- total database connections can therefore grow with serverless concurrency.

Scaling gate must observe DB connection capacity before increasing application concurrency.

### Saju

Initial scaling model should prefer simple container horizontal scaling only when:

- CPU or memory saturation is measured,
- calculation queue/concurrency grows,
- p95 degrades while downstream dependencies are healthy.

### PostgreSQL

Scaling order:

1. query/index/workload correction under DB authority
2. connection pooling/limits
3. provider resource scaling
4. read/architectural expansion only when measured workload requires it

Kubernetes is not a v1 scaling requirement.

Numeric trigger thresholds remain `TBD-BY-MEASUREMENT`.

---

## 31. Resource / Cost Boundary

Track at least:

```text
web/serverless compute
Saju container compute
DB compute/storage
network/egress
logs
metrics/traces
backup storage
AI/provider API usage
notification/provider usage
```

Cost controls:

- avoid high-cardinality metrics.
- log bodies are forbidden; sample low-value success logs if volume requires.
- keep container minimum instances/resource sizes no larger than reliability requires.
- retain only operationally necessary logs/traces.
- scaling decisions require both latency/error evidence and cost impact.

Target is **minimum viable reliability**, not enterprise infrastructure imitation.

---

## 32. Security / Privacy Observability Boundary

Acceptance gate applies to:

```text
application logs
traces
metrics labels
error tracker
alert payload
CI logs
deployment logs
backup metadata
```

Forbidden raw values include:

- auth/session/service tokens
- DB credentials
- Birth raw data
- private conversation/chat transcript
- payment secrets/receipts
- unrestricted user input

Trace/span attributes must use normalized route names, not full URLs containing user identifiers or query strings.

Request IDs and trace IDs are operational identifiers, not authentication evidence.

---

## 33. Production Verification Contract

A production deployment is not accepted by provider `READY` alone.

Minimum verification:

```text
1. expected source SHA / image digest
2. provider deployment state
3. liveness
4. readiness semantics for the deployment unit
5. negative auth smoke
6. positive authenticated smoke where safe credential exists
7. required dependency check
8. user-private no-store/cache contract
9. secret non-reflection
10. log event presence/redaction
11. metrics presence
12. rollback candidate identification
```

MyeongHa/Saju existing exact-head and production smoke mechanisms should be extended/reused rather than duplicated.

---

## 34. Failure / Chaos Test Matrix

| test | injected condition | required result |
|---|---|---|
| Saju kill | stop Saju process | new calculation fails bounded; core stays available |
| Saju slow | latency > client timeout | timeout; no hanging request/resource leak |
| Saju wrong credential | mismatch Bearer | explicit auth reject; no secret reflection |
| credential rotation | active + previous overlap then remove previous | zero-downtime transition; old token eventually rejected |
| DB unavailable | block DB connection | DB routes fail bounded; static remains |
| DB slow | injected/query latency | timeout/alert; no runaway connection growth |
| DB connection exhaustion | cap available connections | bounded failures; saturation metric/alert |
| Auth provider unavailable | fail verifier | protected routes fail closed |
| bad deployment | candidate returns unhealthy behavior | promotion stopped or rollback executed |
| partial service versions | incompatible MyeongHa/Saju versions | fail closed; no silent semantic corruption |
| DNS/TLS failure | break dependency resolution/TLS | classified network dependency failure |
| cache unavailable | disable cache | correctness maintained |
| cache poison simulation | wrong/shared private entry attempt | private response never crosses subject boundary |
| log/metric provider outage | disable export | product correctness unaffected; observability degradation visible when possible |

Failure tests against production require a separate explicit safety decision. Default target is controlled non-production runtime.

---

## 35. Required Runbooks

Minimum runbooks:

1. bad MyeongHa deployment rollback
2. bad Saju deployment rollback
3. Saju service outage/degradation
4. DB unavailable / connection exhaustion
5. DB backup restore
6. credential leak / rotation
7. provider outage classification
8. production smoke failure
9. cache corruption/invalidation when shared cache is introduced
10. worker poison/backlog recovery when workers are introduced

Runbooks must name observable evidence, exact containment action, rollback/recovery verification, and stop conditions.

---

## 36. Open Decisions

### P0

`P0-OPS-01 — Saju production activation`

- choose/confirm actual Saju hosting target
- provision HTTPS origin
- bind production Bearer
- bind `MYEONGHA_SAJU_SERVICE_ORIGIN`
- authenticated positive/negative production E2E
- runtime monitoring + rollback evidence

`P0-OPS-02 — PostgreSQL backup / restore / RPO / RTO`

- confirm Supabase plan capability
- record backup schedule/retention/PITR
- define restore target/procedure
- execute restore drill
- then approve RPO/RTO

`P0-OPS-03 — readiness semantics`

- preserve `/api/health` as liveness or rename semantics explicitly
- define dependency readiness/degraded telemetry
- ensure Saju failure does not mark whole MyeongHa down

### P1

- observability provider/tool selection
- structured logger implementation
- trace propagation
- SLI/SLO target values after baseline
- alert thresholds/destinations
- deployment promotion gate authority
- performance/load environment
- cache matrix enforcement tests
- capacity/scaling thresholds

### UNKNOWN / NEEDS OWNER OR PROVIDER EVIDENCE

- Supabase backup/PITR plan settings
- production DB provider-side pool/connection ceiling
- final custom domain
- final Saju production hosting target
- logs/metrics retention policy

---

## 37. Acceptance Criteria

Architecture stage closes only when:

- [x] current topology is evidence-based.
- [x] service deployment units are classified.
- [x] environment model is defined.
- [x] secret classes and non-exposure rules are defined.
- [x] deployment/provenance/rollback requirements are defined.
- [x] liveness/readiness/degraded semantics are defined.
- [x] structured logging contract is defined.
- [x] metrics/monitoring target set is defined.
- [x] alert severity model is defined.
- [x] dependency failure matrix is defined.
- [x] failure isolation invariants are defined.
- [x] timeout/retry policy is defined without changing idempotency authority.
- [x] backup/restore requirement is defined.
- [x] RPO/RTO remain explicitly unresolved until evidence exists.
- [x] cacheability classification is defined.
- [x] performance baseline plan exists.
- [x] load/capacity matrix exists.
- [x] scaling trigger method is defined.
- [x] privacy/security observability boundary is defined.
- [x] Saju activation path is explicit.
- [x] unresolved P0 items are explicit.
- [ ] self-review complete.

Passing this architecture stage does **not** mean production infrastructure implementation is complete.

---

## 38. Implementation Phases

### Phase 1 — topology/service catalog authority

- freeze this document after self-review
- resolve stale/unknown evidence

### Phase 2 — Saju production hosting

- provider comparison against Section 9 requirements
- deploy exact OCI artifact
- HTTPS + `/healthz`

### Phase 3 — secret/environment binding

- production origin/Bearer
- active/previous rotation test
- secret reflection negative test

### Phase 4 — deployment / health / rollback

- readiness model
- exact artifact verification
- production smoke
- rollback runbook

### Phase 5 — structured logging

- common schema
- redaction tests

### Phase 6 — metrics / monitoring / alerting

- golden signals
- dependency metrics
- alert severity and destinations

### Phase 7 — failure isolation / timeout / retry

- bounded dependency failures
- chaos matrix execution

### Phase 8 — backup / restore / recovery

- provider backup evidence
- restore drill
- approve RPO/RTO

### Phase 9 — cache / CDN

- endpoint classification
- no-store regression tests

### Phase 10 — performance baseline

- collect p50/p95/p99 and dependency latency
- identify hot DB/Saju paths

### Phase 11 — load / capacity

- controlled non-production load tests
- DB connection and Saju saturation ceilings

### Phase 12 — scaling thresholds

- convert measured ceilings into explicit triggers

### Phase 13 — production operations acceptance

Only after implementation and verification may individual capabilities be marked production-ready.

---

## Appendix A. Current P0 Operational Risk Register

| ID | risk | current state | closure evidence |
|---|---|---|---|
| P0-OPS-01 | Saju route not production-activated | BLOCKED | live host + env binding + authenticated E2E + monitoring + rollback |
| P0-OPS-02 | DB backup/restore not proven | UNKNOWN/BLOCKED | provider config + restore drill + approved RPO/RTO |
| P0-OPS-03 | liveness/readiness/degraded distinction not implemented | PARTIAL | explicit health semantics + dependency metrics + smoke |

---

## Appendix B. Non-claims

Until later phases are verified, do not claim:

```text
Production Infrastructure Complete
Highly Available
Scalable
Disaster Recovery Ready
Zero-Downtime Deployment
Automatic Failover
```

The current approved statement is limited to:

> MyeongHa has a production-connected application runtime, exact deployment provenance and partial reliability controls, while Saju production activation, observability, backup/restore, measured capacity and recovery validation remain incomplete.
