# 명하 Dynamic Narrative Feasibility v0.1 — Working Draft

> Status: **DRAFT / NON-AUTHORITY**
> Date: **2026-08-30**
> Scope: 사용자 누적 기록, 사용자-캐릭터 관계 상태, 다인 장면을 이용한 내러티브 변형 가능성
> Important: 이 문서는 relationship policy, unlock DSL, episode evaluator, DB migration을 확정하지 않는다.

---

## 1. Core Question

> 사용자의 쌓인 삶의 기록과 캐릭터와의 관계 정도에 따라 같은 공식 에피소드/장면의 내용이 달라지는 것이 실제 구현 가능한가?

답은 **가능하지만, '무한 분기 스토리' 방식으로 만들면 실패한다.**

현실적인 방식은:

```text
공식 서사 뼈대
+ deterministic state selection
+ bounded authored variants
+ granted user memories/life facts
+ character-specific rendering
= 개인화된 장면
```

이다.

LLM이 사용자의 전체 역사와 모든 관계를 보고 다음 줄거리 자체를 마음대로 만드는 구조는 피한다.

---

## 2. Three Layers

### Layer A — Canonical Event Skeleton

작가/Content Bundle이 결정하는 공식 사건.

예:

- 명하관 기록 사고
- 백헌이 어떤 결정을 내려야 하는 사건
- 세연과 사용자가 다시 만나는 특정 장면

사건의 핵심 사실과 결과 범위는 canon authority가 가진다.

### Layer B — State-Driven Variant Selection

서버가 현재 subject state를 보고 허용된 variant를 고른다.

후보 입력:

- user↔character relationship stage / projection
- 해당 oath reveal 여부
- 특정 episode/world event 완료 여부
- 명시적으로 저장된 Life Fact / approved Memory tag
- 해당 scene 참가 캐릭터와의 관계 상태

### Layer C — Character Rendering

선택된 장면과 허용된 기억을 Character Runtime에 전달해 캐릭터 말투, 반응, 질문, 관계 표현을 렌더링한다.

기존 `AI_CHARACTER_RUNTIME_SPEC.md`의 policy-filtered context / relationship projection / granted memory / scene state 경계를 유지한다.

---

## 3. What 'Narrative Changes' Should Mean

가능하고 관리 가능한 변화:

- 같은 사건에서 먼저 찾아오는 캐릭터가 다름
- 같은 대사의 온도/거리감이 관계 단계에 따라 달라짐
- 과거에 사용자가 맡긴 특정 이야기를 캐릭터가 연결해서 언급함
- 이미 서약을 안 사용자는 설명을 생략하고 더 깊은 대화를 함
- 두 캐릭터와 모두 관계가 깊으면 다인 장면의 분위기/호칭/신뢰 정도가 달라짐
- 특정 선택의 후속 장면이 이후 다른 에피소드에서 callback됨

관리 불가능한 기본값:

- 모든 사용자 행동이 새로운 plot branch를 영구 생성
- 모든 캐릭터 쌍의 호감도 조합별로 별도 스토리 작성
- LLM이 canon 사건/과거/관계 변화를 자유 생성
- 과거 대화 전체를 매번 읽어 '알아서' 일관된 세계를 유지

---

## 4. Avoid Combinatorial Explosion

9 characters × multiple relationship stages × user history tags × character pair states를 전부 조합하면 즉시 폭발한다.

따라서 scene 하나가 보는 동적 조건 수를 제한해야 한다.

Working rule candidate:

> **한 장면은 핵심 personalization signal 1~3개만 본다.**

예:

```text
SCENE_BAEKHEON_DECISION_07

required:
- baekheon.relationshipStage >= TRUST

variant signals:
- baekheon.oathRevealed
- user.lifeFact has RECENT_JOB_DECISION
- seyeon.relationshipStage >= CLOSE (only if Seyeon participates)
```

나머지 사용자 역사는 해당 장면에서 무시한다.

이렇게 하면 '내 이야기 같다'는 느낌은 유지하면서 콘텐츠 조합 폭발을 막을 수 있다.

---

## 5. Relationship State: User↔Character vs Character↔Character

둘을 구분한다.

### 5.1 User↔Character

개인화에 적극 사용 가능.

