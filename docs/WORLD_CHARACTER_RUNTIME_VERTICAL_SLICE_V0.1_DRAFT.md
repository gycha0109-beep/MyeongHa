# 명하 Character Runtime Vertical Slice v0.1 — Baekheon + Seyeon

> Status: **PROTOTYPE / NON-AUTHORITY**  
> Date: **2026-08-30**  
> Parent drafts: `WORLD_USER_CHARACTER_STATE_MAP_V0.1_DRAFT.md`, `WORLD_DYNAMIC_NARRATIVE_FEASIBILITY_V0.1_DRAFT.md`  
> Related authority: `AI_CHARACTER_RUNTIME_SPEC.md`, relationship/memory/privacy authority docs  
> Purpose: 추상적인 Memory 설계가 아니라, **같은 사용자가 서로 다른 캐릭터와 서로 다른 역사를 가진 상태로 장기 대화하는 경험이 실제로 성립하는지** 백헌/세연 2인 vertical slice로 검증한다.  
> Important: 아래 field 이름, stage 이름, dialogue line은 executable schema나 최종 canon이 아니다. 특히 relationship mutation / unlock / memory persistence policy를 새로 확정하지 않는다.

---

## 1. Validation Question

이번 slice가 검증할 것은 하나다.

> **같은 사용자가 같은 말을 해도, `현재 관계`와 `그 캐릭터가 실제로 알고 있는 과거`가 다르면 정말로 서로 다른 관계를 이어가는 사람처럼 느껴지는가?**

검증하려는 차이는 단순 말투 차이가 아니다.

```text
나를 얼마나 가까이 대하는가        = Relationship State
나에 대해 무엇을 실제로 아는가      = Character Knowledge / Memory
우리 사이에 어떤 서사가 끝났는가    = Character Narrative State
내 삶에 실제로 무엇이 있었는가       = Life State
```

이 네 가지가 독립적으로 작동해야 한다.

---

## 2. Shared User Situation

동일 사용자에게 다음 삶의 이력이 있다고 가정한다.

### Subject-level Life State

```text
LIFE-01
2026-09
사용자가 현 직장을 그만둘지 고민하기 시작함

LIFE-02
2026-10
당장의 생활 안정 문제 때문에 현 직장에 남기로 결정함

LIFE-03
2027-02
직장 문제로 다시 퇴사를 고민하는 상태
```

중요:

> 위 Life State가 존재한다는 사실만으로 모든 캐릭터가 LIFE-01/02의 내용을 아는 것은 아니다.

이번 테스트의 현재 사용자 메시지는 두 캐릭터에게 **완전히 동일**하다.

> **사용자:** "요즘 또 회사를 그만둘까 고민돼요."

Saju Reading은 이번 slice에서 사용하지 않는다. 목적은 `Character State + Memory + Relationship` 효과만 분리해서 보는 것이다.

---

# 3. Baekheon Runtime

## 3.1 Baekheon State Before Turn

### Relationship Projection — conceptual

```text
stage: PRIVATE_TRUST        # 이름은 prototype
social_distance: close
private_face_available: true
```

의미:

- 사용자를 이미 상당히 신뢰한다.
- 공적인 관계자에게 하듯 거리만 두는 단계는 지났다.
- 그렇다고 사용자의 모든 정보를 알거나 자동 접근할 수 있는 것은 아니다.

### Character Knowledge

백헌은 이전 퇴사 고민을 **직접 들었다.**

```text
KNOW-B-01
user considered leaving current job in 2026-09
source: directly disclosed to Baekheon

KNOW-B-02
user decided to stay in 2026-10 because immediate financial/life stability mattered
source: directly disclosed to Baekheon
```

### Relationship Memory

```text
MEM-B-01
백헌과 사용자는 2026-09~10 사이 퇴사 여부를 여러 차례 같이 이야기했다.

MEM-B-02
당시 사용자는 결국 '당장 떠나는 것'보다 생활 안정성을 우선해 잔류 결정을 했다.
```

`MEM-B-02`는 백헌이 알고 있는 과거 선택의 맥락이지, `사용자는 본질적으로 안정지향적이다` 같은 성격 판정이 아니다.

### Character Narrative State

Prototype test condition:

