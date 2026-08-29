# 명하 Direct Competitor / Launch BM Review — Pass 2 v0.1

> Product: **명하 / MyeongHa**  
> Track: Revenue Architecture / Unit Economics / Monetization Strategy  
> Status: **Research evidence + architecture hypothesis — NOT product authority**  
> Research snapshot: **2026-08-30 KST**  
> Repository baseline: `main@68fb4e5a904010f64faae2738d105faf7d58b607`

---

## 0. 이번 패스의 질문

Pass 1의 leading hypothesis는 다음이었다.

```text
Free Relationship Core
× Paid Saju / Decision Value
× Optional Membership
× Premium Compute
```

Pass 2는 이 가설을 지지하는 자료만 추가하지 않는다. 다음 반례를 우선 찾았다.

1. 명하와 직접 겹치는 한국 AI 사주 서비스는 실제로 무엇에 돈을 받는가?
2. 관계 채팅 전체를 무료로 두는 것이 정말 최선인가?
3. 구독만으로도 충분히 높은 ARPU를 만들 수 있는가?
4. message metering 외에 비용과 매출을 정렬하는 더 좋은 단위가 있는가?
5. 현재 명하의 Chat / Saju Reading authority 분리가 monetization boundary로도 쓸 수 있는가?

---

# 1. Evidence Class

이 문서의 근거를 다음처럼 구분한다.

```text
OFFICIAL_PRODUCT
= 공식 홈페이지 / 공식 약관 / 공식 도움말

STORE_OBSERVED
= Apple App Store 등 현재 공개 판매가격·기능

USER_REVIEW
= 공개 사용자 후기. 실제 cohort 통계가 아님

INDUSTRY_BENCHMARK
= 여러 앱을 집계한 외부 benchmark

INFERENCE
= 위 자료를 바탕으로 한 명하 측 해석

UNKNOWN
= 공개자료로 확인 불가
```

경쟁사의 가격이 존재한다는 사실을 profitability 또는 PMF 증거로 오해하지 않는다.

---

# 2. Direct Korean Competitor Matrix

| Product | Product shape | Free / return loop | Current visible monetization | Metering object | Evidence |
|---|---|---|---|---|---|
| **사주핑** | 기억하는 AI 사주친구 + decision/timing advice | 오늘의 운세 + 24시간마다 자연 충전 Ping + 출석/친구초대 | Starter ₩35,900/mo, Plus ₩74,900/mo, Pro ₩189,000/mo, Ping top-up ₩1,900~₩439,000 | 사주 해석·상담·리포트 등에 쓰는 digital usage right | OFFICIAL_PRODUCT + STORE_OBSERVED |
| **자모 Jamo** | 사주 계산 + daily + compatibility + conversational decision aid | daily / widgets / chat | weekly ₩3,300, monthly ₩8,800, annual ₩59,000, Premium+ ₩17,000 | subscription access / premium depth; app changelog also exposes free chat usage accounting | STORE_OBSERVED |
| **술술** | characterized dog + Saju 1:1 고민상담 | free detailed answers with delayed response | consumable purchase to accelerate / immediately see response | latency / convenience | STORE_OBSERVED + USER_REVIEW |
| **우주고양이 보라** | character wrapper + fortune / relationship / tarot | free daily content | Jelly consumables ₩3,300~₩29,900, ads | content / consumable | STORE_OBSERVED |
| **사주GPT** | AI Saju chat / compatibility / tarot | free app + ads | points ₩9,900 / ₩29,000 / ₩77,000 | usage credit | STORE_OBSERVED |
| **포스텔러** | large fortune content catalog | daily/free fortune + broad catalog | Force packs ₩3,300~₩97,000, ads | paid content / virtual currency | STORE_OBSERVED |
| **헬로우봇** | chatbot fortune / tarot / relationship | chatbot/free entry | Heart packs + membership ₩26,000 | consumable + membership | STORE_OBSERVED |

Source snapshot:

- Sajuping official home: https://www.sajuping.ai/home
- Sajuping FAQ: https://www.sajuping.ai/faq
- Sajuping Terms: https://www.sajuping.ai/terms
- Sajuping App Store KR: https://apps.apple.com/kr/app/id6752281515
- Jamo App Store KR: https://apps.apple.com/kr/app/id6759788071
- 술술 App Store KR: https://apps.apple.com/kr/app/id6608989137
- 우주고양이 보라 App Store KR: https://apps.apple.com/kr/app/id6469338831
- 사주GPT App Store KR: https://apps.apple.com/kr/app/id1547399137
- 포스텔러 App Store KR: https://apps.apple.com/kr/app/id1262949138
- 헬로우봇 App Store KR: https://apps.apple.com/kr/app/id1294957719

