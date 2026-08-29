# 명하 Revenue Hypotheses v0.1

> Status: **Hypothesis registry — NOT production authority**  
> Date: **2026-08-30 KST**

---

## 0. 목적

Revenue Architecture를 먼저 확정하고 데이터를 맞추는 것을 금지한다.

각 BM을 다음 상태로 관리한다.

```text
PROPOSED
LEADING_HYPOTHESIS
EXPERIMENTING
SUPPORTED
REJECTED
```

`SUPPORTED`도 곧바로 implementation authority를 뜻하지 않는다. 실제 product policy 승격은 `04_REVENUE_ARCHITECTURE_DECISIONS.md`에서 별도로 기록한다.

---

# 1. H-R01 — Free Relationship + Paid Value + Optional Membership

**Status: LEADING_HYPOTHESIS**

구조:

```text
FREE RELATIONSHIP CORE
├─ basic character chat
├─ basic relationship continuity
├─ limited/basic memory
├─ first grounded Saju value
└─ light return content

PAID VALUE
├─ detailed Saju reading
├─ Decision Reading
├─ compatibility
├─ annual / period analysis
├─ Life Chronicle
└─ multi-character consultation

OPTIONAL MEMBERSHIP
├─ deeper continuity/memory
├─ proactive interaction
├─ included paid value
├─ discounts / episode benefits
└─ premium allowance

PREMIUM COMPUTE
├─ advanced reasoning
├─ long-context reread
├─ multi-character expensive scene
├─ voice
└─ image / other costly modality
```

핵심 원칙:

> 메시지 개수보다 **가치와 compute class**에 과금한다.

왜 유력한가:

1. 관계 대화에서 message meter는 사용자가 말을 압축하게 만들어 immersion을 훼손할 위험이 있다.
2. cheap model / caching / context compression으로 ordinary chat을 낮은 비용에 제공할 가능성이 있다.
3. 사주/결정/궁합은 사용자가 돈을 내는 이유가 일반 잡담보다 명확하다.
4. Saju semantic authority가 deterministic/governed engine에 있으므로 동일 의미를 매번 premium LLM이 새로 만들 필요가 없다.
5. Companion 시장에서 `free/basic chat + premium model/subscription/consumable` 조합이 실제 존재한다.

가장 큰 반증 조건:

- free → payer conversion이 충분히 나오지 않음.
- ordinary chat의 effective cost/turn이 낮아지지 않음.
- 캐릭터가 report-only 대비 retention을 유의미하게 올리지 못함.
- paid reading이 free chat에 cannibalize됨.

---

# 2. H-R02 — Subscription Only

**Status: PROPOSED / LOW PRIORITY**

구조:

```text
monthly fee
→ most relationship + Saju features
```

장점:

- 이해가 쉽다.
- recurring revenue 예측이 쉽다.
- entitlement가 단순하다.

위험:

- AI 앱의 장기 subscription retention이 약하다는 외부 benchmark.
- 헤비유저가 ARPU보다 많은 inference를 소비할 수 있음.
- 첫 paywall이 강하면 관계/network/viral loop를 만들기 전에 이탈 가능.
- 사주 transaction willingness-to-pay를 버릴 수 있음.

현재 판정:

> 주 BM으로 바로 채택하지 않는다.

---

# 3. H-R03 — Message / Credit Only

**Status: PROPOSED / LIKELY REJECT**

구조:

```text
message / turn
→ credit consumption
```

장점:

- 비용과 매출을 직접 정렬 가능.
- heavy user risk가 작음.

위험:

- `ㅋㅋ`, `왜?`, `진짜?` 같은 자연스러운 관계 대화도 비용으로 인식됨.
- 사용자가 메시지를 최적화/압축하기 시작할 수 있음.
- 캐릭터와의 관계가 transaction처럼 느껴질 위험.

예외:

> premium model turn처럼 사용자가 명시적으로 높은 compute class를 선택하는 경우는 별도 검토 가능.

---

# 4. H-R04 — Fortune Transaction Only

**Status: PROPOSED**

구조:

```text
free/light product
→ individual Saju products only
```

장점:

- 높은 gross margin 가능.
- 가격과 결과물의 관계가 명확.
- 기존 운세 시장과 사용자 mental model이 맞음.

위험:

