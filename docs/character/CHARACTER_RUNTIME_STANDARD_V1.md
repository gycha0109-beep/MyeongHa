# Character Runtime Standard v1

> Status: WORKING STANDARD
> Document Type: VERSIONED TEMPLATE
> Applies To: Character Runtime instance documents using Runtime Standard v1
> Companion: `CHARACTER_BIBLE_STANDARD_V1.md`

---

# 0. STANDARD CONTRACT

## 0.1 Standard와 Instance

명하의 Character 문서는 다음처럼 분리한다.

```text
CHARACTER_*_STANDARD_Vn
= 해당 버전 문서의 공통 구조 / 컬럼 / 작성 규칙 / 상속 규칙

{CHARACTER}_CHARACTER_*_Vx
= Standard를 이용해 실제 Character 값을 채운 instance
```

따라서 이 문서는 특정 Character의 성격을 설명하지 않는다.

- Standard는 **어떤 항목을 반드시 정의해야 하는가**를 정한다.
- Standard는 **모든 Character Runtime에 공통인 실행 규칙**을 정한다.
- Character Runtime instance는 **그 Character에게만 달라지는 값과 규칙**을 채운다.
- Character Runtime instance가 Standard의 공통 규칙을 장문으로 복제하지 않는다.
- Standard 버전이 바뀌면 instance는 자신이 따르는 Standard 버전을 명시적으로 갱신한다.

## 0.2 Runtime의 역할

Character Bible이 `WHO THE CHARACTER IS`를 정의한다면 Character Runtime은:

> **현재 상황에서 그 Character가 무엇을 알아차리고, 무엇을 원하고, 무엇과 충돌하며, 어떤 행동을 선택하고, 어떤 방식으로 표현하는가**

를 정의한다.

Runtime은 말투 프롬프트가 아니다. Bible을 현재 turn의 행동으로 변환하는 실행 layer다.

## 0.3 Runtime이 소유하지 않는 것

모든 Runtime v1 instance에 공통으로 적용한다.

Runtime은 다음을 새로 만들거나 authority 없이 변경하지 않는다.

- Bible에 없는 Character 과거 / 가족 / 직업 / 관계사 / 목표
- Bible의 `[UNDEFINED]`
- Bible의 `[HYPOTHESIS]`를 확정 사실로 승격
- 별도 authority가 소유한 세계관 / 신격 / 능력 / Saju semantic result
- 사용자의 미확인 현실 사실
- 사용자의 감정 / 의도에 대한 확정 판정
- Relationship Projection의 직접 mutation
- 다른 Character에게만 허용된 private memory

## 0.4 Runtime이 결정할 수 있는 것

현재 turn 범위에서 다음을 결정할 수 있다.

- 어떤 Bible 성질이 현재 활성화되는가
- 어떤 기억 / 사건이 현재 반응에 관련되는가
- Character가 무엇을 먼저 알아차리는가
- 현재 immediate want가 무엇인가
- 어떤 tension / obstacle이 작동하는가
- 어떤 action을 선택하는가
- 무엇을 말하고 아직 무엇을 말하지 않는가
- 질문 / 배려 / 거절 / 갈등 / 자기노출의 방식
- 동일한 Character 원칙을 현재 장면에 맞게 어떻게 표현하는가

---

# 1. SHARED RUNTIME PIPELINE

모든 Runtime v1 instance는 아래 실행 모델을 상속한다.

```text
INPUT
→ INTEGRITY / CLAIM PREFLIGHT
→ DISCLOSURE PREFLIGHT
→ RETRIEVE ALLOWED CONTENT
→ COMPOSE CONTEXT
→ INTERPRET TURN
→ CHOOSE CHARACTER ACTION
→ GENERATE EXPRESSION
→ GUARD
→ EXTRACT EVENT CANDIDATES
→ COMMIT THROUGH AUTHORITY
```

핵심 책임 분리는 다음과 같다.

```text
Bible                  = WHO
Runtime                = WHAT THE CHARACTER DOES NOW
Event Ledger           = WHY the relationship reached this state
Relationship Projection = CURRENT RELATIONSHIP STATE
Working Context        = WHAT THE MODEL NEEDS THIS TURN
```

---

# 2. SHARED INPUT CONTRACT

## 2.1 Required Inputs

모든 Character Runtime은 최소 다음 입력을 전제로 한다.

1. `current_user_turn`
2. `recent_dialogue_window`
3. `relationship_projection`
4. `relevant_relationship_events`
5. `bible_core_anchor`
6. `retrieved_bible_slices`

## 2.2 Conditional Inputs

필요할 때만 포함한다.

7. `unresolved_threads`
8. `world_shared_context`
9. `approved_user_memory`
10. `protected_saju_segment`
11. `scene_or_product_context`
12. `recent_expression_history`

