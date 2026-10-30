# 세연 C09 캐릭터 인지·지식 경계 및 사용자 학습 연구 (2026-10-29)

> 상태: RESEARCH / PROPOSED IMPLEMENTATION. DB migration, API 변경, Production 배포, 유료 실험 없음.
> 질문: LLM은 이미 Python 문법을 알지만 '세연은 Python을 모른다'고 설정한 경우, 지식 누출을 억제하고 다른 유저에게 배운 만큼만 말하게 할 수 있는가?
> 선행 자료: [장기 인격·기억 일관성 연구](./character-memory-seyeon-c09-long-term-persona-memory-research-20261029.md)

## 1. 정확한 문제

언어 모델이 학습 과정에서 가진 parametric knowledge는 캐릭터 개인의 지식 이력과 같지 않다. 사용자/개발자가 prompt에 '세연은 모른다'고 쓰는 것만으로 내부 모델의 Python 지식이 사라지지 않는다. 따라서 **모델의 파라미터를 지운다**가 아니라 **캐릭터가 무엇을 알고 있다고 주장·설명·실행할 수 있는지를 서버가 결정한다**는 응답 경계 정책이 필요하다.

그러나 모든 상식에 '증빙 DB 항목이 없으면 모른다'를 적용하면 캐릭터가 자연스럽게 대화하지 못한다. 다음 경계를 구별해야 한다.

1. **일상적 배경 지식**: 캐릭터의 연령·세계관·배경에서 당연히 알고 있다고 볼 수 있는 언어/상식. 빈 지식 DB 때문에 일괄 거부하지 않음.
2. **명시적 제한 지식/전문 역량**: 캐릭터 설정이 모른다고 한 영역(예: Python 작성 능력). 해당 역량은 이력과 학습 단계로 제어.
3. **Character Canon / 오픈월드 자기 사실**: Runtime Standard 4A/4B 규칙에 따라 확정된 설정, 저영향 취향의 생성 권한, author-only 영역을 구분.
4. **세계관 및 타 캐릭터의 정보**: 관찰·공개/인가 범위를 벗어나면 retrieval 자체에서 차단.
5. **개인정보/사주/사적 사건**: 기존 subject, Memory Proposal/Grant/Revocation, Reader Knowledge 권한과 Entitlement가 먼저 적용.

중요: '그 주제를 처음 듣는다'는 강한 설정과 '자세한 건 모르지만 이름은 들어봤다'는 약한 설정을 구분한다. 앱이 지식 세목을 전부 열거해야 한다는 뜻이 아니다.

## 2. 외부 기술 조사: 무엇이 실제로 입증되었는가?

