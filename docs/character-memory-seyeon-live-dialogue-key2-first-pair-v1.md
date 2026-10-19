# KEY2 실제 대화 E2E 5회↔3회 첫 쌍대 비교 (2026-10-19)

Watchtower-Track: character-memory

- 사용자가 분류기만 계속 시험하는 상황을 문제 삼아, 실제 세연 공개 첫 인사 `N01: 안녕, 세연아!` 한 건을 **기존 5회 경로와 후보 3회 경로 각각 한 번씩** 실제 모델에 전달한다.
- 실제 서버 `runSeyeonCharacterTurnV2`와 `runSeyeonCensusFirstThreeCallShadowV1`를 사용. Legacy Terra x5, Candidate Luna x1 + Terra x2. 전체 외부 provider 최대 **8회**, 자동 재시도 0.
- GitHub `OPENAI_API_KEY2`만 사용하고, 새 workflow 첫 1회 `push/main`의 고정 commit SHA로 실행. 뒤늦은 다른 트랙 main push는 무시한다. 2026-10-19 이전 KEY2 Gold 실측의 첫 2회 및 첫 불일치 중지 이력은 보존하며 재실행하지 않는다.
- 요청당 선예약 $0.08(환율 2500원/USD 기준 200원), 전체 예약 최대 **$0.64=1,600원**, 호출 건당 최대 24,576 Bytes / 1,536 output tokens. 실제 사용액은 제공 사용량 기반 추정, 실제 청구/공급자 하드캡 확인 아님. 사용자 사전 추가 유료 평가 5,000원 누적 한도 아래 별도 실측.
- 순서대로 한 실측 사례를 진행하고, 단계 위반/출처/Guard 거부/미확인 usage/모델 실패 시 즉시 중단. 원래 legacy의 2개 preflight는 병렬이므로 2건 동시 발송 가능. 후속 retry 없음.
- 개인정보·실제 채팅 데이터·보호 Canon/Memory/ACL/RLS/프로덕션 호출은 포함하지 않는다. 응답 본문과 비공개 키는 CI 로그나 Artifact에 저장하지 않는다. 케이스별 단계/성공·실패/토큰/시간/비용만 남긴다.
- 이 실험의 PASS는 공개 첫 인사 1건의 기존/후보 Guard 통과라는 좁은 의미. 자연스러움 사람 평가·장기기억·Production 적격성이나 72개 Gold 완성 증명은 아니다. G0~G6 HOLD 유지.
