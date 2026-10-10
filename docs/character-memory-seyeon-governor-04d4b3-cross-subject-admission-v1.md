# D4B-3 — 다중 Subject Governed Start 동시성 증명

Watchtower-Track: character-memory

## 범위

- D4B-2 병합 커밋 `2d07503be8ed9d3de7ee9e306c4b923fbe81d6bf` 기반. D4A/D4B-1/D4B-2 기존 테스트 유지.
- 오직 disposable PostgreSQL `myeongha_seyeon_d4b3_test`에 합성 데이터와 오프라인 모델 가격만 설정.
- Member A는 이미 COMMITTED인 post_turn Attempt, Member B는 독립 Subject/thread의 RUNNING chat Attempt를 사용. 각각 `begin_member_subject_context_v1`로 다시 Subject를 확인. post_turn과 chat에는 서로 다른 불변 오프라인 정책 행을 신규 INSERT해 사용하며, 두 정책의 단가·견적만 동일하게 맞춤.
- 두 예약 견적은 각각 3,700 microUSD, 글로벌 초기 예산은 7,000, Subject별 예산은 5,000.

## 독립 DB 세션 검증

1. A의 비용 예약은 성공하지만 트랜잭션 COMMIT 직전 FIFO에서 대기.
2. B의 실제 PostgreSQL 세션이 같은 UTC 글로벌 예산 행 잠금에서 A에 의해 차단됨을 `pg_blocking_pids`로 확인. 커밋 전 제3 세션에서 원장·점유 합계 0 확인.
3. A COMMIT 뒤 B는 `23514 / seyeon_ai_governor_global_exhausted`로 거부. 원장 1건·점유 3,700 유지.
4. 오프라인 글로벌 상한만 9,000으로 변경하면, 앞서 실패한 B의 동일 call ID가 성공. 합계 7,400이며 A/B 원장 Subject 귀속이 분리됨.
5. 글로벌 한도만 18,000으로 상향해 충분한 전역 여유를 확보한 뒤 A와 B의 두 번째 3,700 예약을 각각 `seyeon_ai_governor_subject_exhausted`로 거절.
6. A/B가 상대방의 유효한 Subject/turn/attempt를 직접 지정한 변조 요청은 `42501` 권한 거부. 끝까지 원장 2건·글로벌 점유 7,400 유지.

## 범위 밖 / 잔여 위험

- Guest canonical resolver와 Member↔Guest 사이의 동시 경합은 **미검증**. D4B-3 후속으로 추가 필요.
- D4B-4 Settle 중단·재시도와 D4B-5 lock/statement timeout 및 deadlock은 각각 별도 검증 필요.
- 오프라인 합성 성공은 Production migration lineage 정합성 또는 실제 ENFORCE 전환 승인 근거가 아님. Production 변경, 실제 Provider 호출, 운영 권한 REVOKE/GRANT는 하지 않음.
