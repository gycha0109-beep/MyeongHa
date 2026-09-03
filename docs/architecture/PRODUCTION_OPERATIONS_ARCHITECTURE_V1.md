# 명하 운영 인프라 아키텍처 v1

> Repository: `gycha0109-beep/MyeongHa`  
> Baseline date: 2026-09-04 KST  
> Baseline MyeongHa `main`: `0fcd9f2b0dd18e6a9a97edc408b5a10204bdbbfd`  
> Baseline Saju `main`: `2f92f59c3f27c471127bfe3dad8260b192bc8c31`  
> Status: **SECOND SELF-REVIEW PASS / IMPLEMENTATION P0 OPEN / PRODUCTION OPERATIONS NOT COMPLETE**

---

## 1. 목적

이 문서는 명하 production runtime을 실제 장애, 배포 실패, 외부 provider 장애, credential rotation, DB 장애, latency 증가, burst traffic 상황에서도 **관찰·격리·복구·재현·측정 가능**하게 운영하기 위한 기준을 정의한다.

목표는 특정 cloud product를 많이 도입하는 것이 아니다. 다음 질문에 실행 가능한 답을 갖는 것이 목표다.

- 어떤 서비스가 어디에서 실행되는가?
- 한 dependency가 죽을 때 전체 서비스까지 같이 죽는가?
- 장애를 어떤 signal로 감지하는가?
- 느린 요청과 실패 dependency를 구분할 수 있는가?
- bad deployment를 exact previous artifact로 되돌릴 수 있는가?
- DB 손상 또는 삭제 시 복구 가능한가?
- Saju 장애 시 기존 product surface가 유지되는가?
- traffic 증가 시 병목 위치를 측정할 수 있는가?
- cache로 사용자별 민감 데이터가 섞이지 않는가?
- logs/traces/metrics/alerts/CI에 secret 또는 민감 데이터가 노출되지 않는가?

Provider dashboard에 기능이 보인다는 이유만으로 해당 capability가 검증되었다고 간주하지 않는다.

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

Operations는 위 영역의 runtime deployment, timeout/retry, observability, recovery 연결부만 다룬다.

---

## 3. Authority Baseline

```text
MyeongHa Web/API
→ user identity orchestration
→ product state orchestration
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

특히 다음 경계를 유지한다.

```text
Saju Engine
→ 무엇을 계산/해석할 수 있는가

MyeongHa Product DB
→ 누구의 어떤 입력/대화/관계/권한/결과인가

Character Runtime
→ 허용된 의미를 어떤 캐릭터 화법으로 전달하는가
```

Operations 문서가 이 semantic/domain authority를 재정의해서는 안 된다.

문서와 현재 구현이 충돌하면:

1. semantic/domain authority 확인
2. 최신 architecture/decision 확인
3. 최신 `main` implementation 확인
4. 실제 production runtime 확인
5. 충돌을 명시하고 operations 범위에서만 결정

---

## 4. Evidence / Current-State Classification

```text
CONFIRMED
→ repository 또는 live provider/runtime evidence로 확인

PARTIAL
→ 일부 capability는 있으나 운영 contract 전체는 미검증

UNKNOWN
→ provider/account-level evidence를 확인하지 못함

BLOCKED
→ known dependency/decision 때문에 production-ready가 아님
```

`READY`, CI `green`, 단일 HTTP `200`은 독립 evidence일 뿐 production health 전체를 의미하지 않는다.

Current-state assertion은 point-in-time snapshot이다. 다른 repo의 `main`이 이동하면 baseline SHA를 다시 확인한다.

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

확인된 provider/runtime:

- MyeongHa hosting: Vercel
- production project: `myeongha`
- production alias: `myeongha.vercel.app`
- MyeongHa runtime: Node 24.x serverless functions
- current production deployment is exact Git SHA attributable
- prior rollback candidate exists
- current Vercel plan observed during investigation: Hobby
- database provider: Supabase
- database region: `ap-southeast-1`
- PostgreSQL: 17.x
- Supabase project status observed: healthy
- Saju: Node 24 + OCI/Docker production contract exists
- Saju live production origin: **UNKNOWN / activation incomplete**

### 현재 중요 evidence

- `/api/health` returns `200 {"status":"ok"}` but proves route/process liveness only.
- protected current-user API rejects absent identity evidence and uses `Cache-Control: no-store`.
- `/api/me/saju/calculation` fails when required Saju production configuration is missing.
- therefore Vercel `READY` does not imply Saju capability readiness.
- MyeongHa `main` is currently unprotected while `main` maps to production deployment.
- Saju `main` is also currently unprotected. It is not a live production deployment source yet, but it becomes a supply-chain governance risk once production artifact promotion begins.

Saju baseline moved during architecture review from `a64c3b12...` to `2f92f59c...`; the delta was a product-host monthly-reading E2E test addition only. Production container/process files were not changed by that one-commit delta.

---

## 6. 목표 Production Topology

Minimum viable reliability target:

```text
Client
  ↓
CDN / Edge
  ↓
MyeongHa Web/API deployment unit
  ├─ Supabase Auth
  ├─ PostgreSQL
  ├─ Saju Calculation Service
  └─ explicitly activated external providers