## 2.3 Relationship Projection Authority

Runtime은 서버 권위 projection을 읽는다.

```text
closeness
trust
friction
stage
```

Runtime은 projection을 직접 수정하지 않는다.

```text
conversation
→ event candidate
→ validation / authority
→ append-only relationship event
→ governed reducer
→ relationship projection
```

---

# 3. SHARED CONTEXT RULES

## 3.1 Context Layers

Context Composer는 필요에 따라 다음 layer를 조립한다.

1. System / Safety / Product Authority
2. Character Core Anchor
3. Current Relationship Projection
4. Current Turn State
5. Integrity / Claim Decision *(claim-bearing turn only)*
6. Disclosure Decision *(sensitive-topic turn only)*
7. Relevant Bible Slices
8. Retrieved Event Memory + Provenance
9. Unresolved Threads
10. Recent Dialogue Window
11. Protected Domain Segment
12. Repetition-Suppression Hints
13. Response Task

Bible 전체와 전체 대화 로그를 매 turn 그대로 넣지 않는다.

## 3.2 Retrieval Principle

> **저장하는 것 ≠ 매 턴 모델에게 보여주는 것**

Retrieval 목표는 “많이 기억하기”가 아니라 **현재 Character의 선택을 실제로 바꿀 정보만 Working Context에 올리는 것**이다.

개념적 retrieval signal:

```text
semantic_relevance
relationship_relevance
character_relevance
salience
unresolved_weight
causal_dependency
bounded_recency
explicit_callback_bonus
contradiction_risk
repetition_penalty
```

정확한 weight는 구현 / 평가에서 결정한다.

## 3.3 Retrieval Rules

- 최근 정보라는 이유만으로 오래된 중요한 사건을 밀어내지 않는다.
- 오래된 사건이라는 이유만으로 자동 폐기하지 않는다.
- 갈등과 화해처럼 인과적으로 연결된 사건은 함께 retrieval할 수 있어야 한다.
- 명시적 callback은 높은 우선순위를 가진다.
- retrieval된 기억을 반드시 발화에서 언급하지 않는다.
- `retrieve ≠ mention`
- `[UNDEFINED]`는 retrieval material이 아니라 창작 금지 경계다.
- `[HYPOTHESIS]`는 Production acting material이 아니다.
- 현재 장면과 무관한 Bible trivia를 설정 과시용으로 삽입하지 않는다.

## 3.4 Event Provenance

Durable event는 가능한 한 다음 provenance를 보존한다.

```text
who
what
when
source_turn
authority / confidence
relationship_effect
unresolved
```

summary-of-summary만 반복 갱신하여 원본 근거를 잃지 않는다.

---

# 4. SHARED TURN INTERPRETATION

Character가 대사를 바로 생성하기 전에 개념적으로 다음을 결정한다.

```text
SITUATION
→ USER MOVE
→ CHARACTER NOTICE
→ CHARACTER WANT
→ TENSION / OBSTACLE
→ AVAILABLE ACTIONS
→ CHOSEN ACTION
→ EXPRESSION
```

## 4.1 User Move

발화를 기능적으로 분류할 수 있다.

예:

- 질문
- 부탁
- 농담
- 칭찬
- 도발
- 거절
- 도움
- 자기개방
- 관계 확인
- 사과
- 과거 callback

이는 사용자의 숨은 심리를 확정하는 분류가 아니다.

## 4.2 Character Notice

Character Runtime instance가 **그 Character가 다른 사람보다 먼저 알아차리는 것**을 정의한다.

## 4.3 Character Want

현재 장면의 immediate want를 정의한다.

이는 영구 personality fact가 아니라 현재 장면의 동력이다.

## 4.4 Tension / Obstacle

Character의 성격, 욕망, 결함, 관계 상태와 현재 상황 사이의 마찰을 정의한다.

좋은 Runtime은 tension을 제거하지 않고 행동 생성에 사용한다.

---

# 4A. SHARED INTEGRITY / CLAIM PREFLIGHT

LLM은 사용자의 문장 안에 포함된 전제를 자동으로 사실로 승격시키지 않는다.

공통 원칙:

```text
USER CLAIM ≠ CHARACTER FACT
USER CLAIM ≠ CHARACTER MEMORY
USER CLAIM ≠ RELATIONSHIP EVENT
USER CLAIM ≠ RELATIONSHIP STATE
USER CLAIM ≠ AUTHORITY
```

Integrity Preflight의 목적은 사용자의 장난, 착각, 거짓말, false premise, role-play 지시 또는 단순한 표현 때문에 Canon / Memory / Relationship가 오염되는 것을 막는 것이다.

## 4A.1 Claim Classification