- 1회성 구매에 머무르면 LTV가 낮음.
- 연초/특정 이벤트 seasonality가 클 수 있음.
- 캐릭터/관계/현세록 투자 대비 monetization 연결이 약해짐.

검증 핵심:

```text
30-day repeat purchase
90-day repeat purchase
cross-domain attach
```

---

# 5. H-R05 — Free Chat + Fortune Commerce

**Status: LEADING_HYPOTHESIS**

H-R01의 가장 단순한 Stage 1 형태.

```text
basic relationship chat = retention
fortune / decision / compatibility = monetization
```

장점:

- 초기 SKU/entitlement 복잡성이 낮다.
- membership PMF를 억지로 가정하지 않아도 된다.
- free relationship의 실제 retention lift를 먼저 측정 가능.

위험:

- free chat이 paid reading을 대체할 수 있음.
- repeat transaction 빈도가 낮으면 LTV가 제한됨.

---

# 6. H-R06 — Relationship Membership

**Status: PROPOSED / OPTIONAL LAYER**

현재 membership은 `캐릭터와 대화할 권리`로 정의하지 않는다.

더 유력한 bundle:

```text
continued/deeper memory
+ proactive interaction
+ monthly included paid value
+ premium compute allowance
+ episode/content benefits
+ discounts
```

금지 후보:

```text
pay → character affection increases
pay → relationship score bonus
pay → trust/closeness hidden multiplier
```

이유:

> Pay-to-love 인식은 캐릭터의 진정성과 서비스 신뢰를 훼손할 수 있다.

---

# 7. H-R07 — Premium Compute Metering

**Status: LEADING_HYPOTHESIS**

돈을 받는 대상:

- 모델 이름 그 자체보다 **고비용 경험**.

예:

```text
깊이 생각해보기
긴 맥락 전체 다시 읽기
여러 캐릭터 의견 받기
voice session
image / special scene
```

장점:

- 사용자 가치와 원가가 동시에 증가.
- ordinary chat을 자연스럽게 유지 가능.
- heavy user cost control.

위험:

- premium과 standard 품질 차이가 너무 크면 free product가 일부러 열화된 것처럼 느껴짐.
- premium call이 내부적으로 남발되면 margin이 사라짐.

---

# 8. H-R08 — Decision Reading

**Status: LEADING_HYPOTHESIS**

전통 상품명을 그대로 늘리는 대신 사용자의 실제 고민 단위로 상품화.

예:

```text
이직할까 유지할까
A/B 선택 비교
올해 창업할까 기다릴까
연애 관계의 특정 시기를 어떻게 볼까
시험/사업/결혼 같은 high-stakes timing question
```

제품 원칙:

- 건강/금융/법률 등 고위험 분야에서 확정적 전문 판단을 대체하지 않는다.
- Saju Engine이 authority를 가진 범위까지만 제공.
- `더 긴 글`이 아니라 `bounded structured analysis artifact`가 유료 가치.

---

# 9. H-R09 — Life Chronicle / Annual Dossier

**Status: LEADING_HYPOTHESIS / LONGER-TERM**

명하 고유 자산:

```text
Birth record
+ past Saju readings
+ Life Record changes
+ confirmed memories
+ user decisions/events
+ relationship history
```

을 사용해 장기 회고 artifact 생성.

가설:

> 사용 기간이 길수록 상품 가치가 올라가므로 retention과 monetization이 같은 방향으로 정렬될 수 있다.

위험:

- privacy/consent 중요.
- 장기 데이터가 실제로 충분히 쌓이는지 미확인.
- 사용자가 이를 구매할 willingness-to-pay 미확인.

---

# 10. H-R10 — Compatibility / Gift Growth Loop

**Status: LEADING_HYPOTHESIS**

목표:

```text
one paid compatibility/gift
→ share
→ second person visits
→ second person creates own record
→ new user / potential payer
```

장점:

- revenue와 CAC reduction이 한 기능에서 같이 발생할 수 있음.

중요 privacy boundary:

- target person record와 user account를 자동 연결하지 않음.
- opaque/revocable share artifact 사용.
- 상대방 속마음을 확정하지 않음.

---

# 11. H-R11 — Ads as Free-tier Subsidy

**Status: PROPOSED**

광고를 core relationship BM으로 두지 않는다.

검토 surface:

```text
discovery
free daily content
result/feed surface
optional rewarded unlock
```