Independent runtime units
  ├─ Saju Calculation Service
  └─ future workers / notification / webhook processors only when required
```

원칙:

- Saju를 deployment 편의 때문에 MyeongHa function 내부 semantic engine으로 합치지 않는다.
- degradable dependency failure가 전체 readiness를 무조건 내리지 않는다.
- correctness-critical dependency failure는 bounded failure로 종료한다.
- state authority를 application-local ephemeral storage에 두지 않는다.
- worker/runtime class는 실제 use case가 존재할 때만 추가한다.
- deployment topology는 domain authority를 바꾸지 않는다.

---

## 7. Service Catalog

| service_id | owner | repository | runtime | deployment unit | public/private | state | dependencies | health | criticality | data class | scaling |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `myeongha-web` | MyeongHa | `MyeongHa` | Vercel web/edge delivery | web deployment | public | stateless | Vercel/CDN | provider + page smoke | core | public + user UI | provider-managed |
| `myeongha-api` | MyeongHa | `MyeongHa` | Node 24 serverless | API functions | public ingress / server execution | stateless except DB connections | Auth, PostgreSQL, Saju | current liveness; target capability readiness/dependency telemetry | core | private/security-sensitive | serverless |
| `saju-calculation` | Saju | `Saju` | Node 24 OCI long-running HTTP | container image/process | network-public HTTPS + service auth; not user authority | stateless | calculation assets | `/healthz`; target calculation readiness | feature-critical | birth-derived calculation input/output | container instances |
| `postgres` | data platform | `MyeongHa` schema authority | Supabase PostgreSQL 17 | managed DB | private | stateful | provider storage/network | provider health + application DB signals | P0 | persistent private data | provider DB |
| `supabase-auth` | identity platform | external managed | Supabase Auth | managed service | public auth surface / server verification | managed state | provider | provider + auth verification metrics | core | identity/security-sensitive | provider-managed |
| `character-runtime` | Character | TBD | TBD | must preserve Character authority | TBD | preferably stateless over persistent authority | content, DB, AI | REQUIRED before activation | feature-critical | private conversation/context | TBD |
| `outbox-worker` | platform operations | future | TBD | separate worker if activated | private | stateless worker over DB state | PostgreSQL, providers | REQUIRED before activation | background-critical | event metadata | backlog-driven |

Future rows are not evidence that those runtimes exist today.

---

## 8. Environment Model

```text
local
→ developer-only; synthetic/local credentials

test
→ deterministic automated tests; no production secret/data

preview
→ per-PR/non-production deployment; isolated non-production credentials/data