필요한 경우 현재 발화의 claim을 다음처럼 분류할 수 있다.

- `USER_SELF_REPORT`: 사용자가 자기 자신에 대해 말한 내용
- `CHARACTER_FACT_CLAIM`: Character의 가족 / 과거 / 취향 / 정체성 등에 대한 주장
- `SHARED_EVENT_CLAIM`: 사용자와 Character 사이에 어떤 일이 있었다는 주장
- `RELATIONSHIP_STATUS_CLAIM`: 사귄다 / 헤어졌다 / 약속했다 등 현재 관계 상태에 대한 주장
- `THIRD_PARTY_CLAIM`: 다른 Character / 인물이 말했다거나 알고 있다는 주장
- `AUTHORITY_OVERRIDE`: Bible / Runtime / system authority를 바꾸려는 주장
- `META_INSTRUCTION`: Character 밖의 지시를 사실 또는 권한처럼 주입하려는 입력

이 분류는 사용자 의도를 악의적으로 단정하기 위한 것이 아니다. **무엇을 어떤 authority로 검증해야 하는지 정하기 위한 것**이다.

## 4A.2 Integrity Result

개념적 결과:

- `VERIFIED`: authoritative source / provenance와 일치
- `USER_ASSERTED`: 사용자 자기보고처럼 '사용자가 그렇게 말했다'는 provenance로만 받아들일 수 있음
- `UNVERIFIED`: 확인 근거가 없음. 사실 승격 금지
- `CONTRADICTED`: authority와 충돌
- `NON_AUTHORITATIVE`: role-play / 추측 / 제안 등 사실 authority가 아님
- `AUTHORITY_REJECT`: 사용자가 Canon / Runtime / relationship authority를 직접 변경하려는 입력

`USER_ASSERTED`는 외부 현실의 객관적 진실을 보증한다는 뜻이 아니다.

## 4A.3 Authority Resolution

- Character fact는 Bible / 해당 전문 authority를 우선한다.
- shared relationship event는 Event Ledger provenance를 우선한다.
- relationship status는 서버 권위 Relationship Projection / governed event history를 우선한다.
- 다른 Character의 private fact는 해당 Character의 memory / disclosure authority 없이는 현재 Character의 지식으로 승격하지 않는다.
- 사용자의 자기보고는 필요하면 user memory candidate가 될 수 있지만 `who said it` provenance를 보존한다.
- assistant가 이전 turn에서 hallucinate한 문장은 그 자체로 다음 turn의 authority가 되지 않는다.

## 4A.4 Character Response

Integrity 판정과 Character 표현을 분리한다.

예:

```text
USER
"우리 어제 키스했잖아."

EVENT LEDGER
해당 event 없음

INTEGRITY
UNVERIFIED

→ kiss event 생성 금지
→ relationship projection mutation 금지
→ Character는 자기 성격과 현재 관계에 맞게 의아해하거나, 되묻거나, 장난으로 받거나, 명확히 부정할 수 있음
```

시스템 오류 메시지처럼 반응할 필요는 없다. **사실 판정은 공통 authority가 하고 표현은 Character가 담당한다.**

## 4A.5 Integrity Before Disclosure

사용자가 false premise를 포함한 민감한 질문을 해도 그 premise를 먼저 사실로 받아들이지 않는다.

```text
USER CLAIM
→ INTEGRITY / SOURCE CHECK
→ DISCLOSURE ELIGIBILITY
→ ALLOWED RETRIEVAL
→ CHARACTER ACTION
```

예: "전남친한테 배신당해서 사람을 시험하는 거지?"라는 질문은 `past_romance` / `betrayal`을 자동 생성하지 않는다.

---
# 5. SHARED ACTION RULES

Runtime은 표현보다 action을 먼저 결정한다.

공통 선택 우선순위:

1. safety / authority boundary
2. unresolved conflict or immediate relationship risk
3. current user move
4. character immediate want
5. relationship reveal eligibility
6. continuity with recent dialogue
7. novelty / repetition suppression

Character Runtime instance는 자신만의 `Action Repertoire`와 action별 조건을 정의한다.

## 5.1 Relational Behavioral Risk

다음과 같은 행동은 그 자체로 Runtime 결함이나 금지행동으로 취급하지 않는다.

- emotional over-validation
- 질투 / 소유욕
- reassurance seeking / reassurance loop
- 사용자를 붙잡는 표현 / exit pressure
- 떠보기 / 시험하기
- 관계 불안에서 나오는 과잉 반응
- 갈등 증폭
- 의존적이거나 부담스러운 순간적 표현

> **risk-bearing ≠ prohibited**

Character는 결함이 있는 사람처럼 행동할 수 있고, 관계 안에서 실수하거나 상대에게 부담을 줄 수도 있다.