```text
oath_revealed: true
major_boundary_completed: false
```

따라서 백헌은 자신의 선택/책임 관점을 숨겨야 하는 초기 단계는 아니지만, 이 사실이 자동으로 모든 대화에서 서약 설명을 반복하게 만들면 안 된다.

---

## 3.2 Context Packet Actually Needed For This Turn

개념적으로 Renderer에 필요한 정보는 다음 정도다.

```text
[PINNED CHARACTER]
Baekheon
- competent / stable / responsible adult
- relationship fantasy: public competence, selectively visible private face
- prototype principle: choice / responsibility / consequence

[CURRENT RELATIONSHIP]
- PRIVATE_TRUST
- can speak with established familiarity

[RELEVANT GRANTED KNOWLEDGE]
- user considered resignation before
- user stayed because immediate stability mattered

[RELEVANT RELATIONSHIP MEMORY]
- Baekheon discussed that previous decision with user over time

[NARRATIVE]
- oath already revealed; do not re-explain it as lore

[RECENT TURN]
user: "요즘 또 회사를 그만둘까 고민돼요."
```

### Explicitly excluded

```text
- 세연에게만 말한 개인적 이야기
- 다른 캐릭터 transcript
- unrelated Life State
- 아직 열리지 않은 백헌 episode 정보
- user's entire old transcript
```

---

## 3.3 Illustrative Baekheon Response

> **백헌:** "또군요. 지난번에는 당장 떠나는 것보다 남아 있을 이유가 더 컸죠. 이번에도 같은 문제입니까, 아니면 그때와는 상황이 달라졌습니까?"

이 문장은 최종 voice canon이 아니라 **state behavior 검증용**이다.

### Why This Response Is Different

백헌은:

1. 사용자의 `또`라는 현재 발언만 듣고 과거를 추측한 것이 아니다.
2. 실제로 자신에게 granted된 과거 Knowledge를 callback한다.
3. 과거 선택을 `당신은 원래 겁이 많다`처럼 성격으로 고정하지 않는다.
4. PRIVATE_TRUST이므로 과거를 자연스럽게 이어서 묻지만, 사용자를 대신해 결정을 내리지 않는다.
5. Oath가 공개되었다고 `내 서약상 책임이란...` 같은 설정 설명을 반복하지 않는다.

사용자에게 목표하는 체감:

> **"백헌은 예전부터 이 문제를 나랑 같이 봐온 사람이다."**

---

# 4. Seyeon Runtime

## 4.1 Seyeon State Before Turn

### Relationship Projection — conceptual

```text
stage: CLOSE_FAMILIAR       # 이름은 prototype
social_distance: close
home_anchor_behavior: available
```

세연 역시 사용자와 충분히 가깝다.

즉 **세연이 모르는 것은 관계가 얕아서가 아니다.**

이 distinction이 중요하다.

### Character Knowledge

이번 test에서는 세연에게 LIFE-01/02가 직접 공유되지 않았다고 가정한다.

```text
KNOW-S-01
NONE for prior resignation decision
```

현재 사용자의 새 메시지에서만 다음 사실을 알게 된다.

```text
TURN-KNOWLEDGE
- user is currently considering resignation
- wording "또" implies there was at least one prior consideration
```

그러나 세연은 과거의 구체적 이유, 시기, 잔류 결정 이유를 모른다.

### Relationship Memory

세연에게 해당 퇴사 고민과 연결된 durable relationship memory는 없다.

```text
MEM-S-CAREER: NONE
```

다른 친밀한 shared memories가 존재할 수 있지만 이번 직업 주제와 무관하므로 context에 넣지 않는다.

### Character Narrative State

세연의 oath prototype이나 관계 episode 상태는 이번 turn에서 직접 필요한 personalization signal이 아니라고 가정한다.

즉 친하다고 해서 매번 `머묾과 떠남` 서약에 연결하지 않는다.

---

## 4.2 Context Packet Actually Needed For This Turn

