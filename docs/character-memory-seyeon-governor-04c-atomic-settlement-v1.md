# 세연 PR-04C-2 — Ledger·예산 점유 원자 정산

Watchtower-Track: character-memory

## 처리 순서

- `cmd_governed_start_seyeon_ai_call_v1`은 기존과 같이 UTC 전역 예산 행을 잠그고, Subject별 당일 점유를 계산한 후 호출 시작 + 예약을 하나의 트랜잭션으로 저장한다.
- 새 `governor_effective_micro_usd`는 기존 비용 장부에 생성 열로 부착된다. 미정산/사용량 불명은 전체 예약 ceiling 유지. 정산 완료 및 검증된 예상 원가가 있으면 실제 예상 원가로 반영한다.
- `cmd_governed_settle_seyeon_ai_call_v1`는 Subject 소유권 검사 → 원래 예약된 **UTC 날짜** 전역 행 잠금 → 호출 비용 장부 행 잠금 → 기존 `cmd_settle_seyeon_ai_call_v1`의 엄격한 JSON/원가 검증 → 차액을 글로벌 점유액에 반영한다. 트랜잭션 오류는 둘 다 롤백한다.
- 호출 종료의 원가가 예약 상한을 초과해도 버리지 않는다. 실제 원가를 반영하고 `over_ceiling=true`를 반환한다. 이 사고는 차후 운영 경보 대상이다.
- 동일 정산 증빙 반복은 `replayed=true`이며 글로벌 카운터를 다시 갱신하지 않는다. 다른 정산 금액·과금 단가 버전·모델 ID 불일치는 실패한다.
- 요청 실패/타임아웃/사용량 미확정의 예약은 자동 반환하지 않는다. 기존 원장에는 `usage_unknown`으로 명시된다.

## 최소권한

- API executor에게 비용 테이블의 직접 UPDATE/INSERT/SELECT 권한을 주지 않는다.
- 재사용하는 전역 예산 잠금 순서는 admission/settlement 모두 동일하여 DB 교착 위험을 줄인다.
- 비용 함수는 NOLOGIN/NOBYPASSRLS `myeongha_seyeon_cost_meter_owner`가 소유한다.
- 사용자별 예약 메타는 기존 Attempt 삭제 트리거에 포함되며 전역 점유 금액은 삭제 후에도 보수적으로 남는다.

## 비활성 및 검증

- 새 DB RPC는 **명시적으로 governed provider가 구성되었을 때만** 사용된다.
- 기존 시작 RPC의 직접 실행 권한은 아직 열려 있으며 04D에서 우회 경로 제거 + Production 안전 전환이 필요하다.
- 기존 데이터·사용량·정산은 모두 추정 원가이며 실제 공급자 청구서를 대체하지 않는다.
- SQL 오프라인 테스트: 정산 차액 반환, 같은 정산 재실행, 충돌 재실행 거부, 사용량 불명 HOLD, Subject 점유, 전역 점유. 서로 다른 세션 경합 및 삭제 경합 실험은 04D.
- 유료 AI API 호출과 Production Governor 활성화 없음.

## 종료조건
A. Postgres 동일 트랜잭션 Ledger + 예산 갱신 및 회귀 테스트 — CI 기준.
B. 실제 서버 tokenizer/요금 정책 운영 연결, 경쟁 조건 및 개인정보 삭제 검증 — HOLD.
C. Production ENFORCE — HOLD.
