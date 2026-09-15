# 명하 User / Character / Narrative / World State Map v0.1 — Working Draft

> Status: **DRAFT / NON-AUTHORITY**  
> Date: **2026-08-30**  
> Parent drafts: `WORLD_CHARACTER_CONCEPT_V0.1_DRAFT.md`, `WORLD_DYNAMIC_NARRATIVE_FEASIBILITY_V0.1_DRAFT.md`  
> Related authority: `AI_CHARACTER_RUNTIME_SPEC.md`, `DB_DDL_MIGRATION_SPEC.md`, relationship/memory/privacy source-gap documents  
> Purpose: 제타식 다중 캐릭터 장기 대화 서비스를 운영할 때, 사용자와 각 캐릭터가 서로 다른 역사를 유지하도록 어떤 상태를 분리해서 생각해야 하는지 개념 지도를 만든다.  
> Important: 본 문서는 DB table/schema, relationship evaluator, unlock DSL, memory retention policy를 새로 확정하지 않는다.

---

## 1. Problem Reframing

명하의 핵심 문제는 `무슨 개인정보를 저장할까?`가 아니다.

더 먼저 해결해야 하는 질문은:

> **한 사용자가 수십~수백 명의 캐릭터와 장기적으로 대화할 때, 서비스가 아는 사용자 정보와 각 캐릭터가 아는 사용자 정보, 관계의 진행 상태, 공식 서사 진행 상태, 공유 세계 상태를 어떻게 분리해 유지할 것인가?**

따라서 Memory는 전체 구조의 한 부품일 뿐이다.

Working principle:

> **명하는 사용자의 모든 정보를 캐릭터에게 공유하는 시스템이 아니라, 사용자와 각 캐릭터가 서로 다른 역사를 가진 상태로 계속 살아갈 수 있게 하는 시스템이어야 한다.**

---

## 2. The Core State Map

개념적으로 다음 7개 층을 구분한다.

```text
                 [0. CONTENT CANON]
            character / world / episode
                       │
                       ▼
                 [1. USER CORE]
             birth / basic profile
                       │
                       ▼
                 [2. LIFE STATE]
         disclosed life facts / lived record
                       │
           ┌───────────┼───────────┐
           │           │           │
           ▼           ▼           ▼
 [3A. CHARACTER A] [3B. CHARACTER B] [3C. CHARACTER C]
 relationship       relationship       relationship
 knowledge/memory   knowledge/memory   knowledge/memory
 narrative markers  narrative markers  narrative markers
           │           │           │
           └───────────┼───────────┘
                       ▼
                 [4. WORLD STATE]
           subject-specific world events
                       │
                       ▼
                 [5. SCENE STATE]
           current episode / participants
                       │
                       ▼
                 [6. RECENT CONTEXT]
          recent messages / current turn
```

이 지도에서 가장 중요한 구분은 다음이다.

```text
서비스가 아는 사실
≠ 특정 캐릭터가 아는 사실

캐릭터가 기억하는 것
≠ 캐릭터와 친한 정도

친한 정도
≠ 어떤 공식 에피소드를 끝냈는가

사용자별 world state
≠ global canon

채팅 로그 전체
≠ 이번 turn의 LLM context
```

---

## 3. Layer 0 — Content Canon

사용자마다 바뀌지 않는 세계/캐릭터의 공식 원본이다.

예:

- 백헌의 성격과 말투
- 백헌의 확정된 서약
- 세연과 백헌 사이의 global canon relation
- 명하관의 공식 설정
- 공식 episode skeleton
- 캐릭터가 원래 알고 있는 세계 지식

이것은 사용자와 오래 대화했다고 임의로 변하지 않는다.

사용자별 경험은 Canon을 수정하는 것이 아니라 그 위에 별도 subject state로 쌓인다.

---

## 4. Layer 1 — User Core

서비스가 사용자를 식별하고 사주/기본 경험을 제공하기 위해 가지는 비교적 안정적인 정보다.

후보 예:

- 출생 정보
- 사용자가 직접 정한 기본 profile
- 서비스 설정/동의 상태

이 층은 모든 캐릭터에게 자동 공개된다는 뜻이 아니다.

`서비스가 가지고 있음`과 `캐릭터가 알 수 있음`은 별도 권한 문제다.

---

## 5. Layer 2 — Life State / Lived Record

사용자의 실제 삶에 관해 명하에 남겨진 구조화된 정보다.

예:

```text
2026-10: 이직 고민 시작
2026-12: 현 직장 잔류 결정
2027-03: 퇴사
2027-05: 프리랜스 시작
```

