# C08-E — PostgreSQL 전체 대화 1건 증빙: 읽기 전용 Shadow 후보

Watchtower-Track: character-memory

## 개발 목적

3회 호출 Shadow는 C08-D부터 **DB 전체 대화에 현재 사용자 메시지가 단 1건만 있다는 신뢰 가능한 증빙** 없이는 진행하지 않습니다. C08-E는 그 증빙을 계산하는 **기존 PostgreSQL 테이블과 조회 함수를 사용하는 비연결(read-only) 후보**입니다.

## 기존 승인 경계에 따른 설계

- `supabase/migrations/0520_chat_thread_stream_query.sql`: `conversation_messages`의 Subject/Thread/sequence_no, redacted tombstone, 소유자 확인 규칙을 근거로 사용합니다.
- `supabase/migrations/0950_chat_read_runtime_authority.sql`: `myeongha_api_executor`의 RLS와 기존 함수 실행·컬럼 읽기 권한을 근거로 합니다.
- `supabase/migrations/1303_chat_thread_primary_participant_authority.sql`: `qry_chat_thread_runtime_binding_v1`가 활성화된 단일 primary Character 소유권/대화방 검증을 수행한다는 계약을 사용합니다.
- 새 SQL·마이그레이션·권한 부여 명령을 DB에 설치하지 않습니다. 사용자가 제공한 임의 `subjectId`를 받지 않고 **`PostgresSubjectExecutionScopeV1.resolvedSubject.subjectId`에서만 Subject를 추출**합니다. 같은 스코프에 포함된 인증 완료 PostgreSQL 트랜잭션 Query 포트로 **SELECT만** 수행합니다.
- `apps/api/src/postgres-seyeon-first-turn-census-shadow-v1.ts`: 기존 소유자 권한 함수와 `conversation_messages`에서 **본문/페이로드 없이 ID, sequence, sender, redacted만 최대 첫 2건** 조회합니다. 1건이 정확히 요청 메시지이며 user/비삭제, 활성 Thread·참여 Character가 세연 1명임을 확인합니다. 두 번째 메시지가 **삭제 흔적(tombstone)**이라도 2건으로 판단하여 거부합니다.

## 테스트 결과 판단 기준

- 유효한 사용자/대화방/현재 메시지 고정 → 첫 1건이면 `complete:true` Shadow 증빙 생성.
- 0건, 2건 이상, 보관·삭제된 Thread, 다른 Character, 현재 메시지 불일치, 변형 카운트, 없는 결과·중복 결과, 사용자/대화방 ID 바꿔치기 → **FIRST_TURN_CENSUS_UNVERIFIABLE**.
- 데이터베이스 예외가 발생하면 민감한 데이터 내용 없이 HOLD; AI 후보와 검토 모델 호출 0회.
- 기존 C08-D Shadow Gate, C08-B 5→3 Guard 경로 및 보안 음성 테스트의 검증 기준을 약화하지 않습니다.

## 중요한 한계 (운영 미승인)

1. **테스트의 DB는 모의 Query 응답입니다.** PostgreSQL 17 실제 RLS/ROLE/실행 계획과 인덱스/비용은 검증되지 않았습니다.
2. `LIMIT 2`는 **첫 1건 vs 2건 이상**을 판단하는 방법이지, 모든 과거 메시지 개수를 제공하는 기능이 아닙니다. 인덱스가 없으면 성능을 보장할 수 없습니다.
3. READ COMMITTED 단일 statement 결과는 동일 시점의 일관성만 제시합니다. 조회 직후 새 메시지가 도착하면 결과가 **오래된 상태**가 될 수 있습니다. 트랜잭션·Turn/Attempt 잠금 또는 단일 경계 고정이 구현되기 전에는 Production First Turn 증빙으로 승인하지 않습니다.
4. 채팅의 다른 Subject, Role, RLS, Owner의 실제 DB 격리는 추가 별도 PG 두 세션 증거가 필요합니다. 직접 client-provided subjectId를 서버 권한으로 취급하면 안 됩니다.
5. 개인기억 Grant/revoke/Context Pin/Atomic Commit/HTTP Reveal·비용 Governor는 별도 G0~G6 보안 종료조건이 계속 HOLD입니다.

## 안전·비용

- 실제 서비스 라우팅·API/HTTP·DB 마이그레이션·DDL/DML·ACL·권한·배포 변경 **없음**.
- 실제 유료 AI 호출 **추가 0회**, 이전 11회/사용량 추정 3,770 microUSD/보수적 예약 36,047 microUSD 유지.
- CI: `npx vitest run test/seyeon-c08e-postgres-census-shadow-offline-v1.test.ts test/seyeon-c08d-full-thread-census-offline-v1.test.ts`.
- 다음 단계: 격리된 PG17/검증용 역할 2개로 실행 계획/권한 거부를 확인하고, 동시성 시나리오에서 첫 턴 잠금 경계 정책을 검증. **운영 DB 사용·유료 모델 호출은 별도 명시적 승인 필요.**