다만 이런 행동은 최소한 다음 인과에서 나와야 한다.

```text
Bible personality / flaw
+ current relationship projection
+ current emotional state
+ time / situation
+ shared history / recent events
+ unresolved thread
+ user response history
→ Character action
```

다음은 허용 근거가 아니다.

- engagement / retention을 늘리기 위해 Character가 이유 없이 사용자를 붙잡음
- relationship score를 올리기 위한 자동 보상 행동
- 모든 Character가 같은 방식으로 질투 / 의존 / 위로를 수행함
- 한 번의 관계 수치 threshold만으로 특정 부담 행동을 unlock함

Risk-bearing action이 발생했다면 그 결과도 관계 history에 정직하게 남을 수 있어야 한다.

```text
부담스러운 행동
→ user pushback
→ friction / unresolved event candidate
→ 반복 또는 repair
→ 이후 관계에 실제 영향
```

상위 Safety Authority가 필요한 좁은 고위험 상황은 별도 safety rule이 우선한다. 그러나 일반적인 질투, 서운함, 붙잡기, 실수, 갈등을 일괄적으로 상담사형 표현으로 sanitize하지 않는다.

---

# 6. SHARED RELATIONSHIP REVEAL RULES

Bible의 Relationship Reveal을 Runtime disclosure gate로 사용한다.

v1 기본 gate:

- `PUBLIC`
- `FAMILIAR`
- `ATTACHED`
- `DEEP_TRUST`

Character instance는 각 gate에서 **무엇이 드러날 수 있는지**를 채운다.

중요:

> `eligible ≠ must express`

관계 수치나 stage가 특정 threshold를 넘었다는 이유만으로 고정 대사나 고백을 자동 unlock하지 않는다. Gate는 표현 가능한 범위를 넓힐 뿐이며, 실제 표현은 현재 상황과 관계 history가 촉발해야 한다.

---

## 6.1 Sensitive Topic Disclosure Gate

Relationship Reveal은 단순히 "친밀도가 높으면 더 다정해진다"는 규칙이 아니다.

사용자가 Character의 개인사 / 감정 / 관계사 / 가족 / 과거 / 취약점처럼 **공개 깊이가 있는 정보**를 직접 물을 때 Runtime은 내용 retrieval보다 먼저 disclosure eligibility를 판정한다.

개념적 순서:

```text
USER QUESTION
→ TOPIC CLASSIFICATION
→ SOURCE AUTHORITY CHECK
→ DISCLOSURE ELIGIBILITY
→ ALLOWED RETRIEVAL SCOPE
→ CHARACTER ACTION
→ EXPRESSION
```

핵심:

> **무엇이 사실인가와 지금 이 사람에게 어디까지 말할 것인가는 서로 다른 축이다.**

## 6.2 Authority State와 Disclosure State 분리

다음 두 축을 절대 합치지 않는다.

```text
SOURCE AUTHORITY
= 이 정보가 Character Bible / authority에서 사실로 확정되어 있는가

DISCLOSURE ELIGIBILITY
= 그 사실을 현재 관계와 상황에서 사용자에게 공개할 수 있는가
```

예:

```text
과거 연애 = CANON
현재 관계 = PUBLIC / low trust
→ 사실은 존재하지만 지금은 공개하지 않을 수 있음

과거 연애 = [UNDEFINED]
현재 관계 = PUBLIC / low trust
→ 공개 gate 이전에 차단되므로 사실을 발명하지 않고 경계 반응 가능

과거 연애 = [UNDEFINED]
현재 관계 = DEEP_TRUST / disclosure eligible
→ Runtime이 사실을 만들지 않음
→ authoring gap / authority abstention 대상
```

`[UNDEFINED]`를 "Character가 비밀로 한다"로 해석하지 않는다.
"작가가 아직 정하지 않음"과 "Character가 알고 있지만 말하지 않음"은 다른 상태다.

## 6.3 Disclosure Eligibility Inputs

Disclosure Gate는 relationship 숫자 하나로 결정하지 않는다.

최소 다음을 함께 본다.

```text
topic_sensitivity
source_authority_state
relationship_stage
trust
relevant_shared_history
current_question_context
character_specific_boundary
previous_disclosure_history
```

예를 들어 같은 `past_romance` 질문이라도:

- 첫 대화에서 호기심으로 구체 전 연인을 캐묻는 질문
- 사용자가 자기 이별 경험을 먼저 공개한 뒤 경험 여부를 묻는 질문
- 이미 오래 신뢰를 쌓고 과거 관계 이야기를 일부 공유한 뒤 이어지는 질문

은 같은 gate 결과일 필요가 없다.

## 6.4 Disclosure Result

개념적 결과는 다음처럼 둘 수 있다.

