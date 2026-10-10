# PR-04D3B2B-2 — 비공개 Start 권한과 Governed Admission 분리

Watchtower-Track: character-memory

## 실제 변경
- 마이그레이션 1620: 1560의 기존 Start lifecycle을 동일 함수 계약의 seyeon_ai_start_internal_v1로 분리한다.
- Governed Start는 승인 모델/가격/용도, 잠긴 일일 예산과 Subject 점유액 확인 후 비공개 Start만 호출한다. 공개 레거시 Start RPC를 더 이상 내부 호출하지 않는다.
- 공개 레거시 Start는 기존 함수를 그대로 호출하는 위임 래퍼로 유지한다. 동일 Subject/Turn/Attempt 검증, 중복 callId 거부와 OFF 원가 계측의 기존 동작을 유지한다.
- 비공개 Start 소유자는 NOLOGIN/NOBYPASSRLS cost meter owner이며 PUBLIC/anon/authenticated/service_role/API executor EXECUTE를 거부한다.
- 정상 Governor/Legacy API ABI 및 기존 실행 권한 변경 없음. Provider/Production 설정 변경 없음.

## 실제 PostgreSQL 권한 및 원장 회귀
- 새로운 DB 테스트는 비공개 함수 실행권과 소유자/SECURITY DEFINER, Governed 함수 정의에 공개 Start 의존성 없음을 검증한다.
- OFF Start와 Governed Start를 같은 committed attempt에서 실행하고 3700 microUSD 예약, ledger 기록, 중복·다른 Subject 거부, OFF 예약 없음 조건을 검증한다.
- 모든 정책/비용 레코드는 테스트 트랜잭션 ROLLBACK 후 제거된다. 유료 AI 요청 없음.

## 별도 HOLD
- Executor의 legacy Start/Settle/Record GRANT가 남아 있으므로 권한 레벨 우회 방지 전체가 완료된 것은 아니다.
- D3B2B-3 권한 철회는 OFF 서비스 전환과 in-flight 호출 종료를 먼저 검증하고 별도 승인 기준에 따라 수행한다.
- D4 독립 DB 세션 동시성·삭제·크래시, D5 운영 감시·토큰 Count/가격 검증 및 ENFORCE 명시적 승인 전까지 Production OFF.