production
→ real user traffic and persistent authority
```

`staging` is not mandatory at v1. It becomes required when:

- DB migration or multi-service promotion needs production-like coordination not safely covered by preview.
- payment/webhook/provider integration cannot be validated safely in preview.
- destructive/failure/load tests need a persistent shared non-production environment.

Environment invariants:

- production secrets never flow to preview/test.
- preview/test must not use production DB credentials.
- preview/test must not intentionally query production user-owned rows.
- production diagnostics that require real production state run through explicitly authorized production tooling, not by pointing preview at production.
- load/failure tests use synthetic or explicitly designated non-production data.
- environment is explicit in logs/metrics/deployment metadata.

---

## 9. Hosting / Compute Requirements

### MyeongHa Web/API

Required:

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

Required:

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

Current Saju `Dockerfile` uses `node:24-bookworm-slim`, runs as `node`, exposes `3000`, and starts `dist/production-calculation-server.js`.

Current container CI verifies:

- exact SHA-tagged image build
- non-root `node`
- `/healthz`
- unauthenticated/wrong-token reject
- active-token acceptance to request-validation boundary
- service credential non-reflection in response/logs

Current process configuration also supports an optional previous service bearer for rotation. Production rotation itself remains unverified until Phase 3.

Provider selection must compare container support, secret management, health checks, restart, rollback, region, logs/metrics, scaling, cold start, and cost before activation.

---

## 10. Network / Service Connectivity

### MyeongHa → Saju

- server-owned HTTPS origin only
- exact origin, no embedded credentials/path/query/fragment
- Bearer credential injected server-side only
- client cannot choose upstream origin or credential
- redirect must not silently forward credentials
- bounded timeout
- failure classified as dependency failure, not whole-product failure

Current required MyeongHa env names:

```text
MYEONGHA_SAJU_SERVICE_ORIGIN
MYEONGHA_SAJU_SERVICE_BEARER
```

### MyeongHa → PostgreSQL

Current runtime baseline:

- `pg.Pool`
- max connections per runtime: `4`
- connection timeout: `5s`
- idle timeout: `10s`
- governed TLS configuration
- login principal / execution-role preflight

The per-runtime pool limit is not a DB-wide capacity guarantee. Total connections depend on serverless concurrency and provider-side limits/pooling.

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
- browser/client exposure: forbidden for server secret
- logs/traces/metrics labels: forbidden
- error response reflection: forbidden
- CI echo: forbidden
- environment isolation: required
- explicit owner: required
- rotation/revocation path: required
- active/previous overlap only when protocol supports it

Saju producer-side rotation contract supports current + optional previous bearer. Zero-downtime rotation is accepted only after verifying:

```text
new active succeeds
old previous succeeds during overlap
MyeongHa binds new active
new path succeeds
old credential removed
old credential is rejected
```

No credential rotation is considered complete merely because a new secret was stored in a provider dashboard.

---

## 12. Deployment / Promotion Architecture

Provider-neutral target flow:

```text
commit
→ required CI
→ immutable artifact/image
→ deploy candidate
→ configuration preflight
→ provider health
→ application/capability readiness
→ negative auth smoke
→ positive synthetic smoke
→ dependency verification
→ compatibility verification
→ production promotion/alias
→ post-promotion observation
```

Current MyeongHa reality:

```text
main push/merge
→ Vercel production deployment
```

Current MyeongHa `main` is unprotected. v1 operations must close this governance gap before claiming controlled promotion.

Before Saju production activation, Saju source/artifact promotion must also gain an explicit gate because Saju `main` is currently unprotected.

Target invariants:

- every production deployment resolves to exact Git SHA.
- Saju image resolves to exact OCI digest plus source SHA.
- stale concurrent deployments do not silently supersede a newer approved artifact.
- required production config is validated without printing secret values.
- provider `READY` is not product readiness.
- rollback candidate is identified before risky promotion.
- source/ref governance prevents accidental unreviewed promotion, or an equivalent immutable manual promotion gate exists.
- MyeongHa↔Saju compatibility is verified before or immediately after promotion with bounded synthetic data.

Canary/blue-green/Kubernetes are not v1 requirements.

---

## 13. Artifact / Version / Provenance

Required metadata:

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

MyeongHa may use provider deployment identity + Git SHA.
Saju must use OCI digest + source SHA; mutable `latest` alone is not production provenance.

Cross-service compatibility evidence is separate from provenance. Two exact SHAs can still be incompatible.

---

## 14. Liveness / Readiness / Dependency Health

**Liveness**: runtime can execute a minimal local request path.  
**Readiness**: service can safely accept its assigned traffic class.  
**Dependency health**: independently measured Auth/DB/Saju/provider state.  
**Capability readiness**: a specific product capability has required config/dependencies and can execute safely.  
**Degraded**: one capability/dependency is unavailable while unaffected surfaces remain serviceable.

### MyeongHa

Current `/api/health` is liveness only.

Target:

- keep cheap public liveness with no secret/data detail.
- do not turn every optional dependency failure into whole-product unready.
- DB/Auth failure can make user-data capability unready.
- Saju failure marks Saju capability degraded while core remains live.
- missing required Saju config must be detected during deployment/capability preflight rather than discovered only by user traffic.
- readiness/capability state must be measurable independently from Vercel deployment state.

Public health responses must not expose credentials, DB hostname, bearer state, stack, or user data.

### Saju

`/healthz` semantics:

- liveness: HTTP loop responsive.
- calculation readiness: runtime initialized and able to execute a bounded deterministic non-sensitive self-check or equivalent initialization proof.
- provider probe must not execute privacy-sensitive real-user calculation.

---

## 15. Structured Logging Contract

Common target fields:

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

`traceId` is a target field, not a current tracing claim.

Never log in standard operational telemetry:

```text
Authorization header
Bearer token
session token
cookie value
database password
service-role/secret API key
raw payment credential
raw receipt payload
raw Birth payload
full chat transcript
private conversation body
unbounded user-entered text
```

Use stable bounded error codes and normalized metadata. Optional internal IDs must be pseudonymous and operationally necessary.

Raw prompt/response debug capture, if ever required by another authority, is not standard logging and requires separate access/retention approval.

Retention and sampling remain `OPEN DECISION` until tool selection and traffic baseline.

---

## 16. Metrics / SLI Architecture

Golden signals:

```text
latency
traffic
errors
saturation
```

### MyeongHa API

- request count by normalized route/method/status class
- 2xx/4xx/5xx
- p50/p95/p99 duration
- DB query/transaction latency
- DB connection acquisition failures/timeouts
- auth verification latency/failure
- dependency latency/error/timeout
- serverless/cold-start signal when available

### Saju

- calculation request count
- p50/p95/p99
- auth reject count
- calculation error/timeout count
- process restart count
- CPU/memory
- concurrency

### Dependencies

Separate dimensions for PostgreSQL, Supabase Auth, Saju, payment, AI, notification.

Metric labels must be bounded and never contain user IDs, raw URLs with secrets, Birth values, or user text.

---

## 17. SLO Catalog

No availability/latency/error-rate number is authoritative until product criticality and baseline are approved.

| SLO | SLI | window | target | source | user impact |
|---|---|---|---|---|---|
| Core API availability | eligible core requests completing without service failure | `TBD` | `TBD-BY-MEASUREMENT` | API metrics | login/profile/core use |
| Core API error rate | eligible core requests ending 5xx / eligible core requests | `TBD` | `TBD-BY-MEASUREMENT` | API metrics | failed core operations |
| Core API latency | route-normalized p95 | `TBD` | `TBD-BY-MEASUREMENT` | API metrics | responsiveness |
| Saju capability availability | eligible Saju requests completing without dependency/internal failure | `TBD` | `TBD-BY-MEASUREMENT` | MyeongHa + Saju metrics | new calculation |
| Saju latency | end-to-end calculation p95 | `TBD` | `TBD-BY-MEASUREMENT` | metrics/trace | wait time |
| DB dependency success | DB operations without timeout/connection failure | `TBD` | `TBD-BY-MEASUREMENT` | DB/app metrics | persistent paths |

Current 5s Saju adapter timeout is an implementation boundary, not an SLO.

---

## 18. Monitoring / Dashboard

Minimum views:

1. Core service — traffic, 5xx, latency, deployment SHA.
2. Dependencies — DB/Auth/Saju/provider latency/errors/timeouts.
3. Saju — request rate, rejects, latency, CPU/memory, restarts.
4. DB — connection acquisition, query latency, provider capacity signals.
5. Deployment comparison — before/after by SHA.
6. Background processing — only when workers exist; backlog/age/retry.
7. Capability readiness — config/dependency state without secret disclosure.

A dashboard is not alerting.

---

## 19. Alert Severity / Paging

```text
P0
→ data corruption/loss risk, credential compromise, irreversible payment/data risk, broad catastrophic outage