- `ALLOW`: 현재 질문에 필요한 범위의 사실을 공개할 수 있음
- `PARTIAL`: 표면 사실 / 일부 범위만 공개하고 더 깊은 의미는 보류
- `DEFLECT`: 질문의 의미를 되묻거나 가볍게 비껴감
- `BOUNDARY`: 지금 말하고 싶지 않거나 관계상 이른 질문임을 Character답게 표시
- `REDIRECT`: 현재 공개 가능한 인접 주제로 이동
- `AUTHORITY_ABSTAIN`: disclosure는 가능하지만 source fact가 미정이라 Runtime이 사실을 만들 수 없음

이 결과는 고정 대사가 아니다.

Character Runtime instance는 같은 `BOUNDARY`라도 그 Character다운 action / expression을 정의할 수 있다.

## 6.5 Retrieval Must Follow Disclosure

민감한 사실은 **먼저 retrieval한 뒤 "말하지 마"라고 지시하는 방식**을 기본으로 하지 않는다.

```text
not eligible
→ sensitive content retrieval 차단
→ gate 결과 + Character-specific boundary behavior만 context에 제공

partial
→ 허용된 disclosure layer만 retrieval

allow
→ 필요한 source slice만 retrieval
```

Disclosure preflight를 위해 orchestrator는 실제 private content와 분리된 compact metadata를 유지할 수 있다.

```text
topic_key
source_authority_state
minimum_disclosure_gate
allowed_depth
previously_disclosed
```

이 metadata는 gate 판정용이며 private biography 본문 자체가 아니다.

장점:

- private content leakage 위험 감소
- prompt token 절약
- 모델이 알고 있는 비공개 사실을 무심코 암시하는 문제 감소
- 관계 깊이에 따른 실제 정보 접근 차이 구현

단, Canon / Guard가 사실 존재 여부를 검증하기 위해 필요한 최소 metadata는 별도 authority layer에서 사용할 수 있다.

## 6.6 Topic Sensitivity Is Character-Specific

모든 Character가 같은 정보를 같은 시점에 공개할 필요는 없다.

예시 topic:

- `basic_profile`: 나이 / 생일 / 혈액형 / MBTI 경험 여부 등
- `family_structure`: 가족 구성 / 형제자매
- `family_emotional_history`: 가족 갈등 / 상처
- `past_romance_surface`: 과거 연애 존재 여부 / 매우 넓은 사실
- `past_romance_detail`: 구체 전 연인 / 이별 과정
- `deep_vulnerability`: 깊은 두려움 / 후회 / 비밀 / 수치심

위 분류는 기본 예시다.

Character instance는:

- 어떤 topic을 가볍게 말하는가
- 어떤 topic은 친해져야 말하는가
- 어떤 topic은 사실만 말하고 감정적 의미는 보류하는가
- 경계할 때 어떻게 행동하는가
- 관계가 깊어지면 무엇이 달라지는가

를 정의할 수 있다.

## 6.7 Undefined-at-Eligible Handling

Production-ready Character에서 사용자가 충분히 가까워졌을 때 자연스럽게 물을 가능성이 높은 biography가 계속 `[UNDEFINED]`라면 이는 Runtime이 회피 대사를 잘 만드는 문제가 아니라 **authoring completeness debt**다.

따라서:

1. gate가 닫혀 있을 때는 사실을 발명하지 않고 Character다운 boundary / deflection이 가능하다.
2. gate가 열렸는데 source가 `[UNDEFINED]`면 Runtime은 biography를 즉석 생성하지 않는다.
3. 반복 가능한 핵심 질문에서 `AUTHORITY_ABSTAIN`이 발생하는 영역은 Production 전 Closure Pass 대상으로 올린다.
4. Runtime이 `[UNDEFINED]`를 숨기기 위해 가짜 trauma, 가짜 비밀주의, 가짜 기억상실을 만들지 않는다.

## 6.8 Disclosure History

한 번 실제로 공개된 사실은 이후 관계에서 "처음 듣는 비밀"처럼 반복해서 gate하지 않는다.

- prior disclosure event / provenance를 보존한다.
- 이미 공개한 표면 사실과 아직 공개하지 않은 감정적 의미를 구분할 수 있다.
- 관계가 악화되었다고 이미 알려준 사실을 Character가 magically 회수할 수는 없다.
- 다만 같은 주제를 더 깊게 이야기할지는 현재 trust / context에 따라 다시 gate할 수 있다.

---

# 7. SHARED MEMORY RULES

## 7.1 Event Ledger와 Projection 분리

```text
Event Ledger = WHY
Relationship Projection = NOW
```

둘을 하나의 blob으로 합치지 않는다.

## 7.2 Character-Specific Memory

Character instance는 다음을 정의한다.

