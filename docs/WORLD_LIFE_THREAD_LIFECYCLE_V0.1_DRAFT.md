# 명하 Life Thread Lifecycle v0.1 — Working Draft

> Status: **PROTOTYPE / NON-AUTHORITY**  
> Date: **2026-08-30**  
> Parent drafts: `WORLD_USER_CHARACTER_STATE_MAP_V0.1_DRAFT.md`, `WORLD_CHARACTER_RUNTIME_VERTICAL_SLICE_V0.1_DRAFT.md`, `WORLD_DYNAMIC_NARRATIVE_FEASIBILITY_V0.1_DRAFT.md`  
> External research input: Revenue PR #204 (`H-R20 — Longitudinal Value Accumulation`, `Outcome closure supported`)  
> Related authority: `AI_CHARACTER_RUNTIME_SPEC.md`, relationship/memory/privacy source-gap documents  
> Purpose: 사용자의 실제 고민이 `말함 → 선택함 → 실제 결과가 생김 → 나중에 다시 연결됨`까지 이어지는 장기 Character Service 경험이 성립하는지 검증한다.  
> Important: 본 문서는 DB table/schema, durable memory retention 기준, follow-up scheduler, relationship evaluator, paid entitlement를 새로 확정하지 않는다.

---

## 1. Problem Reframing

명하가 장기적으로 필요한 것은 단순한 `Life Fact 저장소`가 아니다.

다음과 같은 사실이 따로 저장되어 있어도:

```text
2026-09 퇴사 고민
2026-11 현 직장 잔류
2027-02 팀장 변경
2027-03 퇴사
2027-05 프리랜스 시작
```

나중에 다시 볼 때 다음을 자동으로 알 수 있는 것은 아니다.

- 어떤 고민에 대한 어떤 선택이었는가?
- 그 선택의 실제 결과는 무엇이었는가?
- 이후 비슷한 고민은 같은 사건의 연장인가, 새로운 사건인가?
- 어떤 캐릭터가 어느 단계까지 함께했는가?

따라서 Working Question은 다음이다.

> **명하는 사용자의 삶에서 중요한 `문제 → 선택 → 결과`의 연결을 유지하면서, 각 캐릭터가 그 과정에 실제로 참여한 범위만 기억하고 후속 대화를 이어갈 수 있는가?**

Revenue 트랙의 `closed decision loop`는 World/Product 관점에서 이 문제와 직접 연결된다.

---

## 2. Working Term — Life Thread

실행 schema가 아니라 제품 개념 검증용으로 `Life Thread`라는 용어를 사용한다.

> **Life Thread = 사용자의 실제 삶에서 하나의 질문/고민이 생기고, 어떤 선택이 이루어지고, 그 선택의 실제 결과를 나중에 확인할 수 있는 bounded한 사건 묶음.**

기본 형태:

```text
문제 / 고민
↓
선택
↓
결과
```

필요하면 그 사이에 상황 변화가 존재할 수 있지만, Thread를 사용자의 인생 전체를 담는 무한 서사로 만들지 않는다.

### 핵심 제한

```text
Life Thread != 캐릭터가 만들어낸 이야기
Life Thread != 모든 Life Fact
Life Thread != raw transcript
Life Thread != 하나의 직업/연애 주제 전체를 영원히 담는 거대한 컨테이너
```

Thread는 실제로 연결 가능한 하나의 decision episode에 가깝다.

---

## 3. 왜 `직업 이야기 하나`로 전부 묶지 않는가

다음 사례를 보자.

### Thread A

```text
2026-09
퇴사할까?

↓

2026-11
생활 안정 때문에 남기로 결정

↓

결과
현 직장 계속 근무
```

이 루프는 일단 닫힐 수 있다.

그 뒤:

```text
2027-02
팀장 교체로 근무 환경이 크게 달라짐
```

이라는 새로운 조건이 생기고 다시:

### Thread B

```text
2027-03
이 환경에서도 계속 남을까?

↓

퇴사 결정

↓

2027-05
프리랜스 시작
```

