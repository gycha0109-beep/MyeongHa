# Production Operations — 구현 목적·실제 엔드포인트·종료 기준 및 현황 보고서

> 기준일: 2026-10-30 KST (관측 시점별 스냅샷이며 지속적인 정상 상태 보증이 아님)
>
> 트랙: `ops` / 저장소: `gycha0109-beep/MyeongHa`
>
> 기준 소스: 병합된 `main` `a3a78bdf6df0824aed018e37cb70c0c1690d5b94` (PR [#2770](https://github.com/gycha0109-beep/MyeongHa/pull/2770))
>
> 최종 판정: **코드·배포·익명 운영 점검 일부 확인 / 전체 Production Operations ACCEPTANCE = 미완료**. `dr_ready=false`, `serviceResumptionAllowed=false` 상태를 변경하지 않음.

## 2026-10-30 16:52 KST 추가 검증 — 최신 Cloudflare 배포의 실제 양성·음성 E2E PASS

**이 절은 아래 §3.2와 §5의 구버전/미수용 항목 중 같은 엔드포인트·같은 조건을 대상으로 한 과거 상태보다 최신 증거**이다. 현재 운영 준비 전체가 완료되었다는 뜻이 아니라 **배포된 정확한 버전에 연결한 검증 부분집합**의 최신 관측이다.

- **고정 소스:** 병합된 `main` `c49d9815f0ddce16afd086528529ddac2674e149` — [CI #41020132039](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41020132039) SUCCESS, [Governance #41020132023](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41020132023) SUCCESS.
- **공급자 배포:** Worker `myeongha`, deployment `b09a6c35-43db-463b-9d9e-254e467fd869`, 2026-10-30T07:27:43.958354Z, exact version **`f549bc9f-eb92-4f7d-a65c-c71a4b4568f0`** 100%. Linked Workers Build `5a8676b5-5b61-4ef6-b765-200fcf598ebb`, outcome SUCCESS, pushed `main` source SHA exactly matching the above.
- **양성 로그인/DB/Saju:** [governed Production workflow #41022084481](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41022084481), completed SUCCESS, 2026-10-30T07:46:25Z. Workflow input was the independently read exact version `f549bc9f-...` (version header enforced before Member credential use). The sanitized actual verifier result is `mode=authenticated`, `result=PASS`, **18 checks**. Positive: Member sign-in `200`, authoritative current-subject DB read `200`, Birth Profile revision `200`, calculation-only Saju `200`. Negative: anonymous Member/Saju/preview `401`, cross-origin sign-in `403`, guarded Chat HOLD `503`, plus health/readiness/security fencing. No real payment, interpretation or chat output was requested. This proves successful live **calculation-only** integration at this version; not all Saju interpretation contracts or infrastructure capacity.
- **같은 배포 버전의 익명 ingress:** [governed Production workflow #41022755702](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41022755702), completed SUCCESS, 2026-10-30T07:52:40Z. Sanitized actual `mode=operations`, `result=PASS`, header `observedWorkerVersion=f549bc9f-eb92-4f7d-a65c-c71a4b4568f0`, **11 checks**: static root/hall `200`, health `200`, POST health `405`, configuration readiness `200`, anonymous Member/Saju/preview `401`, cross-origin sign-in `403`, unknown API `404`, operations admission `PASS`; applicable API no-store, security headers and non-reflection gates enforced.
- **한정된 실제 메트릭:** Cloudflare GraphQL Workers adaptive dataset, script `myeongha`, exact version `f549bc9f-...`, window `2026-10-30T07:27:43Z..07:54:00Z` returned `sum.requests=108`, `sum.errors=0`, `sum.subrequests=89`. Aggregated provider sample; 0 errors in this bounded query **does not prove** zero user-visible 4xx/5xx, DB/Saju latency, capacity threshold or SLO compliance.
- **롤백 후보 인벤토리(실행하지 않음):** 직전 Worker deployment `66739717-fe96-4103-9b25-6d63f2b007bf` at `2026-10-30T07:22:50Z`, version `9c79b61f-69b5-42e5-a5fa-a46257fafa03` previously 100%, build `e433919f-5f6e-4ba0-8aef-848f1e57d15d` SUCCESS from `main` `80268c01913d33bf6a68f1d230a7f4766aeca4e3`. **되돌릴 후보의 식별만 완료**, 그 버전의 종속성·스키마 호환성 및 실제 복귀 drill은 미실증이며 즉시 롤백을 승인하는 근거가 아님.

**이번 실제로 진전된 §33 범위:** ① 주 Worker 소스/버전 연결, ② 배포 상태, ④ live liveness, ⑤ *설정 기반* readiness, ⑥ 익명 음성 인증, ⑦ 합성/전용 Member를 이용한 양성 로그인·DB·Saju 계산, ⑧ 위 경로에서의 실제 의존성 호출, ⑨ *계산-only* Saju 연동, ⑩ API 응답 캐시 헤더, ⑪ 해당 응답에서의 제한된 비밀 반사 음성검증, ⑬ Worker 집계 메트릭, ⑭ 기술적 롤백 후보 **식별**의 각 범위. ③ 전체 구성 preflight/비밀 회전, ⑤의 지속적인 의존성 readiness, ⑨의 전체 Saju 계약, ⑩의 모든 실제 개인 데이터 응답, ⑪의 모든 본문/로그, ⑫ 로그 실측·redaction, ⑬ 종단간 지표·경보, ⑭ 복귀 drill, Phase 7 장애 주입, Phase 10–12 용량 실측, Phase 8 **DR/Hosted Auth-Storage 전체 복구**는 별도 증거가 필요하다. 전체 `Production Operations ACCEPTANCE`는 **미완료**, `dr_ready=false`, `serviceResumptionAllowed=false` 유지.

재검증/승격 규칙: 배포 버전이 바뀌면 해당 새 버전의 워크플로 결과 없이 기존 실측을 자동 승격하지 않는다. Auth/DB/Saju 건강이 영구히 보장되는 것이 아니며, 결과는 각 실행 시각의 관찰이다. 아래 최초 2026-10-30 기준 스냅샷의 과거 RED/미확인은 지우지 않고 이 최신 추가 기록으로 시간 범위를 명확히 한다.

## 1. 트랙의 구현 목적과 최종 엔드포인트(종료 상태)

**목적:** 명하의 실제 운영 경로가 어떤 소스·설정·의존성으로 서비스되는지 추적하고, 배포·비밀 관리·관측·장애 격리·캐시 보호·성능/용량·백업/복구를 **검증 가능한 증거**로 관리하여 문제가 생겼을 때 안전하게 중단·복원할 수 있도록 하는 것. 기능·사주 해석 결과의 품질 개선 트랙이나 다른 서비스의 임의 기능 구현 트랙이 아님.

**목표 토폴로지(공개 진입점):**

~~~text
클라이언트
  → https://myeongha.gycha0109.workers.dev
  → Cloudflare primary Worker "myeongha" (정적 웹 + API)
      ├─ Auth / current-subject / PostgreSQL (승인된 Hyperdrive·Supabase 경계)
      └─ Saju 계산 서비스 (별도 Cloud Run, 서비스 간 계약·인증 필요)
별도 통제 경계: GitHub main/CI/배포, Production 비밀, 백업·Hosted Auth/Storage 복구
~~~

현재 기본 웹/API 진입점은 Cloudflare Worker임. 예전 문서에 남아 있는 **Vercel primary**, **Saju 미배포**, **main 미보호** 등의 과거 진술은 이 보고서의 현재 배포·검증 근거로 사용하지 않음. Saju Cloud Run 및 Production 연결은 [P0-OPS-01 #388](https://github.com/gycha0109-beep/MyeongHa/issues/388)의 기존 이력을 따르되, 별도 Cloud Run 내부 URL/인증 값은 이 보고서에 출력하지 않고 **최신 버전과의 실호출 검증도 별도로 요구**함.

**최종 종료 조건:** [운영 아키텍처 §33의 14개 Production 검증 조건](../architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md)을 **해당 시점의 배포 버전과 연결된 증거로 확인**하고, §38의 Phase 1–13 잔여 실측·안전 복구 항목을 충족하거나 명확한 독립 차단 상태로 인계하는 것. PR 녹색, Cloudflare 배포 성공, `/api/readiness` 200, 진단 도구 구현은 각각 **전체 운영 수용 판정과 다름**. Hosted 서비스 복구의 차단 조건을 생략한 채 `production-ready`로 전환하지 않음.

## 2. 실제 HTTP/API 엔드포인트와 검증 경계

**고정 공개 Origin:** `https://myeongha.gycha0109.workers.dev`. 아래 표의 경로는 이 Origin에 붙는 경로. Cloudflare의 명시적 라우팅 근거는 [`workers/cloudflare-api-router.mjs`](../../workers/cloudflare-api-router.mjs)와 [`cloudflare/myeongha-worker.mjs`](../../cloudflare/myeongha-worker.mjs)임. 라우트 등록과 **실제 Production 정상 응답 검증을 구분**함.

| 엔드포인트 | 역할 / 안전 경계 | 확인된 동작·현재 한계 |
| --- | --- | --- |
| `GET /` 및 `GET /hall.html` | 정적 웹 진입 및 홀 UI | 이전 Worker 버전에서 각각 HTTP 200 실측 |
| `GET /api/health` | 공개 liveness, 민감정보 없는 `{"status":"ok"}` | 이전 Worker 버전에서 200, `no-store`·보안 헤더 검사 PASS. `POST`는 405 + `Allow: GET` |
| `GET /api/readiness` | 기능별 **설정 기반** readiness/상태 | 이전 버전에서 200 실측. DB 쿼리·Auth·Saju 네트워크 가용성을 증명하지 않음 |
| `GET /api/me` | 인증된 Member/Guest의 현재 주체·DB 경계 | 익명 요청 401 실측. 실제 Member DB 조회 200은 이번 운영 점검의 범위 밖 |
| `GET /api/me/birth-profile` | 인증된 주체의 출생정보 revision 조회 | 라우터 등록; 최신 Worker에서 성공적인 인증 조회 증거는 미확인 |
| `POST /api/me/saju/calculation` | 인증된 현재 출생 revision 기반 **계산만** | 익명 요청 401 실측. 최신 Worker에서 인증된 계산 및 Saju 종단 간 계약 미확인 |
| `POST /api/me/saju/preview-reading` | Saju 미리보기 동적 경로 | 익명 요청 401 실측. `/api/me` 디스패처로 매핑되는 rewrite; 인증된 해석 호출은 본 운영 점검에서 수행하지 않음 |
| `POST /api/auth/sign-in` | Member 로그인 / 보호된 세션 | 다른 Origin의 의도적 잘못된 로그인 403 실측. 실제 자격증명 로그인은 별도 governed 워크플로만 |
| `/api/auth/sign-up`, `/api/auth/sign-out`, `/api/auth/refresh` | 회원가입·로그아웃·갱신 | 직접 라우트 등록. 이 보고서는 각각의 실서비스 성공을 주장하지 않음 |
| `/api/session/bootstrap`, `/api/birth-profiles` | 세션 초기화·출생 프로필 관련 진입 | 직접 라우트 등록. 쓰기·민감 데이터 취급은 인증 경계를 따라 별도 검증 |
| `/api/chat`, `/api/chat/:threadId/turns` | 캐릭터 대화/턴 전송 | `/api/me` rewrite 경계. 익명 운영-readiness 점검은 해당 기능을 건드리지 않으며 별도 Chat admission·보안 트랙 소관 |
| `/api/life-record`, `/api/readings`, `/api/memories` | 개인 기록·리딩·메모리 | `/api/me` rewrite, 개인 데이터 `no-store` 경계. 이번 실서비스 기능 검증 대상은 아님 |
| `/api/__myeongha_e2e_unknown` | 존재하지 않는 API 거부 확인용 **테스트 경로** | 이전 버전에서 404 확인. 사용자 기능 엔드포인트가 아님 |

**보안/캐시 정책:** 동적 API의 성공·거부·실패 응답은 `no-store`여야 하며 민감정보를 반사하지 않아야 함. 정적 자산의 별도 CDN 캐시 정책과 혼동하지 않음. 관련: [Phase 9](API_CACHE_ISOLATION_PHASE9_20261030.md).

**실서비스 점검 호출 주체:** [`scripts/verify-cloudflare-primary-e2e.mjs`](../../scripts/verify-cloudflare-primary-e2e.mjs)의 `operations` 모드는 자격증명/DB 쓰기 없이 health, config-only readiness, 익명 인증 차단, 응답 헤더, Worker 버전 일치만 검사. [`.github/workflows/cloudflare-primary-e2e.yml`](../../.github/workflows/cloudflare-primary-e2e.yml)에서 사용. `authenticated` 모드는 [`.github/workflows/cloudflare-primary-e2e-member.yml`](../../.github/workflows/cloudflare-primary-e2e-member.yml)의 `main` 전용 수동 `workflow_dispatch`이며 Production 비밀과 **독립 확인한 정확한 Worker 버전**을 요구함. 임의 재호출·실제 결제·실제 사용자 기록 사용 금지.

## 3. 확인된 배포·CI·운영 실증 (시간/버전 분리)

### 3.1 병합된 `main` 기준 CI

| 증거 | 상태 | 링크 |
| --- | --- | --- |
| main CI | SUCCESS | [#41017690638](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017690638) |
| main Governance | SUCCESS | [#41017690547](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017690547) |
| main Web Browser Smoke | SUCCESS | [#41017690496](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017690496) |
| main Supabase Production 워크플로 | SUCCESS | [#41017690459](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017690459) |
| Supabase Production의 `deploy-migrations` 작업 | **SKIPPED**, 즉 SQL 배포 성공 증거 아님 | [동일 실행](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017690459) |
| main Cloudflare 익명 live E2E | SUCCESS, **아래 구버전 관측** | [#41017690560](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017690560) |

통합 PR [#2770](https://github.com/gycha0109-beep/MyeongHa/pull/2770)은 병합됨. [성공한 정식 통합 실행 #41016949355](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41016949355)과, 제출 라벨 이벤트가 아닌 시점에 시작되어 admission 실패한 [이전 실행 #41016926064](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41016926064)는 구분함. 과거 RED는 코드 회귀를 입증하지 않음.

### 3.2 **같은 소스 SHA라도 E2E와 배포 버전은 별개**

1. PR live 익명 운영 E2E [#41016924078](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41016924078), 2026-10-30T06:55:26Z: `PASS` / Worker version `cc165497-6906-4c36-96c1-9819f287e37d`. 총 11개 결과: 웹 `200/200`, health `200`, 잘못된 health method `405`, readiness `200`, 익명 Member/Saju/preview `401/401/401`, cross-origin 로그인 `403`, 미등록 API `404`, 최종 admission `PASS`.
2. 병합된 main E2E [#41017690560](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017690560), 2026-10-30T07:03:16Z: 동일한 **이전 Worker version `cc165497-...`** 관측 및 `PASS`.
3. **그 이후의** Cloudflare Worker deployment `6c5fcebc-156a-4d1a-8af4-f2b510bf0773`, 2026-10-30T07:04:14Z: **version `9710d396-e68b-4019-98fa-4d29e291c786` 100%**. Workers Build `ecd56497-1f48-4553-81e9-57cb2f39c0b3` outcome `success`; 소스는 병합된 `main` `a3a78bdf6df0824aed018e37cb70c0c1690d5b94`.
4. 이 시점의 익명 live E2E는 **당시 병합 후 Worker 배포 완료보다 먼저 실행**되었음. 이후 **더 최신 main `c49d9815...`/Worker `f549bc9f-...`에서 실제 양성 E2E #41022084481과 익명 E2E #41022755702 모두 PASS**했으며, 보고서 상단 추가 검증을 현재 근거로 사용함. 이후 또다시 버전이 바뀌면 신규 검증이 필요함.

Cloudflare Provider observability 설정은 `enabled=true`, `logs.enabled=true`, `invocation_logs=false`로 읽혔음. 과거 버전 `cc165497-...`에 대해 읽은 bounded analytics 구간(2026-10-30T06:40:35Z–06:57:00Z)은 Worker 요청 11, 오류 0, subrequest 3. **작은 적응형 표본·Worker 단위 메트릭**이지 라우트별 p95, DB/Saju 경로 지연, 실제 용량, 로그 redaction 실증, 경보 전달 또는 승인된 SLO가 아님.

## 4. Phase 1–13 구현 현황 — 코드 구현과 수용 검증 분리

| 단계 | 실제 확보한 구현/증거 | 종료에 남은 것 |
| --- | --- | --- |
| **1. 토폴로지/서비스 목록** | 운영 아키텍처와 Cloudflare primary source·build 추적 | 새로운 배포/설정 변화 때 증거 최신화 |
| **2. Saju Production 호스팅** | Cloud Run 운영·Production 연동 기존 이력 [#388](https://github.com/gycha0109-beep/MyeongHa/issues/388) | **최신 Worker 버전** 기준 실 Saju 계산·계약/버전 검증 |
| **3. 비밀/환경** | Worker 환경/비밀 경계, auth 경계 테스트, `main` 및 Production 환경 정책 문서 | 비밀 로테이션·음성/양성·격리의 실제 시점별 검증을 누락 없이 수용 |
| **4. 배포/Health/롤백** | GitHub main 배포 근거, Cloudflare 100% 버전, 이전 버전 health/readiness 실측 | 새 배포 정확 버전의 live smoke, 의존성 readiness, 실제 rollback 후보/전환 근거 |
| **5. 구조화 로그** | 관련 로깅/비식별화 코드와 Cloudflare 로그 활성화 설정 | 해당 배포 버전의 실제 샘플 존재·redaction 검증 |
| **6. 메트릭/경보** | Cloudflare Worker bounded analytics 조회, 보안 경보 설정·테스트 이력 | 의존성별 golden signal, 생산 로그 연동, 실제 장애/알림 전달 및 보존 근거 |
| **7. 장애 격리/시간 제한** | 기존 예외·차단 경계 및 테스트 | DB/Saju/인증 실패 주입의 실제 제한·복원 실증 |
| **8. 백업/복구** | 암호화된 실제 DB 백업 [#40812111605](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40812111605), 격리 PG17 복원 [#40817391430](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40817391430) 성공 | **Hosted Auth/Storage, 개인정보 연속성, 스키마 동등성, 전체 서비스 RPO/RTO 미증명 — DR 차단** |
| **9. 캐시/CDN** | 동적 API 경로별 `no-store` 코드·회귀 검증, 이전 버전 live 헤더 검사 | 새 버전의 동일 정책 유지 근거 및 외부 CDN 계약 분리 |
| **10. 지연시간 기준선** | [루프백 p50/p95/p99 수집기](API_PERFORMANCE_BASELINE_PHASE10_20261030.md) | 실제 Auth/DB/Saju·제품 경로의 대표 지연 실측 및 병목 파악 |
| **11. 부하/용량** | [20–500 요청 1–8 동시성 수집기 + 5/15분 envelope](API_CONTROLLED_CAPACITY_PHASE11_20261030.md) | 격리된 실제 환경에서 지속 실측·DB/Saju 포화 한계 측정 |
| **12. 확장 임계치** | [측정 실패 경계 기반 진단 분석기](OBSERVED_SCALING_REVIEW_PHASE12_20261030.md) | DB pool/CPU·메모리·실제 서비스 수치를 사용한 수용 가능한 기준, 자동 확장 주장 금지 |
| **13. 최종 운영 수용** | 정확한 main SHA 증거 수집기, Cloudflare live 익명 E2E·Provider 버전 증거 | §33 14개 요건을 현재 배포 버전 기준으로 연결하고 미검증 항목 별도 처리 |

**Phase 8 상세 차단 근거:** [PostgreSQL DR 상태](POSTGRES_DR_READINESS_STATUS_V1.md) 및 [Hosted Auth/Storage gap matrix](HOSTED_AUTH_STORAGE_DR_GAP_MATRIX_V1.md). 당시 Production 원격 migration `20261029012948` vs 저장소 `20261029012000`, 원격 전용 `20261008090417` 등 [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)의 불일치 미해결. 최신 실제 격리 복원은 성공했지만 일부 Provider 원본 행/관계가 빠져 **전체 Hosted 복구 동등성 아님**. 로컬 합성 Auth/Storage·JWT 폐기 테스트 PASS는 Production 연속성 증거로 승격하지 않음. 승인 RPO `PT24H` / RTO `PT6H` 충족도 미입증. `dr_ready=false`, `future_safe_privacy_reconciliation=false`, `serviceResumptionAllowed=false` 유지.

## 5. §33 Production 최소 14항목 수용 판정 — 현 시점

| ID | 확인 대상 | 판정 / 한계 |
| --- | --- | --- |
| 1 | 기대 소스 SHA·OCI digest | **부분 실증:** 최신 Worker Build의 GitHub main SHA 확인. Saju exact OCI/digest 수용은 별도 |
| 2 | Provider 배포 상태 | **관측:** 최신 Worker 100% 트래픽 및 성공 빌드. Saju/DB 전체 readiness와는 별개 |
| 3 | 비밀 비노출 구성 사전점검 | **미수용:** 전체 live preflight 증거 묶음 미확인 |
| 4 | Liveness | **현 배포 `f549bc9f-...` 실서비스 Health 200 PASS** ([#41022755702](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41022755702)) |
| 5 | Readiness·capability | **현 버전 config-only 200 PASS**, 양성 DB/Saju 호출 실측 PASS; **전 의존성·장애시 readiness는 미수용** |
| 6 | 음성 인증 smoke | **현 버전 익명 Member/Saju/preview 401 PASS**, cross-origin 403 PASS |
| 7 | 양성 인증 synthetic smoke | **현 버전 양성 실서비스 PASS:** Member 로그인·주체 귀속 DB·Birth Revision·Saju 계산-only 각 200 ([#41022084481](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41022084481)); 다른 기능 포함 전체 수용은 별도 |
| 8 | 필수 의존성 점검 | **부분 실증:** 현 버전 Member/Auth/DB/Saju 실제 정상 경로 200; 장애 시 지연·timeout·DB pool 가용성 미수용 |
| 9 | MyeongHa↔Saju 호환성 | **계산-only 실서비스 통합 PASS**; 전체 해석 계약·배포 간 호환성·장애 조건은 별도 수용 |
| 10 | 사용자 비공개 캐시 | **현 버전 익명·양성 검증 API no-store 헤더 검사 PASS**; 모든 개인 데이터 경로와 외부 CDN 계약은 별도 |
| 11 | 비밀 반사 금지 | **일부 실증:** 현 버전 익명·양성 검증 응답의 비밀/헤더 경계 검사 PASS. 전체 로그·본문·크로스서비스 검증 미수용 |
| 12 | 로그 존재·redaction | **설정 확인**. 실제 배포 샘플 및 redaction 증거 미수용 |
| 13 | 메트릭 존재 | **현 버전 Cloudflare Worker 집계 관측** (지정 구간 108건/Worker 오류 0건); 의존성 지표·운영 SLO는 미수용 |
| 14 | 롤백 후보 확인 | **이전 버전 후보 식별** (`9c79b61f-...`, 기존 main `80268c01...`); 호환성 검증 및 실제 롤백 drill 미수용 |

이 표는 별도 실증 결과를 수작업으로 구분한 **상태 보고**이며 `scripts/operations/inspect-main-operations-acceptance.mjs`가 자동으로 전 항목을 PASS 판정한 결과가 아님. 그 스크립트는 read-only GitHub workflow 증거만 수집하고 `acceptanceDecision=NOT_EVALUATED_BY_COLLECTOR`를 반환함.

## 6. 실제 종료까지의 실행 순서와 금지 사항

1. **새 배포의 익명 수용 (현 `f549bc9f-...` 버전 PASS):** Cloudflare에서 실제 100% 버전 재확인 → 같은 버전의 `/`, `/hall.html`, `/api/health`, `/api/readiness`, `/api/me`, `/api/me/saju/calculation`, `/api/me/saju/preview-reading`, `/api/auth/sign-in`를 기존 익명 운영 E2E로 검증 → 워크플로 URL·시각·버전 기록. 버전이 바뀌면 결과도 갱신.
2. **양성 의존성 수용 (현 `f549bc9f-...`의 Member/DB/Saju 계산-only PASS):** 이미 존재하는 governed `cloudflare-primary-e2e-member.yml` 사용. 별도 확인한 현재 Worker 버전 및 Production 합성/전용 Member 비밀의 범위 내에서 로그인, 주체 귀속 DB, Birth revision, 계산-only Saju 경로 검증. 비밀 값을 보고서/로그에 출력하지 않음.
3. **운영 장애·관측 수용:** 실제 버전 로그/redaction·의존성 메트릭·알림·롤백 근거를 확보. 안전한 **비운영** 환경에서 DB/Saju timeout/장애, 5/15분 실측, 부하·용량 및 확장 기준을 검증. 테스트 도구의 존재만으로 실측 완료 처리 금지.
4. **DR 통합 수용:** 실제 백업과 migration/DDL/ACL 동등성, 지속적인 독립 개인정보 삭제/철회 기록, Hosted Auth/Storage 복원, 전체 서비스 복구 및 RPO/RTO 확인. 관련 권한·안전 조건이 충족되기 전에는 서비스 재개 게이트를 열지 않음.
5. **종료 결정:** 위 증거를 §33 항목별 PASS/NOT_OBSERVED/BLOCKED로 묶어 최종 판정. **전부 충족하지 못했다면 전체 Production 운영 준비 완료를 선언하지 않고 차단 항목을 명시한 채 종료 가능 범위만 종료**. 임의 추가 기능/별도 승인자·외부업체 문의/근거 없는 완료율을 만들지 않음.

## 7. 실무상 바로 재사용할 파일/검증 진입점

| 구분 | 파일 또는 실행 지점 |
| --- | --- |
| 최상위 실행·수용 원칙 | [`docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md`](../architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md) (§33, §38) |
| Cloudflare 라우트 인벤토리 | [`workers/cloudflare-api-router.mjs`](../../workers/cloudflare-api-router.mjs) |
| 실제 익명 검증기·워크플로 | [`scripts/verify-cloudflare-primary-e2e.mjs`](../../scripts/verify-cloudflare-primary-e2e.mjs), [`cloudflare-primary-e2e.yml`](../../.github/workflows/cloudflare-primary-e2e.yml) |
| 실제 양성 Member/Saju 검증 | [`cloudflare-primary-e2e-member.yml`](../../.github/workflows/cloudflare-primary-e2e-member.yml) |
| main 소스별 read-only 검증 증거 | `node scripts/operations/inspect-main-operations-acceptance.mjs --sha <40자리-main-SHA>` |
| Saju/DB/복구 책임 경계 | [`POSTGRES_DR_READINESS_STATUS_V1.md`](POSTGRES_DR_READINESS_STATUS_V1.md), [`HOSTED_AUTH_STORAGE_DR_GAP_MATRIX_V1.md`](HOSTED_AUTH_STORAGE_DR_GAP_MATRIX_V1.md) |
| Phase 9–12 근거 | [캐시](API_CACHE_ISOLATION_PHASE9_20261030.md), [지연](API_PERFORMANCE_BASELINE_PHASE10_20261030.md), [부하](API_CONTROLLED_CAPACITY_PHASE11_20261030.md), [확장](OBSERVED_SCALING_REVIEW_PHASE12_20261030.md) |
| Phase 13 구체적 운영 evidence | [`MAIN_OPERATIONS_ACCEPTANCE_PHASE13_20261030.md`](MAIN_OPERATIONS_ACCEPTANCE_PHASE13_20261030.md) 및 [PR #2770 실측 댓글](https://github.com/gycha0109-beep/MyeongHa/pull/2770) |

**최신 실측 증거:** 이 보고서 상단의 2026-10-30 16:52 KST 추가 검증이 아래 초기 §3.2/§5 스냅샷보다 최신입니다.

**보고서 자체의 한계:** 이 파일을 병합하는 것은 **현황과 종료 조건의 권위 있는 스냅샷 기록**이지 Phase 1–13 수용의 완료 또는 새로운 Production 배포에 대한 자동 보증이 아님. 병합 후 main SHA나 Worker 버전이 바뀌면 재확인해야 함.

Watchtower-Track: ops
