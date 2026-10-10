# D3B2B-3C — Governed Start/Settle 비용 경로 분리

Watchtower-Track: character-memory

## 범위와 경계
- Chat 네 역할(preflight/interpreter/renderer/reviewer)과 Post-turn의 비용 Start/Settle은 ENFORCE에서 별도 인증된 `costRunner`만 사용한다.
- 일반 `runner`는 기존 Chat/Outbox/Thread/Persistence를 유지하며 OFF의 비용 기록도 기존 일반 Runner로 실행한다.
- ENFORCE에서 모델 호출 전에 전용 비용 로그인으로 동일 canonical Subject ID와 Kind를 재검증한다. 실패 시 유료 호출을 차단하며 레거시 OFF로 자동 전환하지 않는다.
- Turn-send Root에서 명시적 ENFORCE인 경우에만 별도 DB URL/Principal을 요구하며 `parseSeyeonGovernedDbConfigV1`로 검증한다. 기본 OFF는 추가 자격이 필요 없다.
- Post-turn Worker는 server-owned 별도 DB Config 또는 환경 변수를 하나만 받으며 중복 자격 설정을 거부한다.
- 두 Pool close; 외부 주입 테스트 Pool을 임의로 닫지 않는다.

## 검증
- Vitest는 OFF 호환, ENFORCE 전용 DB 자격 누락, 일반 Pool 거부, Post-turn 승인 구성 시 비용 자격 누락 차단, Chat 네 역할/Worker 모두 비용 Runner 사용을 검사한다.
- D3B2B-3B1/-3B2 PostgreSQL NOLOGIN 실행권, 레거시 RPC 금지, 별도 임시 LOGIN 세션 부정 테스트를 유지한다.
- 유료 AI 호출, 운영 DB 접근, 운영 secret 변경 없음.

## HOLD
- 별도 Production LOGIN 발급, 시크릿 설정, 실제 운영 DB 인증은 미완료다.
- Production ENFORCE 기본 OFF. 정책/가격 live 활성화, A/B/C 모델 실행 및 운영 승인 없음.
- D3B2B-3D 레거시 Start/Settle/Record EXECUTE 회수는 OFF 종료, in-flight 처리, 권한 철회·롤백 승인 이전 금지.
- D4 독립 세션 race/삭제/크래시와 D5 운영 감시·승인 HOLD.

본 PR은 코드 결속 완료를 증명하지만 별도 Production DB LOGIN 접속 성공이나 최종 ENFORCE 안전 승인을 의미하지 않는다.