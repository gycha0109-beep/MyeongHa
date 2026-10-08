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

## 실측 v1 HOLD와 후보 v2 진단
- 1차 실측: 기준 6/8 승인(P50 11256ms), 후보 4/8 승인(P50 8809ms), 총 60호출, 추정 $0.289025. 기준 N03/N09 의미 검증 거부; 후보 N03/N05/N06/N09 최종 의미 검증 전 거부(당시 오류 범주 미분화).
- v2 Shadow에는 고정 단계 코드만 추가하여 Interpretation/Causality/Renderer/Semantic 거부를 구분한다. 프롬프트에 공개 첫 만남의 필수 턴별 행동과 출력 어휘·공개 심도를 명확히 고정한다.
- 합성 평가 수 8, 모델 배치, 예산·토큰·속도 측정 방식은 이전과 동일. 운영 상태는 변경하지 않음.

## v2 실측 및 v3 확장 (2026-10-09)
- v2 실측: 기존 7/8 승인(N06 의미 검증 HOLD), 후보 8/8 승인(후보 거부 0), 기존 P50 11,080ms / P95 16,468ms, 후보 P50 11,179ms / P95 15,565ms. 기존 추정 $0.186241, 후보 $0.145591. 전체 양쪽 완전 PASS 조건은 만족하지 않아 HOLD. 증거: Actions run 37820807931.
- v3는 동일한 공개 첫 만남·합성 입력 영역에서 기존 8건 + 원래 합성 gold의 N19/N22 + 평가 전용 X01–X06을 추가한 **16건**을 1회 비교한다. 기존 classifier gold set은 수정하지 않는다.
- 모델 배치, 비로그 정책, Production 분리 원칙, strict 전체 HOLD 규칙은 변하지 않는다. 각 경로별 gateVerdict를 추가해 후보 100% 통과와 기존 경로의 독립적 변동을 구분한다. 경로별 PASS가 Production 또는 Character 품질 PASS를 의미하지 않는다.
- 호출 상한 128회, repository 예상 비용 상한 $3.00, 재시도 0, 순서 교차, 보호된 main 트리거 fire-2026-10-09-real-path-v3.
- 이 평가는 아직 다중 턴·장기 기억·관계 변화·실제 캐릭터 자연스러움 평가가 아니다. 운영 경로 승격 HOLD.