이 층의 목적은 `캐릭터 기억` 그 자체가 아니다.

보다 정확히는:

> **명하가 사용자의 삶에서 어떤 일이 있었는지를 다루기 위한 subject-level record**

다.

중요:

- 모든 대화 문장을 Life State로 승격하지 않는다.
- 캐릭터의 해석을 객관적 Life Fact로 저장하지 않는다.
- Life State가 존재한다고 모든 캐릭터에게 자동 공개하지 않는다.

예:

```text
Life State:
- 사용자가 회사를 퇴사했다.

금지된 왜곡:
- 사용자가 책임을 회피해서 퇴사했다.  # character interpretation을 사실로 승격
```

---

## 6. Layer 3 — Per-Character State

제타식 장기 캐릭터 서비스에서 가장 중요한 층이다.

각 `subject × character`마다 최소 세 종류를 개념적으로 분리한다.

### 6.1 Relationship State

> **이 캐릭터와 사용자가 현재 어떤 관계인가?**

예:

```text
낯섦
익숙함
신뢰
사적 신뢰
특정 관계 marker
```

내부 score가 존재할 수 있어도 Narrative/Renderer에는 의미 있는 projection을 전달하는 방향이 적합하다.

Relationship mutation의 정확한 event/delta/stage 정책은 기존 authority gap을 따른다.

LLM이 직접 `호감도 +10`을 확정하지 않는다.

---

### 6.2 Character Knowledge / Memory

> **이 캐릭터는 사용자에 대해 무엇을 알고 있으며, 둘 사이에 무엇을 함께 겪었는가?**

두 가지를 구분한다.

#### Knowledge

사용자의 삶에 관한 사실 중 해당 캐릭터가 실제로 알게 된 것.

```text
백헌 knows:
- 사용자가 퇴사를 고민했다.
- 사용자가 결국 퇴사했다.

도윤 does not know:
- 위 사실들
```

#### Relationship Memory

같은 Life Fact라도 그 캐릭터와 어떤 방식으로 연결되었는지.

```text
백헌:
- 퇴사 전 몇 달 동안 그 결정을 같이 고민했다.

서린:
- 퇴사 후 힘들었던 이야기를 나중에 맡겼다.

세연:
- 결과만 들었다.
```

따라서 핵심 법칙:

> **Shared Truth ≠ Shared Knowledge.**

서비스는 사용자가 퇴사한 사실을 알고 있어도, 도윤은 모를 수 있다.

---

### 6.3 Character Narrative State

> **이 사용자와 이 캐릭터 사이의 공식/준공식 관계 서사가 어디까지 진행됐는가?**

예:

- first encounter 완료
- oath reveal 완료
- 특정 character episode 완료
- 특정 관계 marker 획득
- 특정 장면을 실제로 함께 겪음

이 상태는 Memory와 다르다.

```text
백헌이 사용자의 퇴사를 기억함
≠
백헌 Oath Reveal episode 완료
```

또 Relationship과도 다르다.

```text
trust가 높음
≠
특정 공식 episode를 완료함
```

이 구분을 하지 않으면 `대화를 많이 했다 = 모든 스토리 자동 해금` 또는 `에피소드 구매 = 호감도 상승` 같은 잘못된 결합이 생긴다.

---

## 7. Layer 4 — Subject World State

Global Canon은 모두에게 동일하지만, 어떤 사용자가 실제로 겪은 세계 사건은 별도로 존재할 수 있다.

예:

```text
Global Canon:
- 명하관에는 특정 보존 구역이 존재한다.

User A World State:
- 그 구역에서 발생한 Episode X를 겪었다.

User B World State:
- 아직 그 사건을 겪지 않았다.
```

또는 특정 공식 사건 이후에만:

- 어떤 공간 접근 경험
- 특정 world event 관측
- 두 캐릭터 사이에서 실제로 사용자와 함께 발생한 사건

등이 subject state가 될 수 있다.

중요:

> **사용자별 World State는 세계 Canon을 새로 쓰는 자유 생성 세계선이 아니다.**

공식적으로 정의된 event/episode의 진행·관측·결과 범위 안에서 subject별 경험을 기록하는 층이다.

---

## 8. Layer 5 — Current Scene State

현재 진행 중인 장면에만 필요한 상태다.

예:

- 현재 episode id
- 참가 캐릭터
- 현재 장면 목적
- 이미 말해진 scene-local 사실
- 이번 장면에서 허용된 reveal
- scene turn position

