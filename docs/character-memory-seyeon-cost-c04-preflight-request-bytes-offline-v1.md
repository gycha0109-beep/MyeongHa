# COST-04 — 첫 인사 Preflight 2회→1회 실제 요청 크기 감사

Watchtower-Track: character-memory. 상태: **무과금 CI 후보 / 실제 모델·운영 HOLD**.

`test/seyeon-cost-c04-preflight-request-bytes-offline-v1.test.ts`는 공개 합성 인사 두 종류를 기존 독립 Integrity+Disclosure 모델 요청 2개와 통합 Shadow Preflight 요청 1개에 전달한다. 실제 `createOpenAiSeyeonStructuredProviderV1`이 직렬화한 최종 JSON을 **네트워크 대신 fake fetch**로 받아 정확한 UTF-8 바이트 길이와 단계별 instructions/input/schema 크기를 측정한다. 응답은 고정한 합성 라벨만 반환하고 실제 Resolver/Guard는 적용한다.

- 기록: `SEYEON_C04_OFFLINE_PREFLIGHT_UTF8_BYTES` CI 로그에서 케이스 별 단계·모델·요청 크기 숫자만 제공. 비밀키/생성 원문/개인기록 저장 없음.
- 비교 가능한 범위: 기존 5회 경로의 **사전 분류 2회** vs 3회 후보 경로의 **통합 사전 분류 1회**. 해석/대사/검증의 추가 3/2회 요청이 포함되지 않으므로 전체 대화 비용 감소로 보고하지 않는다.
- UTF-8 바이트는 사용량 토큰, 캐시 적중, 출력/추론 토큰, 실청구, 캐릭터 자연스러움의 대체물이 아니다. 통합 classifier의 실제 오탐/누락률 역시 이 테스트로 알 수 없다.
- 네트워크·유료 모델 0회, Production routing/Canon/DB/ACL 변경 없음. Secret `OPENAI_API_KEY2`를 호출하지 않으며 잠금은 유지한다.