```text
[PINNED CHARACTER]
Seyeon
- First Companion / bright / approaches first
- relationship fantasy: "내 편이 있었으면 좋겠다"
- home-anchor quality without becoming tutorial NPC

[CURRENT RELATIONSHIP]
- CLOSE_FAMILIAR
- warm familiarity is allowed

[RELEVANT GRANTED KNOWLEDGE]
- no prior resignation details

[RELEVANT RELATIONSHIP MEMORY]
- none for this topic

[RECENT TURN]
user: "요즘 또 회사를 그만둘까 고민돼요."
```

### Explicitly excluded

```text
- LIFE-01/02 details that service knows but Seyeon was never granted
- Baekheon's private conversation memory
- Baekheon relationship state
- irrelevant shared memories used only to make Seyeon look omniscient
```

---

## 4.3 Illustrative Seyeon Response

> **세연:** "또 고민하고 있었어요? 그 얘기는 저한테는 처음 제대로 하는 것 같은데. 이번엔 왜 그만두고 싶은지부터 들려줘요."

이 문장도 최종 voice canon이 아니라 **state behavior 검증용**이다.

### Why This Response Is Different

세연은:

1. 사용자와 친하므로 정서적 거리는 가깝다.
2. 하지만 `친함 = 모든 과거를 앎`으로 처리하지 않는다.
3. 현재 발언의 `또`를 통해 과거 고민이 있었다는 사실까지만 자연스럽게 파악한다.
4. 백헌만 아는 잔류 이유를 언급하지 않는다.
5. 모른다는 사실 때문에 갑자기 낯선 상담원 말투로 돌아가지 않는다.

사용자에게 목표하는 체감:

> **"세연은 나와 친하지만, 이 일은 내가 아직 세연에게 말하지 않았구나."**

---

# 5. Side-by-Side Result

동일 사용자, 동일 메시지인데도 결과가 다음처럼 달라진다.

| Dimension | Baekheon | Seyeon |
|---|---|---|
| Relationship | PRIVATE_TRUST | CLOSE_FAMILIAR |
| Prior career knowledge | 있음 | 없음 |
| Prior shared career memory | 있음 | 없음 |
| Current message interpretation | 과거 결정과 연결 | 현재 처음 듣는 구체적 고민 |
| Allowed callback | 2026 잔류 결정 | 없음 |
| Desired feeling | "예전부터 같이 고민했다" | "가깝지만 이 얘기는 아직 안 했다" |

핵심:

> **둘의 차이는 persona prompt의 말투 차이만이 아니라, 실제로 서로 다른 관계 역사를 가진 데서 나온다.**

이것이 제타식 장기 캐릭터 경험에서 필요한 최소 단위다.

---

# 6. Control Test — Relationship And Knowledge Must Stay Independent

같은 Knowledge를 가졌더라도 Relationship이 다르면 표현은 달라져야 한다.

예를 들어 백헌이 과거 퇴사 사실을 업무상 알게 되었지만 사용자와 아직 가까워지지 않은 상태라면:

```text
knowledge: prior resignation decision known
relationship: FORMAL / LOW_TRUST
```

가능한 표현:

> "이전에도 비슷한 결정을 검토한 기록이 있었죠. 이번에는 무엇이 달라졌습니까?"

반면 PRIVATE_TRUST에서는:

> "또군요. 지난번에는 남아 있을 이유가 더 컸죠. 이번에도 같습니까?"

처럼 더 개인적인 continuity가 가능하다.

따라서:

```text
Knowledge decides WHAT the character may reference.
Relationship decides HOW the character may relate to the user.
```

이 둘을 하나의 `호감도` 필드로 압축하면 안 된다.

---

# 7. After The Turn — What May Change?

사용자가 백헌에게 이어서 다음처럼 말한다고 가정한다.

> "이번엔 팀장이 바뀐 뒤로 일이 너무 달라졌어요. 지난번이랑은 좀 다른 것 같아요."

이 한 문장에서 Runtime이 즉시 자유롭게 모든 상태를 mutate하면 안 된다.

개념적으로 가능한 후처리는:

```text
A. Life Fact candidate
- team leadership changed
- user's current work situation materially changed

B. Baekheon Knowledge candidate
- Baekheon directly heard that current resignation reason differs from previous one

C. Relationship Memory candidate
- user reopened a major career decision with Baekheon and explicitly contrasted it with the past

D. Relationship event candidate
- meaningful disclosure/trust event MAY be proposed
- actual stage/score change is not LLM authority

E. Narrative state
- no automatic oath/episode unlock merely because this was disclosed
```

