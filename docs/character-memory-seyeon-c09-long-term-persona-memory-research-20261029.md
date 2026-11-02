# 세연 C09 장기 인격·기억 일관성 선행기술 조사 (2026-10-29)

> 상태: RESEARCH / 설계 참고. Production 적용, 데이터 스키마 변경, 품질 통과를 의미하지 않는다.
> 목적: 2026-10-29 대화에서 조사한 장기 인격·기억 관련 공개 연구·오픈소스를 재사용 가능한 형태로 보존한다.
> 구분: [외부 근거]는 인용 링크가 있는 공개 주장, [명하 적용]은 프로젝트에 대한 설계 해석, [미검증]은 명하에서 실측하지 않은 부분이다.

## 1. 문제 정의

명하의 목표는 이전 대화를 단지 재현하는 챗봇이 아니라, 캐릭터가 고유한 정체성을 유지하며 배우고 경험에 따라 생각이 달라지는 지속적인 인물이다. 따라서 다음을 분리해 검증해야 한다.

1. 사건/사실 기억: 무엇을 겪었는가?
2. 캐릭터 관점의 해석 기억: 캐릭터가 그 사건을 어떻게 받아들였는가?
3. 현재 판단: 같은 성격과 변한 경험으로 무엇을 선택하는가?
4. 장기 변화 기록: 무엇이 언제, 왜 바뀌었는가?
5. 지식·권한 경계: 알 수 없는 정보를 알고 있다고 말하지 않는가?

단순 요약·벡터 검색·캐릭터 말투 프롬프트만으로 다섯 항목을 만족했다고 간주하지 않는다.

## 2. 핵심 선행 기술

