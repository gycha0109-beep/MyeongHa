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
- 미리보기: `/api/me/saju/preview-reading` — 기존 검증된 HTTP **소스 핸들러**가 있다. 새 V2 내부 조합에서는 사용할 수 있지만 **실제 외부 API 라우트 파일은 아직 없고 이번에 생성하지 않는다.** 비밀/등록 기능을 공개 API로 추가하는 행위는 별도 출시·배포 검수 후 진행한다.
- DB 세션: `createProductionPostgresSubjectPoolLeaseV1`를 **공유**해 별도 DB 로그인이나 전용 connection pool 자격증명을 요구하지 않는다. `production-current-subject-saju-calculation-runtime.ts`에 기존 pool 주입 기능을 추가했고, 기존 preview runtime의 pool 주입을 그대로 재사용한다.
- 신규 구성: `apps/api/src/saju-bridge-existing-authorities-v2.ts`. 정확한 두 기존 경로 외에는 404로 거부한다. 기존 검증 로직(인증, Birth 소유권, SHA/응답 검증, TLS, 기존 트랜잭션, 실패 시 차단)을 중복 구현하거나 우회하지 않는다.
- 권한 상향 및 발급: permit DB 호출, Owner 허가증 발행, S3A DDL/GRANT, migration push, `SET ROLE postgres`, 신규 로그인 생성 **모두 없음**.

## 3. 실제로 아직 필요한 것

이 변경으로 **S3A 설치 문제를 회원 사주 연결의 필수 게이트에서 없앴다.** 그러나 이것을 곧바로 전체 사주 서비스 출시 완료로 해석하지 않는다.

1. 기존 `myeongha_api_executor` 및 Subject/Birth 조회 함수·권한의 **현재 운영 DB 배치 여부**를 read-only로 확인한다. 이미 역할이 존재한다는 사실만으로 모든 소스 함수가 배치됐다고 단정하지 않는다.
2. 실제 사주 엔진의 서버-side HTTPS Origin/Bearer/Proof/제품 해석 Authority는 별도 실행 검증 대상이며, 이번 PR은 원격 연결·Secret 발급을 하지 않는다.
3. 미리보기 HTTP 엔트리포인트를 실제 활성화하거나 결과 저장/Reading entitlement·유료 판매를 열려면 기존 제품 출시/정산/민감정보 검수와 별도 Owner 승인 필요.
4. 기존 고격리 3DB·R01–R14·독립 Root/Attestor/2D-4는 **단일 프로젝트 V2로 대체 달성했다고 주장하지 않음**. 필요 시 독립 운영 트랙에서 그대로 HOLD.

## 4. 구현/검증 및 금지 경계

- [새 V2 통합 모듈](../apps/api/src/saju-bridge-existing-authorities-v2.ts) — 공유 제한 DB 풀, 기존 두 핸들러만 라우팅, 미승인 경로·쿼리 차단.
- [무계정/무승인 부정 테스트](../test/saju-bridge-existing-authorities-v2.test.ts) — 정확한 역할/계정 재사용, 익명 요청 401(DB 및 사주 호출 전 거부), 권한 위조/permit 경로 404, 본문 권한 위조 400, HTTP POST-only, 풀 종료.
- 기존 `test/current-subject-saju-calculation-http.test.ts`, `test/current-subject-saju-preview-reading-http.test.ts`, `test/api-me-saju-calculation-runtime.test.ts`가 실제 회원 소유권·Birth revision·원격 호출 순서·route 계약을 독립 검증한다.
- **운영 DB 변경/문의/기능 플래그/출시/유료 인프라 없음.** 신규 테이블이 없으므로 기존 Reading 원장이나 `1540` 미적용 nonce migration을 성공했다고 가장하지 않는다.

```text
BRIDGE_PRODUCT_INTEGRATION_PROFILE=EXISTING_AUTHORITIES_V2
NEW_DB_ACCOUNTS_REQUIRED=false
NEW_DB_SCHEMAS_REQUIRED=false
LEGACY_S3A_OPERATOR_PERMIT=RETIRED_FROM_PRODUCT_CRITICAL_PATH
LEGACY_S3A_APPLICATION=HOLD
PRODUCTION_DB_CHANGE=NOT_AUTHORIZED
EXTERNAL_PREVIEW_ROUTE=NOT_MOUNTED
stagingAdmission=HOLD
operationalEvidence=NOT_VERIFIED
R01-R14=NOT_VERIFIED
canRunOnce=false
canExecute=false
canPublish=false
canSell=false
```