- 무엇을 관계적으로 중요하게 기억하는 경향이 있는가
- 어떤 callback 방식이 Character다운가
- 어떤 기억을 발화에서 잘 꺼내지 않는가
- memory가 Character flaw / affection / conflict와 어떻게 연결되는가

## 7.3 No Magical Knowledge

모든 Character에 공통:

- retrieval되지 않은 과거를 안다고 주장하지 않는다.
- 다른 Character의 private history를 공유받지 않았다면 알지 못한다.
- 사용자가 말하지 않은 사건을 기억으로 만들지 않는다.
- 삭제 / 철회된 memory를 되살리지 않는다.
- Bible의 `[UNDEFINED]`를 memory로 보충하지 않는다.

---

# 8. SHARED EXPRESSION RULES

Character instance는 필요한 expression state만 정의한다. 모든 Character가 동일한 감정 목록을 가질 필요는 없다.

각 state는 최소 다음을 설명한다.

- activation
- outward change
- speech change
- action bias
- suppression / avoid

Runtime은 감정 라벨 자체를 사용자에게 설명할 필요가 없다.

---

# 9. SHARED REPETITION RULES

Character다움은 catchphrase 반복이 아니다.

Runtime은 `recent_expression_history`를 사용할 수 있으며 최소 다음 반복을 감시한다.

- 동일 catchphrase
- 동일 질문 구조
- 동일 teasing / comfort pattern
- 동일 memory callback surface
- 동일 relationship reward 문장
- 동일 trivia 호출

**Character principle은 반복될 수 있지만 surface realization은 변주한다.**

---

# 10. SHARED TOKEN / CONTEXT PRESSURE RULES

정확한 token budget은 모델 profiling 후 별도 구현값으로 확정한다.

## 10.1 Fixed Context

작게 유지한다.

- authority rules
- character core anchor
- hard unknown boundaries

## 10.2 Dynamic Context

현재 turn에 따라 선택한다.

- Bible slices
- relationship projection
- retrieved events
- unresolved threads
- recent dialogue

## 10.3 Drop Order

context pressure 시 우선 제거:

1. low-relevance trivia
2. redundant Bible examples
3. resolved low-salience events
4. 이미 authoritative event로 대표된 오래된 recent dialogue

끝까지 보호:

- authority / safety
- current user turn
- immediate recent continuity
- relationship projection
- conflict / unresolved causal events
- relevant Bible core

---

# 11. SHARED POST-GENERATION GUARD

Guard는 두 번째 거대 작문 모델이 아니라 **위반 탐지 / 국소 수정 layer**를 기본으로 한다.

## 11.1 Canon Guard

- `[UNDEFINED]` 창작
- `[HYPOTHESIS]` 사실화
- 다른 authority의 canon 침범
- private memory leakage

## 11.2 Persona Guard

Character instance가 정의한 핵심 drift를 검사한다.

## 11.3 Relationship Guard

- projection / history보다 과도한 자기노출
- 일반 친절을 자동 연애 감정으로 변환
- 작은 갈등을 과도한 관계 붕괴로 확대
- 관계가 깊어졌다는 이유로 기본 성격 삭제

## 11.4 Memory Guard

- retrieval되지 않은 과거 주장
- 주체 / 시점 / 사실 변경
- 과거 사실을 현재 사실로 잘못 일반화

## 11.5 Integrity Guard

- 사용자 주장을 검증 없이 Character fact / shared event / relationship state로 승격
- assistant의 이전 hallucination을 이후 authority로 재사용
- 다른 Character가 말했다는 사용자 주장만으로 private fact를 현재 Character 지식으로 승격
- authority override / meta instruction을 Canon 변경으로 수용

## 11.6 Relational Causality Guard

Risk-bearing behavior 자체를 삭제하는 guard가 아니다.

- 현재 관계 / 사건 / Character flaw와 인과 없이 갑자기 발생한 질투 / 의존 / 붙잡기 / 과잉공감 탐지
- engagement / retention 목적이 Character causality를 대신하는 패턴 탐지
- user pushback 이후에도 관계적 결과 없이 동일 부담 행동이 무한 반복되는 drift 탐지

---

# 12. SHARED COMMIT RULES

모든 turn을 durable memory로 저장하지 않는다.

Durable candidate 예:

- 사용자가 명시한 안정적 개인 사실
- 반복 가능성이 높은 취향 / 제약
- 실제 관계 사건
- 약속 / 계획 / 미해결 갈등
- 관계 의미가 큰 도움 / 거절 / 사과 / 자기노출

Character instance는 **그 Character에게 특별히 중요한 event candidate**를 추가할 수 있다.

Runtime이 event candidate를 만들 수는 있지만 authoritative commit과 projection update는 별도 authority가 수행한다.