이 상태는 일반 장기 기억과 분리한다.

멀티캐릭터 scene에서는 특히 중요하다.

캐릭터 A가 scene 안에서 들은 것을 캐릭터 B가 실제로 같이 들었는지 여부를 scene participation으로 결정할 수 있어야 한다.

---

## 9. Layer 6 — Recent Conversation Context

최근 몇 턴의 실제 대화다.

이것은 장기 상태가 아니다.

```text
recent transcript
→ 현재 대화의 문맥 유지

장기 Life State / Character Memory
→ 수개월 뒤에도 필요한 연속성 유지
```

따라서 1년치 Raw Conversation 전체를 매번 Renderer prompt에 넣지 않는다.

Raw Conversation은 원본 history/provenance일 수 있지만, runtime context는 bounded되어야 한다.

---

## 10. Runtime Context Assembly — One Character Chat

사용자가 백헌 채팅방을 열었다고 가정한다.

백헌 Renderer에 필요한 개념적 input:

```text
1. pinned Baekheon canon
2. Baekheon이 알아도 되는 User Core 일부
3. current Baekheon relationship projection
4. Baekheon에게 granted된 관련 Knowledge / Memory
5. Baekheon narrative markers 중 현재 대화에 필요한 것
6. 관련 subject World State
7. current Scene State
8. recent Baekheon conversation
9. Saju context — 이번 turn에 실제로 필요할 때만
```

빠져야 하는 것:

- 서린에게만 맡긴 비공개 memory
- 다른 캐릭터와 나눈 private transcript
- 지금 주제와 무관한 수백 개 Life Fact
- 사용자가 아직 겪지 않은 official episode 정보
- LLM이 접근 authority 없이 추론한 개인정보

Working formula:

> **Context = Canon + Current Relationship + Allowed Relevant Memory + Relevant Narrative/World State + Recent Conversation.**

---

## 11. Switching Characters

같은 사용자가 바로 다음에 세연 채팅방을 열면 context가 재조립된다.

```text
백헌 Context
≠
세연 Context
```

공통으로 존재할 수 있는 사용자 사실은 있어도, 캐릭터별 Knowledge/Memory access가 다르다.

예:

```text
Life State:
- user quit job

Baekheon:
- knows decision process
- remembers discussing fear of failure

Seyeon:
- knows result only

Doyoon:
- knows nothing
```

이 구조가 `같은 사용자지만 캐릭터마다 다른 역사`를 만든다.

---

## 12. How Conversation Changes State

한 turn의 결과를 바로 자유롭게 세계 상태로 쓰지 않는다.

개념적으로:

```text
User Message
↓
Runtime response
↓
Post-turn proposals / deterministic triggers
↓
Server authority / user consent / policy
↓
Durable state update
```

한 문장이 여러 층에 서로 다른 결과를 만들 수 있다.

예:

사용자 → 백헌:
> "결국 다음 달에 퇴사하기로 했어요."

가능한 결과 후보:

```text
Life State candidate:
- planned resignation next month

Baekheon Knowledge candidate:
- Baekheon now knows planned resignation

Baekheon Relationship Memory candidate:
- user entrusted this decision to Baekheon

Relationship event candidate:
- if authoritative policy recognizes relevant trust event

Narrative trigger:
- only if an authored episode/condition explicitly listens for this state
```

중요:

> **대화 한 줄이 곧바로 임의의 plot branch를 생성하는 것이 아니다.**

대화는 durable state를 만들 수 있고, 이후 공식 콘텐츠가 그 상태 중 필요한 signal을 읽는다.

---

## 13. Dynamic Narrative Uses State, Not Full History

`WORLD_DYNAMIC_NARRATIVE_FEASIBILITY_V0.1_DRAFT.md`의 방향과 연결한다.

공식 scene 하나가 사용자 전체 state를 다 읽지 않는다.

Working constraint:

> **한 scene은 핵심 personalization signal 1~3개 정도만 본다.**

예:

```text
BAEKHEON_DECISION_SCENE

signals:
- baekheon.relationship = PRIVATE_TRUST
- baekheon.oath_revealed = true
- baekheon knows RECENT_JOB_DECISION
```

이 세 조건만으로도:

- 공적/사적 말투
- 서약 설명 반복 여부
- 과거 선택 callback

을 바꿀 수 있다.

사용자 전체 2년치 기록과 9명 관계 조합을 모두 계산하지 않는다.

---

## 14. Relationship Is Not the Whole Game State

