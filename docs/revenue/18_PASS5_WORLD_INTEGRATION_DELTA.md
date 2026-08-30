# MyeongHa Revenue Architecture — Pass 5 World Integration Delta v0.1

> Product: **명하 / MyeongHa**  
> Status: **Research decision delta — NOT product authority**  
> Snapshot: **2026-08-30 KST**

---

## 1. 판정

### H-R19 — **유지 / 조건부 강화**

World 트랙의 최신 장기 Character Service 설계는 H-R19를 폐기할 이유를 만들지 않았다.

오히려 다음 Revenue loop를 가능하게 한다.

```text
Open Relationship Core
→ 장기 관계 / per-character history
→ Life State 축적
→ 고민-선택-결과 closed loop 축적
→ 신규 사용자에게는 불가능한 longitudinal Artifact
→ repeat purchase / membership 후보
```

다만 이것은 아직 **가설**이다.

장기 관계가 retention만 올리고 paid Artifact conversion을 올리지 못하면 경제성은 악화될 수 있다.

---

## 2. 이번 Pass에서 새로 강화된 가설

### H-R20 — Longitudinal Value Accumulation

> **사용기간 자체가 아니라, 연결된 삶의 사건과 선택-결과 evidence가 쌓일수록 유료 Artifact의 차별화 가치가 높아질 수 있다.**

중요 변수 후보:

```text
closed decision loops
= 고민 → 선택 → 결과가 연결된 사건 수
```

이는 단순 tenure보다 Artifact 가치와 더 직접적으로 연결될 수 있다.

검증 전까지 product authority 아님.

---

## 3. 이번 Pass에서 승격된 핵심 리스크

### RISK-R20 — Free-Core Cannibalization

World 설계가 성공할수록 무료 사용자는 이미 높은 가치를 받는다.

```text
relationship
memory
callback
basic Saju conversation
relationship progression
```

따라서 유료 Artifact가 단순히 `더 길고 더 자세한 답변`이면 구매 이유가 약해진다.

유료 Artifact는 반드시 별도의 작업 단위를 가져야 한다.

```text
cross-time synthesis
cross-option comparison
outcome retrospective
longitudinal pattern extraction
multi-person structured analysis
persistent formal artifact
```

---

## 4. Memory monetization boundary

Pass 5에서 유지하는 경계:

```text
Memory preservation / natural callback
= Relationship Core

Cross-history synthesis / formal compilation
= Paid Artifact candidate
```

원칙:

> **Preservation is infrastructure. Synthesis is monetizable value.**

결제 여부가 Character의 affection, concern, knowledge honesty, or basic continuity를 바꾸면 안 된다.

---

## 5. Dynamic Narrative 경제성 판정

World의:

```text
authored event skeleton
+ bounded variants
+ relationship state
+ memory callback
+ character rendering
```

방향은 `무한 scripted episode 생산`보다 경제적으로 우수할 가능성이 높다.

하지만 절감되는 authoring cost 대신 다음 비용이 생긴다.

- state matrix QA
- eligibility testing
- continuity regression
- persona evaluation
- memory callback evaluation

따라서 Dynamic Narrative는 `콘텐츠 공짜화`가 아니라 **asset reuse multiplier**로 본다.

---

## 6. Revenue가 World에 요구하는 핵심 조건

1. **State cardinality bounded** — 관계/내러티브 variant 조합 폭발 금지.
2. **Memory COGS observable** — retrieval/context/latency/callback 품질 측정 가능.
3. **Character marginal economics measurable** — 새 캐릭터가 retention/monetization 대비 비용을 얼마나 추가하는지 측정.
4. **Outcome closure supported** — 고민→선택→결과를 후속 Life State로 연결할 수 있어야 함.
5. **Artifact role preserved** — 무료 Character가 모든 cross-history synthesis를 대신하지 않도록 작업 단위 분리.
6. **Data minimization** — 실제 continuity/Artifact에 쓰이지 않는 장기 데이터는 moat가 아니라 liability로 취급.

---

## 7. Membership에 대한 변화

Membership은 여전히 **후순위**다.

관계와 기본 memory를 잠그지 않는다면 recurring bundle은 다음처럼 `새로 발생하는 반복 가치`를 묶어야 한다.

- periodic Review Artifact
- repeat Decision/Timing analysis
- cross-event synthesis
- premium multi-character analysis
- multimodal / authored premium experience

즉:

> **Membership = memory tax가 아니라 recurring synthesis/value bundle**

이어야 한다.

---

## 8. Pass 5 핵심 검증 지표

```text
D30 / D90 / 6M retention by active-character count
monthly chat COGS / retained MAU
P95 / P99 free-user chat COGS
artifact attach rate by tenure
artifact ARPPU by tenure
repeat purchase by closed-decision-loop count
Life Chronicle eligibility → purchase conversion
content authoring cost / activated user
meaningful exposures / authored event
```

---

## 9. 최종 문장

Pass 5의 현재 Revenue thesis:

> **명하의 장기 관계 구조가 돈이 되는 이유는 Memory를 유료화해서가 아니라, 관계가 오래 지속될수록 다른 서비스가 만들 수 없는 `실제 삶의 longitudinal evidence`가 쌓이고 그것을 분석·비교·편찬한 Artifact의 가치가 올라갈 가능성이 있기 때문이다.**

반대로 그 evidence가 paid conversion으로 이어지지 않으면, 같은 구조는 chat/memory COGS만 늘리는 비용 요인이 된다.
