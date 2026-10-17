# 사주 브릿지 V2 — 추가 DB 계정 없는 기존 명하 권한 재사용 구조 (2026-10-16)

Watchtower-Track: saju-bridge

> **Owner 변경 지시:** 사주 연동을 위해 새로운 계정/역할을 만들지 않는다. 기존 명하 회원 Auth, 제한 로그인 `myeongha_runtime`, 기존 NOLOGIN 실행 역할 `myeongha_api_executor`, 기존 Subject/Birth 조회 권한과 사주 HTTPS 어댑터만 사용한다. **실제 Production DB DDL/GRANT/Secret 변경은 별도 승인 전 금지.** 본 변경은 소스·테스트·문서만 수정하며 기능 공개나 기존 고격리 실행 허가는 아니다.

## 1. 무엇을 제거했는가 (활성 설계의 의존성 기준)

이전 `SINGLE_PROJECT_V1` / S3A는 **운영용 일회성 테스트 Permit**을 DB에 저장·소비하기 위해 다음 항목을 별도로 설치하려 했다.

- 두 NOLOGIN DB 역할 `myeongha_saju_bridge_permit_owner`, `myeongha_saju_bridge_permit_executor`
- 비공개 `saju_bridge_private` 스키마, `operator_permits_v1` / `audit_events_v1` 테이블, `cmd_consume_operator_permit_v1` 함수

이들은 **일반 회원의 사주 계산 및 Preview Reading에 필요한 기능이 아니다.** PostgreSQL 17 관리형 `postgres`의 자동 ADMIN 멤버십 문제로 S3A가 막혔다고 해서 회원 대상 사주 연동도 필수적으로 막혔다고 주장하지 않는다.

**V2 결정:** 이 Permit 서브시스템을 실제 사주 연동의 선행조건에서 **완전히 제외**한다. 새 역할/테이블/스키마/키/로그인을 만들지 않는다. 옛 미적용 SQL `supabase/proposals/1730_saju_bridge_single_project_operator_permit_v1.sql`은 기존 해시와 감사 기록을 보존할 **역사적 중단 초안**으로만 남긴다. 이를 수정·자동배포·실행하거나 DB 역할 조건을 낮추지 않는다. 기존 `saju-single-project-operator-permit-v1.ts`는 **미연결 레거시 코드**이며 신규 V2에서 import/consume/발급하지 않는다.

## 2. 실제 V2 흐름

```text
회원 앱 → 기존 명하 API (회원 JWT 검증)
             ↓
      기존 myeongha_runtime DB 로그인
             ↓  한 트랜잭션의 SET LOCAL ROLE myeongha_api_executor
      기존 Subject 현재 회원 소유권 확인
             ↓
      기존 Birth current self revision 확인
             ↓  DB 트랜잭션 종료 후 외부 네트워크
      기존 서버 전용 사주 HTTPS/Bearer 연결
             ↓
      기존 calculation_only / preview-reading 결과 처리
```

- 계산: `/api/me/saju/calculation` — **기존 공개 API 파일이 이미 존재**하며 새 DB 역할을 사용하지 않는다. 계산 자료는 원래 계약에 따라 해석/출시 허가가 아니다.
- 미리보기: `/api/me/saju/preview-reading` — 기존 검증된 HTTP 핸들러가 있다. **2026-10-17 현재 `vercel.json`의 rewrite → `api/me.ts` 디스패처 → 기존 Preview Runtime 연결이 `main`에 존재한다.** 독립 `api/me/saju/preview-reading.ts` 파일은 없다. 라우팅 코드 존재는 실제 Saju 서비스 배포, 운영 환경변수 검증, 공개 출시·유료 Reading 승인을 증명하지 않는다. 이 작업은 기존 라우트를 새로 만들거나 활성화하지 않는다.
- DB 세션: `createProductionPostgresSubjectPoolLeaseV1`를 **공유**해 별도 DB 로그인이나 전용 connection pool 자격증명을 요구하지 않는다. `production-current-subject-saju-calculation-runtime.ts`에 기존 pool 주입 기능을 추가했고, 기존 preview runtime의 pool 주입을 그대로 재사용한다.
- 신규 구성: `apps/api/src/saju-bridge-existing-authorities-v2.ts`. 정확한 두 기존 경로 외에는 404로 거부한다. 기존 검증 로직(인증, Birth 소유권, SHA/응답 검증, TLS, 기존 트랜잭션, 실패 시 차단)을 중복 구현하거나 우회하지 않는다.
- 권한 상향 및 발급: permit DB 호출, Owner 허가증 발행, S3A DDL/GRANT, migration push, `SET ROLE postgres`, 신규 로그인 생성 **모두 없음**.

## 3. 실제로 아직 필요한 것

이 변경으로 **S3A 설치 문제를 회원 사주 연결의 필수 게이트에서 없앴다.** 그러나 이것을 곧바로 전체 사주 서비스 출시 완료로 해석하지 않는다.

1. 기존 `myeongha_api_executor` 및 Subject/Birth 조회 함수·권한의 **현재 운영 DB 배치 여부**를 read-only로 확인한다. 이미 역할이 존재한다는 사실만으로 모든 소스 함수가 배치됐다고 단정하지 않는다.
2. 실제 사주 엔진의 서버-side HTTPS Origin/Bearer/Proof/제품 해석 Authority는 별도 실행 검증 대상이며, 이번 PR은 원격 연결·Secret 발급을 하지 않는다.
3. 미리보기 rewrite/디스패처가 소스에 이미 연결돼 있지만, **실제 외부 배포 및 실행 가능 여부는 미검증**이다. 서비스 설정 변경·결과 저장/Reading entitlement·유료 판매·추가 공개 활성화는 기존 제품 출시/정산/민감정보 검수와 별도 Owner 승인 필요.
4. 기존 고격리 3DB·R01–R14·독립 Root/Attestor/2D-4는 **단일 프로젝트 V2로 대체 달성했다고 주장하지 않음**. 필요 시 독립 운영 트랙에서 그대로 HOLD.

