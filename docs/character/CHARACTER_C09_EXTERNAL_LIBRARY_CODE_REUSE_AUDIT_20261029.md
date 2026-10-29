# 명하 C09 — 외부 9개 오픈소스 코드·라이선스·재사용성 대조 (2026-10-29)

> **상태: 조사·선별 완료 / 코드 도입 및 Production 적용 없음.** 본 문서는 [전 캐릭터 공통 명세 v1.1](./CHARACTER_CHATBOT_COMMON_SPEC_V1_1.md)의 기술 참고 9건을 실제 저장소 파일과 대조한 기록이다. 성능 수치는 각 프로젝트 주장이지 명하 실측이 아니다. 개발자가 외부 프로젝트에 문의하거나 유료 모델을 실행하지 않았다.

## 1. 조사 기준과 결론

- 기준 명하 `main` 커밋: [de6fcd0](https://github.com/gycha0109-beep/MyeongHa/tree/de6fcd0fb97ccdd1ab17bd4a251a9064186ff907).
- 기존 C09 연구 코드: [연구 PR #2575](https://github.com/gycha0109-beep/MyeongHa/pull/2575), **닫힘/미병합**. Character-first / Persona Composer는 연구용이며 main Production에 설치됐다고 간주하지 않는다.
- 기존 [장기 기억 조사](../character-memory-seyeon-c09-long-term-persona-memory-research-20261029.md)와 [지식 경계 조사](../character-memory-seyeon-c09-epistemic-knowledge-boundary-research-20261029.md)의 판단을 재사용한다.
- 조사 방식: 9개 GitHub 저장소의 README, 실제 코드 경로, LICENSE 유무와 명시 문구, 의존성, 기본 브랜치·최신 푸시 시점 확인. **실행·벤치마크·번들/의존성 설치는 하지 않았다.**
- **결론: 즉시 설치할 외부 라이브러리 0개.** 세연 C09 기존 경로에 *개념/검사 방식만 선별 적용*하고 서버 Authority·Grant·Revocation을 유지한다. 타 Python 에이전트 런타임으로 명하 TypeScript API를 교체하지 않는다.

## 2. 9개 저장소 상세 판정

| 프로젝트·고정 리비전 | 검증한 실제 파일 / 구조 | 라이선스 확인 | 명하 재사용 판정 |
|---|---|---|---|
| [KSKT](https://github.com/Sunrich-HT/KSKT/tree/18976327849c7350793d8fedff5558b760394ae5) | [`kskt/modeling_kskt.py`](https://github.com/Sunrich-HT/KSKT/blob/18976327849c7350793d8fedff5558b760394ae5/kskt/modeling_kskt.py): PyTorch Dual Stream Attention·Bipolar Reasoning·MoE, [`training/`](https://github.com/Sunrich-HT/KSKT/tree/18976327849c7350793d8fedff5558b760394ae5/kskt/training) | [LICENSE](https://github.com/Sunrich-HT/KSKT/blob/18976327849c7350793d8fedff5558b760394ae5/LICENSE) 파일은 Apache-2.0 명시, GitHub 자동 감지는 NOASSERTION | **코드 도입 제외**: OpenRouter의 GLM/Luna API에는 모델 가중치·attention 수정 접근 없음. 캐릭터 자기 관점 vs 사용자 요구라는 *판단 평가축*만 참고 |
| [ThinkPersona](https://github.com/Hualeez/ThinkPersona/tree/37ff59c9ede4432b53c44c695be96b2e0e33057d) | [`src/graph.py`](https://github.com/Hualeez/ThinkPersona/blob/37ff59c9ede4432b53c44c695be96b2e0e33057d/src/graph.py) Persona Graph의 node/edge; `src/thinkpersona_inference.py`, LLaMA-Factory/LoRA 훈련·Neo4j 도구 | [LICENSE MIT](https://github.com/Hualeez/ThinkPersona/blob/37ff59c9ede4432b53c44c695be96b2e0e33057d/LICENSE); README는 *research purposes*라 기술. 코드·외부 데이터 권리는 별도 구분 | **설계 참고**: 인물의 가치·경험·관계 인과 그래프를 근거로 결정한다는 접근 유효. 별도 학습·Neo4j 그래프 도입은 현 시점 불필요 |
| [PersonaForge](https://github.com/fQwQf/PersonaForge/tree/10363f65b9649ae258854568608da7add1d6cc98) | [`personality_model.py`](https://github.com/fQwQf/PersonaForge/blob/10363f65b9649ae258854568608da7add1d6cc98/personaforge/personality_model.py): CoreTraits/SpeakingStyle/DynamicState; [`dual_process_agent.py`](https://github.com/fQwQf/PersonaForge/blob/10363f65b9649ae258854568608da7add1d6cc98/personaforge/dual_process_agent.py): critical-turn 탐지→선별적 내적 판단→대사; [`dynamic_state_manager.py`](https://github.com/fQwQf/PersonaForge/blob/10363f65b9649ae258854568608da7add1d6cc98/personaforge/dynamic_state_manager.py): mood/energy/relationship 업데이트 | Apache-2.0 + [NOTICE](https://github.com/fQwQf/PersonaForge/blob/10363f65b9649ae258854568608da7add1d6cc98/NOTICE): BookWorld 유래 모듈 포함 | **최우선 구조 참고, 코드 직접 복사 보류**: 매 턴 추가 내적 독백 호출 대신 *중요 턴만 깊게 판단* 가설을 C09 Shadow에 비교. Python 동적 관계 갱신을 기존 서버 승인 없는 저장으로 옮기지 않음 |
| [BRIDGE](https://github.com/Sunrich-HT/BRIDGE/tree/2ee01c8d6d587cb0625f6fea8ebfd679b7e545f4) | [`bridge/modeling_bridge.py`](https://github.com/Sunrich-HT/BRIDGE/blob/2ee01c8d6d587cb0625f6fea8ebfd679b7e545f4/bridge/modeling_bridge.py) PyTorch hidden-state 제어·triangular refinement; [`bridge/memory.py`](https://github.com/Sunrich-HT/BRIDGE/blob/2ee01c8d6d587cb0625f6fea8ebfd679b7e545f4/bridge/memory.py) latent-tier memory | [LICENSE](https://github.com/Sunrich-HT/BRIDGE/blob/2ee01c8d6d587cb0625f6fea8ebfd679b7e545f4/LICENSE) Apache-2.0 명시, 자동 감지 NOASSERTION | **코드 도입 제외**: 모델 내부/학습 접근 필요. 장기 변화율·핵심 성격 드리프트 측정 개념만 참고. 수치적 latent memory와 명하의 권한 있는 사실 기록은 동일하지 않음 |
| [Concordia](https://github.com/google-deepmind/concordia/tree/71046c616e50430d47033f73ebee09af60b87667) | [`components/agent/concat_act_component.py`](https://github.com/google-deepmind/concordia/blob/71046c616e50430d47033f73ebee09af60b87667/concordia/components/agent/concat_act_component.py), observation/instructions/memory/plan 조립 및 agent/game-master simulation lifecycle | Apache-2.0 | **설계 참고**: 모듈별 주목·기억·판단·행동 책임 분리. 명하 `seyeon-runtime-context-v2.ts`와 C1 계약에 구조가 이미 있으므로 Concordia 런타임 전체 설치는 중복 |
| [TinyTroupe](https://github.com/microsoft/TinyTroupe/tree/7ce8be378a37ee73f9745d6781452712318afa04) | `tinytroupe/agent/tiny_person.py`, `tinytroupe/agent/memory.py`, [`validation/simulation_validator.py`](https://github.com/microsoft/TinyTroupe/blob/7ce8be378a37ee73f9745d6781452712318afa04/tinytroupe/validation/simulation_validator.py): 실험 결과의 정량·의미 검증 | [MIT](https://github.com/microsoft/TinyTroupe/blob/7ce8be378a37ee73f9745d6781452712318afa04/LICENSE); README의 실험적 사용 및 사용 제한 고지는 별도 확인 필요 | **평가 방식 참고**: 인물 간 상호작용 회귀, 표본 비교. 세계/인물 시뮬레이터 전체, Python/Jupyter 의존성 번들은 설치하지 않음 |
| [CoSER](https://github.com/Neph0s/CoSER/tree/624efc50db7be3a4e37cec6a1c58ed434dc9f2ce) | [`gca_evaluation/agent.py`](https://github.com/Neph0s/CoSER/blob/624efc50db7be3a4e37cec6a1c58ed434dc9f2ce/gca_evaluation/agent.py): RAG/FAISS+캐릭터 대사 평가. `chat.py`, `exp/` 예제 존재 | **저장소에서 LICENSE 파일/ GitHub SPDX 미확인**. 공개 코드·데이터셋이므로 자유 재사용 가능하다고 추정 금지 | **평가 개념만 참고, 소스·데이터 복사 제외**: 여러 장면에서 캐릭터성과 일관성 평가. 기존 인물의 원작 데이터·학습 모델을 명하에 직접 포함하지 않음 |
| [InCharacter](https://github.com/Neph0s/InCharacter/tree/f554202a94d4a83dc5407245bb18981899e872e6) | [`code/personality_tests.py`](https://github.com/Neph0s/InCharacter/blob/f554202a94d4a83dc5407245bb18981899e872e6/code/personality_tests.py): interview/assessment/test-retest, 설문 결과 비교 | [MIT](https://github.com/Neph0s/InCharacter/blob/f554202a94d4a83dc5407245bb18981899e872e6/LICENSE), 포함된 설문/외부 캐릭터 데이터 권리는 별도 확인 | **우선 평가 프로토콜 참고**: 같은 가치관·결함이 맥락/세션을 넘어 유지되는지 면접형 다중 턴 회귀를 C09 Gold에 추가. 평가점수만으로 사람다움 보장 금지 |
| [Graphiti](https://github.com/getzep/graphiti/tree/72b5c59c06607e09ea855be61b6ff5a3446fc951) | [`graphiti_core/graphiti.py`](https://github.com/getzep/graphiti/blob/72b5c59c06607e09ea855be61b6ff5a3446fc951/graphiti_core/graphiti.py) episode 추가·시간 지식 그래프, 드라이버별 그래프 연산·검색 | [Apache-2.0](https://github.com/getzep/graphiti/blob/72b5c59c06607e09ea855be61b6ff5a3446fc951/LICENSE); `pyproject.toml` Python ≥3.10, neo4j 기본 의존 | **기존 DB 먼저, 라이브러리 설치 보류**: valid/invalid time, source provenance, conflict/supersession을 기존 Event Ledger·Memory Grant·Postgres에 적용할 부분만 검토. 그래프 검색으로 인가 우회 금지 |

각 GitHub 저장소는 조사 당시 접근 가능하고 archived=false였다. 외부 커밋 시점은 레포마다 다르므로 **최근 인기/스타 수를 품질·안전성 증거로 사용하지 않는다**. KSKT·BRIDGE의 SPDX 자동 감지와 LICENSE 파일 문구 간 차이, CoSER의 LICENSE 부재를 그대로 기록했다.

## 3. 명하 기존 구현과 중복·부족 비교

| 필요 기능 | 현재 main의 확인된 코드/명세 | 외부 후보와 겹치는 부분 | 결론 / 실제 갭 |
|---|---|---|---|
| 인격 불변·버전 | [`SEYEON_CORE_ANCHOR_V2`](../../packages/character-content/src/seyeon-authored-projection-v2.ts), [공통 명세](./CHARACTER_CHATBOT_COMMON_SPEC_V1_1.md), [Runtime Standard](./CHARACTER_RUNTIME_STANDARD_V1.md) | PersonaForge CoreTraits, BRIDGE personality tier | **별도 CoreTraits DB/모델 추가 불필요.** 실제 Character 판단에 고정 Core가 원인으로 작동하는지 검증·연결 부족 |
| 현재 상황·허용된 기억 Context | [`assembleSeyeonRuntimeContextV2`](../../packages/domain/src/seyeon-runtime-context-v2.ts), [Integrity](../../packages/domain/src/character-integrity-gate-v1.ts), [Disclosure](../../packages/domain/src/character-disclosure-gate-v2.ts) | Concordia 관찰/기억 컴포넌트, ThinkPersona Graph | **모델에 새 자료를 무조건 더 주지 않는다.** source·접근권한이 확인된 사실만 Context에 조립 |
| 관계/사건 이력 | [`seyeon-event-ledger-v2.ts`](../../packages/domain/src/seyeon-event-ledger-v2.ts) (해당 V2는 experimental), [Production relationship bridge](../../packages/domain/src/seyeon-production-relationship-bridge-v1.ts) | Graphiti temporal graph, PersonaForge relationship map | **별도 자동 관계 mutation 금지.** 공식 ledger/Projection의 현재 상태와 Shadow의 차이를 유지 |
| 사용자 승인 기억 | [`seyeon-conversation-recall-memory-contract-v1.ts`](../../apps/api/src/seyeon-conversation-recall-memory-contract-v1.ts), [Production memory fetch](../../apps/api/src/production-seyeon-first-memory-fetch-runtime-v1.ts) | Graphiti, ThinkPersona·Concordia 메모리 | **Graph DB 바로 도입 불필요.** approved memory / 원본 grant / revoke / 권한 있는 조회를 우선 재사용 |
| 인물의 능동적 판단 | [C09 연구 PR #2575](https://github.com/gycha0109-beep/MyeongHa/pull/2575)의 Character-first Composer / Persona Profile; **main에는 C09 소스 미반영** | PersonaForge dual-process, KSKT self-other, Concordia components | **최대 실제 갭.** 안정적 정체성 + 허용된 상태 → 자기 욕구/사용자 요구 구분 → 판단/대사 생성 연결. 매 상황 고정 답안표로 대체 금지 |
| 지식 학습·전문성 | [인지·지식 경계 연구](../character-memory-seyeon-c09-epistemic-knowledge-boundary-research-20261029.md) (PROPOSED IMPLEMENTATION) | ThinkPersona Graph, Graphiti episode/version | **설계만 존재.** 명시적 unaware와 미설정(일상 상식), user_taught_verified와 private memory 분리, 승인/증빙/레벨·시점 처리 구현 필요 |
| 실제 인격 평가 | [15문항 C09 결과](https://github.com/gycha0109-beep/MyeongHa/blob/4c8f3474d8e855493d08138917fe892468cd1775/docs/character-memory-seyeon-c09-15x3-generative-comparison-results-20261026.md), [3종 GLM/Luna/MiniMax](https://github.com/gycha0109-beep/MyeongHa/blob/4c8f3474d8e855493d08138917fe892468cd1775/docs/character-memory-seyeon-c09-three-model-live-comparison-20261027.md) | InCharacter, TinyTroupe, CoSER | 단발 5/15문항을 넘는 **다중 턴·세션 간/사용자 간 테스트** 부족. 선행 라이브러리 점수와 명하 실제 결과 혼합 금지 |

## 4. 선별 결정과 실제 다음 구현 순서

### A. 우선 차용할 **설계·검사 방식** (별도 라이브러리 설치 없음)

1. **C09 Character Decision 경로**: PersonaForge의 *선별적 숙고*와 Concordia의 *구성요소 책임 분리*를 기존 [Runtime Context V2](../../packages/domain/src/seyeon-runtime-context-v2.ts) + C09 Shadow 인물 판단 경로에 맞춰 사용한다. 외부 Python `DualProcessAgent` 복사 금지. **간단한 턴/중요한 턴**의 선택 기준은 새 모델 호출 전에 기존 서버 인가·비용 계약과 충돌하지 않는지 확인한다.
2. **사용자 학습·기억**: Graphiti의 valid/invalid time, provenance, supersession 모델을 **기존 Postgres·Event Ledger·Grant 체계에 대조**한다. Graphiti 전체 서버/Neo4j는 도입하지 않는다. 캐릭터가 배운 전문 지식·승인 사실·사적 기억·Canonical 사실을 서로 다른 authority로 유지한다.
3. **실제 인격 품질 회귀**: InCharacter 면접/재질문, TinyTroupe의 관찰·통계 평가 관점, CoSER의 맥락별 인물 행동 평가를 **명하 자체 합성 Gold 시나리오**에 적용한다. 원 저작물 캐릭터 데이터나 외부 테스트 문항을 무단 복사하지 않는다.

### B. 현재 범위 밖

- **KSKT, BRIDGE 모델 가중치/hidden state 패치:** OpenRouter·Responses API의 상용 원격 모델 경로에서 직접 적용 불가.
- **ThinkPersona 전체 Neo4j+fine-tuning 파이프라인:** 기존 Character Authority/DB와 중복, 학습 비용이 제품 목표에 맞는다는 증거 없음.
- **Concordia/TinyTroupe 전체 에이전트 시뮬레이션 런타임:** 명하 API/World Authority를 대체하지 않음.
- **CoSER 소스/데이터 원문 복사:** 저장소 라이선스 미확인, 평가 참조만 허용.
- **Graphiti 즉시 설치:** 그래프 인프라, 별도 자동 저장·검색 경로의 ACL/Revocation 일관성 보장 없음.
- **추가 유료 GLM/Luna/MiniMax 실험:** 기존 승인 범위를 확장하지 않는다.

## 5. 확인 방법과 종료 조건

- 구현 착수 전: 기존 C1 Bible/Runtime, current main, C09 Shadow 간 권한·책임 연결점만 비교. 없는 자료를 새 Canon/DB 사실로 만들지 않는다.
- 인물 판단 첫 Shadow: 동일 공개 첫 턴에서 세연의 **자기 관점 vs 사용자 요구**가 매핑표·무조건 동조·허위 사건 없이 다르게 작동하는지; 정상 사용자 질문은 답을 회피하지 않는지 확인.
- 지식 학습: **Python unaware → 사용자 설명(그 턴만) → 검증/공유 승인 → 초급 재사용 → 다른 사용자에게 사적 출처 비노출**을 같은 캐릭터/다른 캐릭터/철회 뒤 상황에 걸쳐 확인.
- 장기 회귀: 5/15개 단발 질문을 넘어 선택된 상태·관계·기억이 실제 이력에서 왔는지, Core가 바뀌지 않았는지, 거짓 공동 기억/관계 주장과 과도한 전문지식이 배제되는지 비교.
- 합격을 의미하지 않는 증거: README의 논문 수치, LICENSE 존재, TypeScript compile, 모델 API 200, 단발 구조 검사 PASS. 반드시 캐릭터 품질/권한/기억/비용을 각각 구분한다.

## 6. 결정의 범위

**결정:** 현 시점에는 외부 Python 코드·DB·모델 의존성을 설치하지 않고, 이미 존재하는 C1/C09 권한 체계 위에서 *세연의 판단 인과성*과 *검증된 학습 상태*를 우선 구현한다. 

**미검증:** 각 외부 오픈소스의 명하 환경에서 실행 결과, 재학습 효과, 실서비스 비용, 유료 모델 품질, 상용 환경의 법률적 적합성. 이 문서는 새로운 모델/DB/권한/결제 정책의 승인이 아니며 후속 런타임 구현 완료 보고가 아니다.