예:

- 친밀도/신뢰가 낮음 → 공적 말투
- 신뢰가 높음 → 먼저 개인적 사정을 말함
- 특정 Gate 완료 → 과거/서약 callback 가능

### 5.2 Character↔Character

기본적으로 global canon relation/knowledge를 따른다.

사용자 행동 때문에 모든 캐릭터 쌍의 관계 score가 실시간 변화하는 `질투 시뮬레이터`를 기본으로 하지 않는다.

특정 episode가 명시적으로 두 캐릭터 관계를 subject-specific하게 변화시키는 경우에만 별도 world/episode state로 다룬다.

즉:

```text
사용자가 세연과 친함
+ 윤호와 친함
→ 둘이 자동으로 질투/경쟁 관계가 되는 것 X

공식 다인 episode에서 둘 사이에 실제 사건이 생김
→ 그 episode 후 상태가 달라질 수 있음 O (별도 설계 필요)
```

---

## 6. Example

공식 사건:

> 사용자가 큰 결정을 앞두고 백헌과 기록을 검토한다.

### User A

- 백헌 신뢰 낮음
- 서약 미공개
- 관련 Life Fact 없음

장면:

> 백헌이 비교적 공적인 태도로 현재 선택과 책임을 묻는다.

### User B

- 백헌 신뢰 높음
- 서약 공개됨
- 과거에 이직 고민을 맡긴 기록 존재

동일 사건이지만:

> 백헌은 이전에 사용자가 결정을 미뤘던 사실을 callback하고, 이번에는 무엇이 달라졌는지 묻는다. 서약 설명은 반복하지 않는다.

### User C

- 위 조건 + 백헌과 Gate B 관계 marker 존재

동일 사건이지만:

> 백헌이 자신의 판단을 먼저 주기보다 사용자에게 맡겨도 된다는 신뢰를 표현하는 variant가 열린다.

핵심 plot은 동일하지만 **관계의 의미가 달라진다.**

---

## 7. Why This Is Technically Plausible In Current Architecture

현재 Character Runtime은 이미 renderer context 후보로 다음을 갖는다.

- current relationship projection
- explicitly granted Life Facts
- explicitly granted Memories
- world relation canon
- recent messages
- Saju envelope
- scene state

따라서 필요한 핵심은 LLM 능력 자체보다:

1. 어떤 상태를 durable하게 저장할지
2. episode/scene이 어떤 bounded 조건을 읽을지
3. 어떤 variant를 deterministic하게 선택할지
4. 선택된 variant 안에서 LLM에게 어느 정도 표현 자유를 줄지

이다.

현재 relationship mutation policy와 unlock/condition evaluator는 아직 source gap이 있으므로 executable contract로 확정하면 안 된다.

---

## 8. Content Cost Model

Dynamic narrative의 목표는 `사용자마다 완전히 다른 스토리를 생성`하는 것이 아니다.

보다 현실적인 목표:

> **하나의 공식 콘텐츠를 여러 관계 상태에서 서로 다르게 느끼게 만드는 것.**

예를 들어 한 episode를:

```text
1 canonical skeleton
+ 3 relationship variants
+ 2 relevant memory callbacks
+ character renderer
```

정도로 만들면 6개의 완전 독립 에피소드를 쓰는 것보다 훨씬 싸면서 개인화 체감은 높일 수 있다.

---

## 9. Product Rule Candidate

> **큰 사건은 작가가 만든다. 그 사건이 '나에게 어떤 의미였는가'는 지금까지 쌓인 관계와 기록이 바꾼다.**

이 문장이 명하의 dynamic narrative 목표로 가장 적합하다.

---

## 10. Validation Before Architecture Expansion

바로 generic narrative engine을 만들지 않는다.

백헌 하나로 작은 vertical slice를 먼저 검증한다.

필요한 샘플:

- 동일 canonical scene 1개
- 관계 상태 3종
- user Life Fact callback 1종
- oath reveal 여부 2종

이 조합을 실제로 렌더링했을 때 사용자가 `같은 이벤트의 색칠놀이`가 아니라 `내 관계에 맞게 달라졌다`고 느끼는지 확인한다.

그 체감이 약하면 dynamic branching 자체를 확대하지 않는다.
