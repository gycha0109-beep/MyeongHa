# PR-04D3B2A — 세연 비용 호출 코드 경계 회귀 검사

Watchtower-Track: character-memory

## 검사 내용
- apps/api/src 모든 TypeScript 파일에서 직접 OpenAI Provider 생성과 Persisting Provider 생성에 대한 신규 import를 정적 검사한다.
- 허용 파일은 기존 감사로 확인된 Chat, Post-turn, 비용 장부 어댑터뿐이다.
- 레거시 start/settle/record RPC 이름을 신규 런타임 코드가 직접 참조하면 테스트 실패한다.
- 실제 Chat HTTP와 Post-turn이 서버 승인 Governor 생성기를 사용하는지를 CI에서 확인한다.

## 경계와 후속
- 직접 import 및 RPC 명칭에 대한 회귀 검사이지 런타임·네트워크·DB 역할 수준의 완전한 보안 증명은 아니다.
- 아직 API executor는 레거시 RPC EXECUTE 권한을 소유한다. 강제 모드 활성화 전에 권한 전환 및 기존 OFF 호환성 정리가 필요하다.
- D3B2B: SQL 권한/SECURITY DEFINER/보안 실행 경로 실제 DB 검증과 철회 절차.
- D4: 독립 PostgreSQL 세션 경합·삭제·크래시 테스트. D5: 운영 감시 및 Production 별도 승인.
- 이 변경에서 외부 유료 API 호출, DB 권한 변경 및 Production ENFORCE 활성화는 없다.