---

# 3. 사주핑 — 가장 중요한 직접 반례

## 3.1 Product overlap

사주핑은 공식적으로 자신을:

```text
나를 기억하는 AI 사주친구
```

로 포지셔닝한다.

공식 설명상:

- 만세력 기반 Saju 계산
- 이전 고민과 선택을 기억하는 AI 상담
- 이직/연애 등 구체적 고민
- timing 중심 decision advice
- 오늘의 운세
- 궁합
- 다인 궁합

을 제공한다.

공식 홈페이지는 2026-08-30 snapshot에서 `8만+ 다운로드`, App Store는 400+ review를 표시한다. 이는 회사/스토어 surface의 공개 표기이며 audited MAU 또는 revenue가 아니다.

### MyeongHa implication

> `Saju + memory + decision conversation` 자체는 아직 시장에 없는 카테고리가 아니다.

명하의 차별화는 단순히 `AI가 기억해준다`가 될 수 없다.

---

## 3.2 Ping architecture

공식 약관의 핵심 구조:

```text
Ping
= 사주 해석 / 상담 / 리포트 등 콘텐츠 사용 시 차감되는 digital usage right

natural Ping
= 모든 회원에게 시간 경과에 따라 자동 충전

holding limit
= 자연 충전이 쌓이는 상한

subscription
= holding limit 확대 / charging cycle 단축 가능

paid Ping
= 별도 top-up

bonus Ping
= 이벤트 / 친구초대 / 광고 등
```

FAQ는 현재 natural Ping이 `24시간마다` 무료 충전된다고 설명한다.

즉 BM은:

```text
replenishing free allowance
+ subscription
+ top-up
+ referral / reward currency
```

이다.

### Current App Store price surface

```text
5 Pings      ₩1,900
20 Pings     ₩11,000
50 Pings     ₩27,500
100 Pings    ₩49,000
500 Pings    ₩229,000
1000 Pings   ₩439,000

Starter      ₩35,900 / month
Plus         ₩74,900 / month
Pro          ₩189,000 / month
```

### What this proves

It proves only:

- a direct Korean competitor is willing to list substantially higher price points than the Pass 1 ₩9,900~₩14,900 membership hypothesis;
- allowance + subscription + top-up is operationally plausible;
- free usage and explicit consumption rights can coexist.

It **does not prove**:

- which plan sells;
- payer conversion;
- ARPPU;
- gross margin;
- retention;
- that users accept the meter without friction.

---

## 3.3 Free vs paid Ping quality split

Sajuping FAQ states free and paid Ping both use the same manseryeok base, while paid Ping uses a higher-performance AI model for more detailed/accurate/longer answers.

This is a direct example of:

```text
grounded base
+ compute-quality differentiation
```

### MyeongHa implication

Pass 1의 `Premium Compute` thesis receives additional direct-market support.

But MyeongHa should not sell `accuracy` in a way that implies cheap users receive semantically unreliable Saju. Its deterministic/governed Saju authority means:

```text
semantic validity
must not depend on payment

presentation depth / reasoning / context / modality
may depend on entitlement
```

---

# 4. Jamo — low-price subscription-led counterexample

Jamo currently lists:

```text
Weekly Premium   ₩3,300
Monthly Premium  ₩8,800
Annual Premium   ₩59,000
Premium+         ₩17,000
```

App Store product description positions Jamo around:

- daily fortune
- five-element flow
- compatibility
- love/work/money/choice conversation

Recent changelog shows rapid movement toward the same quality axis MyeongHa cares about:

- previous important conversation memory
- cross-device chat history
- app-calculated Saju evidence fed into chat
- reducing invented shinsal/gwiin
- more complete chart context
- Premium+ answer style selection
- deeper interpretation across yongshin / gyeokguk / johoo / eokbu perspectives

It also explicitly mentions correction so failed/interrupted responses do not incorrectly consume **free chat usage**.

### User-review signal — not a cohort statistic

A prominent review says the app became a daily habit and praised price/value, but complained that separate chats gave contradictory career recommendations after purchasing annual access.

Another review describes using Jamo for many small everyday choices — lunch, note-taking, whether to work on a specific day — rather than only traditional fortune questions.

### MyeongHa implication

Two strong observations:

1. `Decision Reading` demand can exist at **small everyday-choice frequency**, not only rare high-stakes decisions.
2. **consistency / memory / grounded semantics is a willingness-to-stay issue**, not merely an architecture nicety.

The second point aligns especially well with MyeongHa’s deterministic semantic authority strategy.

---

# 5. 술술 — monetize latency instead of meaning

술술’s App Store positioning:

```text
cute Sapsal dog character
+ Saju-based 1:1 고민상담
+ free daily fortune
```

The product deliberately frames answers as something the character prepares and sends later, with a paid option to check faster.

A public user review praised that the detailed fortune products could be used for free and explicitly said they were willing to wait for the reply.

### Insight

This shows another monetization axis:

```text
same semantic value
+ different latency / convenience
```

### MyeongHa stance

Latency monetization is worth keeping as an option, but deliberately degrading free chat speed is **not** a preferred early strategy.

Why:

- relationship chat depends on conversational rhythm;
- artificial delay can look manipulative;
- the more natural place for priority is a heavy analysis/report job, image, voice, or multi-character scene rather than ordinary `ㅋㅋ / 왜?` chat.

---

# 6. Traditional Korean fortune commerce still matters

## 포스텔러

Current App Store surface:

```text
200 Force     ₩3,300
500 Force     ₩7,700
900 Force     ₩15,000
1500 Force    ₩25,000
2000 Force    ₩33,000
3000 Force    ₩41,000
5000 Force    ₩67,000
7200 Force    ₩97,000
```

App also contains ads and a broad free/paid fortune catalog.

## 헬로우봇

Current App Store surface includes:

```text
Heart consumables
+ Membership ₩26,000
```

## 우주고양이 보라 / 사주GPT

Both show simple consumable-credit commerce, with ads/free entry.

### Pass 2 conclusion

> Korean fortune users are already trained on **virtual-currency / per-content / membership hybrid** mental models.

Therefore a consumable itself is not automatically alien to the category.

The real question for MyeongHa is **what event consumes it**.

---

# 7. Global companion evidence — relationship itself can remain free

## Character.AI

Current official c.ai+ page:

```text
Free
→ basic chat models

$9.99/month or $94.99/year
→ better memory
→ latest/best models
→ ad-free
→ no slow mode
→ unlimited voice
→ additional controls/features
```

## Replika

Official help explicitly states chatting with Replika remains free.

Paid tiers add:

- relationship status / premium activities
- voice and calls
- image generation
- smarter conversation
- better emotional intelligence
- self-reflection
- memory controls
- advanced immersive features

### Implication

The direct Korean Saju market supports metering/consumables, while major companion services support free basic relationship access.

This creates a useful split for MyeongHa:

```text
relationship conversation
!=
new grounded Saju analysis
```

---

# 8. Co-Star — hybrid evidence and freshness warning

Current App Store surface includes:

```text
Pro-Star monthly       $8.99
Year Ahead             $11.99
Advanced Self          $8.99
Advanced Relationship  $8.99
Eros                    $6.99
5 Questions             $2.99
10 Questions            $4.99
25 Questions            $6.99
```

This is effectively:

```text
subscription
+ standalone reports
+ question packs
```

Some older Co-Star material describes a-la-carte IAP as its revenue model. Current store evidence is newer and therefore receives precedence for **current product pricing**, while older statements remain historical evidence.

Do not silently merge stale and current surfaces.

---

# 9. Subscription benchmark challenges RAV1

RevenueCat State of Subscription Apps 2026 analyzes 115,000+ apps / $16B+ revenue.

Key current benchmark:

```text
D35 download → paid
hard paywall median  10.7%
freemium median       2.1%
```

Hard paywall is around 5× higher on early conversion.

But RevenueCat also reports that after one year subscriber retention is nearly identical by access model and explicitly notes freemium can still be correct when free users create:

- word of mouth
- network effects
- long-term brand scale

AI apps in the same report:

```text
D35 paid conversion     2.4% vs 2.0% non-AI
trial→paid              8.5% vs 5.6%
30d RLTV/payer          $18.92 vs $13.59
Y1 RLTV/payer           $30.16 vs $21.37

12m monthly retention   6.1% vs 9.5%
12m annual retention    21.1% vs 30.7%
refund median           4.2% vs 3.5%
```

### Important correction to Pass 1 reasoning

`free relationship gives more retention` is **not evidence-backed yet**.

What we can say:

```text
Free access probably sacrifices early conversion.

It is justified only if its incremental
retention + referral + data/relationship value + future monetization
exceeds that sacrificed conversion and free-user COGS.
```