| 자료 | 실제 공개된 접근 | 명하 적용 가능성 | 주의 사항 |
|---|---|---|---|
| [RoleMemo / DualMem](https://github.com/Collab-Gen/RoleMemo) · [EMNLP 2026](https://aclanthology.org/2026.findings-emnlp.270/) | factual cognition과 persona-conditioned insight를 분리. RoleMemo 2,052 persona / 20,244 query를 표방 | 사실·해석 두 계층의 기억 후보 설계 | 데이터셋, SFT/RL 체크포인트, 전체 recurrent agent는 저장소 기준 미공개(Coming soon). 논문 성과가 명하에서 재현된 것은 아님 |
| [BOOKMARKS](https://github.com/KomeijiForce/BOOKMARKS_Koishiday_2026) · [논문](https://arxiv.org/abs/2605.14169) | 현재 시점의 질문·답 형태로 concept / behavior / state 북마크를 재사용하고 갱신. 85 캐릭터 평가 | 현재 행동에 필요한 상태/행동 근거 선별 | 스토리라인 중심 벤치마크이므로 실시간 다중 사용자 서비스 적합성은 미검증 |
| [Graphiti](https://github.com/getzep/graphiti) | episode, entity, 관계, valid/invalid 시간과 source provenance를 갖는 temporal knowledge graph | 취향·관계·신념 변화의 사실 이력과 검색 | 별도 그래프 운영 비용 및 자동 충돌 판정 오류 가능. 바로 전면 도입하지 않음 |
| [Letta / MemGPT](https://github.com/letta-ai/letta) | 핵심 상태와 장기 보관 기억을 구분하는 상태ful agent memory | 항상 유지할 핵심 anchor와 검색 메모리 분리 참고 | Letta 전체 agent 런타임으로 교체할 근거는 없음 |
| [CharMemory](https://github.com/bal-spec/sillytavern-character-memory) | SillyTavern 채팅을 구조화된 캐릭터 메모리로 추출, Data Bank와 Vector Storage로 검색·주입. Injection Viewer, 수정/삭제, consolidation preview | 기억 추출과 검색 주입 과정의 가시화·관찰성 | 개인용 확장으로 명하의 서버 승인·사용자 간 격리·상호 공유 정책을 대체하지 못함. 무검증 자동 요약은 정보 손실/오염 가능 |
| [LangMem](https://github.com/langchain-ai/langmem) | semantic / episodic / procedural memory 추출, 통합, 갱신 도구 | memory 후보 후처리와 중복 정리 참조 | 자동 저장 권한은 명하 server authority가 계속 소유 |
| [Mem0](https://github.com/mem0ai/mem0) | user / agent / run scope, 검색·업데이트 인터페이스 | 캐릭터별 공통 지식 vs 사용자별 사적 기억 분리 참고 | scope 설정만으로 privacy가 자동 보장되지 않음. 애플리케이션의 ACL 필수 |

### 구현 참고 사항

- CharMemory의 기본 auto-extraction은 20개 메시지마다 실행되는 예시이며, 명하의 저장 주기를 정한 값이 아니다.
- Graphiti의 시간 유효성 개념은 유용하지만 PostgreSQL에 기존 provenance/validity 구조를 먼저 확장할 수 있다.
- Mem0의 agent/user 분리는 논리적 namespace 참고이며, 명하의 기존 record_access_grants를 우회하는 저장소를 새로 만들지 않는다.
- 지식이 검색됐다는 이유로 실제 발언에서 반드시 언급할 필요는 없다. Retrieve != mention.

## 3. 평가 자료

| 자료 | 검증에 사용할 질문 |
|---|---|
| [RolePlayBench](https://github.com/MiuLab/RolePlayBench) | 이미 유명한 캐릭터를 모델이 알아서 흉내 내는 것과 실제 persona 구현 능력을 구분할 수 있는가? |
| [LongMemEval](https://github.com/xiaowu0162/LongMemEval) | 여러 세션의 사실 회상, 지식 갱신, 시간 추론, 근거 부족 시 답변 유보가 되는가? |
| [LongMemEval-V2](https://github.com/xiaowu0162/LongMemEval-V2) | 오랜 경험에서 실제 작업 지식과 변화한 환경 상태를 회수할 수 있는가? |
| [PersonaMem](https://huggingface.co/datasets/bowen-upenn/PersonaMem-v1) | 선호의 장기 변화와 관련 맥락을 추적하는가? |
| [DeepEval](https://github.com/confident-ai/deepeval) | 다중 턴 Role Adherence와 Knowledge Retention을 분리 평가할 수 있는가? |

데이터셋을 그대로 Production 합격 기준으로 삼지 않는다. 세연의 독립적 판단·관계 변화·지식 경계·사용자 프라이버시를 포함한 고유 회귀 사례가 필요하다.

## 4. 명하 기존 설계와의 연결

기존 [Character Runtime Standard v1](./character/CHARACTER_RUNTIME_STANDARD_V1.md)는 Character Bible의 WHO와 Runtime의 현재 행동을 분리하며, 4A Integrity/Claim Preflight, 4B Open-World Fact Generation, 4B.5 Unsupported Sophistication Guard, 4B.9 Commit Before Expression, Relationship/Memory authority를 명시한다.

[세연 C09 상태·로드맵](./roadmaps/seyeon-c09-current-status-and-roadmap-20261029.md)은 아직 PR #2694에 있어 main 병합 전일 수 있다. 연구용 Shadow나 외부 라이브러리를 Production에 적용한 것으로 취급하지 않는다.

### 권장 연결 순서 (신규 트랙 확정 아님)

- Bible/Canon/Behavior: 사용자가 직접 덮어쓰지 못하는 정체성·행동의 authority.
- Episode/Event: 실제 경험과 원본 provenance.
- Fact Memory: 관찰/발언/검증된 사실.
- Insight Memory: Fact에 근거한 캐릭터 관점의 해석. 독립적인 사실 authority가 되지 않음.
- Temporal State: 현재/과거의 차이와 변화 사유. 조용한 overwrite 금지.
- Decision → Renderer → Guard → governed commit: 먼저 캐릭터 행동을 선택하고, 인가/정합성을 지키며 자연스럽게 표현.

## 5. 적용 금지/미검증

1. 외부 라이브러리 도입이 장기 인격 일관성을 자동 보장한다고 주장하지 않는다.
2. 사용자 발언을 캐릭터 공통 지식으로 즉시 승격시키지 않는다. 사용자 승인·공유 가능 범위·오염 검사를 준수한다.
3. 모든 세션을 무조건 한 캐릭터의 공통 기억으로 합치지 않는다. 사용자 비공개 경험과 캐릭터가 외부에 말할 수 있는 지식을 분리한다.
4. 모델 답변을 사후적으로 Canon의 자기증거로 삼지 않는다.
5. 연구 수치 및 오픈소스 README의 성능은 명하 라이브 실측 결과가 아니다.

## 6. 2026-10-29 기준 조사 결론

우선순위는 특정 라이브러리의 즉시 설치가 아니라 **RoleMemo의 사실/해석 분리 + BOOKMARKS의 선택적 상태 회수 + Graphiti의 시간/provenance 모델을 기존 명하 Authority에 접목**하는 것이다. 캐릭터가 애초에 알지 못하는 지식과 모델의 사전학습 지식이 충돌하는 문제는 별도 후속 조사 문서에서 다룬다.

## 출처

- [RoleMemo repo](https://github.com/Collab-Gen/RoleMemo)
- [RoleMemo EMNLP 논문](https://aclanthology.org/2026.findings-emnlp.270/)
- [BOOKMARKS repo](https://github.com/KomeijiForce/BOOKMARKS_Koishiday_2026)
- [BOOKMARKS paper](https://arxiv.org/abs/2605.14169)
- [Graphiti](https://github.com/getzep/graphiti)
- [Letta](https://github.com/letta-ai/letta)
- [CharMemory](https://github.com/bal-spec/sillytavern-character-memory)
- [LangMem](https://github.com/langchain-ai/langmem)
- [Mem0](https://github.com/mem0ai/mem0)
- [RolePlayBench](https://github.com/MiuLab/RolePlayBench)
- [LongMemEval](https://github.com/xiaowu0162/LongMemEval)
- [PersonaMem](https://huggingface.co/datasets/bowen-upenn/PersonaMem-v1)
