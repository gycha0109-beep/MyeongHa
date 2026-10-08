# 세연 실제 API 대화 경로 5회·3회 비교 — 격리 실측 v1

Watchtower-Track: character-memory

- 대상: `scripts/seyeon-model-eval-cases-v1.mjs` 중 공개 일상 대화 8건(N01–N06, N09–N10). 사용자 계정/실제 세션/DB/비공개 Canon/관계 메모리는 사용하지 않는다.
- 기존: Terra 2개 병렬 분류 + Terra 의도 해석 + Terra 렌더러 + Terra 의미 검증. 합계 **성공 시 5회**.
- 후보: Luna 통합 사전 분류 + Terra 해석/대사 결합 Shadow + Terra 독립 의미 검증. 합계 **성공 시 3회**.
- 기존 런타임 `runSeyeonCharacterTurnV2`와 후보 `createSeyeonUnifiedGovernanceCandidateV1`, `createSeyeonFastDialogueShadowV1`을 동일한 공개 컨텍스트 및 서버 가드로 비교한다.
- 출력 원문, 사용자 정보, Character 비밀, API 키는 로그/증거 아티팩트에 포함하지 않는다. 합성 사례 ID·통과/실패·단계·토큰·지연·예상비용만 기록한다.
- API calls 최대 64회, repository-estimated cost $3.00 상한, 모델 재시도 0. 양쪽 순서를 번갈아 수행한다.
- 모델 배치가 다르므로 총 지연/비용 차이를 순수하게 호출 통합 효과로 귀속해서는 안 된다. 단일 실행 8건의 표본 오차와 외부 모델 변동성도 명시한다.
- 독립 의미 검증 승인 여부는 품질의 **최소 자동화 안전 게이트**이며, 자연스러운 세연 캐릭터/다중 턴/전체 권한 안정성을 입증하지 않는다.
- PASS는 8/8 양쪽 경로의 자동 검증 통과를 뜻할 뿐 라이브 전환 승인으로 취급하지 않는다. 하나라도 거부 시 평가 HOLD 및 Production 경로 변경 금지.
- 보호된 production `OPENAI_API_KEY`는 `main` push sentinel 경로에서만 사용한다. 불신 PR 코드에서 키를 실행하지 않는다.
- 기존 Production turn-send/model routing/Canon/Memory/Commerce/Saju/DB/migration은 수정하지 않는다.