Therefore RAV1 remains plausible but must earn its free layer empirically.

---

# 10. MyeongHa has a cleaner meter than competitors

Current MyeongHa source authority already separates:

## Ordinary relationship chat

```text
User talks without requesting Saju
→ Planner classifies general conversation
→ no Saju Engine call
→ persona + relationship + allowed memory response
```

## New Saju question

```text
needsSaju = true
→ Saju Adapter / governed Reading execution
→ Grounding
→ Character rendering
```

The DB/transaction architecture also treats chat turn and reading execution as separate logical commands.

### Consequence

MyeongHa does not need to choose between:

```text
A. everything free
B. every message costs credits
```

There is a third, architecture-native boundary:

> **Meter a new grounded Saju analysis execution, not a relationship message.**

---

# 11. H-R17 Candidate — Replenishing Grounded Analysis Allowance

## Status

**NEW LEADING HYPOTHESIS — PASS 2 / NOT AUTHORITY**

Proposed structure:

```text
OPEN RELATIONSHIP CORE
├─ ordinary small talk
├─ emotional / reflective conversation within safety boundary
├─ relationship progression
├─ permitted basic memory continuity
└─ discussion of already-grounded result where no new semantic execution is needed

REPLENISHING GROUNDED ANALYSIS ALLOWANCE
├─ new Saju domain execution
├─ new period/timing calculation where governed reading is required
├─ compatibility execution
└─ other expensive governed semantic analysis

PAID ARTIFACT
├─ detailed structured report
├─ Decision Reading artifact
├─ annual / period dossier
├─ Life Chronicle
└─ shareable compatibility product

OPTIONAL MEMBERSHIP
├─ larger/faster replenishing analysis allowance
├─ deeper continuity/memory service value
├─ included paid artifacts
├─ premium compute allowance
└─ content / episode benefits

PREMIUM COMPUTE
├─ deeper reasoning/presentation
├─ long-context reread
├─ multi-character consultation
├─ voice
└─ image / expensive modality
```

---

# 12. Why H-R17 is stronger than message credits

## 12.1 Natural conversation stays natural

The following should not visibly cost an analysis unit:

```text
ㅋㅋ
왜?
오늘 회사에서 진짜 짜증났어
아까 그 말 무슨 뜻이야?
```

provided the system does not require a **new governed Saju semantic execution**.

## 12.2 Cost and value line up better

A fresh Reading execution is both:

- more valuable to the user than casual chatter;
- structurally distinct in MyeongHa;
- potentially more compute-intensive;
- independently auditable and entitlement-gatable.

## 12.3 No sales-agent behavior is needed

Character behavior remains monetization-neutral.

```text
payer state
↛ character affection / concern / initiative
```

When a request requires a new paid/allowance Reading, Product UI / Capability Gate handles access.

The character does not need to suddenly become more promotional for free users.

## 12.4 Replenishment creates a return loop

A small replenishing analysis allowance could create:

```text
come back later
→ allowance restored
→ ask one meaningful new Saju question
→ continue relationship chat
```

without turning every message into a transaction.

This is a hypothesis, not a claim that daily currency is inherently good.

---

# 13. H-R17 risks

## Risk A — users ration questions

If users think every natural Saju-related thought might consume an allowance, they may compress or suppress conversation.

Mitigation candidate:

> charge only at explicit **new analysis execution boundary**, never every follow-up message.

## Risk B — unclear boundary feels arbitrary

If one sentence is free and another unexpectedly consumes an analysis unit, trust falls.

Required UX:

```text
ordinary conversation
→ free continuation

new governed analysis needed
→ explicit action / preview / entitlement boundary before execution
```

No surprise consumption.

## Risk C — allowance becomes game currency clutter

MyeongHa’s world/relationship experience may feel cheap if the UI constantly displays `3 coins left`.

Candidate solution:

- avoid currency animation inside intimate chat;
- surface remaining analysis rights only near analysis entry/confirmation;
- use semantic labels such as `정밀 풀이 이용권` rather than generic gems if testing supports it.

## Risk D — generous free chat still cannibalizes paid analysis

This only works if ordinary chat cannot silently create new Saju meaning.

MyeongHa’s current governed Saju authority makes that separation technically enforceable.

## Risk E — too little replenishment damages return value

Sajuping proves replenishment is operationally possible, not that its exact quantity is optimal.

Free allowance quantity / holding cap / cadence must be experimentally determined.

---

# 14. Structural Sensitivity — NOT forecast

To understand why allowance models deserve testing, consider a deliberately simplified MAU-level sensitivity model.

