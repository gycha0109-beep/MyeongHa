# 사주 브릿지 — 기존 명하 Supabase 단일 프로젝트 통합 설계 v1 (2026-10-15)

Watchtower-Track: saju-bridge

> **2026-10-16 운영 상태 우선:** S1·S2 소스/폐기형 검증은 완료됐으나 **S3A 비활성 DB 객체 적용은 `BLOCKED/HOLD`**이다. PostgreSQL 17의 운영 `postgres`는 비슈퍼유저 `CREATEROLE`이며 새 역할 생성 시 자동 bootstrap ADMIN 멤버십이 생겨, 승인된 `1730` SQL의 zero-membership 최종 검사를 통과할 수 없다. 실제 단일 트랜잭션 [#38846217625](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38846217625)은 ROLLBACK되고 대상 스키마·역할·테이블·함수 0건이었다. [#2156](https://github.com/gycha0109-beep/MyeongHa/pull/2156) 병합 / [고정 통합 CI #38847796203](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38847796203) SUCCESS로 **객체 생성 전 거부**를 검증했다. 현행 계정으로 실행/재시도하지 않으며, 승인된 SQL·SHA256·Git blob·zero-membership postcheck를 변경하거나 보안을 완화하지 않는다. 재개에는 공급자가 지원하는 안전한 권한 경로의 검증 또는 새로운 역할 권한 계약에 대한 **별도 명시적 Owner 승인**이 필요하다. [S3A 운영 런북](./SAJU_BRIDGE_S3A_GUARDED_MANUAL_APPLY_RUNBOOK_20261016.md)과 [이슈 #1871](https://github.com/gycha0109-beep/MyeongHa/issues/1871)이 실행 게이트의 최신 근거다.

> **설계 판단: `SINGLE_PROJECT_DESIGN_READY / OWNER_RISK_ACCEPTANCE_PENDING`.** 별도 배포 트랙, Neon, 신규 Supabase 프로젝트, 새 서버/백업 서버를 만들지 않고 **기존 명하 Supabase Production 프로젝트 내부**에 사주 브릿지의 필요한 DB 기록과 최소권한 경계를 구성하는 **대안 운영 모델**이다. 이 문서는 **설계 및 읽기 전용 현황 조사 결과**이다. 운영 DDL/GRANT/Secret/사용자 데이터/배포·판매 설정을 변경하거나 Owner의 실제 적용·잔여 위험 승인을 대신하지 않는다.
>
> **중요한 보안 계약의 차이:** 이 설계는 기존 [SO-4 격리 3DB 토폴로지](./SAJU_SO4_SUPABASE_ISOLATION_P0.md)의 물리적 3클러스터/독립 Root/Attestor 요건을 **충족하지 않는다**. 세 스키마를 만들어 세 서버라고 부르지 않는다. 기존 R01–R14와 Target Authority V2/2D-4의 보안 지표를 거짓으로 `VERIFIED`로 바꾸지 않으며, 새 **단일 프로젝트 운영 프로파일**에서 달라진 잔여 위험을 Owner가 별도로 채택해야 한다. 기존 고격리 스테이징 프로파일은 사용자가 선택하지 않는 한 그대로 HOLD한다.

## 1. 읽기 전용 실측 근거와 재사용 판단

기준 프로젝트: Supabase `MyengHa`, ref `cnsfpcdiyofqvhpcegfc`, Singapore, PostgreSQL 17, ACTIVE_HEALTHY. 2026-10-15에 연결된 명하 Supabase 계정의 `list_projects`/`list_organizations` 및 이 프로젝트 PostgreSQL **SELECT 전용 metadata**로 확인. 조직은 Free이고 기존 다른 목적의 `Refund_management`를 포함해 활성 프로젝트 2개다.

| 실측·소스 | 현재 | 설계상 처리 |
|---|---|---|
| Auth | 기존 Supabase Auth (`auth` schema) 있음 | 별도 Auth 신설 없이 **기존 회원 세션을 검증**. 요청 본문의 사용자 ID는 불신 |
| 회원 소유권 | `public.subjects(id, kind, auth_user_id, status, ...)` | Member identity 검증 후 현재 Subject를 서버에서 해결; Guest/merge/타인 거부 |
| 출생 근거 | `public.birth_profiles(id, subject_id, current_revision_id, archived_at, ...)`; `public.birth_profile_revisions(id, birth_profile_id, subject_id, input_hash, ...)` | existing current revision query 계약 재사용; 요청 직전/후 revision 일치, archive/소유권 확인 |
| 상품·해석 | `public.readings`, `reading_sessions`, `reading_execution_attempts`, `reading_refs` 및 standard reading 연결 테이블 존재 | 신규 별도 Reading DB/중복 구매·Entitlement authority 만들지 않고 **기존 도메인 RPC**를 사용 |
| 기존 DB runtime | `myeongha_runtime`, `myeongha_worker_runtime`는 제한된 `LOGIN, NOINHERIT, NOBYPASSRLS`; `myeongha_api_executor`는 NOLOGIN | 기존 Owner/Role/RPC 패턴과 일치시키되 **브릿지 승인 소비 권한은 별도 역할**로 제한 |
| 공개 권한 | 조회된 핵심 Subject/Birth/Reading 테이블은 `anon/authenticated` SELECT 권한 없음, 일부에는 RLS 적용 | 현재 제한 유지. 새 private schema를 Data API exposed schemas에 추가하지 않음 |
| Supabase Security Advisor | `policy_exists_rls_disabled` 6개: `characters`, `chat_turn_attempts`, `chat_turns`, `subject_merge_actions`, `subject_merge_jobs`, `world_events`; `auth_leaked_password_protection` WARN 1개 | **별도 기존 보안 이슈로 분류해 배포 전 위험 평가**. 무조건 RLS 토글 시 기존 RPC가 깨질 수 있어 이 브릿지 적용에서 즉흥 변경하지 않음 |
| 사주 HTTP 연동 소스 | `production-current-subject-saju-calculation-runtime.ts`, `production-current-subject-saju-preview-reading-runtime.ts`, `production-saju-runtime-config.ts` | 서버가 보유한 HTTPS origin/Bearer를 사용. **실제 Saju 엔진이 운영 origin에서 준비·검증되었는지는 별도 확인** |
| 기존 격리 rehearsal | `saju-held-staging-rehearsal-runner-v1.ts`는 boolean `StagingTargetAuthorityPortV1`; `saju-held-staging-connection-plan-v1.ts`는 서로 다른 targetId/역할 3개를 요구 | 기존 3DB 계약을 허위 값/동일 DB targetId로 통과시키지 않음. **통합 프로파일 전용 새 versioned authority**를 설계; V1을 몰래 변경하거나 운영 Runner에 직접 결선하지 않음 |

데이터·인프라 무변경 읽기 전용 조사이며 **실제 민감한 Auth 회원 정보, Birth 행 값, 비밀키, DB URL, 운영 API Secret은 조회·출력·복제하지 않았다.**

## 2. 목표 구조: Supabase 1프로젝트, 기존 제품 동작 재사용

```text
사용자 앱/브라우저
    │  Bearer (기존 명하 Supabase Auth)
    ▼
기존 MyeongHa API (Vercel 서버 측, 고객 입력은 불신)
    │
    ├── (A) 기존 Auth 검증 + public.subjects 멤버·소유권 확인
    ├── (B) public.birth_profiles/current_revision 조회
    │
    ├── (C) 신규 private schema: saju_bridge_private
    │        ├── request_claims         중복·원자 claim
    │        ├── operator_permits       Owner 승인 단발 통제(운영 리허설용)
    │        ├── execution_ledger       실행/미확정 상태·SHA·revision 결속
    │        └── audit_events           비밀/개인정보 제외한 감사 참조
    │           (한 PostgreSQL 클러스터의 같은 failure domain)
    │
    └── (D) 기존 HTTPS 사주 서버 어댑터 (배포 여부 별도 실측)
               │
               └── Proof/HMAC 결과 검증 후 기존 Reading 도메인 RPC
```

**서로 다른 세 물리 DB를 설치하는 것이 아니다.** 저장소에 추가되는 것은 *기존 DB의 비공개 스키마와 소수 테이블, 접근 역할·계약 테스트*뿐이다. 기존 출생정보, Auth 사용자, Reading 결과를 새 테이블로 복사/이전하지 않는다. 기존 Vercel 앱이 데이터베이스에 접속하는 구성은 유지하며, 새 사주 엔진 서버가 반드시 필요하다고 추정하지 않는다. 단, **실제 사주 엔진 HTTP endpoint가 유효해야 브릿지 기능을 운영할 수 있다.** Supabase Database 자체가 Node/HTTP 사주 엔진을 호스팅하는 것은 아니다.

### 2A. 신규 테이블 최소 계약 (이름은 설계안; 적용 전 migration 검증)

| 스키마·테이블 | 최소 필드(비밀 아님) | 원자성·보존 |
|---|---|---|
| `saju_bridge_private.request_claims` | `id`, `subject_id`, `request_digest`, `birth_revision_id`, `scope`, `expires_at`, `status`, `claimed_at` | `UNIQUE(subject_id, scope, request_digest)`, 조건부 단회 claim. 원본 Birth/JWT/HMAC 저장 금지 |
| `saju_bridge_private.operator_permits` | `permit_id`, `action`, `scope_digest`, `approved_owner_ref`, `policy_revision`, `issued_at`, `expires_at`, `consumed_at`, `status` | Owner 운영 승인 P3/P4 용도로만 사용; **사용자 일반 사주 조회마다 Owner 승인 필요 없음**. Operator 서명 키는 DB에 저장 금지 |
| `saju_bridge_private.execution_ledger` | `attempt_id`, `subject_id`, `birth_revision_id`, `engine_version`, `myeongha_sha`, `saju_sha`, `request_digest`, `state`, `error_code`, `audit_ref` | `CLAIMED / COMPLETED / UNKNOWN_HOLD / REVOKED`; attempt-id·scope 유일성, 충돌/경합 실패 봉쇄. 기존 `reading_execution_attempts`와 중복 책임은 구현 전에 병합·대체 판정 |
| `saju_bridge_private.audit_events` | `event_id`, `attempt_id`, `event_type`, `occurred_at`, `actor_role`, `commit_digest`, `previous_hash` | append-only에 준하는 쓰기/권한. **동일 DB 내부 감사는 독립·불변 감사가 아님**. 필요 시 기존 GitHub/Vercel 비밀 없는 결과 참조로 교차 기록하되 원격 불변성 보증은 주장하지 않음 |

테이블 수·필드는 최종 DB 중복 분석 후 줄일 수 있다. 승인되지 않은 일회용 시험 회원·기존 회원 삭제, 운영 Birth 변경, 서비스 키 재발급은 이 설계에 포함되지 않는다.

### 2B. DB 접근 경계

- `saju_bridge_private`는 **PostgREST/Data API exposed schemas에 추가하지 않음**. `PUBLIC/anon/authenticated/service_role`에 새 schema USAGE/테이블 DML/RPC EXECUTE를 부여하지 않음. PostgreSQL 기본 PUBLIC 함수 EXECUTE·default privileges도 migration 시 명시적 차단.
- 기존 API 계정(`myeongha_runtime`)은 **기존 Subject/Birth/Reading 조회·명령**만. `saju_bridge_claim_login`, `saju_bridge_permit_login` 등 브릿지 전용 제한 `LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS` 및 **비로그인 역할**을 설계한다. 계정 비밀번호는 저장소/PR에 남기지 않고 서버 Secret에 둔다. 같은 공용 `postgres` 관리자/서비스 키는 데이터 경로에 사용하지 않는다.
- 역할 간 `SET ROLE`·`GRANT` 우회, schema CREATE, 임의 행 UPDATE, 일반 사용자 RPC 접근 금지. 각 스키마 `USAGE/SELECT/INSERT/UPDATE`를 필요한 SQL 함수/컬럼에 최소한만 부여하고 **DELETE/TRUNCATE 및 과거 감사 수정 금지**. RLS는 방어층이며 GRANT/보안 함수를 대체하지 않음.
- DB function은 가급적 `SECURITY INVOKER`, schema-qualified SQL 및 고정 search_path. 불가피한 `SECURITY DEFINER`는 별도 NOLOGIN Owner·제한 EXECUTE·입력 소유권 검증/transaction-bound trusted context를 증명한 후에만 사용.
- **단일 관리 DB 관리자(`postgres`)는 모든 스키마를 통제할 수 있고 동일 DB 장애·백업복구의 영향을 받는다.** schema/role/RLS는 애플리케이션 계층 분리이지 물리 독립·비반출 Root custody가 아니다.

### 2C. 실행 및 재시도 규칙

1. 기존 Auth JWT를 서버에서 검증(issuer/audience/expiry/signature; 필요 시 세션 `/user` 확인), `subjects.auth_user_id`와 현재 Member 상태를 조회. 요청자 주입 Subject/Guest/타인/merge/revoked/expired 세션은 차단.
2. 기존 조회 계약으로 `birth_profiles` 소유권과 `current_revision_id`를 확인하고 요청 digest를 생성. 출생정보 원문은 로그/감사에 저장하지 않음.
3. 한 PostgreSQL 트랜잭션에서 조건부 `request_claims`(및 해당되는 경우 서명·Owner 의도가 확인된 `operator_permits`)를 **단 한 번** 소비해 `execution_ledger`를 `CLAIMED`로 기록. 유니크 충돌/TTL 초과/역할 부족/트랜잭션 결과 불명확은 무조건 **HOLD**.
4. 외부 Saju HTTPS/Bearer/HMAC/issuer/audience/응답 해시와 engine SHA를 검증하고, 기록된 Birth revision을 **완료 직전 다시 확인**. 예상치 못한 변경이면 결과를 저장·노출하지 않음.
5. 기존 사주 Reading transport/Entitlement/Reader 계약으로만 결과를 커밋. 같은 `attempt_id`·digest의 이중 발행, 다른 유저 접근, 미결제 Reading 생성은 차단.
6. HTTP 전송 이후 DB COMMIT 또는 외부 결과가 불확실하면 `UNKNOWN_HOLD`로 판정. **자동 재시도·보상·새 Permit 발급 금지**; Owner가 추적/대조한 새 명시적 attempt만 진행. 같은 DB의 claim+permit 원자성은 확보 가능하지만 **외부 Saju 요청까지 정확히 한 번 실행됐다는 뜻은 아니다.**

### 2D. 두 승인 레벨은 분리

- **일반 회원 사주 조회/유료 Reading:** 사용자 인증·정보 소유·entitlement 및 서비스 설정 확인. Owner의 수동 승인을 매 요청 요구하지 않는다.
- **운영 연결/권한 변경/스테이징 rehearsal/출시:** Owner가 정확한 프로젝트 ref, 변경 DDL, 실행 SHA, 대상 기능, 비용 상한(기본 0원), 만료·롤백, 발행 권한을 승인. 단순 채팅 승인, 코드 리뷰, CI 통과를 암호학적 Owner 강인증/서명으로 가장하지 않는다.

## 3. 기존 고격리 계약과 충돌 처리: 안전한 버전 분기

| 고격리 SO-4 기존 기준 | 기존 프로젝트 1개 대안 | 판정 |
|---|---|---|
| 독립 staging Auth (R05) | 기존 명하 Production Auth 재사용 | **동일 Production Auth** — 독립 검증 불가 |
| Subject/Nonce/Admission 별개 TLS 클러스터 (R06–R09) | Subject는 기존 `public` 테이블, Nonce/Admission는 비공개 스키마 | **물리적 격리 미충족**; DB 역할·원자성만 검증 가능 |
| 독립 Root/KMS/Attestor·불변 감사 (R01–R04, R14) | 기존 서버 Secret·제한된 DB 감사 + 코드 검증 | **독립 관리자/키 custody·오프사이트 immutable audit 미충족** |
| 분산 DB 장애 검증 | 같은 DB 내 트랜잭션, 외부 HTTP 이후 UNKNOWN_HOLD | DB 내부 원자성이 개선될 수 있으나 **공유 DB 단일 장애·복구 위험** 발생 |
| 기존 `ConnectionPlan V1` 및 `Target Authority V1` | 신규 `SINGLE_PROJECT_V1` 의 별도 계획/신뢰·위험 승인 계약 | V1에 가짜 target ID를 넣어 통과시킴 **금지** |
| 2D-4 단회 리허설 | 새 운영 프로파일에서의 별도 Owner 승인 및 부정 테스트 | 이전 고격리 `canRunOnce`를 자동 true로 전환하지 않음 |

**선택 조건:** Owner가 단일 프로젝트 운영 모델의 한계(동일 관리자/키/복구/장애 도메인, Production에서 테스트할 경우 데이터·가용성 위험)를 명시적으로 수용하면, **고격리 rehearsal 게이트를 통과했다고 주장하는 대신** 새 제품 통합/출시 검증 기준을 정의해 별도로 인수한다. 제품 수준의 보안 책임을 생략하거나 기존 `R01–R14`를 자동 충족으로 재해석해서는 안 된다. 기존 격리 SO-4 요구를 유지해야 하는 경우 이 대안은 합격이 아닌 HOLD다.

## 3A. S1 구현 결정 — 기존 Reading/Proof 중복 제거 (2026-10-15)

**S1 최소 범위:** 기존 `public.readings`에는 이미 `UNIQUE(subject_id, request_idempotency_key)`가 있고, 기존 `public.reading_execution_attempts`는 Reading별 실행 상태를 보유한다. 또한 [기존 migration 1540](../supabase/migrations/1540_saju_source_proof_nonce_claim_authority_v1.sql)은 `public.saju_source_proof_nonce_claims`의 **별도 권한/원자 nonce 중복 방지**를 정의한다. **따라서 별도의 `request_claims`/일반 `execution_ledger` 테이블을 이번 S1에서 추가하지 않는다.** 2A 표는 후보 초안이며 이 S1 결정을 우선한다.

**이번에 작성할/작성한 실제 소스 (Production 미적용):**

- [미적용 migration 1730](../supabase/proposals/1730_saju_bridge_single_project_operator_permit_v1.sql): `saju_bridge_private` 비공개 스키마, 운영용 `operator_permits_v1`, 같은 DB 내 `audit_events_v1`, NOLOGIN/NOBYPASSRLS Owner/Executor 역할, 강제 RLS와 실행자 최소 `EXECUTE`만 정의. **발급자/로그인/기본 회원·Birth/Reading/실행 API/서비스 공개 없음.** `SINGLE_PROJECT_INTEGRATION_PROBE`만 허용하고 Production 활성화/판매 Permit을 발급할 수 없다.
- [미연결 원자 소비 어댑터](../apps/api/src/saju-single-project-operator-permit-v1.ts): 제한 역할을 `SET LOCAL ROLE`로 고정하고 DB 함수의 조건부 원자 claim과 감사 INSERT를 **한 DB 트랜잭션**으로 호출. 결과가 `COMMITTED_UNVERIFIED_OWNER_AUTHORITY`여도 `canRunOnce/canExecute/canPublish/canSell=false`; COMMIT 결과 불명확/권한 실패/중복 모두 FAIL CLOSED 및 재시도 금지. 어댑터 생성 자체는 무 I/O.
- [소비 부정 테스트](../test/saju-single-project-operator-permit-v1.test.ts) / [미적용 SQL ACL 테스트](../test/saju-single-project-operator-permit-migration-v1.test.ts): 조작된 SHA/scope, 미발급·소비·만료·철회, 역할 차단, 유일성, 잘못된 DB 결과, COMMIT 응답 유실, 감사/권한 계약을 검사한다.

**실제 운영 DB baseline 주의:** 2026-10-15 **읽기 전용 SQL 조회**에서 현재 명하 Supabase에는 `1540`·`1530`·`1720` migrations가 적용됐다는 기록이 없고 `saju_source_proof_nonce_claims` 테이블과 `myeongha_saju_%` 역할도 없었다. 즉 **소스에 있는 DB migration이 Production에 실제 적용됐다고 가정하면 안 된다.** 1730을 Production에서 **독립적으로 수동 실행하는 것도 금지**하고, 선행 미적용 migration 전체의 의존성·호환성·승인 순서를 정리할 때까지 S3는 HOLD한다.

**보안 한계:** Owner intent digest가 DB row와 일치한다고 해서 **사용자의 실제 행위별 강인증/서명 검증**이 되는 것은 아니다. 이 S1에는 Permit 발급 경로/실제 Owner 인증/Root custody/independent audit를 구현하지 않는다. 운영 권한은 증빙·승인 전 계속 HOLD. 동일 DB 내 audit는 독립 불변 감사가 아니다.

## 4. 실행 순서 및 검증 게이트 (추가 프로젝트/유료 자원 없음)

| 단계 | 구체적 구현·검사 | 종료 조건 |
|---|---|---|
| **S0 — 조사** | 기존 DB 스키마/roles/GRANT/RLS/함수 서명·마이그레이션·Supabase Advisor **읽기 전용** 조회 | **실측 완료(2026-10-15)**. 개인정보/Secret 조회 없음 |
| **S1 — 코드/계약** | 기존 Reading/Nonce/Permit 데이터 소유권 중복 정리; `SINGLE_PROJECT_V1` 보안·위험 승인 타입/주입 포트, private schema migration을 **소스에만** 작성 | TypeScript 타입 검사 및 부정 테스트 PASS. 기존 3DB 보호 계약 영향 없음 |
| **S2 — 폐기형 검증** | 기존 Docker/CI를 이용해 **추가된 코드와 migration 부분만** 제한 검증: 익명·타회원·Guest 거부, expired JWT·다른 Birth revision, Role escape/GRANT, nonce/permit 중복·경합, 2단계 COMMIT 불확실, 잘못된 Saju 서명/Origin 거부, 취소/결제 권한 | 코드 변경 관련 검사 PASS. 기존 Windows Phase 1–5 전체 재검증 요구 안 함 |
| **S3 — Owner 운영 변경 승인** | 정확한 `MyengHa` project ref, **신설 private schema만** 포함한 DDL/역할/Secret/접속 계획, 백업/롤백·가용성 영향·기존 RLS Advisor 6건 위험 검토. PG17 자동 ADMIN 권한 충돌을 별도로 해결·증빙 | **S3A BLOCKED/HOLD**: 기존 조건부 승인은 권한 계약 재설계를 포함하지 않음. 현행 역할 재시도 금지; 수정 계약·안전 실행 경로에 대한 신규 Owner 승인 필요 |
| **S4 — 실제 DB 보안 수용** | 승인된 migration, post-migration schema/privilege/role/SECURITY DEFINER/Advisor 재조회, 제한된 Synthetic transaction/rollback 검사, 원장 충돌·TTL·오류·불명확 COMMIT의 읽기 전용 대조 | 실제 DB role/권한/원자성 확인. 현 Production 사용자 데이터 읽기/변경·서비스 공개 없음 |
| **S5 — 실제 사주 연결** | 서버만 HTTPS Saju origin과 키 접근; SHA/transport/Proof, member→current Birth→Saju→기존 Reading DB 일관성; synthetic test Member 조건 및 감사·삭제 검증 | 실제 endpoint/키 증빙+Owner가 대상/출시 승인. Saju 엔진 배포가 아직 없으면 **이 단계만 HOLD** |
| **S6 — 제한 공개/복구** | 계정·키 회전, 차단 스위치, 응답 오류·불명확 처리, 원상복구/운영 모니터링, feature flag 단계적 enable | Owner의 별도 **Production 공개/결제 승인** + 결함 없음. 해당 feature만 활성화, 다른 명하 제품과 무관 |

**2026-10-16 현재의 다음 미완료 작업은 S3A Owner 결정 게이트:** S1·S2 코드 및 폐기형 검증은 이미 수행됐다. #2156이 실패 원인을 검증하고 pre-DDL HOLD를 병합했으므로 이를 다시 구현하지 않는다. 승인된 1730 원문 SHA256 `900e0771915776b4a7c2a8b3cf60e24b83c79fcec14f27cf6356b44685b385e2` / Git blob `42e076799d627bc9e19fe28e1ad25b4548e05e61`은 불변이다. Owner가 공급자 지원 역할 실행 경로의 안전성 또는 별도 보안 계약 재설계를 명시적으로 결정·승인하기 전에는 S3A 재적용과 S4–S6 활성화를 진행하지 않는다. 별도로 고격리 SO-3/R01–R14는 계속 `NOT_VERIFIED/HOLD`이며, 독립 업무는 기존 코드·문서 감사 범위에서만 계속한다.

## 5. 비용·보안 결론, 불변 상태

- **Supabase 프로젝트 추가 0개, Neon 0개, 현재 연결된 서비스 외 신규 유료 자원 0원**을 기본 제약으로 한다. 기존 Free 프로젝트 안에서 운영 비용/사용량 증가 가능성까지 0원이라 단정하지 않는다.
- Production 인스턴스 안에 테이블을 추가하는 변경이므로 **실제 DDL/GRANT는 배포/운영 변경**이고 그 자체가 기존 데이터 가용성에 위험을 줄 수 있다. 먼저 소스와 폐기형 테스트로 안전성을 입증한 뒤 별도 Owner 승인받는다.
- **2026-10-16 운영 적용 최신 상태:** `S3A_APPLICATION=BLOCKED/HOLD`, `OWNER_REVISED_AUTHORITY_APPROVAL=REQUIRED`, 운영 SQL 적용/서비스 활성화 증빙 없음. #2156 병합으로 사고 방지 코드만 완료됐으며, 본 문서의 과거 S1 권고·2026-10-15 snapshot보다 이 상태가 우선한다.
- **2026-10-15 기준 설계 snapshot:** `SINGLE_PROJECT_DESIGN_READY`는 설계 결과 **뿐**이며 `OWNER_RISK_ACCEPTANCE_PENDING`; `stagingAdmission=HOLD`, `stagingConnection=NOT_VERIFIED`, `operationalEvidence=NOT_VERIFIED`, `canRunOnce/canExecute/canPublish/canSell=false`. 기존 고격리 R01–R14도 그대로 NOT_VERIFIED.
- 기존 [사주 브릿지 완료 로드맵](./SAJU_HELD_STAGING_COMPLETION_ROADMAP_8C2B2D.md), [SO-4 고격리 설계](./SAJU_SO4_SUPABASE_ISOLATION_P0.md), [개발/로컬 인수 종료](./SAJU_BRIDGE_DEVELOPMENT_LOCAL_CLOSEOUT_20261015.md), [Issue #1871](https://github.com/gycha0109-beep/MyeongHa/issues/1871)과 연계해 동일 트랙에서 다음 적용·검증을 이어간다.

## 6. 참조

- 실제 저장소: `apps/api/src/production-user-data-runtime-config.ts`, `production-current-subject-saju-calculation-runtime.ts`, `production-current-subject-saju-preview-reading-runtime.ts`, `saju-held-staging-connection-plan-v1.ts`, `saju-held-staging-rehearsal-runner-v1.ts`, `supabase/migrations/0470_birth_profile_current_revision_query.sql`.
- Supabase 공식 [Postgres Roles](https://supabase.com/docs/guides/database/postgres/roles), [Custom Schema](https://supabase.com/docs/guides/api/using-custom-schemas), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Database Linter](https://supabase.com/docs/guides/database/database-linter?lint=0007_policy_exists_rls_disabled).