P1
→ core product unavailable or major critical capability unavailable

P2
→ bounded degradation with limited blast radius/workaround

P3
→ anomaly requiring investigation but no immediate critical impact
```

Initial alert candidates:

- sustained core 5xx regression
- DB unavailable / connection exhaustion
- Saju unavailable or timeout spike
- production verification failure
- repeated process restart
- backup failure once monitoring exists
- outbox/worker backlog when activated
- payment webhook failures when activated

Thresholds and windows remain `TBD-BY-MEASUREMENT`. Single isolated warnings should not page by default.

---

## 20. Dependency Failure Matrix

| Failure | Detection | User impact | Blast radius | Automatic recovery | Manual action | Data risk | Expected state |
|---|---|---|---|---|---|---|---|
| MyeongHa API unavailable | synthetic/API metrics | API unavailable | static web may remain | provider restart/redeploy | rollback/investigate | low unless in-flight write | API unavailable |
| Saju unavailable | timeout/health/5xx | new calculation unavailable | Saju only | service restart if supported | rollback/provider action | low if no partial commit | core available |
| Saju timeout | latency/timeout | bounded Saju error | request/capability | timeout releases caller | inspect capacity/provider | low | core available |
| DB unavailable | DB connection errors | user-data paths fail | broad API | provider recovery | incident/restore | potentially high | static/non-DB only |
| DB slow | latency/acquire signal | slow/timeouts | DB routes | bounded by configured limits when implemented | query/capacity analysis | low-medium | degraded core |
| Supabase Auth unavailable | verifier/provider errors | member auth fails | protected routes | provider recovery | provider incident | low | public/static remain |
| credential mismatch | 401/auth metric | affected S2S capability fails | dependency only | overlap only if protocol supports | rotate/bind | low | bounded outage |
| bad deployment | smoke/regression | varies | deployment unit | promotion stop/rollback | rollback/roll-forward | migration-dependent | previous healthy version |
| partial deployment | provenance/compatibility failure | inconsistent behavior | involved services | stop promotion | align versions | medium | fail closed |
| DNS/TLS failure | network classification | affected dependency fails | dependency | provider recovery | network action | low | bounded degradation |
| AI/provider timeout | dependency metrics | generated feature degraded | AI surface | bounded timeout | approved provider action | low | non-AI core remains |
| logging provider unavailable | export health | observability reduced | operations | buffer if supported | restore export | no correctness impact | product continues |
| metrics provider unavailable | export health | detection reduced | operations | retry/export recovery | restore metrics | no correctness impact | product continues |
| worker crash | heartbeat/backlog | async delay | worker feature | restart | inspect poison item | event-semantic dependent | sync core remains |
| cache failure | cache errors | slower responses | cached surfaces | bypass | restore/invalidate | correctness must remain | uncached operation |

---

## 21. Failure Isolation Invariants

```text
Saju down
→ new Saju calculation unavailable
→ existing persisted Reading retrieval remains possible when DB healthy
→ Character surfaces not requiring a new Saju call may remain available
→ login/home/core API do not fail solely because Saju is down

DB down
→ DB-dependent requests fail bounded
→ connection storm is limited
→ static assets remain available

Auth down
→ protected member paths fail closed
→ no client-supplied subject fallback

observability down
→ product correctness unchanged

