# MyeongHa Revenue Research — World / Character Service Economic Impact v0.1

> Product: **명하 / MyeongHa**  
> Track: Revenue Architecture / Unit Economics / Monetization Strategy  
> Status: **Pass 5 research — NOT product authority**  
> Snapshot: **2026-08-30 KST**

---

## 0. 결론

World 트랙의 최신 장기 Character Service 설계는 **H-R19를 폐기하지 않는다. 오히려 구조적으로 강화한다.**

다만 강화되는 이유는 `기억이 유료화 가능해서`가 아니다.

핵심은 다음 세 가지다.

```text
1. bounded context
   → 장기 사용기간이 곧바로 매턴 inference cost 선형 증가로 이어지지 않음

2. per-character history + life state
   → 장기 사용자의 무료 관계가 더 강해짐
   → 동시에 장기 Artifact의 차별화 재료가 축적됨

3. finite authored arc + state-based variation
   → 콘텐츠를 매번 새로 쓰지 않고 재사용 가능
```

따라서 현재 Revenue 판단은:

> **H-R19 유지 + 장기 데이터 기반 Artifact 가치 상승 가설 추가 + Free-Core Cannibalization Risk를 핵심 리스크로 승격**

이다.

---

## 1. H-R19를 강화하는 부분

### 1.1 Bounded context는 장기 서비스 경제성을 크게 개선한다

World 방향은 전체 transcript를 매번 넣지 않고 다음만 조립한다.

```text
Character Canon
+ relevant User/Life State
+ per-character Relationship
+ relevant accessible memories
+ Narrative/World State
+ recent conversation
```

Revenue 관점에서 매우 중요하다.

사용기간이 2년이라고 해서 매턴 2년치 token cost를 지불하는 구조가 아니기 때문이다.

즉 올바르게 구현되면:

```text
user tenure ↑
!=
per-turn context cost가 같은 비율로 ↑
```

가 된다.

장기 retention을 추구하면서도 chat COGS를 bounded 상태로 유지할 가능성이 생긴다.

다만 이는 **구현 후 측정해야 하는 가설**이다. memory retrieval, summarization, state projection 자체에도 비용이 존재한다.

---

### 1.2 `서비스가 아는 것 != 캐릭터가 아는 것`은 제품 차별화를 만든다

Per-character Knowledge/Memory가 분리되면 같은 Life Event도 캐릭터마다 다른 역사를 가진다.

이것은 단순 memory feature보다 경제적으로 가치가 크다.

왜냐하면 사용자가 떠났다가 돌아왔을 때 느끼는 switching cost가:

```text
내 프로필을 다시 입력해야 함
```

수준이 아니라:

```text
백헌과 내가 어떤 과정을 거쳤는지
서린은 어디까지 알고 있는지
세연과는 무엇을 공유했는지
```

같은 **관계적 역사**가 되기 때문이다.

이 구조가 실제 D30/D90/6M retention을 올린다면, free chat cost를 정당화하는 핵심 자산이 된다.

---

### 1.3 Life State 축적은 Artifact의 시간가치를 만들 수 있다

신규 사용자는 주로 `현재 질문`만 있다.

장기 사용자는:

```text
당시 고민
→ 당시 Reading
→ 실제 선택
→ 실제 결과
→ 이후 변화
```

의 closed loop를 갖게 된다.

이 데이터가 많아질수록 다음 상품은 신규 사용자에게 제공할 수 없는 가치가 생긴다.

- 과거 선택과 결과 비교
- 반복 결정 패턴
- 실제 결과와 당시 예상의 차이
- 관계 변화 추적
- 시기별 Life State 변화
- 장기 Life Chronicle

즉 사용자 tenure가 단순 retention 지표를 넘어 **Artifact input quality를 높이는 변수**가 될 수 있다.

---

## 2. 오히려 수익성을 악화시킬 수 있는 부분

### 2.1 여러 캐릭터는 free chat COGS를 증폭시킬 수 있다