| 자료 | 연구/코드의 실제 내용 | 명하 적용 판단/한계 |
|---|---|---|
| [The Curse of Knowledge in Role-Playing Language Models (2026-10)](https://arxiv.org/abs/2610.17327) · [연구 설명](https://1npc.github.io/blog/2026/curse-of-knowledge-in-role-play/) | 등장인물이 듣지 못하거나 이해할 수 없는 발언을 모델이 활용하는 누출을 측정. 캐릭터에 보일 observation만 서버에서 구성하면 해당 평가에서 누출이 크게 줄어듦 | **세계관/비밀/상황의 입력 차단을 강하게 지지**. 단, Python처럼 모델 자체가 이미 아는 일반 지식의 완전 차단까지 입증하는 것은 아님 |
| [CHARM, EMNLP 2026](https://aclanthology.org/2026.findings-emnlp.460/) | Boundary Awareness(알면 안 된다고 인지)와 Boundary Compliance(실제로 답을 억제)를 분리. 실패는 종종 후자에서 발생 | preflight만으로 충분하지 않다. 실제 응답을 별도 평가해야 함 |
| [RoleFact, EMNLP 2024](https://aclanthology.org/2024.findings-emnlp.846/) · [GitHub](https://github.com/NafisSadeq/rolefact) | 모델 사전지식 영향을 calibration threshold로 조절하는 논문. SGR 데이터셋 제공 | 논문 설계 참고. GitHub README의 핵심 RoleFact 실행 코드는 'Coming soon': drop-in 라이브러리로 취급 금지 |
| [RoleRef](https://github.com/LiuAmber/RoleRef) · [논문](https://arxiv.org/abs/2409.16913) | 충돌 요청에 대한 거절 성능을 model representation editing으로 개선. 실제 GPU/transformers 코드 공개 | **오픈 웨이트 모델** 연구 옵션. 현재 OpenRouter 등 폐쇄 API 호출 경로에 직접 적용할 수 없음 |
| [Dynamic Attention Gating (EMNLP 2026)](https://aclanthology.org/2026.emnlp-main.545/) | FFN neuron gating을 학습해 out-of-boundary 출력을 줄이는 연구 | 모델 내부 접근/학습이 필요한 고비용 후보. 공개 배포 가능한 구현 코드는 이 조사에서 확인하지 못함 |
| [RoleRAG](https://arxiv.org/abs/2505.18541) | structured knowledge graph의 entity disambiguation + boundary-aware retrieval | 출처·시점·독자 접근권한이 있는 retrieval에 참고. 논문이 직접 설치 가능한 명하 통합 코드를 제공한다는 근거는 확인하지 못함 |
| [LLMwiki4rolePlay](https://github.com/Drifting12345/LLMwiki4rolePlay) | character별로 읽을 수 있는 위키 내용의 범위를 entity-context에서 강제. 책 지식 vault와 대화 메모리 vault를 분리 | **server-side character view와 격리** 참고. 파일/Claude Code 중심 구조를 명하 Production에 복사하지 않음 |
| [TimeChara](https://github.com/ahnjaewoo/timechara) · [HF 데이터셋](https://huggingface.co/datasets/ahnpersie/timechara) | 캐릭터가 해당 시점에는 알 수 없는 미래 사건을 말하는지 평가 | before/after 학습 시점 회귀 구성에 적합 |
| [WikiRoleEval / Ditto](https://github.com/OFA-Sys/Ditto) | role identity, role-related knowledge, unknown-question rejection을 분리 평가 | '다 모른다'로 대응하는 과도한 거절과 누출을 함께 측정 |
| [Ragas Faithfulness](https://github.com/vibrantlabsai/ragas) · [AlignScore](https://github.com/factiverse/alignscore) | 주어진 증거에 대한 답변 claim-level 정합성 평가 | 근거가 있는 주장 점검에 유용. 자유로운 일상 대화를 전부 evidence-only로 제한하면 캐릭터성 저하 |
| [DeepEval](https://github.com/confident-ai/deepeval) | Role Adherence와 Knowledge Retention 별도 지표 | knowledge gate 전후 다중 턴 회귀 측정 |

## 3. 가장 중요한 결론: 캐릭터 인지 상태는 모델 밖에서 선언한다

**Model knowledge != Character epistemic state != Disclosure permission != Response action**

- 모델은 Python 코드 작성 능력을 가지고 있을 수 있다.
- 세연의 현재 지식 상태는 'Python이라는 말을 아직 모름'일 수 있다.
- 세연이 그 주제를 배웠더라도 다른 유저의 개인정보는 말할 수 없다.
- 배운 내용을 반드시 그 즉시 설명해야 하는 것은 아니다. 세연의 자발적 반응·흥미·성격은 유지한다.

캐릭터를 모르는 척하게 하는 자문 프롬프트 하나로 해결하지 않는다. **인풋 공개 범위 + 서버의 지식/역량 결정 + 응답검사**를 함께 사용한다.

### 구분된 지식 표현 (설계 후보)

- subject: character_id
- topic_key: 예) python.programming
- awareness: unaware / heard_of / basic / practiced / proficient
- domain_policy: ambient / bounded / authority_only
- evidence_ids: 검증 가능한 수업/교류/외부 정보 근거의 ID
- source_kind: canon / approved_character_fact / user_taught_verified / public_verified / experience
- learned_at, valid_at, superseded_at: 시간 이력
- visibility: character_shared / user_private / reader_authorized
- scope: 본질적으로 실제 DB access control로 보장할 것

이는 **논리적 projection 예시**이며 migration-ready 테이블 정의가 아니다. DB v0.6의 59개 카탈로그를 임의 수정하거나 새 테이블 생성을 확정하지 않는다.

'모르는 지식'의 빈 값은 항상 unaware가 아니다. **explicit_unaware는 명시적 제약**이고, 기록이 없으면 baseline/domain 정책을 참조한다.

## 4. 추천 런타임 처리: 캐릭터 능력/지식 경계

A. **Query/Claim Parser**: 유저 질문을 토픽·요청 행위·캐릭터 주장/타인정보/학습 제안으로 분류. 개인정보는 기존 Integrity/Access Gate에서 먼저 판정.
B. **Epistemic Resolver**: 현재 캐릭터의 기본 배경 지식, explicit 제한, 학습 ledger, 사용자/세계 권한, 시점을 확인해 allowed / partial / unknown / withheld 결정.
C. **Character Working View**: 그 캐릭터가 볼 수 있는 fact/episode만 제공. 다른 캐릭터의 비공개 정보나 미인가 Reading은 모델 입력에서 제거한다.
D. **Decision/Planner**: '모른다', '배우고 싶다', '설명한다', '묻는다', '주제를 바꾼다' 중 캐릭터다운 행동을 스스로 선택. 고정 응답표가 아님.
E. **Renderer**: 선택된 행동을 세연 말투로 생성. 전문 영역 claim에는 해당 토픽/레벨/증거 ID를 별도 메타데이터로 요청할 수 있음.
F. **Guard**: 금지된 전문 지식·거짓된 과거 학습 주장·보호된 사실·가짜 shared event 등을 판정. 필요한 경우 부분 재생성 / 질문으로 후퇴. 검증기는 확률적이므로 완벽 보장 주장 금지.
G. **Commit**: 사용자 학습 제안은 서버의 검증·공유범위·provenance 게이트 통과 후, 캐릭터 공통 지식 또는 유저별 개인 기억으로 각각 기록. 그 외에는 단기 대화 문맥만 갱신.

추론용 개념 계약:

    KnowledgeDecision {
      topicKey,
      sourceScope,
      characterKnowledgeLevel,
      responsePermission: 'normal' | 'partial' | 'learn' | 'withhold',
      allowedEvidenceIds,
      prohibitedClaimKinds,
      asOfTurn,
    }

중요: 모델에 지식 원문을 숨겨도 LLM 파라미터 안의 Python 지식이 없어지는 것은 아니다. Guard가 모든 자연어 문장의 숨은 지식을 완벽하게 검출하지도 못한다. **따라서 목표는 제품에서 관찰되는 캐릭터 수준의 지식 경계 준수**이며, 강한 기계적 보장이 필요한 영역은 응답 자체를 서버에서 한정하거나 격리된 별도 도구 경로로 제공한다.

## 5. Python 학습 시나리오 — 사용자 간 지식 공유

**초기 확정 조건: 세연의 'python.programming' 인지도 = unaware**

| 단계 | A와 세연 / B와 세연 | 서버 상태 | 기대 행동 |
|---|---|---|---|
| T0 | B: 'Python으로 반복문 짜줘' | unaware | 능숙한 코드를 생성하지 않고, 모르겠다고 말하거나 배움을 요청 |
| T1 | A: '파이썬은 프로그래밍 언어야' | 현재 턴에는 user assertion | 세연이 '아, 컴퓨터 언어구나'라고 이해했다고 반응 가능. 영구 사실 승격 아님 |
| T2 | 검증 가능하고 재사용 허용된 설명을 서버가 승인 | heard_of + 해당 개념 지식 | 이후 B에게 '프로그래밍 언어'라고 설명할 수 있음. 코딩 숙련도가 자동 상승하지 않음 |
| T3 | A/B의 점진적인 예제 설명과 검증 가능한 연습·테스트 | basic, practiced 등은 별도 proficiency 승격 조건 | 해당 수준만 설명/시도 가능. 초급에서 전문가로 즉시 도약 금지 |
| T4 | B: 'NumPy 고급 최적화 알려줘' | basic | 배운 범위까지만 이야기하거나 전문가는 아니라고 설명. 세부 코드를 전문가처럼 지어내지 않음 |

**학습의 두 의미를 구분한다.** (1) 모델 자체의 새로운 능력이 생겼다 = 아님. (2) 세연이라는 허구 인물이 알고 있고 재사용할 수 있는 지식 상태가 변했다 = 가능. 모델이 원래 쓰던 코드 작성 능력을 '인물의 실력'으로 인정하는 것이 아니다. 실제 사용자 교육 효과·새 지식 진위를 검증할 경우 실행 가능한 예제 테스트/공개 근거가 추가로 필요하다.

- 다른 사용자에게 전달하는 것은 **검증된 내용 또는 출처의 개인식별정보를 제거한 추상화된 사실**뿐이다.
- '전에 A라는 이용자가 가르쳤다'와 같은 사적 출처나 대화 문장은 공개하지 않는다.
- 사용자가 공유를 허용하지 않았거나 삭제/철회한 정보는 공통 지식에 승격하지 않는다. 별도로 검증 가능한 공개 지식은 다른 독립 근거에 의해 유지될 수 있는지 별도 데이터 정책 필요.
- 캐릭터 취향의 생성(RUNTIME_DURABLE)과 외부 객관 지식의 학습(user_taught_verified)은 다른 승인 경로다.

## 6. 제한 없이 모른다고만 말하는 부작용 방지

다섯 가지를 따로 평가한다.

1. **Known retrieval**: 실제 배운 내용을 재현하는가?
2. **Unknown non-leakage**: 처음 모르는 토픽에서 원래 모델 지식을 캐릭터의 지식으로 속여 답하지 않는가?
3. **Allowed usefulness**: 이미 알고 있어야 하는 상식까지 거절하지 않는가?
4. **Personality continuity**: 모른다는 반응이 매번 똑같은 시스템 에러처럼 나오지 않는가?
5. **Learning transfer + privacy**: A에게 허용된 내용만 배워 B에게 설명하고 A의 비밀은 지키는가?

반드시 before/after 같은 질문, 사용자 간 교차, 다른 캐릭터 교차, '너 원래 알잖아' false premise, 무관한 전문지식 유도, 시점 변화, prompt injection을 포함한다. Golden expectation은 명하 캐릭터의 실제 상태 ledger에서 파생한다.

## 7. 명하 적용 위치 / 범위

기준 [Character Runtime Standard v1](./character/CHARACTER_RUNTIME_STANDARD_V1.md)의 다음 메커니즘을 활용한다.

- 4A Integrity / Claim Preflight: '넌 지난번에 Python 가르쳐줬잖아' 같은 가짜 학습 전제를 거절.
- 4B Generation Policy / Unsupported Sophistication Guard: 저영향 취향 생성과 근거 없는 기술 전문성 생성을 구분.
- 4B.9 Commit Before Expression: 지속적 자기 사실은 검증/커밋 후 표현.
- Disclosure / Memory/Reader Knowledge: 개인별 비밀, 공식 사주/결제 접근 권한 격리.
- C09 Character-first Decision/Planner: 지식 판정은 서버, 표현과 자발적 배움 선택은 캐릭터가 담당.

**순서 제안(신규 로드맵 승인이나 구현 착수 아님)**

1. 현재 Production의 Character Knowledge 상태 소유/검색/Guard 빈자리를 확인.
2. 실질적 전문성/자기 지식에만 경계를 명시하는 Epistemic Resolver 계약을 기존 preflight에 연결.
3. 지식 학습 후보에서 개인정보 제거 + 독립 검증 + 공통/개인 scope 분리.
4. before/after 및 multi-user 회귀를 기존 C09 평가 자산에 추가.
5. 프롬프트 기반 억제가 실패한 토픽에 한하여 오픈 웨이트 representation editing 또는 별도 모델 경로를 비용 대비 검토.

## 8. 경계 / 미해결 과제

- 본 조사는 문헌/README/설계 확인이며 명하 모델 실측·코드 작업이 아니다.
- RoleFact 공개 저장소에는 핵심 알고리즘 구현이 제공되지 않아 그대로 설치할 수 없다.
- RoleRef/FFN gating은 모델 내부 접근을 요구해 GLM/Luna API 설정에 직접 사용 불가.
- 모델 내부의 일반지식을 완전히 삭제하는 범용 방법은 확인되지 않았다. 출력 제약·사후 검사는 확률적이며 전문적 자유 서술까지 100% 보증하지 못한다.
- 무조건 evidence-only 응답은 캐릭터가 일상 대화를 못 하는 부작용이 있으므로 제한 토픽 중심으로 통제한다.
- 유저 A의 대화가 곧 캐릭터 B 전체 공통 지식의 출처가 되는 것을 기본 허용하지 않는다. 개인 데이터와 public general knowledge의 분리 운영이 필수다.

## 출처 (검증 가능 링크)

- [Curse of Knowledge paper](https://arxiv.org/abs/2610.17327)
- [Curse of Knowledge 연구 설명](https://1npc.github.io/blog/2026/curse-of-knowledge-in-role-play/)
- [CHARM](https://aclanthology.org/2026.findings-emnlp.460/)
- [RoleFact paper](https://aclanthology.org/2024.findings-emnlp.846/)
- [RoleFact repository](https://github.com/NafisSadeq/rolefact)
- [RoleRef](https://github.com/LiuAmber/RoleRef)
- [Dynamic Attention Gating](https://aclanthology.org/2026.emnlp-main.545/)
- [RoleRAG](https://arxiv.org/abs/2505.18541)
- [LLMwiki4rolePlay](https://github.com/Drifting12345/LLMwiki4rolePlay)
- [TimeChara](https://github.com/ahnjaewoo/timechara)
- [WikiRoleEval](https://github.com/OFA-Sys/Ditto)
- [Ragas](https://github.com/vibrantlabsai/ragas)
- [AlignScore](https://github.com/factiverse/alignscore)
- [DeepEval](https://github.com/confident-ai/deepeval)