## 4. 구현/검증 및 금지 경계

- [새 V2 통합 모듈](../apps/api/src/saju-bridge-existing-authorities-v2.ts) — 공유 제한 DB 풀, 기존 두 핸들러만 라우팅, 미승인 경로·쿼리 차단.
- [무계정/무승인 부정 테스트](../test/saju-bridge-existing-authorities-v2.test.ts) — 정확한 역할/계정 재사용, 익명 요청 401(DB 및 사주 호출 전 거부), 권한 위조/permit 경로 404, 본문 권한 위조 400, HTTP POST-only, 풀 종료.
- 기존 `test/current-subject-saju-calculation-http.test.ts`, `test/current-subject-saju-preview-reading-http.test.ts`, `test/api-me-saju-calculation-runtime.test.ts`, `test/api-me-runtime.test.ts`가 회원 소유권·Birth revision·원격 호출 순서·기존 rewrite 디스패처 계약을 검증한다.
- `test/saju-bridge-existing-authorities-v2-synthetic-e2e.test.ts`의 추가 성공/부정 검증은 **실제 Saju upstream 배포 없이** source admission/lifecycle/version이 유효한 Preview 200 응답만 반환하고 attestation 누락 또는 envelope 불일치 시 503으로 차단함을 확인한다. 이는 운영 R01–R14 또는 Production 활성화 증빙이 아니다.
- 동일 합성 E2E의 계산 경로는 source-owned 계산 HTTP V1 200 payload를 실제 기존 ingress로 통과시키며, `calculation_only`/`interpretationAuthorized=false`/현재 Birth Revision 결속·민감 출생값의 응답 비노출을 검증한다. 변경된 Birth input 또는 스키마 버전의 upstream 200 응답은 503으로 fail closed한다. 계산 결과가 Product Reading 또는 판매·배포 권한을 얻는 것은 아니다.
- **전송 실패/재호출 경계:** 동일 V2 합성 E2E에서 두 경로 모두 인증 후 Saju 네트워크 거절 및 429·503 응답을 503으로 fail closed하고, 원격 Bearer·출생값·원격 오류 본문을 반환하지 않으며 **단일 API 요청 내 자동 재전송은 0회**임을 검증한다. `retryable: true`는 자동 재실행 또는 중복 요청 방지 약속이 아니다. **별도 클라이언트 재전송·병렬 중복 호출의 전역 멱등성은 아직 제공·증명되지 않았으며**, 저장·유료 Reading/Entitlement를 여는 근거로 사용할 수 없다.
- **V2 구성 종료 수명주기:** `createSajuBridgeExistingAuthoritiesV2`는 `close()`가 시작되면 새 요청을 503으로 거부하고, 이미 수락한 계산·미리보기 요청이 종료될 때까지 공유 DB 풀 종료를 늦춘다. 종료 호출은 하나의 Promise로 결속하고 upstream 지연/완료 순서를 기존 합성 E2E에서 검증한다. 이는 서버리스 외부 배포 설정이나 프로세스 강제 종료 신호를 제어하는 기능이 아니며, 전역 요청 중복 차단 또는 Production 출시 권한을 의미하지 않는다.
- [V2 소스 연결 검사 및 과거/현재 운영 증빙 경계](./SAJU_BRIDGE_V2_CONNECTION_EVIDENCE_GAP_20261017.md) — 기존 엔트리포인트, rewrite, Auth/Birth 제한 역할, HTTPS Origin/Bearer 연결을 **리포지토리 소스만으로** 검사하고 변조·누락 시 차단한다. 2026-09-16 성공한 운영 계산 검증은 당시 SHA의 계산 전용 범위로 제한하며 최신 Preview/Guest 검증까지 성공했다고 소급하지 않는다. 현재 Vercel 바인딩·Cloud Run serving SHA·DB 함수 배치·Preview 실환경 연동은 별도 승인된 읽기 전용 검증 전까지 NOT_VERIFIED.
- **운영 DB 변경/문의/기능 플래그/출시/유료 인프라 없음.** 신규 테이블이 없으므로 기존 Reading 원장이나 `1540` 미적용 nonce migration을 성공했다고 가장하지 않는다.

```text
BRIDGE_PRODUCT_INTEGRATION_PROFILE=EXISTING_AUTHORITIES_V2
NEW_DB_ACCOUNTS_REQUIRED=false
NEW_DB_SCHEMAS_REQUIRED=false
LEGACY_S3A_OPERATOR_PERMIT=RETIRED_FROM_PRODUCT_CRITICAL_PATH
LEGACY_S3A_APPLICATION=HOLD
PRODUCTION_DB_CHANGE=NOT_AUTHORIZED
EXTERNAL_PREVIEW_ROUTE=REWRITE_REGISTERED_RELEASE_NOT_VERIFIED
stagingAdmission=HOLD
operationalEvidence=NOT_VERIFIED
R01-R14=NOT_VERIFIED
canRunOnce=false
canExecute=false
canPublish=false
canSell=false
```