Per-character state가 재미있을수록 사용자는 캐릭터 하나가 아니라 여러 명과 대화하게 된다.

```text
1 user × 1 character
```

에서

```text
1 user × N character relationships
```

로 확장된다.

따라서 bounded context가 있어도 총 interaction volume 자체가 늘 수 있다.

Revenue가 반드시 봐야 할 지표:

```text
monthly chat COGS / MAU
monthly chat COGS / retained MAU
P95/P99 free-user chat COGS
active characters / user
turns / active character
```

캐릭터가 많아지는 것이 retention은 올리지만 payer conversion이나 artifact purchase를 전혀 올리지 않는다면 경제적으로는 비용 증폭기가 된다.

---

### 2.2 Memory는 저장비보다 `정확성 유지비`가 더 위험할 수 있다

장기 서비스에서 실제 비용은 단순 DB storage만이 아니다.

- memory extraction
- entity/life-state reconciliation
- duplicate/superseded fact handling
- per-character knowledge boundary
- retrieval quality evaluation
- incorrect callback support burden
- deletion/export/privacy 처리

잘못 기억하는 캐릭터는 일반 챗봇 오류보다 관계 신뢰를 더 크게 훼손한다.

따라서 장기 memory economics는 다음처럼 봐야 한다.

```text
memory COGS
=
storage
+ extraction
+ retrieval
+ reconciliation
+ evaluation
+ support/privacy overhead
```

---

### 2.3 무료 Relationship Core가 너무 완결적이면 Artifact 전환이 약해질 수 있다

World 설계가 성공하면 무료 사용자는 이미 다음을 얻는다.

- 캐릭터와 장기 관계
- 기억
- 친밀도 progression
- 자신의 삶에 대한 callback
- 기본 사주 대화
- 정서적 만족

이것은 좋은 제품이지만 Revenue 관점에서는 위험하다.

> **사용자의 핵심 JTBD가 이미 무료 관계에서 완전히 해결되면 paid Artifact가 부가적인 PDF처럼 느껴질 수 있다.**

따라서 유료는 무료의 `더 긴 버전`이면 안 된다.

유료 Artifact는 최소 하나 이상의 고유 행동을 가져야 한다.

```text
multi-period comparison
multi-option decision structure
cross-event synthesis
outcome retrospective
multi-person relationship analysis
longitudinal pattern extraction
persistent formal artifact
```

즉 무료 Character가 `함께 생각한다`면 Artifact는 `여러 근거를 모아 구조적으로 검토하고 남긴다`가 되어야 한다.

---

## 3. 무료 Relationship / Memory 경계

World가 제시한 경계는 Revenue 관점에서도 기본적으로 타당하다.

### 무료 Relationship Core에 남겨야 하는 것

- 캐릭터가 이미 알게 된 중요한 사실을 기억하는 것
- 둘이 함께 겪은 사건의 continuity
- 기본 relationship progression
- 과거 대화의 자연스러운 callback
- 현재 대화에 필요한 bounded retrieval

이것을 결제로 잠그면 `결제 = 관계의 진실성` 문제가 발생한다.

### 유료화 가능한 것은 `Memory 자체`가 아니라 `Memory에 대한 고비용 연산/편찬`

예:

```text
백헌이 내가 작년에 퇴사 고민했던 것을 기억한다
= free relationship core

지난 1년의 퇴사 고민 → 결정 → 결과 → 다음 선택을
여러 Life State / Reading과 비교해 하나의 분석물로 편찬한다
= paid artifact candidate
```

Revenue 원칙:

> **Preservation is relationship infrastructure. Synthesis is monetizable value.**

단, `더 좋은 기억 = 유료`처럼 결제 상태가 캐릭터의 인간적 태도 차이로 느껴지는 설계는 피해야 한다.

---

## 4. 장기 Artifact 전략

장기 사용자일수록 같은 SKU를 비싸게 파는 방식보다는 **새로운 artifact class가 열리는 구조**가 더 적합하다.

