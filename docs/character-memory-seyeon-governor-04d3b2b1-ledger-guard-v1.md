# PR-04D3B2B-1 — Governor 예약 원장에 대한 레거시 정산 우회 차단

Watchtower-Track: character-memory

## 확인된 취약 경로
- `cmd_settle_seyeon_ai_call_v1`은 원래 Governor 예약 필드를 확인하지 않고 lifecycle_state를 settled로 바꿀 수 있었다.
- API executor가 이를 직접 호출하면 Governed 일별 global occupied 잔액과 ledger effective 비용 사이 불일치가 발생할 수 있었다.
- 반면 `cmd_governed_settle_seyeon_ai_call_v1`은 내부에서 legacy 정산 계약을 재사용하고 있어 단순 예외 차단만 추가하면 정상 Governed 정산도 실패한다.

## 이번 마이그레이션
- `1610_seyeon_ai_governor_legacy_settlement_guard_v1.sql`: 기존 1560 lifecycle 정산 계약을 `seyeon_ai_settle_internal_v1` 비공개 SECURITY DEFINER 함수로 복제한다.
- 내부 함수 소유권은 `myeongha_seyeon_cost_meter_owner` (NOLOGIN/NOBYPASSRLS). PUBLIC/API executor/웹 principal EXECUTE는 금지한다.
- 기존 `cmd_settle_seyeon_ai_call_v1`은 동일 파라미터·반환 계약을 유지하되 Subject 검증과 row lock을 거쳐 Governor 예약 호출이면 SQLSTATE 23514로 차단한다. OFF 레거시 호출은 기존 validator를 사용한다.
- 정식 Governed 정산은 자체 global-budget lock 및 비용 검증 후 비공개 내부 정산 함수만 호출한다. 기존 원자적 예산 변경과 재실행 규칙은 유지한다.
- 글로벌 예산 정책 시딩, Production 모드, HTTP 진입점, api executor의 기존 레거시 RPC grant를 건드리지 않는다.

## 검증
- `test/db/seyeon_ai_governor_legacy_settlement_guard_v1.sql`을 DB authority core에 등록한다.
- private helper 직접 실행권 거부, active/settled Governor 예약의 legacy settlement 거부, 정식 Governed settlement 및 retry, OFF 레거시 settlement/retry, 타 Subject 요청 거부, global occupied ↔ ledger effective 잔액 동일성을 PostgreSQL에서 검사한다.
- 테스트의 모든 정책·호출 행은 BEGIN/ROLLBACK 구간에만 존재하며 유료 AI 호출은 수행하지 않는다.

## 별도 HOLD
- D3B2B-2/3: 여전히 executor의 legacy start/record/settle RPC GRANT는 유지된다. 안전한 권한 전환 시점·OFF 세션 호환성이 필요하다.
- D4 독립 DB 연결·충돌·장애·삭제 경쟁 시험, D5 운영 관측/명시적 승인, 실가격/Count API Production 검증 전 ENFORCE 활성화 금지.
