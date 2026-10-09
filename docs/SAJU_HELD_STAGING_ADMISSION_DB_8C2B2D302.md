# 8C-2B-2D-3-02 — Permit V2 PostgreSQL 승인 원자 소비 (CI 전용)

Watchtower-Track: saju-bridge

## 목적

8C-2B-2D-3-01에서 Manifest Digest와 Connection Plan Digest를 함께 Ed25519 서명에 포함했다. 본 단계는 그 둘을 **독립 V2 DB 행과 원자적으로 일치 비교**하는 서버 전용 소비 어댑터 및 폐기 가능한 PostgreSQL 15/17 검증을 추가한다.

기존 Permit V1 서명·테이블·소비 어댑터는 불변이며 V2는 `public.saju_staging_operator_admission_permits_v2`만 조작한다.

## 변경 범위

- `apps/api/src/saju-held-staging-admission-postgres-v2.ts`: V2 구분된 테이블, V2 서명 사전검증, 별도 승인 DB pool, `BEGIN READ COMMITTED → SET LOCAL ROLE → SELECT FOR UPDATE → 별도 UPDATE ... RETURNING → COMMIT`. 커넥션은 소비 시점까지 요청하지 않는다. COMMIT 실패/응답 불명확/ROLLBACK 실패는 거부하고 재시도하지 않는다.
- `test/db/fixtures/saju_staging_operator_admission_schema_8c2b2d302.sql`: 독립 V2 CI 테이블, FORCE RLS, issuer/runtime/revoker NOLOGIN·NOINHERIT, 열별 최소 ACL, TTL≤15분·상태 CHECK. **운영 DB migration 아님**.
- `test/db/saju_staging_operator_admission_v2_authority.sh`: 실제 PG15/17에서 RLS·ACL, Manifest/Connection Plan Digest 변경, 재사용, 동시성, 철회, 만료 및 잠금 대기 후 만료를 검증한다.
- `test/saju-held-staging-admission-postgres-v2.test.ts`: 합성 public-key Ed25519 검증, 범위 고정, 회피·변조·DB 장애·SQL 조건부 일치 시험.
- 기존 `scripts/ci/db-suites.json`, `scripts/ci/db-pr-router.mjs`, `test/db/run_ci_case.sh`, `tests/verification-plan.test.ts`만 등록을 위해 변경한다. V2 케이스는 PG15 runtime과 PG17 postgres17 모두 포함. 총 케이스 35개 등록, 중복 제외 32종.
- 기존 GitHub workflow 신규 생성 금지.

## 신뢰·권한의 경계

1. 기존 Connection Plan V1에 고정된 `myeongha_saju_staging_admission_runtime` 역할명을 사용한다. V1/V2 **물리적 테이블 분리**는 유지하나, 역할명 자체의 버전별 분리는 구현하지 않는다. 실제 배포에서 V1 테이블 사용 가능성 차단 여부는 다음 운영 검증 단계의 필수 조건.
2. Runtime의 PostgreSQL `SET LOCAL ROLE`은 자체적으로 실제 로그인 권한을 증명하지 않는다. 합성·CI PostgreSQL에서 superuser가 역할을 전환하는 것은 운영 최소 권한 로그인 증빙이 아니다. **어떤 role membership도 이 단계에서 GRANT하지 않는다.**
3. Issuer는 ISSUED 행 INSERT만, Runtime은 승인 비교에 필요한 SELECT와 `status`/`consumed_at_ms` UPDATE만, Revoker는 미소비 ISSUED → REVOKED만 가능. 일반 API/nonce/Auth/commerce는 접근 불가.
4. 서명 검증을 통과해도 **공개키의 출처와 운영자 권한은 여기서 보증하지 않는다.** 독립적으로 보관된 승인자 키 레지스트리와 승인 원본의 출처/변경 불가성은 3-03에서 별도 검증 필요.
5. PostgreSQL의 `clock_timestamp()`를 소비 조건·행 상태 검사에 이용해 단일 UPDATE 내부의 clock_timestamp()만으로는 잠금 대기 후 만료 재검사를 보장하지 못함이 PG17 CI에서 확인됐다. 먼저 SELECT FOR UPDATE로 행 잠금을 획득한 뒤, READ COMMITTED 별도 UPDATE 문장의 clock_timestamp()로 만료를 새로 평가하여 거부한다. COMMIT 결과 불명확 시 자동 재시도가 없고 운영 감사 경로에서만 확인.
6. 새 테이블 SQL·테스트 이외의 Supabase migrations, staging grants, Secret provider, 실제 Auth/Proof 요청, 로그인/배포/판매 권한, HTTP route, CLI 실행 경로를 생성하지 않는다.
7. 서명·승인 메타데이터·Subject/Birth·DB URL/Secrets 원문은 로그로 반환하지 않는다. 테스트 fixture의 값은 합성이다.

## 미완료 및 후속 작업

- 8C-2B-2D-3-03: 실제 Target Authority와 별도 승인자 공개키 레지스트리, DB 클러스터/TLS peer/session_user/role membership, Proof HTTPS/Bearer/HMAC, staging Auth 분리 확인.
- 8C-2B-2D-3-04: 운영 승인 기록·철회·복구·키 회전·증빙 보관·인시던트 런북.
- 2D-4: 독립 실환경 승인과 일회 실행.

종료 조건 A: 코드·SQL·RLS/ACL·부정·race 테스트.
종료 조건 B: PG15/17, TypeScript, scoped CI, SHA 고정 전체 통합 CI PASS.
종료 조건 C: 최신 HEAD/BASE 확인 후 Squash Merge 및 main SHA 확인.

```text
stagingAdmission = HOLD
stagingConnection = NOT_VERIFIED
signerAuthority = NOT_VERIFIED
sourceAuthority = NOT_EVALUATED
releaseAuthorization = NOT_EVALUATED
canRunOnce = false
canExecute = false
canPublish = false
canSell = false
```