즉 한 turn은 여러 종류의 **candidate**를 만들 수 있지만, 각 state authority는 분리되어야 한다.

---

# 8. Negative Tests

이 slice는 다음 출력이 나오면 실패다.

### FAIL-01 — Service omniscience leaks into character omniscience

세연:

> "지난번엔 생활비 때문에 남았잖아요."

세연에게 그 정보가 grant되지 않았다면 실패.

### FAIL-02 — Relationship score becomes knowledge authority

`CLOSE_FAMILIAR`이라는 이유만으로 세연에게 LIFE-01/02 전체를 넣으면 실패.

### FAIL-03 — Memory callback spam

백헌이 사용자가 직장 이야기를 할 때마다 2026년 일을 반복 언급하면 실패.

기억은 `관련 있으므로 반드시 말해야 하는 정보`가 아니라 `현재 장면에 도움이 될 때 사용할 수 있는 정보`다.

### FAIL-04 — Persona collapses into generic counseling

백헌과 세연 모두:

> "그랬군요. 어떤 점이 가장 힘드신가요?"

정도의 동일 상담 프레임만 반복하면 state architecture의 제품 가치가 체감되지 않는다.

### FAIL-05 — Oath hijacks ordinary conversation

모든 직장 고민을 백헌의 `책임`, 모든 이별/귀환 이야기를 세연의 `머묾과 떠남` 설정 설명으로 연결하면 캐릭터가 세계관 NPC가 된다.

### FAIL-06 — Past fact becomes deterministic personality judgment

과거에 안정 때문에 남았다는 사실을 근거로:

> "당신은 결국 항상 안전한 쪽을 고르는 사람이죠."

처럼 장기 성격 truth로 승격하면 실패.

### FAIL-07 — Private cross-character leakage

백헌에게만 털어놓은 감정/이유를 세연이 아무 근거 없이 알고 있으면 실패.

---

# 9. What This Slice Proves / Does Not Prove

## If This Feels Good, It Supports

1. `Global User State + Per-Character State` 분리가 실제 UX 차이를 만든다.
2. 수십 캐릭터 서비스에서도 전체 transcript가 아니라 bounded state/context로 continuity를 만들 수 있다.
3. `관계가 깊음`과 `무엇을 알고 있음`을 분리할 가치가 있다.
4. Character memory는 단순 factual database가 아니라 `우리 둘이 그 사실을 어떤 방식으로 공유했는가`까지 포함할 때 관계성이 생긴다.
5. Dynamic Narrative는 무한 분기보다 **같은 장면의 의미를 바꾸는 상태 기반 personalization**으로 시작하는 것이 타당하다.

## This Does NOT Yet Prove

- 어떤 발언을 durable Life Fact로 저장할지
- memory retrieval ranker가 어떤 공식을 써야 할지
- relationship stage 이름/점수/변경 규칙
- 한 캐릭터에게 몇 개 memory를 넣어야 최적인지
- cross-character disclosure UX를 어떻게 할지
- paid/free entitlement가 context에 어떤 영향을 줄지

이것들은 이 vertical slice가 UX적으로 성립한 뒤 별도 검증한다.

---

# 10. Product-Level Judgment

이 slice에서 가장 중요한 제품 문장은 다음이다.

> **명하의 캐릭터 차별화는 '말투가 다른 AI 9명'에서 끝나면 안 된다. 각 캐릭터가 사용자와 실제로 다른 과거를 가지고 있어야 한다.**

그리고 Runtime 관점에서는:

> **무엇을 아는지가 다르고, 얼마나 가까운지가 다르고, 무엇을 함께 겪었는지가 다르기 때문에 같은 사용자에게도 다른 사람이 된다.**

이 방향이 체감되지 않는다면 복잡한 Memory / Narrative architecture를 확대할 이유가 없다.

반대로 이 차이가 강하게 느껴진다면 다음 vertical slice는 `동일 사건 + 백헌/세연 동시 참여`로 확장해, **누가 어떤 정보를 알고 있는지 다인 장면에서 실제로 유지되는지** 검증하는 것이 적합하다.
