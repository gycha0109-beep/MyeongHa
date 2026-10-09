# 8C-2B-2D-1 — 격리 PostgreSQL 운영자 승인 권한 검증

Watchtower-Track: saju-bridge

## 범위

8C-2B-2C에서 구현한 서명 검증·조건부 일회성 승인 소진 어댑터의 PostgreSQL 테이블/RLS/ACL 계약을 **폐기 가능한 CI DB에서만** 검증한다. 새로운 파일은 `test/db/fixtures/saju_staging_operator_admission_schema_8c2b2d1.sql`이다. `supabase/migrations`에 운영 DDL을 추가하지 않는다.

## 최소 권한 계약

- Issuer `myeongha_saju_staging_admission_issuer`: NOLOGIN/NOINHERIT, 승인 전용 ISSUED 행 INSERT만 가능. SELECT/UPDATE/DELETE 불가. DB는 서명 발급 서버도 개인키 저장소도 아니다.
- Runtime `myeongha_saju_staging_admission_runtime`: 독립 NOLOGIN/NOINHERIT. 승인 일치 비교·RETURNING에 필요한 컬럼 SELECT 및 `status`/`consumed_at_ms` UPDATE만 허용한다. INSERT/DELETE/타깃 필드 변경 금지.
- 양쪽 역할에 DB 로그인 멤버십을 부여하지 않는다. 운영용 Supabase, 일반 API, nonce 역할과 권한 분리. PUBLIC/anon/authenticated/service_role 접근 거부.
- 승인 행: UUID PK, Manifest SHA-256 digest, 환경 식별, MyeongHa/Saju 40자리 SHA, 승인자/Ed25519 키 ID, 발급·만료·소진 시간 및 상태. 15분 이하 TTL, RLS FORCE, 상태 일관성 CHECK. 비밀값·원본 서명·Subject/Birth 없음.

## 검증

`test/db/saju_staging_operator_admission_authority.sh`는 Postgres 15 및 17에서 역할·RLS·ACL을 검사하고 권한 부족, 승인 위조 바인딩, 재소비, 만료, 철회, 병렬 UPDATE를 테스트한다. 두 개의 별도 psql 연결에서 첫 트랜잭션이 잠금을 유지하는 동안 두 번째가 경합하여 최종적으로 1건만 소비된다.

현재 어댑터의 Ed25519 서명 검증은 TypeScript 합성 테스트가 담당한다. DB CI는 실제 PostgreSQL의 **스키마·권한 및 원자성**을 확인하는 시험이며, 독립 승인 발급·키 보관 및 실제 스테이징 로그인의 신뢰성을 인증하지 않는다.

기존 `ci-db-track.yml`을 유지하고 `runtime`(PG15) 및 `postgres17` DB suite에 시험을 등록한다. 신규 워크플로, 배포, DB 권한 GRANT, Secret 발급, Auth/HTTP 호출 없음.

## 남은 운영 게이트

실제 격리 스테이징 DB의 리뷰된 DDL·로그인 역할 멤버십·TLS peer 및 DB cluster identity, 실제 운영 승인 서명 발급·키 회전·철회·GC, 별도 Auth/Member/Birth, 보호형 Saju Proof issuer 배포, 장애·failover·rollback E2E는 후속 승인 및 실증 대상이다. 테스트 DB에서 superuser의 SET LOCAL ROLE은 제한된 실제 운영 로그인 증빙이 아니다.

```text
stagingAdmission = HOLD
stagingConnection = NOT_VERIFIED
sourceAuthority = NOT_EVALUATED
releaseAuthorization = NOT_EVALUATED
canExecute = false
canPublish = false
canSell = false
```

## 종료 기준

A: 격리 SQL·RLS·최소 권한·경합/부정 테스트 구현.
B: PostgreSQL15/17 및 SHA 고정 전체 통합 CI PASS.
C: HEAD/BASE 확인 후 Squash merge 및 main 재검증.

위 종료 조건 충족은 실환경 실행 승인과 무관하다.
