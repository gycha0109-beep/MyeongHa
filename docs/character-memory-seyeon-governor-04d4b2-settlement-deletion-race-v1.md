# Se-yeon Governed Cost D4B-2 — Settle vs Account Finalizer Race
Watchtower-Track: character-memory

## 계약 및 경계
- 본 단계는 D4B-1 병합 이후 시작됩니다. 중복 정산과 개인정보 잔존을 실제 PostgreSQL 세션으로 검증합니다.
- 합성 Member/전용 Governed 로그인과 테스트용 가격 정책만 사용합니다. 유료 모델 호출은 없습니다.
- 테스트 DB 이름을 myeongha_seyeon_d4b2_test로 고정하고 DB Authority Core의 폐기 DB를 사용합니다.
- 기존 계정 삭제 명령 cmd_start_account_deletion_v1과 승인된 DB finalizer internal_finalize_account_deletion_db_v1을 실행합니다.
- 기존 1550 cleanup trigger는 Attempt 삭제 후 비용 원장을 DELETE 합니다.
- 글로벌 일별 점유 카운터는 정책상 보수적으로 보존될 수 있으며 개인정보 원장 합과 삭제 직후 무조건 일치해야 한다는 요구를 만들지 않습니다.

## 시나리오
1. Governed 전용 로그인으로 3700 microUSD 예약.
2. 별도 트랜잭션에서 Settle(실제 합성 사용료 300 microUSD)을 실행하되 커밋 직전 FIFO에서 대기.
3. 승인된 계정 삭제 시작을 별도 DB 세션에서 COMMIT하고, 테스트 fixture에만 존재하는 미처리 Chat Outbox를 processed로 정리.
4. 현재 삭제 Outbox lease 소유권을 검증한 DB finalizer 실행.
5. pg_stat_activity + pg_blocking_pids로 finalizer가 Settle 트랜잭션의 DB row lock에 대기 중임을 확인.
6. Settle COMMIT 이후 finalizer COMMIT. Subject deleted, Attempt/Cost ledger 0, 글로벌 보수적 점유 300 확인.
7. 삭제된 Member의 실제 Governed 로그인 재해석 실패(SQLSTATE 28000), 별도 특권 실행 경로도 기존 Call Settle을 되살리지 못함(SQLSTATE 23514) 확인.
8. 전체 개인정보 비용 원장이 계속 비어 있고 원장/글로벌 점유 반쪽 쓰기가 없는지 확인.

## 비범위
- DELETE 우선/Settle 늦게 도착하는 추가 경합, 별도 Attempt DELETE의 승인 계약, DB crash 시 COMMIT 인지 불명, 다중 Subject, lock_timeout/statement_timeout 전체 커버리지는 후속 작업.
- Production migration lineage issue #1887, 운영 로그인 인증, ENFORCE, REVOKE, 유료 API는 HOLD 유지.