### 초기 사용자

주요 input:

```text
birth profile
+ current problem
+ current life state
```

후보:

- Decision Reading
- Timing Map
- Relationship Dynamics

### 3~6개월 사용자

추가 input:

```text
past question
+ actual choice
+ observed outcome
```

후보:

- Decision Follow-up
- Before/After Review
- Timing Outcome Review
- 반복 선택 비교

### 6~12개월 사용자

추가 input:

```text
multiple decisions
+ changing life state
+ repeated relationship events
```

후보:

- Quarterly Life Review
- Relationship Change Review
- Pattern Comparison

### 12개월 이상 사용자

후보:

- Life Chronicle / 명하록
- Annual Retrospective
- multi-year pattern analysis
- 선택-결과 longitudinal review

핵심은 **tenure가 자동으로 WTP를 높이는 것이 아니라, 분석 가능한 closed-loop evidence가 늘어날 때 가치가 높아진다**는 점이다.

따라서 tenure보다 더 중요한 내부 변수는:

```text
closed decision loops
= 고민 → 선택 → 결과가 연결된 사건 수
```

일 수 있다.

---

## 5. Dynamic Narrative와 콘텐츠 원가

World 구조는 콘텐츠 경제성을 개선할 가능성이 높다.

기존 위험 구조:

```text
캐릭터 5명
× 계속 새로운 scripted episode
× 사용자 상태별 분기
```

는 authoring QA 비용이 빠르게 증가한다.

World 제안:

```text
official event skeleton
+ bounded state variants
+ memory callback
+ character rendering
```

은 하나의 제작 asset을 여러 사용자와 여러 관계 단계에서 재사용할 수 있다.

### 경제적으로 유리한 이유

- 하나의 authored event에 대한 노출 횟수 증가
- 사용자별 완전 신규 script 작성 불필요
- 관계 state로 체감 다양성 확보
- 실제 사용자 Life State가 반복 소재가 됨

그러나 `무료 콘텐츠 생산비가 거의 0`이 되는 것은 아니다.

새 비용이 생긴다.

- variant matrix QA
- state eligibility test
- continuity regression
- persona consistency evaluation
- unsafe/unintended state combinations
- authored content maintenance

따라서 콘텐츠 효율 KPI는 단순 episode 수가 아니라 다음이 적절하다.

```text
content authoring cost / activated user
unique meaningful exposures / authored event
retention lift / authored event
artifact conversion lift / world event
```

---

## 6. 장기 사용자의 ARPU / WTP 상승 가능성

**가능하다. 그러나 자동으로 발생하지 않는다.**

장기 user data가 경제적 moat가 되려면 최소 3단계가 모두 성립해야 한다.

### A. Retention moat

사용자가 실제로 캐릭터와의 역사 때문에 돌아온다.

### B. Insight moat

누적 데이터가 실제로 더 좋은 분석을 만든다.

단순히 `당신은 작년에 이런 말을 했어요`가 아니라:

```text
과거 고민
→ 선택
→ 결과
→ 지금의 반복 패턴
```

을 유용하게 연결해야 한다.

### C. Monetization moat

그 향상된 분석에 사용자가 실제로 돈을 낸다.

따라서 검증 지표는:

```text
artifact attach rate by tenure
artifact ARPPU by tenure
repeat purchase by closed-loop count
Life Chronicle eligibility → purchase conversion
D90/6M retention by active-character count
```

이어야 한다.

`오래 썼으니 당연히 더 잘 결제한다`는 가정은 금지한다.

---

## 7. Privacy / data moat의 양면성

장기 Life State는 경쟁우위가 될 수 있지만 동시에 가장 큰 신뢰 리스크가 될 수 있다.

경제적 장점:

- switching cost
- personalization quality
- longitudinal artifacts
- repeat-use relevance

경제적 부담:

