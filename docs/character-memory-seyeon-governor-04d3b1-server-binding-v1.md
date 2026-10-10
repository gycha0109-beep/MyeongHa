# PR-04D3B1 — 서버 승인 Governor 구성 연결

Watchtower-Track: character-memory

## 구현
- Chat 네 역할과 Post-turn의 모델·가격 버전·허용 목적·출력 토큰 상한을 서버 승인 정책에 결속합니다.
- 공식 OpenAI Responses 입력 토큰 계산 포트를 구성하며 임의 Provider hook, Gateway/대체 endpoint와 정책 불일치를 거부합니다.
- Chat의 ENFORCE 실행은 서버 승인 governorApproval에 의존하며 외부 costGovernorForRole 콜백으로 우회할 수 없습니다.
- Post-turn ENFORCE도 서버 승인 정책으로만 Governor를 생성하고 임의 주입 Governor를 거부합니다.
- 기본 OFF는 변경하지 않으며 생성 시 네트워크 I/O가 발생하지 않습니다.

## 남은 위험과 활성화 HOLD
- 레거시 start/settle/record RPC에 API executor 권한이 남아 있습니다. 직접 REVOKE하면 기존 OFF 호출에 장애가 발생할 수 있어 이 PR에서는 변경하지 않습니다.
- D3B2에서 RPC 권한·SECURITY DEFINER 내부 의존성·직접 Provider 정적 경로를 감사하고 안전하게 철회해야 합니다.
- D4 독립 DB 세션 경합·삭제·크래시 테스트, D5 운영 관측·승인 이전에는 Production ENFORCE 활성화 금지입니다.
- 입력 토큰 계산 API의 모델별 Production 호환성·요금·쿼터·타임아웃은 외부 검증 전까지 보류입니다.
- 실 유료 AI API 호출, Production 설정 변경, DB 예산 시딩은 실행하지 않았습니다.