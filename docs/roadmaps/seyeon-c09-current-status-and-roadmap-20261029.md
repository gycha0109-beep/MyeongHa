# 세연 C09 최신 구현 현황 및 로드맵 — main 동기화 (2026-10-29)

> 기준: C09 연구 PR [#2575](https://github.com/gycha0109-beep/MyeongHa/pull/2575)의 고정 HEAD `4c8f3474d8e855493d08138917fe892468cd1775`와 2026-10-26~27 실제 모델 평가. 이 문서는 **main에 연구 결과와 다음 구현 위치를 명시**하는 문서이며 연구 Shadow 코드를 Production에 승격하거나 병합하는 작업이 아니다.

## 1. 기존 기술 전략 정정

이전 C08 Terra/Luna의 5회↔3회 호출 최적화는 역사적 비용/안전성 근거다. **현재 세연 캐릭터 품질 연구의 기준은 C09**이며, 모델을 바꾸는 것만으로 세연의 인격·지속적 판단·기억을 구현했다고 보지 않는다.

세연을 '세연 흉내를 내는 AI'가 아니라 지속적인 인물로 구현하는 핵심 과제는 **Character Canon / Persona / Behavior → 서버가 검증한 현재 Context·State → Character Decision / Planner → Renderer → 기존 Authority/Integrity/Disclosure/Memory/Saju Guard → 승인된 Commit/Reveal**의 실제 연결이다. C1 설계의 책임 분리를 따르되, 매 상황의 정답 대사나 행동을 고정하지 않는다.

## 2. OpenRouter 3종 실측 결과 (2026-10-27)

동일한 공개 초면 상황, 원문 질문 Q1·Q2·Q5·Q7·Q10, temperature=0.65, max_tokens=900. 각 모델 5회씩 실제 호출.

| 모델 | OpenRouter ID | 정상 완료 | 중앙 응답 지연 | 5회 기록 비용 USD | 잠정 판단 |
|---|---|---:|---:|---:|---|
| GLM 5.3 Flash | `z-ai/glm-5.3-flash` | 5/5 | 358ms | 0.000532264255 | **독립적인 의견·주도성에서 1차 우선 후보** |
| GPT-6 Luna | `openai/gpt-6-luna` | 5/5 | 345ms | 0.0004004 | 형식 안정적, 서비스형 응대 잔존 |
| MiniMax M2-her | `minimax/minimax-m2-her` | 2/5 | 648ms | 0.0041151 | 3/5 출력 한도, 지문 출력, 기억 경계 불충분: 동일 조건 비권장 |

비용은 API 로그의 **기록 비용**이지 청구액이 아니다. 지연은 연구 호출의 측정값이지 end-to-end 서비스 응답 시간은 아니다. 5개 단발 응답은 다중 턴 관계·장기 기억·Production 보안의 합격 근거가 아니다.

근거: [3종 비교 문서](https://github.com/gycha0109-beep/MyeongHa/blob/4c8f3474d8e855493d08138917fe892468cd1775/docs/character-memory-seyeon-c09-three-model-live-comparison-20261027.md), [15개 원본 JSON](https://github.com/gycha0109-beep/MyeongHa/blob/4c8f3474d8e855493d08138917fe892468cd1775/docs/experiments/seyeon-c09-three-model-minimax-luna-glm-five-20261027-raw-v1.json).

## 3. 실제 C09 구현·실험 상태

- A/B/C: GPT-4.1 mini 기반 동일 15문항 × 3프로필 = 45개 유효 생성. A 구조 검사 15/15였지만 가짜 공동 기억을 인정. B/C 구조 검사 각각 0/15, 공개 참고 ID와 disclosure 권한 필드 혼동·허용되지 않은 행동이 주요 원인.
- D balanced: 15/15 생성, 12/15 선별 통과 및 12건 실제 독립 의미 검토 수행. `approach` 13/15 편중, 무조건 동조·문맥 이탈 등 남아 **NO-GO**.
- C09 Character-first Shadow: 고정 상황→행동 매핑 없이 인물 특성·결함·가치관을 기반으로 모델이 주목·욕구·긴장·행동·대사를 생성하는 경로 구현. 오프라인 테스트 완료, **실제 운영 미연결·유료 품질 미입증**.
- C09 Persona Composer: `core`, `core_examples`, `core_focus` 프로필 구성. 기존 Runtime V2 slice selection을 대체하는 새 인가 엔진이 아니며 실제 라우팅/권한 연결은 미완료.
- GLM/Luna/MiniMax의 **동일 개선형 프롬프트 비교 매트릭스**는 오프라인 생성 완료, 신규 유료 모델 호출은 0건. 개선형 3종이 실측 완료됐다고 해석하면 안 된다.
- 연구 PR #2575는 **미병합/닫힘**. 연구 결과가 main Production에 적용됐다고 주장하지 않는다.

근거: [C09 아키텍처 진단](https://github.com/gycha0109-beep/MyeongHa/blob/4c8f3474d8e855493d08138917fe892468cd1775/docs/character-memory-seyeon-c09-persona-runtime-architecture-diagnosis-decision-20261026.md), [A/B/C 결과](https://github.com/gycha0109-beep/MyeongHa/blob/4c8f3474d8e855493d08138917fe892468cd1775/docs/character-memory-seyeon-c09-15x3-generative-comparison-results-20261026.md), [D 결과](https://github.com/gycha0109-beep/MyeongHa/blob/4c8f3474d8e855493d08138917fe892468cd1775/docs/character-memory-seyeon-c09-balanced-paid-retest-results-20261026.md).

## 4. 제품·데이터 경계

- 초기 출시: 사주 상담 중심 진입 + 세연 자유 대화. 개발은 세연 1인 완성도를 우선하고 기존 출시 캐릭터 수의 별도 확정 사항을 자동 변경하지 않는다.
- 주도성: 응답형 → 대화 중 자발적 주도 → 별도 정책·승인 하의 선제 메시지 순.
- 세연의 세계관·개인사·공개 가능한 일상은 Character Canon/Disclosure가 소유. 확인되지 않은 '오늘 한 일', 공유 기억, 관계, 연애 사건을 모델이 임의 확정하지 않는다.
- 사용자에게 배운 사실은 기존 Memory Proposal / 승인 / Grant / Provenance / Revocation 정책에 따라 저장·재사용한다. 사용자 발언을 즉시 영구 Canon으로 승격하지 않는다.
- 사주 의미·계산·공식 Reading은 Saju Engine과 기존 Entitlement/Reader Knowledge 권한이 소유한다. 캐릭터는 허용된 의미의 표현·순서·반응만 담당한다.
- 결제/채팅 크레딧은 기존 확정된 Commerce 트랙을 재사용한다. 본 문서에서 새로운 결제 정책이나 DB 권한을 만들지 않는다.

## 5. 다음 구현 순서 (기존 C09/C1에 맞춘 우선순위)

1. **연구/운영 차이 확인:** main의 현행 세연 Production 경로, C09 Shadow 코드, Bible/Runtime Draft, Authored Projection의 실제 연결점·불일치 확인. C09 연구를 통째로 병합하지 않는다.
2. **세연 상태·판단 인과 연결:** 기존 Canon/Persona/Behavior와 서버가 허용한 현재 장면·세션·관계·기억을 Character Working State에 연결. 턴 한정 감정/욕구와 증거 기반 지속 상태를 분리.
3. **자율적 선택 + 자연스러운 표현:** 상황→행동 고정표 없이 Decision/Planner가 선택하고 Renderer가 말하도록 연결. 기존 Interpretation/Action/Disclosure/Meaning Review/Reveal Guard는 유지.
4. **사용자 학습·기억 연속성:** 기존 Memory Proposal 및 승인·취소·접근 Grant를 대화 맥락과 연결. 가짜 공유 기억, 위조 대화 기록, 허위 관계 전제는 사실로 수용하지 않음.
5. **품질 비교:** GLM 우선 후보, Luna 비교군, MiniMax 비권장 근거를 유지. 먼저 기존 15문항·다중 턴 오프라인 회귀를 활용하고, 추가 유료 모델 비교는 별도 승인 조건을 따른다.
6. **운영 승격:** 실제 서비스 경로의 권한·사주·기억·크레딧·비용·지연을 확인한 뒤 운영 모델/프롬프트 전환 여부 결정. Shadow 성공을 Production 합격으로 대체하지 않는다.

## 6. 작업 상태

- **완료된 근거:** 2026-10-26~27 C09 모델 비교, A/B/C/D 실패 분석, 연구용 Character-first 및 Persona Composer Shadow, 오프라인 평가 자산.
- **미완료:** 최신 C09 연구와 Production 경로의 정합한 통합, 장기 인물 상태·기억 학습, 운영 수준 다중 턴 품질 및 비용 확인.
- **주의:** 연구 PR #2575의 병합 여부와 Production 활성화는 이 문서만으로 변경되지 않는다.