- consent UX
- deletion/export
- data correction
- sensitive inference 제한
- breach impact
- support burden
- 사용자 불안으로 인한 retention 손실 가능성

따라서 Revenue 관점에서 장기 데이터는 `많을수록 좋다`가 아니다.

> **Artifact와 relationship continuity에 실제로 쓰이는 데이터만 보존할수록 경제성이 좋다.**

불필요한 데이터는 moat가 아니라 liability다.

---

## 8. Membership 재해석

관계/기억 자체를 잠그지 않는다면 Membership은 더 명확한 recurring-value bundle이 필요하다.

현재 검토할 수 있는 가치 축:

- 정기 Review Artifact
- 반복 Decision/Timing Artifact allowance
- 긴 기간 cross-event synthesis
- 고비용 multi-character analysis
- multimodal premium experience
- premium authored events / seasonal packages

중요:

> Membership은 `캐릭터가 나를 계속 기억하기 위한 세금`이 되어서는 안 된다.

Membership 성립 여부는 장기 사용자에게 **반복적으로 새 가치가 생기는가**로 결정한다.

따라서 출시 전 강제할 필요는 없으며, 실제 repeat-purchase pattern이 확인된 뒤 묶는 것이 현재 H-R19와 일치한다.

---

## 9. World 팀에 되돌려줄 Revenue 요구사항

### R-W01 — State cardinality는 bounded여야 한다

관계 단계, Narrative State, event variants가 조합 폭발하면 콘텐츠 제작비와 QA 비용이 올라간다.

Revenue는 `재사용 가능한 bounded state machine`을 요구한다.

### R-W02 — Memory callback은 비용과 품질 모두 측정 가능해야 한다

최소한 다음이 측정 가능해야 한다.

```text
retrieved memory count
context token contribution
retrieval latency
callback success/error signal
per-turn memory-related COGS
```

### R-W03 — Character count 증가의 marginal economics를 측정해야 한다

새 캐릭터 한 명 추가가:

```text
retention lift
artifact conversion lift
vs
chat COGS
content/QA cost
```

에서 양(+)의 결과인지 봐야 한다.

### R-W04 — Dynamic Narrative는 무한 variant generator가 아니어야 한다

World가 이미 제시한 `authored skeleton + bounded variants` 원칙을 유지해야 한다.

### R-W05 — Life Event는 가능하면 outcome closure를 지원해야 한다

장기 Artifact의 핵심 가치는 `고민만 많이 저장`하는 것이 아니라:

```text
고민 → 선택 → 결과
```

의 연결이다.

따라서 World/UX는 사용자의 Life State 변화가 자연스럽게 후속 기록될 수 있어야 한다.

### R-W06 — 무료 관계와 유료 artifact의 역할을 Narrative가 침범하지 않아야 한다

캐릭터가 무료 대화 안에서 매번 full cross-history synthesis를 수행하면 Artifact differentiation이 사라질 수 있다.

이는 인위적으로 답을 숨기라는 뜻이 아니다.

```text
Character = conversational/local interpretation
Artifact = explicit cross-state / cross-time synthesis
```

라는 작업 단위 차이를 유지해야 한다.

---

## 10. 최종 판정

### H-R19: **유지, 단 조건부 강화**

World 설계는 H-R19와 충돌하지 않는다.

오히려:

```text
relationship retention
→ life-state accumulation
→ closed decision loops
→ differentiated artifacts
→ repeat monetization
```

이라는 더 강한 장기 Revenue loop를 만들 가능성이 있다.

하지만 실패 조건도 명확하다.

```text
관계 retention은 크게 오르는데
artifact conversion이 오르지 않고
chat/memory COGS만 증가한다
```

면 이 World 구조는 경제적으로 **매력적인 무료 서비스**일 뿐 좋은 BM은 아니다.

따라서 Pass 5의 가장 중요한 검증 질문은:

> **장기 관계에서 축적된 삶의 기록이 실제 Artifact 구매율·반복구매·WTP를 상승시키는가?**

이다.