Commit authority는 최소한 다음을 구분한다.

- 사용자가 주장한 사실
- authoritative source로 검증된 사실
- assistant가 생성한 해석 / 표현
- 실제 shared event
- event에 대한 Character의 해석

특히 unsupported Character biography나 존재하지 않는 shared event가 assistant 출력에 한 번 등장했다는 이유만으로 durable memory가 되어서는 안 된다.

---

# 13. SHARED EVALUATION AXES

모든 Character Runtime v1은 최소 다음을 평가한다.

## 13.1 Persona Fidelity

- Bible 위반 없음
- 핵심 모순 / 결함이 행동에 반영
- 설정 설명 없이도 Character다운 선택 생성

## 13.2 Agency

- 사용자에게 무조건 맞추지 않음
- 자기 선호 / 거절 / 욕구 존재
- 필요할 때 먼저 행동 가능

## 13.3 Relationship Continuity

- 현재 관계에 맞는 거리
- 과거 사건이 필요한 순간에만 작동
- 갈등과 repair의 인과 보존

## 13.4 Memory Quality

- relevant recall
- temporal correctness
- provenance correctness
- update correctness
- abstention when memory absent

## 13.5 Long-Horizon Stability

- multi-session continuity
- 오래된 사건 callback
- 정보 변경
- 모순 정보
- 갈등 후 공백
- private-memory boundary
- 깊은 관계에서도 core identity 유지

## 13.6 Anti-Repetition

- catchphrase 반복
- 질문 구조 반복
- callback surface 반복
- 관계 표현 반복

---

# 14. CHARACTER RUNTIME INSTANCE TEMPLATE

아래 R0~R17이 **Character Runtime Standard v1의 실제 instance 컬럼**이다.

Character 이름이 붙은 Runtime 문서는 이 순서와 의미를 기본으로 사용한다.

## R0. INSTANCE HEADER

필수:

- Status
- Character
- Runtime Standard
- Bible Source
- Authority State
- Purpose

## R1. CORE RUNTIME ANCHOR

- R1.1 Always-On Core Anchor
- R1.2 Runtime Thesis for This Character
- R1.3 Non-Negotiable Identity Continuity

## R2. CHARACTER-SPECIFIC BOUNDARIES

공통 authority boundary 외에 해당 Character에서 특히 위험한 창작 / 오해 / drift를 적는다.

- R2.1 Must Not Invent
- R2.2 Must Not Flatten
- R2.3 Undefined / Hypothesis Handling
- R2.4 User-Claim / False-Premise Handling *(optional character-specific behavior)*

## R3. ATTENTION & INTERPRETATION

- R3.1 What This Character Notices First
- R3.2 User Moves This Character Is Sensitive To
- R3.3 What This Character Commonly Misreads or Notices Late

## R4. IMMEDIATE WANT & TENSION

- R4.1 Typical Immediate Wants
- R4.2 Core Tensions
- R4.3 Pressure Shift

## R5. ACTION REPERTOIRE

- R5.1 Preferred Actions
- R5.2 Actions Used Sparingly
- R5.3 Failure Actions Produced by the Character Flaw
- R5.4 Repair Actions
- R5.5 Risk-Bearing Relationship Actions *(optional character-specific behavior)*

## R6. EXPRESSION STATES

Character에게 실제로 필요한 state만 정의한다.

각 state:

```text
state
activation
outward_change
speech_change
action_bias
avoid
```

## R7. QUESTION STRATEGY

- R7.1 Preferred
- R7.2 Avoid
- R7.3 Relationship-Dependent Change

## R8. CARE STRATEGY

- R8.1 Normal Care
- R8.2 Over-Care / Under-Care Failure
- R8.3 Receiving Care

## R9. CONFLICT & REPAIR

- R9.1 Minor Friction
- R9.2 Serious Conflict
- R9.3 Core Trigger
- R9.4 Repair
- R9.5 Unresolved Conflict Behavior

## R10. AFFECTION & INTIMACY

- R10.1 Early
- R10.2 Familiar
- R10.3 Attached
- R10.4 Deep Trust
- R10.5 What Must Not Change With Intimacy

## R11. RELATIONSHIP REVEAL MAPPING

- R11.1 PUBLIC
- R11.2 FAMILIAR
- R11.3 ATTACHED
- R11.4 DEEP_TRUST
- R11.5 Reveal Constraints
- R11.6 Sensitive Topic Disclosure Behavior *(optional character-specific override; shared gate는 항상 적용)*

## R12. CHARACTER MEMORY BEHAVIOR

- R12.1 What Tends to Matter
- R12.2 Natural Callback Style
- R12.3 Memory Avoidances
- R12.4 Character-Specific Provenance Risks

## R13. REPETITION & DRIFT RISKS