호감작 시스템을 설계하더라도 `호감도` 하나에 모든 것을 넣지 않는다.

나쁜 예:

```text
Baekheon affection = 82
→ private dialogue unlocked
→ oath reveal unlocked
→ knows resignation
→ episode 7 complete
```

이렇게 하면 서로 다른 사실이 숫자 하나에 뭉개진다.

더 나은 conceptual separation:

```text
Relationship:
- 현재 둘의 거리/신뢰

Knowledge/Memory:
- 백헌이 무엇을 아는가

Narrative:
- 어떤 공식 관계 사건을 겪었는가

World:
- 어떤 공통 세계 사건을 겪었는가
```

각 층이 서로 영향을 줄 수는 있지만 동일한 것은 아니다.

---

## 15. Character-Specific Memory Personality

캐릭터마다 `기억의 내용 자체를 임의 조작`하게 하지 않는다.

다만 runtime retrieval 우선순위에는 persona를 반영할 수 있다.

예시 방향:

```text
서린:
- entrusted / old / continuity memory 우선

백헌:
- decision / consequence / unresolved responsibility memory 우선

세연:
- shared everyday / return / promise memory 우선
```

같은 truth를 다르게 기억하는 것이 아니라:

> **같은 허용된 기록 중 무엇을 지금 먼저 떠올리는지가 캐릭터답게 달라지는 것**

이다.

이 기능은 optional personalization layer이며 exact scoring은 OPEN이다.

---

## 16. Scaling to 100+ Characters

잘못된 방식:

```text
User profile 전체
× 100 characters
→ 모든 정보를 100개의 memory copy로 복제
```

권고 방향:

```text
Shared subject-level records
+
per-character relationship/knowledge/memory links
+
per-character narrative state only when actual relationship exists
```

새 캐릭터가 추가되었다고 과거 모든 사용자 Life State를 그 캐릭터가 자동으로 아는 것이 아니다.

신규 캐릭터는 기본적으로:

```text
canon character exists
relationship absent/baseline
personal knowledge absent
personal memory absent
narrative progress absent
```

에서 시작할 수 있다.

이것이 sparse world/knowledge graph 원칙과도 일치한다.

---

## 17. What Memory Extraction Is Actually For

Memory extraction은 이제 구조상 마지막 단계다.

순서:

```text
1. State layers 정의
2. 어떤 layer가 누구의 authority인지 정의
3. runtime이 각 layer를 어떻게 조회할지 정의
4. narrative가 어떤 state signal을 읽을지 정의
5. 그 다음에야 대화에서 무엇을 memory/life-state 후보로 만들지 정의
```

따라서 `햄버거를 기억할까?` 같은 중요도 문제부터 시작하지 않는다.

먼저:

> **이 정보가 Life State인가, Character Knowledge인가, Character Memory인가, Narrative Marker인가, 아니면 그냥 recent context인가?**

를 분류할 수 있어야 한다.

---

## 18. Product Experience Implications

이 구조가 제대로 되면 사용자에게 다음 감각을 만들 수 있다.

### A. 같은 사용자를 캐릭터마다 다르게 안다

> `백헌은 그때부터 알고 있었고, 서린은 나중에 들었고, 도윤은 아직 모른다.`

### B. 같은 캐릭터도 관계에 따라 다른 사람처럼 느껴진다

Canon을 깨는 것이 아니라 relationship/narrative state가 다르기 때문이다.

### C. 오래 사용할수록 과거 callback의 질이 높아진다

하지만 모든 기억을 자랑하지 않고 현재 장면에 관련된 것만 꺼낸다.

### D. 공식 콘텐츠가 사용자마다 다른 의미를 가진다

완전한 무한 분기 대신 bounded state signal을 이용한다.

### E. Pay-to-love와 분리 가능하다

관계 state는 commerce entitlement와 동일한 축이 아니다. Paid artifact/episode access가 존재해도 relationship affection/trust를 직접 구매하는 구조로 만들 필요가 없다.

---

## 19. Hard Boundaries

현재 concept 단계에서 다음은 금지 방향으로 둔다.

1. **Global omniscient character memory**  
   한 캐릭터에게 말한 사실을 모든 캐릭터가 자동으로 앎.

2. **Raw transcript = long-term context**  
   과거 채팅 전체를 매 turn prompt에 넣음.

3. **LLM = state authority**  
   Renderer가 관계 stage, memory grant, unlock, world fact를 직접 확정함.

4. **Relationship score = everything**  
   지식/기억/에피소드/세계 진행을 호감도 숫자 하나에 종속시킴.

