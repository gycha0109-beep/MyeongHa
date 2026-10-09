# 세연 Governor PR-04D3A — ENFORCE 사전 진입 경계

Watchtower-Track: character-memory

## 구현 범위
- Production Chat 네 역할(preflight/interpreter/renderer/reviewer) 및 Post-turn에 `OFF | ENFORCE` 서버 내부 모드 계약을 추가했다.
- 기본값은 OFF이며 기존 운영 요청이나 유료 API 호출을 새로 활성화하지 않는다.
- ENFORCE에서는 네 역할의 명시적 네이티브 Provider 설정, Governor 존재, 직접 Provider 주입 금지, 임의 네트워크 엔드포인트/전송 및 사용자 제공 dispatch hook 금지를 런타임 구성 단계에서 확인한다.
- Chat/Worker의 원시 Provider fallback은 ENFORCE 경로에서 사용하지 않는다. Role Governor 생성 결과가 없으면 레거시 start로 후퇴하지 않는다.
- 모의·순수 단위 테스트로 필수 역할 누락, 우회 Provider, 임의 네트워크 훅을 거부한다.

## 미완료·별도 변경
- **D3A는 운영 활성화와 D3 전체 종료가 아니다.** OFF 동작은 의도적으로 유지한다.
- Production 서버 소유 가격정책/공식 입력계측 포트의 구성 및 신뢰된 ENFORCE 전환권한 결속, 코드 전체 직접 Provider 생성 검사는 D3B에서 추가로 봉쇄해야 한다.
- 레거시 RPC 직접 EXECUTE 제한, governed ledger 단독 정산 경계 및 PostgreSQL 권한/회귀 테스트는 D3B에서 완료해야 한다.
- 독립 DB 세션 경합·삭제/크래시(D4), 운영 감시 및 실운영 승인(D5), 공식 count API 비용·모델별 검증은 HOLD다.
- 이번 PR에서 Production ENFORCE, DB GRANT/REVOKE, 유료 OpenAI 호출은 수행하지 않는다.