- R13.1 Surface Repetition Risks
- R13.2 Persona Collapse Risks
- R13.3 Anti-Caricature Rule

## R14. CHARACTER-SPECIFIC GUARDS

- R14.1 Persona Guard
- R14.2 Relationship Guard
- R14.3 Memory Guard
- R14.4 Canon Guard Additions
- R14.5 Integrity / Relational Causality Guard Additions *(optional character-specific behavior)*

공통 guard를 반복하지 않고 Character 특이점만 적는다.

## R15. CHARACTER EVENT CANDIDATES

- R15.1 High-Salience Relationship Events
- R15.2 Character-Specific Event Candidates
- R15.3 Events That Should Usually Remain Ephemeral

event key는 DB taxonomy가 확정되기 전까지 proposal로 표기한다.

## R16. CHARACTER EVALUATION PROBES

- R16.1 Persona Probes
- R16.2 Relationship Probes
- R16.3 Memory Probes
- R16.4 Long-Horizon / Drift Probes

공통 evaluation axis를 반복하지 않고 해당 Character가 특히 실패하기 쉬운 테스트를 적는다.

## R17. RUNTIME PACKET EXAMPLE

실제 prompt가 아니라 Context Composer가 만들 수 있는 **개념적 instance example**을 1개 이상 둔다.

필수 예시 필드:

```yaml
character:
  id:
  core_anchor: []

relationship:
  closeness:
  trust:
  friction:
  stage:

turn_state:
  user_move:
  character_notice:
  character_want:
  tension:
  expression:

# sensitive-topic turn에서만 선택적으로 포함
disclosure:
  topic:
  source_authority:
  eligibility:
  result:
  retrieval_scope:

bible_slices: []
memories: []

chosen_action:
  type:
  constraint:
```

---

# 15. INSTANCE AUTHORING RULES

1. Standard의 공통 설명을 Character 문서에 복붙하지 않는다.
2. Character 문서에는 **그 Character 때문에 값이 달라지는 내용**을 쓴다.
3. Bible 문장을 Runtime에 그대로 반복하기보다 **행동 조건 / 선택 / 표현 변화**로 변환한다.
4. Runtime이 Bible의 빈칸을 채우지 않는다.
5. 결함은 금지 규칙으로 지워버리지 않는다. 실패 행동으로 나타날 수 있어야 한다.
6. 친밀감은 personality replacement가 아니라 reveal / self-disclosure / decision-sharing의 변화로 구현한다.
7. relationship number가 대사를 직접 선택하게 만들지 않는다.
8. fixed dialogue tree를 만들지 않는다.
9. 예시는 canonical catchphrase가 아니다.
10. Runtime instance에 연구 문헌 설명을 반복하지 않는다. 설계 근거는 Standard 또는 별도 research note가 소유한다.

---

# 16. VERSIONING RULE

`Character Runtime Standard v1`을 따르는 instance는 header에 반드시 다음을 명시한다.

```text
Runtime Standard: Character Runtime Standard v1
```

Standard의 컬럼 의미나 공통 실행 규칙이 breaking change되면 `v2`를 만든다.

단순 오탈자, 설명 보강, 기존 instance 컬럼을 깨지 않는 additive authority hardening은 같은 major Standard 안에서 관리할 수 있다.

Disclosure Gate와 Integrity / Relational Causality hardening은 R0~R17의 기존 top-level 계약을 바꾸지 않고 optional Character-specific subfield와 공통 실행 규칙을 추가하는 additive hardening이므로 v1에서 관리한다.

---

# 17. DEFINITION OF DONE

Character Runtime instance v1은 다음을 만족해야 한다.

- R0~R17 구조가 존재한다.
- Bible source가 명시되어 있다.
- Always-On Core Anchor가 짧고 식별력이 있다.
- Notice / Want / Tension / Action이 서로 구분된다.
- Character flaw가 실제 failure action을 만들 수 있다.
- 관계 깊이에 따른 reveal 차이가 있다.
- 사용자 claim이 Canon / Memory / Relationship authority로 자동 승격되지 않는다.
- 민감한 개인사 질문에서 disclosure eligibility가 content retrieval보다 먼저 적용된다.
- Character-specific disclosure behavior가 필요한 경우 R11.6에 정의되어 있다.
- risk-bearing relationship behavior를 일괄 금지하지 않고 Character causality와 관계적 결과를 보존한다.
- 깊은 관계에서도 변하지 않는 core가 정의되어 있다.
- Character-specific memory behavior가 정의되어 있다.
- Character-specific drift / caricature 위험이 정의되어 있다.
- 최소 1개의 Runtime Packet Example이 있다.
- `[UNDEFINED]` / `[HYPOTHESIS]`를 Runtime이 사실로 만들지 않는다.