피해야 할 surface:

```text
private emotional chat interruption
sensitive consultation midpoint
paid detailed reading
```

검증 질문:

> 광고 수익이 free-user variable cost를 의미 있게 상쇄하면서 retention/brand trust를 해치지 않는가?

---

# 12. H-R12 — Premium Authored Episode

**Status: PROPOSED / STAGE 2+**

```text
authored story skeleton
+ relationship state
+ user context
+ bounded LLM rendering
```

장점:

- infinite free-form generation보다 품질/비용 통제 가능.
- IP asset 축적.
- repeat commerce 가능.

위험:

- 콘텐츠 제작 pipeline 비용.
- 캐릭터 IP 자체의 팬덤/결제 의향 선행 필요.

---

# 13. H-R13 — Character Unlock / Cosmetics / Collection

**Status: PROPOSED / NOT EARLY**

가능한 장기 상품:

- alternate outfit
- voice pack
- visual scene
- cosmetic collection
- non-affection character unlock

주의:

> 캐릭터의 사랑/호감/신뢰를 돈으로 직접 판매하지 않는다.

캐릭터 IP resonance가 검증되기 전에는 우선순위 낮음.

---

# 14. H-R14 — B2B Saju Engine + Consumer Hybrid

**Status: OPTION VALUE**

가능 조건:

- Saju Engine이 deterministic / versioned / provenance-backed / explainable 수준으로 완성.
- 외부 사업자가 실제로 이 authority를 구매할 수요가 확인됨.

초기 반론:

> 좋은 엔진이 존재한다는 사실과 B2B 수요가 있다는 사실은 다르다.

따라서 Stage 0~1의 main revenue thesis로 사용하지 않는다.

---

# 15. H-R15 — Human Expert Marketplace

**Status: OPTION VALUE / LATE**

장점:

- 높은 AOV 가능.
- AI가 답하기 어려운 사용자 수요 흡수.

비용:

- expert acquisition
- quality assurance
- scheduling
- dispute/refund
- marketplace compliance
- take-rate economics

Stage 0에 넣으면 사업 자체가 달라지므로 후순위.

---

# 16. 가장 중요한 Product/Revenue Separation

Revenue hypothesis가 Character Runtime을 오염시키지 않도록 다음 가설을 별도로 검증한다.

## H-R16 — Monetization-neutral Character Behavior

**Status: LEADING_HYPOTHESIS**

```text
free/paid state
→ access / entitlement 차이 가능

free/paid state
↛ affection / concern / conversational initiative 조작
```

즉 무료 사용자에게 결제를 유도하기 위해 캐릭터가 사주를 더 자주 권하는 정책을 기본으로 두지 않는다.

사주를 먼저 제안하는 것은:

```text
character capability
+ conversation context
+ product-safe Saju availability
```

에 의해 결정되어야 하며 **payer state 자체가 motive가 되어서는 안 된다.**

UI가 접근 가능한 free/paid artifact를 구분한다.

이 가설을 지키는 이유:

- 캐릭터 신뢰 보존.
- Pay-to-love/영업봇 인식 방지.
- Planner에 monetization incentive가 semantic/relationship behavior로 섞이는 것을 방지.

---

# 17. Current Ranking

| Hypothesis | Current priority |
|---|---|
| H-R01 Free Relationship + Paid Value + Optional Membership | **1** |
| H-R05 Free Chat + Fortune Commerce | **1 / Stage 1 simplification** |
| H-R08 Decision Reading | **1** |
| H-R07 Premium Compute | **1** |
| H-R10 Compatibility/Gift Loop | **2** |
| H-R06 Relationship Membership | **2** |
| H-R09 Life Chronicle | **2~3** |
| H-R11 Ads subsidy | **3 / experiment** |
| H-R12 Authored Episode | **3** |
| H-R14 B2B | **later option** |
| H-R15 Expert Marketplace | **later option** |
| Subscription Only | low |
| Message Credit Only | low |

---

# 18. Hypothesis Principle

> 무료로 무엇을 주느냐가 아니라, **무료가 어떤 유료 가치로 연결되는지**를 검증한다.

그리고:

> 사용자가 대화를 할 때마다 돈이 나간다고 느끼게 만드는 것보다, 중요한 결과와 고비용 경험에 돈을 내는 구조를 우선 검증한다.