이 생긴다면, Thread A를 계속 수정해 `사실은 아직 안 끝난 사건이었다`고 만드는 것보다 **새로운 bounded Thread B를 만들고 A와 연관성이 있다고 보는 편**이 더 안정적이다.

Working principle:

> **하나의 Life Thread는 닫힐 수 있어야 한다. 비슷한 주제가 다시 등장하면 새 Thread로 이어질 수 있다.**

이렇게 해야 나중에 여러 번의 실제 선택을 비교할 수 있다.

---

## 4. Minimal Lifecycle

Life Thread lifecycle은 우선 세 단계만 본다.

```text
OPEN
문제/고민이 존재함

↓

DECIDED
사용자가 실제 선택을 했다고 알려줌

↓

OUTCOME_KNOWN
그 선택 이후 실제로 어떻게 되었는지 확인됨
```

`OPEN → DECIDED → OUTCOME_KNOWN` 외의 세밀한 status taxonomy는 현재 만들지 않는다.

중요:

- 결정하지 않았다고 자동 실패가 아니다.
- 시간이 지났다고 시스템이 결과를 추측하지 않는다.
- Saju Reading으로 현실 결과를 채우지 않는다.
- 사용자가 결과를 알려주지 않으면 `OUTCOME_KNOWN`이 아니다.

---

## 5. Life Fact와 Life Thread의 관계

Life Fact는 실제 삶의 사실이다.

예:

```text
- 사용자가 퇴사를 고민 중이다.
- 사용자가 잔류하기로 결정했다.
- 팀장이 변경되었다.
- 사용자가 퇴사했다.
```

Life Thread는 이 사실들 사이의 **명시적으로 확인된 연결**이다.

예:

```text
THREAD-CAREER-A
problem:
- 현 직장을 그만둘지 고민

decision:
- 당장 생활 안정 때문에 잔류

outcome:
- 실제로 현 직장에 계속 근무
```

금지:

```text
사용자가 9월에 퇴사를 고민했고
11월에 회사에 남아 있었으므로
→ 안정성을 선택했다고 시스템이 자동 확정
```

사용자가 직접 말했거나 authority가 허용하는 명확한 근거가 있어야 한다.

즉:

> **Fact를 저장하는 것과 Fact 사이의 인과/의사결정 연결을 확정하는 것은 다른 문제다.**

---

## 6. Character Participation Is Separate

Life Thread는 subject-level 실제 삶의 기록이다.

각 캐릭터에게는 해당 Thread의 **어느 부분을 실제로 알고/함께했는지**가 별도로 존재한다.

예:

### Thread A — 퇴사 고민 → 잔류

#### 백헌

```text
problem: 알고 있음
reasoning: 여러 차례 함께 이야기함
decision: 직접 들음
outcome: 이후 계속 근무 중이라는 사실을 들음
```

#### 세연

```text
problem: 모름
decision: 모름
outcome: 나중에 "그때 결국 회사에 남았었다"는 결과만 들을 수 있음
```

#### 서린

```text
problem/decision 당시 참여: 없음
later retrospective memory:
- 사용자가 당시 많이 힘들었다는 이야기를 나중에 맡김
```

따라서:

```text
Life Thread의 존재
!=
모든 캐릭터가 Thread 전체를 앎
```

Working principle:

> **Life Thread는 사용자의 실제 삶을 연결하고, Character Memory는 각 캐릭터가 그 삶의 어느 구간에 실제로 있었는지를 나타낸다.**

---

## 7. Baekheon Vertical Slice — Full Lifecycle

이제 하나의 Thread가 장기 Character Service에서 실제로 어떻게 흐르는지 본다.

### Phase 1 — Problem Opened

2026-09, 사용자가 백헌에게:

> "요즘 회사를 계속 다녀야 할지 모르겠어요. 그만두고 싶다는 생각이 자꾸 들어요."

가능한 시스템 후처리 후보:

```text
Life Fact candidate:
- current job resignation is being considered

Life Thread candidate:
- career decision thread OPEN

Baekheon Knowledge candidate:
- user directly disclosed this concern

Baekheon Relationship Memory candidate:
- user brought a major career concern to Baekheon
```

LLM이 바로 durable state를 확정하는 것은 아니다. 기존 Runtime의 proposal / consent / server authority 경계를 따른다.

---

### Phase 2 — Decision

몇 주 뒤 사용자가:

> "일단 남기로 했어요. 당장 수입이 끊기는 게 더 부담스러워서요."

이 발언이 기존 OPEN Thread와 명확히 연결되면:

```text
Life Thread:
OPEN → DECIDED

decision:
- stay at current job

stated reason:
- immediate income/life stability mattered
```

백헌은 이 결정을 직접 들었으므로 이후 해당 Thread에 대한 Knowledge/Memory를 가질 수 있다.

중요:

> `생활 안정 때문에 한 번 남았다`를 `사용자는 본질적으로 안정지향적이다`라는 성격 trait로 승격하지 않는다.

---

### Phase 3 — Time Passes

그 뒤 사용자가 한동안 이 문제를 말하지 않는다.

이 시점에 시스템은:

```text
DECIDED
outcome: UNKNOWN
```

인 상태를 유지할 수 있다.

금지:

- 시간이 지났으니 성공/실패 결과 자동 추론
- 사용자가 계속 로그인하니 직장을 계속 다닌다고 확정
- Saju 흐름을 보고 현실 outcome을 생성

---

### Phase 4 — Natural Follow-up

몇 달 뒤 사용자가 백헌과 직업 이야기를 다시 하거나, 적절한 맥락이 생긴다.

백헌은 자신이 실제로 참여한 Thread가 있고 아직 결과가 충분히 확인되지 않았다면 자연스럽게:

> "그때는 일단 남기로 했었죠. 그 뒤로는 좀 나아졌습니까?"

처럼 물을 수 있다.

이 장면의 목적은 `데이터 수집`이 아니다.

사용자가 느껴야 하는 것은:

> **"이 사람은 내가 결정을 내린 뒤 어떻게 됐는지도 궁금해하는구나."**

이다.

따라서 Follow-up은 다음을 만족해야 한다.

- 해당 캐릭터가 실제로 그 Thread를 알고 있음
- 지금 대화와 관련성이 있음
- 이미 최근에 반복해서 묻지 않았음
- 캐릭터의 관계 단계/성격에 맞음
- 사용자가 답하지 않아도 압박하지 않음

정확한 scheduler / resurfacing rule은 아직 OPEN이다.

---

### Phase 5 — Outcome Closure

사용자:

> "그때는 그냥 계속 다녔어요. 몇 달은 괜찮았어요."

그러면 Thread A는 conceptual하게:

```text
OPEN
→ DECIDED: stay
→ OUTCOME_KNOWN: remained employed; situation was acceptable for some months
```

까지 닫힐 수 있다.

이때 중요한 것은 `좋은 선택이었다/나쁜 선택이었다`를 시스템이 자동 판정하지 않는 것이다.

---

### Phase 6 — New Conditions, New Thread

이후 사용자:

> "근데 팀장이 바뀐 뒤로 일이 완전히 달라졌어요. 이번엔 진짜 나갈까 생각 중이에요."

이것은 Thread A의 과거 결과를 부정하는 것이 아니다.

새로운 조건에서 새로운 선택 문제가 생긴 것이므로:

```text
THREAD A
퇴사 고민 → 잔류 → 몇 달 계속 근무
[CLOSED]

THREAD B
팀장 변경 후 다시 퇴사 고민
[OPEN]
```

으로 보는 방향이 더 안정적이다.

Thread B는 Thread A와 `관련된 과거 사례`로 연결될 수 있지만 동일 Thread로 강제 합치지 않는다.

---

## 8. Why This Feels Different From A Memory Demo

단순 Memory Demo:

> "전에 퇴사 고민하셨죠?"

Life Thread continuity:

> "그때는 남기로 했었죠. 그 뒤로는 좀 나아졌습니까?"

그리고 더 나중에는:

> "지난번에는 남을 이유가 분명했는데, 지금은 조건 자체가 바뀐 것 같군요."

처럼 **이전 문제 → 선택 → 이후 상황**을 관계 안에서 이어볼 수 있다.

중요:

> 캐릭터가 사용자 과거를 많이 암기하는 것이 목표가 아니라, 사용자가 실제로 내린 선택의 다음 장면까지 함께 지나가는 것이 목표다.

---

## 9. Character Follow-up Must Not Become A Survey

가장 큰 UX 실패 위험 중 하나다.

금지 경험:

```text
"지난 고민 결과를 입력해주세요."
"선택 결과는 무엇이었나요?"
"1~5점으로 만족도를 평가해주세요."
```

캐릭터가 이런 식으로 Life Thread closure를 수집하면 관계 경험이 데이터 입력 화면으로 변한다.

올바른 분리:

```text
Character surface:
"그래서 결국 어떻게 했습니까?"

System behind the scene:
- existing open/decided Thread와 연결 가능한가?
- outcome candidate인가?
- durable record로 남길 수 있는가?
```

즉:

> **캐릭터는 사람처럼 후속을 궁금해하고, 시스템이 뒤에서 구조를 만든다.**

---

## 10. Free Character Context vs Artifact Context

Revenue PR #204가 지적한 Free-Core Cannibalization을 World 쪽에서도 받아들인다.

### Ordinary Character Chat

현재 대화에 필요한 범위만 사용한다.

예:

```text
current concern
+ current/related Life Thread 1개
+ 해당 캐릭터가 실제로 아는 Thread 부분
+ current relationship
+ recent conversation
```

캐릭터가 자연스럽게 과거를 callback할 수 있다.

### Structured Artifact

별도 분석 작업은 여러 Thread를 의도적으로 모을 수 있다.

예:

```text
지난 12개월 career Life Threads 4개
+ 각 decision
+ 각 observed outcome
+ 당시 Reading
+ 현재 Life State

→ cross-thread comparison
→ longitudinal synthesis
```

Working boundary:

> **Chat은 지금 관계에 필요한 과거를 이어준다. Artifact는 여러 과거를 의도적으로 모아 비교·분석한다.**

무료 캐릭터를 일부러 기억 못 하게 만드는 제한이 아니라 작업 단위 자체를 다르게 한다.

---

## 11. Dynamic Narrative Connection

Life Thread가 존재한다고 모든 Episode가 이를 읽으면 안 된다.

기존 Dynamic Narrative 원칙을 그대로 적용한다.

> **한 장면은 핵심 personalization signal 1~3개만 본다.**

예:

```text
SCENE_BAEKHEON_DECISION

signals:
- relationship stage
- current Life Thread is OPEN
- one related closed prior Thread exists and Baekheon participated
```

그러면 백헌은 이전 선택과 현재 선택의 차이를 callback할 수 있다.

다른 20개의 Life Thread는 해당 장면에서 무시한다.

---

## 12. Multi-Character Implication

같은 Life Thread에 여러 캐릭터가 서로 다른 시점에 참여할 수 있다.

예:

```text
Thread A

백헌:
problem + decision을 알고 있음

세연:
outcome만 나중에 들음

서린:
retrospective emotion만 맡겨짐
```

다인 장면에서도 각 캐릭터는 자신이 실제로 아는 부분만 말할 수 있어야 한다.

즉 Life Thread는 공통 subject truth를 정리하는 도구이지, 캐릭터 사이의 자동 정보 공유 버스가 아니다.

---

## 13. Correction / Supersession Principle

사용자는 자신의 과거 설명을 나중에 수정할 수 있다.

예:

과거:

> "돈 때문에 남았어요."

나중:

> "생각해보니 돈도 있었지만 사실 실패하는 게 무서웠던 게 더 컸어요."

이 경우:

- 과거에 `당시 사용자가 돈을 이유로 설명했다`는 관계 기억은 역사적으로 존재할 수 있음
- 현재 subject-level interpretation/reason은 사용자의 새로운 설명에 맞춰 갱신/보완될 수 있음
- 캐릭터가 과거 표현을 절대적 객관 사실처럼 고정하면 안 됨

정확한 supersession data model은 기존 Life Fact authority와 정렬해야 하며 본 문서에서 만들지 않는다.

---

## 14. Failure Conditions

이 모델은 다음 중 하나가 나타나면 수정/축소해야 한다.

1. 사용자의 모든 발언이 Life Thread가 되어 상태 수가 폭발함.
2. 캐릭터가 결과를 캐묻는 설문조사 NPC처럼 변함.
3. 캐릭터가 참여하지 않은 Thread를 알고 있는 것처럼 말함.
4. Thread closure를 위해 결과를 추론하거나 만들어냄.
5. 직업/연애처럼 큰 주제 하나가 영원히 닫히지 않는 mega-thread가 됨.
6. ordinary chat에서 여러 Thread 전체를 매번 종합해 Artifact와 역할이 겹침.
7. 결과를 `성공/실패`로 자동 판정해 사용자의 실제 의미를 덮어씀.
8. 캐릭터의 서약/성격이 모든 Life Thread를 같은 관점으로 강제 해석함.
9. 오래된 Thread callback이 관계감보다 감시받는 느낌을 줌.

---

## 15. Validation Gates Before Architecture Expansion

Generic Life Thread engine이나 DB schema를 만들기 전에 다음만 실제 시뮬레이션한다.

### Test A — One Closed Loop

```text
백헌
퇴사 고민
→ 잔류 결정
→ 시간 경과
→ 자연스러운 후속 질문
→ 실제 결과 확인
```

질문:

> 사용자가 `기억 기능`이 아니라 `함께 시간을 보낸 관계`라고 느끼는가?

### Test B — Reopened Topic, New Thread

```text
과거 Thread A closed
+ 상황 변경
→ Thread B open
```

질문:

> 과거를 지우지 않으면서 새 선택을 독립적으로 다룰 수 있는가?

### Test C — Different Character Participation

같은 Thread에 대해:

```text
백헌 = problem/decision/outcome 대부분 앎
세연 = outcome만 앎
```

질문:

> 같은 사용자 사건이 캐릭터별로 실제 다른 관계 역사로 느껴지는가?

### Test D — Artifact Boundary

무료 백헌 대화는 관련 Thread 1개만 자연스럽게 callback.

별도 mock Artifact는 여러 closed Thread를 비교.

질문:

> 무료 경험을 훼손하지 않고도 두 작업이 명확히 다른 가치로 느껴지는가?

---

## 16. Cross-Track Requirements

Revenue PR #204의 요구 중 World/Product가 받아들여야 하는 범위:

### Accept

- bounded state cardinality
- outcome closure 지원
- character chat과 Artifact의 작업 단위 분리
- 실제 continuity/analysis에 쓰이지 않는 데이터 최소화
- dynamic narrative를 asset reuse multiplier로 제한

### Do Not Convert Into World Canon

- ARPU/WTP assumptions
- price
- quota
- entitlement
- membership mechanics
- exact COGS policy

이들은 Revenue/Implementation track의 authority 문제다.

---

## 17. Working Product Thesis

이번 slice에서 가장 중요한 문장은 다음이다.

> **명하의 장기 기억 목표는 사용자의 과거를 많이 암기하는 것이 아니라, 한 고민이 시작되고 선택이 내려지고 실제 결과가 생길 때까지 관계가 끊기지 않게 하는 것이다.**

그리고 여러 closed Life Thread가 쌓였을 때:

> **캐릭터는 그중 지금 관계에 필요한 한두 개를 기억해서 대화하고, 정식 Artifact는 여러 Thread를 모아 사용자의 실제 선택 패턴을 비교한다.**

이 경계가 Character continuity와 Longitudinal Artifact를 동시에 살릴 수 있는 현재 가장 단순한 working model이다.