cache down/corrupt
→ correctness preserved
→ uncertain private cached data is bypassed/invalidated
```

---

## 22. Timeout / Retry / Circuit Policy

Every dependency defines connect/request timeout, retryability, count, backoff/jitter, and optional circuit behavior before activation.

| dependency | current evidence | timeout authority | retry authority | circuit authority |
|---|---|---|---|---|
| Saju | HTTP adapter default 5s; adapter accepts integer up to 30s; production composition currently uses default | bounded; final value validated by baseline | no automatic application retry until safety/load behavior is proven | only if repeated failure creates measured pressure |
| PostgreSQL | pool connect timeout 5s; max 4/runtime | query/transaction timeout still `TBD` | transaction/write retry belongs to platform semantics | bounded connection/backpressure first |
| Supabase Auth | verifier exists | `TBD-BY-IMPLEMENTATION` | auth rejection non-retryable; transient retry only by explicit policy | `TBD` |
| AI | activation-dependent | REQUIRED before activation | side-effect retry requires idempotency | measured decision |
| payment | activation-dependent | REQUIRED before activation | never retry command blindly | provider/idempotency contract |
| notification | activation-dependent | REQUIRED before activation | async retry governed by delivery/outbox semantics | worker/backoff after activation |

Rules:

- no unbounded network wait.
- no automatic write retry without platform idempotency authority.
- auth/authz failure is non-retryable.
- schema/contract 4xx is non-retryable.
- retry must not amplify outage load.
- timeout is not SLO.

---

## 23. Rollback / Roll-forward Strategy

### Application deployment

```text
detect
→ contain / stop further promotion
→ identify exact previous healthy artifact
→ rollback or roll-forward
→ verify health + auth + dependency + cache/privacy contracts
```

### Saju regression

- previous OCI digest remains identifiable.
- rollback only Saju unit when contract remains compatible.
- MyeongHa rollback is not required unless compatibility demands it.

### DB migration regression

Application rollback must not assume schema rollback is safe. DB authority classifies migrations as backward-compatible, forward-only, or coordinated-recovery.

Roll-forward is preferred when data/schema state makes code rollback unsafe.

---

## 24. Backup / Restore

Current evidence:

```text
Supabase project healthy
backup schedule = UNKNOWN
retention = UNKNOWN
PITR = UNKNOWN
restore procedure = UNVERIFIED
restore drill = NOT EVIDENCED
```

Requirements:

- authoritative PostgreSQL data has provider-supported backup.
- backup schedule and retention are explicitly recorded.
- backup failure/status is observable.
- restore is tested, not assumed.
- restore drill uses isolated target where feasible.
- restore credentials/procedure do not exist only on one operator machine.
- repository reconstructability is not a substitute for database backup.

### Privacy / deletion / legal-retention restore invariant

Backup retention and restore do not override product privacy/deletion/legal-retention authority.

The DB authority explicitly separates personalization erase from legally retained commerce history. Therefore a restore runbook must include reconciliation before restored data can serve production traffic.

At minimum:

```text
restore isolated copy
→ identify backup point/time
→ reconcile account-deletion state and deletion jobs/tombstones as defined by data authority
→ preserve legally retained commerce data only under its governing policy
→ prevent resurrected personalization/share/device/notification access where deletion should remain effective
→ verify authorization/integrity
→ promote recovered state
```

Operations owns execution/recovery mechanics; privacy/legal/product authority owns what must remain deleted or retained.

---

## 25. RPO / RTO

Definitions:

- **RPO**: maximum acceptable persistent-data loss window.
- **RTO**: maximum acceptable service-recovery duration after a qualifying failure.

Current numeric authority:

```text
RPO = OPEN DECISION
RTO = OPEN DECISION
```

Decision direction is **product requirement → infrastructure validation**, not provider capability → product requirement.

Correct sequence:

```text
1. classify data/service criticality and acceptable business impact
2. approve provisional RPO/RTO objectives
3. compare provider backup/PITR/restore capability against those objectives
4. change plan/provider/design if capability cannot meet the objectives, or explicitly accept a documented gap
5. run restore drill
6. measure achieved recovery and verify whether the approved objectives are met
```

A restore drill proves achievable recovery; it does not define what loss/downtime the product should accept.

Until objectives and achieved evidence are both present, no `DR Ready` claim is allowed.

---

## 26. Incident Recovery

General flow:

```text
detect
→ classify service/dependency
→ contain blast radius
→ preserve evidence
→ rollback/restore/recover
→ verify exact production state
→ root cause / preventive action
```

Credential compromise:

```text
revoke/rotate
→ bind active credential
→ verify new succeeds
→ verify old fails
→ review exposure evidence
```

Data corruption:

```text
stop destructive writers when needed
→ identify corruption boundary
→ select repair/restore under DB authority
→ perform privacy/deletion/legal-retention reconciliation
→ verify consistency/authorization
→ reopen traffic
```

---

## 27. Cache / CDN Classification

| data class | policy |
|---|---|
| hashed static immutable asset | aggressive CDN cache allowed |
| public versioned content | shared cache allowed with versioned key; TTL `TBD` |
| shared dynamic public content | only after freshness/correctness review |
| user-private API | `no-store` by default; any private-cache exception requires explicit contract |
| auth/session/security-sensitive | `no-store` |
| current-subject Saju calculation | `no-store` |
| mutation/write result | `no-store` unless explicit safe contract |

Cross-user invariant:

- shared cache never serves user-private content across subjects.
- where correctness is uncertain, disable shared cache.

Cache outage affects performance, not correctness.

---

## 28. Performance Budget

No fabricated p95 target is authoritative in v1.

Required baseline:

```text
web TTFB/load
API p50/p95/p99
cold-start contribution
DB connection acquisition
DB query/transaction latency
Auth verification latency
MyeongHa→Saju network latency
Saju calculation latency
```

Values remain `TBD-BY-MEASUREMENT`.

Priority:

1. correctness/resource leak
2. pathological saturation
3. user-visible p95 regression
4. cost efficiency
5. micro-optimization

Supabase advisor warnings are investigation inputs, not automatic schema changes.

---

## 29. Load / Capacity Model

No destructive load test runs against production user data.

| scenario | RPS | concurrency | duration | dataset | expected result |
|---|---:|---:|---:|---|---|
| single-user baseline | `TBD` | 1 | 5m initial | synthetic | measure stable baseline |
| normal concurrency | `TBD` | `TBD` | 15m initial | synthetic/non-prod | bounded latency/errors |
| burst | derived; 10x only if safe | `TBD` | 1–5m | synthetic/non-prod | no resource collapse |
| dependency latency | `TBD` | `TBD` | 5m | injected | bounded by implemented timeout |
| DB saturation | `TBD` | `TBD` | controlled | isolated DB | connection budget respected |
| Saju saturation | `TBD` | `TBD` | controlled | deterministic fixtures | CPU/memory ceiling measured |
| rate-limit boundary | `TBD` | `TBD` | controlled | synthetic | intended limit behavior only |

A scenario requiring a timeout that is still `TBD` is BLOCKED until that timeout contract is implemented; the test must not pretend the control exists.

`10x` is a resilience scenario, not a capacity claim.

---

## 30. Scaling Strategy

### MyeongHa API

Provider-managed serverless horizontal scaling.

Risk: every runtime can own a DB pool, so total DB connections can rise with runtime concurrency.

Application scaling must observe DB capacity before concurrency is increased.

### Saju

Horizontal scale only when measured concurrency/CPU/memory/latency justify it.

### PostgreSQL

Order:

1. query/index/workload correction under DB authority
2. connection pooling/limits
3. provider resource scaling
4. architectural expansion only when measured workload requires it

Numeric triggers remain `TBD-BY-MEASUREMENT`.

Kubernetes is not a v1 requirement.

---

## 31. Resource / Cost Boundary

Track:

```text
web/serverless compute
Saju container compute
DB compute/storage
network/egress
logs
metrics/traces
backup storage
AI/provider API
notification/provider
```

Controls:

- bounded metric cardinality.
- no log bodies.
- sample low-value success logs if volume requires.
- minimum container resources only as reliability requires.
- retain only operationally necessary telemetry.
- scaling decisions include latency/error and cost evidence.

Target is minimum viable reliability, not enterprise-infrastructure imitation.

---

## 32. Security / Privacy Observability Boundary

Applies to:

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

Forbidden raw values:

- auth/session/service tokens
- DB credentials
- Birth raw data
- private chat/transcript
- payment secrets/receipts
- unrestricted user input

Trace/span attributes use normalized routes, not full URLs with identifiers/query strings.

Request/trace IDs are operational identifiers, never authentication evidence.

---

## 33. Production Verification Contract

Provider `READY` alone does not accept a deployment.

Minimum verification:

```text
1. expected source SHA / image digest
2. provider deployment state
3. configuration preflight without secret-value output
4. liveness
5. readiness/capability readiness for assigned traffic
6. negative auth smoke
7. positive authenticated synthetic smoke
8. required dependency check
9. MyeongHa↔Saju compatibility/contract check when relevant
10. user-private no-store/cache contract
11. secret non-reflection
12. log presence/redaction
13. metrics presence
14. rollback candidate identification
```

Positive smoke requirements:

- use dedicated synthetic smoke identity/data.
- do not use another user's production record.
- do not create real payment side effects.
- do not print credentials or raw private payloads.
- clean up synthetic mutable state where required by product semantics.

Existing exact-head/production smoke mechanisms should be extended rather than duplicated.

---

## 34. Failure / Chaos Test Matrix

| test | injected condition | required result |
|---|---|---|
| Saju kill | stop process | new calculation bounded-fails; core stays available |
| Saju slow | latency > caller timeout | timeout; no hanging resource |
| Saju wrong credential | mismatch bearer | explicit reject; no reflection |
| credential rotation | current+previous overlap then remove previous | transition succeeds; old eventually rejected |
| missing Saju config | omit required origin/bearer in candidate | candidate/capability preflight fails before user promotion |
| DB unavailable | block DB | DB routes bounded-fail; static remains |
| DB slow | inject latency | bounded by implemented timeout; otherwise test reports missing control, not PASS |
| DB connection exhaustion | cap connections | bounded failures; saturation observable |
| Auth unavailable | fail verifier | protected routes fail closed |
| bad deployment | unhealthy candidate | promotion stops or exact rollback executes |
| incompatible service versions | contract mismatch | promotion blocked/fail closed |
| DNS/TLS failure | break resolution/TLS | classified network dependency failure |
| cache unavailable | disable cache | correctness maintained |
| cache poison | wrong/shared private entry | no cross-subject private response |
| telemetry outage | disable export | correctness unaffected; observability degradation visible when feasible |

Default target is controlled non-production runtime. Production failure injection requires separate explicit safety approval.

---

## 35. Required Runbooks

1. bad MyeongHa deployment rollback
2. bad Saju deployment rollback
3. Saju outage/degradation
4. DB unavailable / connection exhaustion
5. DB backup restore + privacy/deletion/legal-retention reconciliation
6. credential leak / rotation
7. provider outage classification
8. production smoke failure
9. cache corruption/invalidation when shared cache exists
10. worker poison/backlog recovery when worker exists

Each runbook names observable evidence, containment action, rollback/recovery verification, stop condition, and authority boundary.

---

## 36. Open Decisions

### P0

#### P0-OPS-01 — Saju production activation

- choose/confirm hosting target
- provision HTTPS origin
- deploy exact OCI digest
- bind production bearer
- bind `MYEONGHA_SAJU_SERVICE_ORIGIN`
- verify active/previous rotation behavior
- authenticated positive/negative synthetic E2E
- runtime monitoring
- rollback evidence
- compatibility gate

#### P0-OPS-02 — PostgreSQL backup / restore / RPO / RTO

- classify product/data criticality
- approve provisional RPO/RTO objectives
- confirm Supabase plan backup/PITR capability
- record backup schedule/retention
- reconcile retention with privacy/deletion/legal-retention authority
- define restore target/procedure
- execute restore drill
- measure achieved RPO/RTO against objectives

#### P0-OPS-03 — readiness / configuration preflight

- preserve `/api/health` as liveness or rename semantics explicitly
- define capability readiness/degraded telemetry
- detect missing required production configuration before user traffic
- ensure Saju failure does not mark whole MyeongHa down

### P1

#### P1-DEP-01 — MyeongHa controlled production promotion

- MyeongHa `main` protection currently disabled
- choose branch/ruleset or equivalent immutable promotion gate
- define required checks/stale-deployment handling

#### P1-DEP-02 — Saju source/artifact promotion governance

- Saju `main` protection currently disabled
- before production activation, require branch/ruleset or equivalent exact-SHA/digest manual promotion gate
- production deployment authority must not be mutable `latest` or an unreviewed moving ref

Additional P1:

- observability provider/tool selection
- structured logger implementation
- trace propagation
- SLI/SLO targets after baseline
- alert thresholds/destinations
- performance/load environment
- cache enforcement tests
- capacity/scaling thresholds

### UNKNOWN / NEEDS OWNER OR PROVIDER EVIDENCE

- Supabase backup/PITR plan settings
- production DB provider-side pool/connection ceiling
- final custom domain
- final Saju hosting target
- logs/metrics retention
- approved numeric RPO/RTO

---

## 37. Acceptance Criteria

Architecture stage closes only when:

- [x] current topology is evidence-based.
- [x] service deployment units are classified.
- [x] environment isolation is defined and preview/test production-DB use is forbidden.
- [x] secret classes/non-exposure/rotation rules are defined.
- [x] deployment/provenance/rollback requirements are defined.
- [x] liveness/readiness/capability-degraded semantics are defined.
- [x] configuration preflight is part of promotion architecture.
- [x] structured logging/privacy contract is defined.
- [x] metrics/monitoring target set is defined.
- [x] SLI/SLO structure exists without fabricated targets.
- [x] alert severity model is defined.
- [x] dependency failure matrix is defined.
- [x] failure isolation invariants are defined.
- [x] timeout/retry boundaries do not redefine platform idempotency.
- [x] backup/restore requirements are defined.
- [x] restore privacy/deletion/legal-retention reconciliation is defined.
- [x] RPO/RTO direction is product requirement → provider validation.
- [x] RPO/RTO numeric values remain unresolved until approved.
- [x] cacheability classification is defined.
- [x] performance baseline plan exists.
- [x] load/capacity matrix exists.
- [x] scaling trigger method is defined.
- [x] production synthetic smoke privacy rules are defined.
- [x] cross-service compatibility gate is explicit.
- [x] Saju activation path is explicit.
- [x] both MyeongHa and Saju source-governance risks are explicit.
- [x] unresolved P0/P1 items are explicit.
- [x] second self-review complete.

Passing architecture does not mean infrastructure implementation is complete.

---

## 38. Implementation Phases

### Phase 1 — topology / service catalog authority

- freeze reviewed document
- refresh evidence snapshot as implementation proceeds

### Phase 2 — Saju production hosting

- provider comparison against Section 9
- close exact-SHA/digest promotion governance
- deploy exact OCI artifact
- HTTPS + liveness/readiness

### Phase 3 — secret / environment binding

- production origin/bearer
- current/previous rotation test
- secret reflection negative test
- preview/test isolation validation

### Phase 4 — deployment / health / rollback

- controlled promotion gate
- configuration preflight
- capability readiness/degraded model
- exact artifact verification
- synthetic production smoke
- MyeongHa↔Saju compatibility gate
- rollback runbook

### Phase 5 — structured logging

- common schema
- redaction tests

### Phase 6 — metrics / monitoring / alerting

- golden signals
- dependency/capability metrics
- alert severity/destination

### Phase 7 — failure isolation / timeout / retry

- bounded dependency failures
- missing-control tests fail rather than fake PASS
- chaos matrix execution

### Phase 8 — backup / restore / recovery

- approve provisional RPO/RTO from product criticality
- provider backup/PITR evidence
- retention/privacy/legal reconciliation design
- isolated restore drill
- measure achieved recovery

### Phase 9 — cache / CDN

- endpoint classification
- no-store regression tests

### Phase 10 — performance baseline

- collect p50/p95/p99 + dependency latency
- identify hot DB/Saju paths

### Phase 11 — load / capacity

- controlled non-production tests
- DB/Saju saturation ceilings

### Phase 12 — scaling thresholds

- convert measured ceilings into explicit triggers

### Phase 13 — production operations acceptance

Only verified capabilities may be marked production-ready.

---

## 39. First Self-Review Record

First review found and corrected:

| ID | finding | correction |
|---|---|---|
| SR-01 | stale Saju baseline | refreshed SHA |
| SR-02 | MyeongHa branch protection omission | added controlled-promotion risk |
| SR-03 | implicit error-rate SLO | added explicit row |
| SR-04 | dependency retry policy incomplete | expanded dependency table |
| SR-05 | 5s timeout could be misread as SLO | marked implementation boundary |
| SR-06 | latest container contract needed recheck | rechecked Dockerfile/workflow |
| SR-07 | fabricated RPO/RTO risk | kept numeric values unresolved |
| SR-08 | platform/payment boundary risk | preserved semantic authority |
| SR-09 | whole-product readiness risk | separated Saju degradation |
| SR-10 | telemetry privacy risk | bounded/redacted schema |

First-review verdict was PASS for architecture structure, with implementation P0 open.

---

## 40. Second Self-Review Record

Second review deliberately challenged the first PASS against current repositories and uploaded authority documents.

### Findings and corrections

| ID | finding | severity | correction | result |
|---|---|---|---|---|
| SR2-01 | Saju `main` moved again after first review. | evidence freshness | baseline refreshed to `2f92f59c3f27c471127bfe3dad8260b192bc8c31`; one-commit delta verified test-only. | PASS |
| SR2-02 | RPO/RTO wording incorrectly risked deriving business objectives from provider capability/restore drill. | architecture correctness | reversed direction to product-impact objective first, infrastructure capability/drill second. | PASS |
| SR2-03 | restore design did not explicitly reconcile personalization deletion with legal commerce retention. | P0 data/privacy recovery | added restore reconciliation invariant/runbook requirement. | PASS |
| SR2-04 | only MyeongHa unprotected `main` was recorded; Saju `main` is also unprotected. | P1 supply-chain | added `P1-DEP-02` and Phase 2 promotion-governance gate. | PASS |
| SR2-05 | preview wording allowed interpretation that production DB might be used by default exception. | privacy/environment | prohibited production DB credentials/user rows in preview/test; production diagnostics separated. | PASS |
| SR2-06 | current missing Saju config failure was classified only as runtime readiness gap. | P0 deployment safety | added required configuration preflight before user promotion and chaos case. | PASS |
| SR2-07 | exact SHA provenance alone did not guarantee MyeongHa↔Saju compatibility. | P1 deploy safety | added cross-service compatibility gate to promotion/verification. | PASS |
| SR2-08 | positive production smoke lacked explicit data/privacy/side-effect constraints. | privacy/operations | required dedicated synthetic identity/data and no real payment/user side effects. | PASS |
| SR2-09 | DB slow chaos expected a timeout even though query timeout policy is still TBD. | verification honesty | test now fails/reports missing control until timeout is actually implemented. | PASS |
| SR2-10 | Saju credential overlap was described without explicitly separating code support from production proof. | evidence precision | code support recorded; production rotation remains Phase 3 unverified requirement. | PASS |

### Second Self-Review Verdict

```text
Authority conflict: NONE FOUND
Provider-specific overfit: NONE BLOCKING
Platform Integrity boundary violation: NONE FOUND
Payment semantic boundary violation: NONE FOUND
RPO/RTO direction error: CORRECTED
Restore privacy/legal-retention gap: CORRECTED
Source-governance omission: CORRECTED
Configuration-preflight gap: CORRECTED
Compatibility-verification gap: CORRECTED
Fabricated SLO/capacity/RPO/RTO authority: NONE
Unresolved production operations P0: YES — explicitly recorded
Second architecture self-review: PASS
Implementation readiness: NOT YET COMPLETE
```

This PASS means the architecture is internally coherent enough to proceed to implementation decisions. It does not assert production reliability.

---

## Appendix A. Current Operational Risk Register

| ID | risk | severity | current state | closure evidence |
|---|---|---|---|---|
| P0-OPS-01 | Saju route not production-activated | P0 | BLOCKED | host + exact digest + env binding + rotation + synthetic E2E + compatibility + monitoring + rollback |
| P0-OPS-02 | DB backup/restore/RPO/RTO not proven | P0 | UNKNOWN/BLOCKED | objectives + provider capability + retention reconciliation + isolated restore drill + measured recovery |
| P0-OPS-03 | liveness/readiness/capability/config-preflight distinction not implemented | P0 | PARTIAL | explicit implementation + dependency metrics + promotion smoke |
| P1-DEP-01 | MyeongHa `main` unprotected while deploying to production | P1 | CONFIRMED | branch/ruleset or equivalent controlled promotion gate |
| P1-DEP-02 | Saju `main` unprotected before production artifact activation | P1 | CONFIRMED | branch/ruleset or exact-SHA/digest promotion authority |

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

Current statement is limited to:

> MyeongHa has a production-connected application runtime, exact deployment provenance and partial reliability controls. Saju production activation, controlled source/artifact promotion, capability readiness, observability, backup/restore, measured capacity and recovery validation remain incomplete.