Illustrative only:

```text
Assume effective ordinary AI turn cost = ₩2.5
Assume other variable cost = ₩40 / MAU
```

Under one arbitrary set of monetization/usage assumptions, contribution per MAU can rise materially if free analysis usage is bounded while paid attachment remains similar.

The exact output is not retained here as a forecast because it is dominated by assumed conversion, allowance usage and channel realization.

The useful conclusion is directional:

```text
free relationship
+ bounded expensive semantic executions
```

has a wider economic safety margin than:

```text
free relationship
+ unbounded expensive semantic executions
```

This is almost tautological economically; product success still depends on whether the bound damages retention/conversion.

---

# 15. Pass 2 Architecture Ranking

Current rank after direct-competitor research:

| Rank | Architecture | Status |
|---:|---|---|
| **1A** | Open Relationship + Replenishing Grounded Analysis + Paid Artifacts + Optional Membership + Premium Compute | **NEW LEADING HYPOTHESIS** |
| **1B** | Free Relationship + Paid Value + Optional Membership + Premium Compute | **LEADING, CHALLENGED** |
| **2** | Subscription-led Saju Chat / Relationship | **UPGRADED: MUST TEST** |
| **3** | Free Chat + transaction-only Saju | plausible simplification |
| **4** | Hard paywall subscription | economic control case; product-risk high |
| **5** | Visible per-message credits for ordinary chat | low priority |

Why subscription-led was upgraded:

- Jamo is a direct current Korean example;
- RevenueCat shows materially stronger early conversion for hard-access subscription models;
- Sajuping proves high monthly price surfaces exist in the direct category.

Why it is not #1:

- no public competitor data proves which direct model has better long-term contribution;
- MyeongHa’s relationship/world architecture benefits from low-friction ongoing access;
- free relationship may create referral/retention/data value, but this must be measured.

---

# 16. Launch BM experiment that now matters most

Do **not** A/B test twenty prices first.

First test the access architecture.

## Arm A — Open Relationship / Paid New Analysis

```text
ordinary chat = open
new Saju execution = paid or very small trial allowance
```

## Arm B — Open Relationship / Replenishing Analysis

```text
ordinary chat = open
new Saju execution = naturally replenishing allowance
membership/top-up expands it
```

## Arm C — Subscription-led

```text
short free value demonstration
→ subscription gates most sustained Saju conversation/depth
```

### Hold constant

- Saju semantic quality
- character affection / concern / initiative
- onboarding value
- character persona
- safety policy

### Measure

```text
D1 / D7 / D30
free→payer
first purchase latency
analysis requests / MAU
analysis requests abandoned at entitlement boundary
ordinary chat turns / MAU
AI COGS / MAU
payer contribution
contribution / MAU
refund
subscription first renewal
repeat transaction
share/referral
self-reported paywall frustration
credit/allowance hoarding behavior
```

The winner is not highest conversion alone.

```text
incremental contribution LTV
+ organic/referral value
- retention damage
```

wins.

---

# 17. Current Recommendation

Pass 2 does **not** finalize RAV2.

But it changes the next hypothesis materially.

### Pass 1

```text
Free Relationship
+ Paid Value
```

### Pass 2 refined candidate

```text
Open Relationship Core
+ Replenishing Grounded Analysis Rights
+ Paid Structured Artifacts
+ Optional Membership
+ Premium Compute
```

One-line principle:

> **사람과 이야기하는 느낌에는 요금을 매기지 말고, 새로운 명리 의미를 계산해 주는 실행에 명확한 권리를 붙이는 구조를 먼저 검증한다.**

This is currently the most architecture-native compromise between immersion and unit economics.

---

# 18. Evidence Gaps — next research

Still unknown and therefore next-pass targets:

1. Sajuping/Jamo estimated revenue / download trend / active-user proxy from credible third-party data.
2. Exact free-chat / free-analysis quota behavior in Jamo and whether Premium/Premium+ changes it.
3. Direct competitor subscription renewal signals beyond selected reviews.
4. Korean consumer willingness-to-pay by Saju SKU, not merely listed price.
5. Whether high-priced Sajuping plans are anchor/enterprise-like tiers or materially purchased tiers.
6. App Store / Google Play fee mix and web purchase opportunities for actual launch.
7. How much users value `memory / continuity` independently from Saju answer depth.
8. Whether replenishment cadence improves return behavior or merely frustrates users.

Until these are resolved, **listed price ≠ validated ARPU** and **competitor existence ≠ successful unit economics**.
