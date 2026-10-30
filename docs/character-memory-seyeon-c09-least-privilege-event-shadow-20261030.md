# C09 학습 이벤트: 격리 역할·RLS·트랜잭션 검증 (2026-10-30)

**상태: LOCAL ISOLATED PG17 ONLY. 운영 DB·HTTP Routing 미적용.**

## 구현

- 근거: docs/character-memory-seyeon-c09-atomic-source-shadow-20261029.md 및 기존 supabase/proposals/*PROPOSAL_NOT_APPLIED.sql.
- test/fixtures/c09-learning-least-privilege-isolated-postgres17.sql
  - 합성 사용자 A/B를 서로 다른 PostgreSQL 테스트 역할로 분리. 테스트 전용 current_user 기반 SQL RLS 정책을 정의했고, 클라이언트에서 임의 변경 가능한 세션 GUC는 사용하지 않음.
  - 조회/특정 칼럼 UPDATE/학습 증빙 INSERT/함수 EXECUTE를 테스트 역할에 한정. **운영 ACL/RLS 예제가 아니며 이 Fixture의 잠금용 칼럼 UPDATE 권한을 운영에 그대로 복사하면 안 됨.**
  - SELECT ... FOR SHARE가 단순 SELECT 정책만으로는 행을 반환하지 않는 격리 PostgreSQL 실패를 발견해 Topic 잠금에 필요한 RLS 정책을 추가하고 실제 DB에서 재검증.
  - 테스트 B는 A의 Source 승인 원본을 볼 수 없고, A의 UUID를 전달해도 A 학습 발행 불가. A/B 별도 발행, 서로 다른 비공개 기록 격리, 교차 철회 거부, 개별 승인 철회와 동의 철회 시 공유 학습 일괄 무효화 확인.
  - 실제 SQL 검증 마커: C09_ISOLATED_LEAST_PRIVILEGE_RLS_PASS.
- apps/api/src/seyeon-c09-learning-event-isolated-shadow-v1.ts
  - 오직 테스트 전용 실행기: C09_ISOLATED_PG_URL 환경변수, DB 이름 fixture, current_user가 합성 c09_isolated_subject_a/b, Canonical Subject Scope 일치가 전부 필요.
  - BEGIN → 실제 DB Role·Subject 검사 → PostgreSQL Source/Consent/Revocation 승인 읽기 → 기존 Planner의 잠금 기반 원자적 함수 호출 → 반환 ID 확인 → COMMIT. 오류 시 ROLLBACK.
  - 다른 Role의 Subject ID 위조, 반복 발행·반복 철회, 승인/동의 원본 미존재 시 거부. 운영 API/메모리 commit 경로에는 연결하지 않음.
- test/fixtures/c09-learning-isolated-event-seed.sql 및 test/seyeon-c09-learning-event-isolated-shadow.test.ts
  - 합성 Source/Consent를 격리 DB에 설치한 뒤 실제 PG Driver를 통해 발행·철회 트랜잭션을 수행. 실패 후 ROLLBACK, 중복 발행 후 기존 기록 보존 확인.

## 검증

- 격리 PostgreSQL 17 SQL 실행: C09_ISOLATED_LEAST_PRIVILEGE_RLS_PASS.
- 실제 격리 DB 이벤트 처리 테스트: 2/2 PASS.
- 일반 C09 관련 Vitest 10파일: 77 PASS, 격리 DB 전용 1 SKIP (환경변수 미설정).
- 빌드용 TypeScript 검사: PASS.
- 실사용자 데이터 조회 없음; 관리자 세션에서 테스트용 역할을 SET ROLE한 일회용 Docker PG17 실증이지 운영 myeongha_api_executor의 실역할 ACL/RLS 검증이 아님.

## 운영 전 미완료

1. 실제 DB Migration·ACL·RLS 변경은 별도 사용자 승인 게이트 유지.
2. 검증된 학습 Source/Consent/Privacy Review/Approval/Revocation 증빙을 **신뢰 가능한 운영 원본**으로 발행·감사하는 기능 미구현.
3. 사용자 임의 역할·Subject에 의존하지 않는 운영 인증 및 최소권한 설계 필요. 테스트 고정 역할/UPDATE 권한을 운영에 그대로 적용하면 안 됨.
4. 운영 동시성·데드락·재시도·동의 철회 전파·장기 기억 및 실제 GLM/Luna 품질 검증 미완료.
5. 기존 conversation_messages 직접 SELECT ACL 블로커 유지.

SQL은 여전히 supabase/proposals/*PROPOSAL_NOT_APPLIED.sql에만 있으며 운영 DB·원래 D:\cha\MyeongHa 작업 트리는 변경하지 않음.