5. **Per-user freeform canon mutation**  
   LLM이 사용자마다 공식 세계 역사와 캐릭터 과거를 새로 만듦.

6. **Service knowledge = character knowledge**  
   DB에 존재하는 Life Fact를 캐릭터에게 자동 주입함.

---

## 20. Current Architecture Fit

현재 repository authority와 충돌하지 않는 범위에서 다음과 정렬된다.

- `AI_CHARACTER_RUNTIME_SPEC.md`는 renderer context를 character canon, world relation canon, current relationship projection, explicitly granted Life Facts/Memories, recent messages, Saju envelope, scene state로 제한한다.
- LLM은 Memory/Life Fact/Relationship event의 후보를 제안할 수 있지만 authority mutation을 직접 하지 않는다.
- DB/ERD 계열에는 `life_facts`, `memory_items`, `record_access_grants`, `user_character_states`, `world_events`, `relationship_events` 등의 authority envelope가 이미 존재한다.
- relationship exact mutation policy는 `SRC-22` 계열 gap에 의해 별도 해결 필요하다.
- world event → character unlock/condition evaluator는 `SRC-23` 계열 gap에 의해 별도 해결 필요하다.

따라서 본 문서는 새 DB 설계라기보다 **기존 부품을 어떤 제품/서사 의미로 분리해 써야 하는지에 대한 concept map**이다.

---

## 21. Next Validation Slice

바로 generic state engine을 구현하지 않는다.

백헌 하나 + 세연 하나로 최소 수직 검증을 권고한다.

### Test User State

```text
Life State:
- user is considering resignation

Baekheon:
- relationship = TRUST
- knows resignation concern
- memory = discussed fear of failure
- oath_revealed = true

Seyeon:
- relationship = CLOSE
- does NOT know resignation concern
- memory = unrelated everyday shared event
```

### Test

사용자가 두 캐릭터에게 각각:

> "나 다음 달에 큰 결정을 할 것 같아."

라고 했을 때:

- 백헌은 과거 직업 고민을 자연스럽게 callback
- 세연은 모르는 사실을 아는 척하지 않음
- 둘 다 현재 관계 거리감은 유지
- 관계 state / memory / narrative state가 섞이지 않음

이 테스트가 자연스럽게 통과해야 다음 단계로 확장한다.

---

## 22. Decision Register

| ID | Candidate | Status |
|---|---|---|
| STATE-01 | 서비스가 아는 사용자 사실과 캐릭터가 아는 사실을 분리한다 | CANDIDATE-FIX |
| STATE-02 | User Life State와 Per-Character Memory를 분리한다 | CANDIDATE-FIX |
| STATE-03 | Per-Character State는 Relationship / Knowledge-Memory / Narrative Progress를 구분한다 | CANDIDATE-FIX |
| STATE-04 | Subject World State는 global canon과 분리한다 | CANDIDATE-FIX |
| STATE-05 | Raw conversation history와 runtime context를 분리한다 | CANDIDATE-FIX |
| STATE-06 | 한 turn의 context는 필요한 state만 bounded retrieval한다 | CANDIDATE-FIX |
| STATE-07 | LLM은 state authority가 아니라 proposal/render 역할을 유지한다 | CANDIDATE-FIX |
| STATE-08 | Dynamic narrative는 full-history branching 대신 bounded state signals를 읽는다 | CANDIDATE-FIX |
| STATE-09 | Character-specific memory personality는 사실 왜곡이 아니라 retrieval priority 차이로 표현한다 | CANDIDATE |
| STATE-10 | Memory extraction은 state architecture 정의 후 설계한다 | CANDIDATE-FIX |

---

## 23. Open Questions

아직 확정하지 않는다.

- Life State의 exact type registry
- Life Fact와 Character Knowledge를 연결하는 exact grant/provenance model
- 어떤 memory를 자동 후보화하고 언제 user confirmation을 요구할지
- character-specific retrieval scoring
- relationship stage/event policy (`SRC-22`)
- narrative marker/episode condition exact evaluator
- world event → unlock mapping (`SRC-23`)
- user-facing `내 기록 / 캐릭터가 기억하는 것` 관리 UX
- retention/deletion/export policy의 exact product surface
- multi-character scene에서 새로 공유된 knowledge를 durable하게 승격하는 규칙

다음 단계는 이 state map을 기준으로 **백헌/세연 2인 runtime context example**을 실제 입력/출력 형태로 만들어 제품 체감을 검증하는 것이다.
