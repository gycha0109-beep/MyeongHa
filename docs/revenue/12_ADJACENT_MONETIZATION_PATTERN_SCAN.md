# 명하 Adjacent Monetization Pattern Scan — Pass 3 v0.1

> Product: **명하 / MyeongHa**  
> Track: Revenue Architecture / Unit Economics / Monetization Strategy  
> Status: **Adjacent-market research — NOT product authority**  
> Snapshot: **2026-08-30 KST**

---

## 0. 목적

Pass 2가 직접 한국 AI 사주 경쟁사를 중심으로 `chat vs grounded Reading execution` 경계를 검토했다면, Pass 3는 한 단계 넓게 본다.

검토 범위:

```text
AI companion
wellness / habit
astrology / expert marketplace
interactive fiction
romance live-service / gacha
online dating
creator membership
```

목적은 경쟁사를 복사하는 것이 아니라:

> **사용자가 반복적으로 돈을 내는 가치 단위가 무엇인지**

를 추출하는 것이다.

---

# 1. Evidence rule

```text
OFFICIAL_PRODUCT
= 공식 도움말 / 공식 사이트 / 공식 가격정책

STORE_OBSERVED
= App Store에 현재 공개된 가격/IAP

PUBLIC_FINANCIAL
= 언론/공시/회사 공개 수익 수치

USER_REVIEW
= 사용자의 마찰 신호. 대표성 있는 cohort 통계 아님

INFERENCE
= 명하에 대한 해석
```

특히 다음을 금지한다.

```text
listed price = willingness-to-pay
ARR claim = audited revenue
large revenue = same BM works for MyeongHa
```

---

# 2. Pattern A — Free core, pay for capacity/depth

## Kindroid

Official July 2026 subscription documentation:

```text
Free
→ unlimited messages on Lite model

Standard
→ $13.99/month web
→ $15.99/month app

Ultra add-on
→ +$24.99 web / +$28.99 app

MAX add-on
→ +$59.99 web / +$68.99 app
```

The company explicitly says Ultra/MAX exist because expanded context and dedicated-server costs are high, and it expects to break even or potentially lose money even at those rates.

Source:
- https://kindroid.ai/v2/docs/subscriptions/

### MyeongHa lesson

This is one of the cleanest external supports for:

```text
cheap/open relationship layer
!=
high-context / high-compute layer
```

Important correction:

> Premium Compute does not need to be a large profit center.

It can instead function as a **cost containment / cost recovery layer**.

This makes H-R07 stronger architecturally, but weakens any assumption that premium compute itself will become the primary margin engine.

---

# 3. Pattern B — Core trust product stays free; subscription sells "more", not access

## Finch

Official Finch help center says all core self-care features are and will remain free.

Free users can:

- care for the self-care pet;
- set goals;
- reflect;
- send social encouragement;
- participate in seasonal events.

Finch Plus adds:

- more customization;
- additional prompts/content;
- more reward slots;
- faster seasonal progression;
- broader soundscape/timer options;
- bonus content.

Official pricing snapshot:

```text
$9.99/month
$69.99/year
```

Sources:
- https://help.finchcare.com/hc/en-us/articles/37780200600589-Benefits-of-Finch-Plus
- https://help.finchcare.com/hc/en-us/articles/38755205001869-Finch-Plus-Pricing

Finch also runs Guardian programs, gift subscriptions, raffles and community support mechanisms.

### MyeongHa lesson

A trust-sensitive product can legitimately say:

```text
core relationship / core wellbeing value = free
premium = customization + convenience + bonus content + faster progress
```

This supports a possible MyeongHa membership design where:

```text
relationship existence != paid
relationship affection != paid

membership
→ more continuity tooling
→ richer presentation
→ more included analysis/value
→ more content
```

The key difference is that MyeongHa has material inference cost whereas Finch's core interactions are not equivalent LLM workloads.

Therefore Finch validates the **product philosophy**, not MyeongHa unit economics.

---

# 4. Pattern C — Subscription + one-time products is a mature hybrid

## Co-Star

Current App Store surface:

```text
Pro-Star monthly          $8.99
Year Ahead                $11.99
Advanced Self Chart       $8.99
Advanced Relationship     $8.99
Eros                       $6.99
5 Questions                $2.99
10 Questions               $4.99
25 Questions               $6.99
```

Korean store equivalents currently include:

```text
Pro-Star monthly          ₩12,000
Year Ahead                ₩19,000
Advanced Self             ₩15,000
Advanced Relationship     ₩15,000
5 Questions               ₩4,400
10 Questions              ₩7,700
25 Questions              ₩11,000
```

Sources:
- https://apps.apple.com/us/app/co-star-personalized-astrology/id1264782561
- https://apps.apple.com/kr/app/co-star-personalized-astrology/id1264782561

### MyeongHa lesson

This remains one of the strongest broad analogues for:

```text
free recurring utility/social surface
+ recurring subscription
+ question pack
+ high-value standalone report
```

It argues against forcing one universal monetization unit.

A user can have different willingness-to-pay for:

```text
ongoing relationship continuity
vs
one specific question
vs
one polished saved artifact
```

---

# 5. Pattern D — High-trust service can sell annual/lifetime access

## Calm

Current App Store copy states:

```text
monthly       $14.99
annual        $69.99
lifetime      $399.99
```

Korean App Store currently displays multiple localized Calm Premium purchase points, including ₩59,000 annual-style SKUs.

Sources:
- https://apps.apple.com/kr/app/calm/id571800810
- Calm official subscription offer pages also renew around $79.99/year on current promotions.

### MyeongHa lesson

Lifetime access is not an early recommendation for an inference-heavy service because future variable COGS remains open-ended.

But the broader lesson matters:

> Users can be offered **different commitment horizons** for the same continuing value.

Possible later MyeongHa pricing architecture:

```text
monthly
annual at meaningful discount
fixed-term gift
```

Avoid lifetime unlimited AI compute unless future-cost exposure is contractually bounded.

---

# 6. Pattern E — Sell control/visibility/uncertainty reduction, not the core social interaction

## Tinder

Tinder's free product still centers on discovering/matching/chatting.

Subscriptions sell layers such as:

```text
unlimited likes
rewind
ad-free
incognito
see who likes you
weekly Super Likes
monthly Boost
prioritized Likes
```

It also sells Super Likes and Boost-like visibility products separately.

Sources:
- https://www.help.tinder.com/hc/en-us/articles/115004487406-Tinder-subscriptions
- https://tinder.com/feature/subscription-tiers/
- https://www.help.tinder.com/hc/ko/articles/115004493543-

### MyeongHa lesson

Tinder does not primarily monetize `message to another person`.

It monetizes:

- control;
- speed;
- visibility;
- uncertainty reduction;
- priority.

Equivalent value axes for MyeongHa could be:

```text
analysis certainty/structure
comparison capability
priority/latency for heavy report jobs
history navigation
multi-person comparison
```

But a strict boundary remains:

> Do not sell emotional certainty such as "character truly loves you".

---

# 7. Pattern F — Interactive fiction proves hybrid monetization, and also its failure mode

## Episode

Current App Store structure includes:

```text
Gems
Passes
VIP monthly ($14.99 on US surface)
No-ads / value packs / event-like consumables depending region
```

The product has 150,000+ stories and billions of reads according to its current store description.

Sources:
- https://apps.apple.com/us/app/episode-choose-your-story/id656971078
- https://apps.apple.com/kr/app/episode-choose-your-story/id656971078

## Choices

Korean App Store currently lists:

```text
Diamonds         ₩3,300 ~ ₩149,000
Keys             ₩3,300 ~ ₩17,000
VIP Subscription ₩20,000
```

Source:
- https://apps.apple.com/kr/app/choices-stories-you-play/id1071310449

### MyeongHa lesson

Hybrid structure is proven operationally:

```text
subscription
+ content-energy/pass
+ premium choices/content currency
```

But the failure mode is directly relevant:

> If emotionally meaningful choices repeatedly become paid gates, the user can feel that the story is deliberately made worse unless they pay.

This is exactly why MyeongHa should avoid:

```text
pay to receive kind response
pay to prevent relationship damage
pay to unlock affection choice
```

If authored episodes are later monetized, price the **episode/content package**, not emotional dignity inside the scene.

---

# 8. Pattern G — Relationship IP can monetize far beyond dialogue

## Love and Deepspace

Current App Store monetization includes:

```text
Aurum Pass (30 Days)    $4.99
packs from sub-$1 upward
Heartfelt Vow / event-style purchases
limited Wish pools / 5-star Memories
```

The official game documents a pity system and precise-wish guarantees for limited Memories.

Reuters reported in February 2026:

```text
80M+ users
nearly $1B revenue
~60% revenue from China
```

Sources:
- https://apps.apple.com/us/app/love-and-deepspace/id6443467666
- https://loveanddeepspace.infoldgames.com/en-EN/news/17
- Reuters, 2026-02-12, "More than a game: virtual boyfriends win hearts in China"

### MyeongHa lesson

The major lesson is **not** to add gacha.

It is:

> A successful relationship/IP layer creates monetizable objects outside the conversation itself.

Examples that could become relevant only after character resonance is proven:

```text
authored character episodes
visual memories
voice packs
cosmetics
seasonal world content
physical/digital collectibles
```

This supports maintaining Character IP as **option value** even if early BM is Saju-centered.

But:

- gacha is not an early MyeongHa recommendation;
- romantic affection must not depend on spending;
- randomized paid emotional access would conflict with current trust principles.

---

# 9. Pattern H — Expert marketplace can dwarf content commerce

## AstroTalk

Economic Times reported FY25:

```text
operating revenue   ₹1,176 crore
FY24 operating rev  ₹651 crore
YoY growth          ~81%
profit before tax   ₹285 crore
```

The company attributed demand to core astrology services, with stronger engagement/conversion/repeat use in tier-I cities.

AstroTalk's official pricing policy says Android/iOS user transactions typically range:

```text
₹500–₹1,500 per user per session
```

Sources:
- https://economictimes.indiatimes.com/tech/startups/online-astrology-service-astrotalks-fy25-revenue-surges-81-to-rs-1176-crore/articleshow/127691241.cms
- https://astrotalk.com/pricing

AstroTalk Store, launched later, reportedly reached over ₹140 crore in FY25 revenue and processed 1.6M+ orders in 2025, according to company figures reported by Moneycontrol.

Source:
- https://www.moneycontrol.com/news/business/startup/astrotalk-s-e-commerce-arm-posts-rs-140-crore-revenue-in-fy25-scales-to-rs-200-crore-arr-13779261.html

### MyeongHa lesson

There is a credible later-stage expansion path:

```text
AI / deterministic reading
→ human expert escalation
```

Potential high-AOV cases:

- user wants a human interpretation;
- complex relationship question;
- ceremonial/consultative experience;
- premium scheduled session.

But this is a **different operational business**:

- expert recruitment;
- quality control;
- scheduling;
- dispute/refund;
- moderation;
- marketplace compliance;
- take rate economics.

Therefore H-R15 remains later-stage option value.

Physical spiritual-commerce cross-sell is even less attractive for early MyeongHa because it adds inventory/reputation risk and can create incentives to recommend products on unverifiable grounds.

---

# 10. Pattern I — Membership + one-time product + gift can coexist cleanly

## Patreon

Current Patreon structure supports:

```text
monthly membership
annual membership
one-time digital products
one-time paid posts/collections
gift memberships
discounts/promotions
```

For creators newly publishing after August 4, 2025, Patreon currently uses a standard 10% platform fee plus payment-processing fees.

Sources:
- https://support.patreon.com/hc/en-us/articles/11111747095181-Creator-fees-overview
- https://support.patreon.com/hc/en-us/articles/31344987943949-How-to-gift-memberships-to-other-fans
- https://support.patreon.com/hc/en-gb/articles/204606215-Can-I-make-a-one-time-payment

### MyeongHa lesson

Recurring membership and transactional commerce do not need to compete.

They can serve different jobs:

```text
membership
→ continuing service relationship

one-time artifact
→ specific value object

gift
→ acquisition + monetization
```

This reinforces H-R10 compatibility/gift as more than a sharing feature.

A MyeongHa product can plausibly be designed so that a non-user buys or receives:

- compatibility gift;
- fixed-term membership gift;
- premium Reading gift;

without forcing a subscription first.

---

# 11. Pattern J — Community subsidy / sponsorship can preserve a free core

## Finch Guardians

Finch operates Guardian subscriptions, raffles, gifting and fundraising around its free-core philosophy.

Sources:
- https://help.finchcare.com/hc/en-us/categories/37934158500237-Guardians
- https://help.finchcare.com/hc/en-us/articles/41672084300557-FAQs

### MyeongHa lesson

Not a launch priority, but there is a later alternative to advertising for subsidizing access:

```text
user-paid gift
sponsor-funded campaign
partner-funded access
community grants/promotions
```

Potential examples:

- seasonal gifted analysis passes;
- brand-funded non-sensitive event access;
- creator/community gift campaigns.

Any sponsor involvement must be clearly separated from Saju semantic outcomes.

```text
sponsor
↛ favorable reading
↛ product recommendation embedded in divination claim
```

---

# 12. Pattern K — Social AI scale shows model quality and inference architecture are revenue variables

## CHAI

Current CHAI site self-reports:

```text
$70M/year revenue in 2026
5,000 GPUs
1.2T tokens/day
51K unique LLMs served
```

The company also says an in-house model improvement produced engagement gains and reports later model upgrades increased screentime/revenue.

Separately, CHAI-issued press releases in 2026 have claimed ARR growth from ~$58M to $80M and later over $100M/year revenue.

Sources:
- https://chai.ai/
- https://www.prnewswire.com/news-releases/chai-3x-annual-growth-reaching-70m-arr--latest-ai-safety-update-302694006.html
- https://www.prnewswire.com/news-releases/chai-ai-backed-by-coreweave-and-amd-hits-80m-arr-with-talks-of-2-4b-valuation-302759626.html

These are company claims, not audited financial statements.

### MyeongHa lesson

At large scale:

> model routing, latency, context efficiency and self-hosted inference become business-model variables, not merely engineering details.

This supports the existing stage rule:

```text
Stage 0~1 → API-first
Stage 2 → multi-provider / benchmark
Stage 3+ → self-host/open model crossover becomes serious
```

But CHAI scale is not evidence that MyeongHa should self-host early.

---

# 13. Cross-market monetization primitives

Across the adjacent scan, monetization repeatedly clusters around these primitives.

| Primitive | Examples | MyeongHa fit |
|---|---|---|
| Core access | hard/soft subscription | **TEST, not default** |
| Capacity | Kindroid context tier | **HIGH fit** |
| Depth | premium reasoning/report | **HIGH fit** |
| Specific artifact | Co-Star reports | **HIGH fit** |
| Question allowance | Co-Star packs / Saju credits | **HIGH fit, needs UX guardrail** |
| Convenience / latency | Tinder Boost analogue / delayed report priority | **MEDIUM** |
| Customization | Finch / companion apps | **MEDIUM later** |
| Premium content | Episode / Finch seasonal tracks | **MEDIUM after IP proof** |
| Collection | Love and Deepspace | **LOW early / HIGH option value** |
| Human expert access | AstroTalk | **LATER high-AOV option** |
| Gift | Patreon / Finch | **HIGH growth option** |
| Physical commerce | AstroTalk Store | **LOW / high trust risk** |
| Ads | many freemium apps | **OPEN subsidy only** |

---

# 14. Important conceptual change: do not ask for one BM

The broad scan weakens the question:

> `What single business model is MyeongHa?`

A better decomposition is:

```text
1. Relationship Access Layer
2. Grounded Analysis Usage Layer
3. Artifact Commerce Layer
4. Membership Bundle Layer
5. Premium Compute Layer
6. IP / Content Layer
7. Expert / Gift / Distribution Layer
```

Each layer can be independently activated when evidence exists.

This does **not** mean launch should contain all seven.

It means architecture should avoid making them mutually exclusive.

---

# 15. Launch simplification after broad scan

The broad scan actually argues for a **simpler launch**, not more monetization features.

Stage 1 should likely test only:

```text
A. relationship access
B. new grounded-analysis access
C. one or two paid structured artifacts
D. one recurring membership control
```

Defer:

```text
season pass
gacha
cosmetic store
expert marketplace
physical commerce
creator marketplace
complex reward economy
```

until the corresponding product behavior is proven.

---

# 16. New product-value ladder candidate

Instead of pricing by message count, define ascending value objects.

```text
LEVEL 0 — Relationship
ordinary conversation / continuity

LEVEL 1 — Inquiry
one new bounded grounded question

LEVEL 2 — Analysis
multi-axis / timing / comparison execution

LEVEL 3 — Artifact
saved structured report / compatibility / annual dossier

LEVEL 4 — Experience
multi-character / voice / authored episode / visual experience

LEVEL 5 — Human / Gift / Social
expert session / gifted product / couple product
```

This ladder gives revenue architecture a clearer semantic basis than generic coins.

---

# 17. Broad-scan anti-patterns

## Anti-pattern 1 — Pay for affection

Interactive fiction / romance monetization shows why users can tolerate paying for content, but emotionally coercive gates are dangerous.

MyeongHa rule remains:

```text
money
↛ affection
↛ concern
↛ trust score
↛ avoiding punishment from character
```

## Anti-pattern 2 — Unlimited expensive compute hidden inside low-price subscription

Kindroid's public cost commentary is a direct warning.

## Anti-pattern 3 — Too many currencies at launch

Episode/gacha-style systems may monetize at scale but create cognitive and trust cost.

## Anti-pattern 4 — Physical recommendation conflict

If MyeongHa ever sells products related to readings, commercial incentive could contaminate perceived semantic neutrality.

Do not combine without a separate trust architecture.

## Anti-pattern 5 — Fake scarcity / fake urgency

The service should not manufacture cosmic urgency to move transactions.

---

# 18. Pass 3 conclusion

The broader market does **not** overturn H-R17.

It changes how H-R17 should be understood.

Pass 2 framing:

```text
Open Relationship
+ Replenishing Grounded Analysis Rights
+ Paid Artifacts
+ Optional Membership
+ Premium Compute
```

Pass 3 refinement:

> **Grounded Analysis Rights are only one monetization primitive, not the whole BM.**

The more durable architecture is:

```text
Open / low-friction relationship core
+ measurable grounded-analysis unit
+ distinct high-value artifacts
+ optional recurring service bundle
+ cost-recovery premium compute
+ later IP / gift / human-expert option value
```

The strongest lesson from adjacent markets is:

> **Do not monetize the emotional bond itself. Monetize depth, capacity, structured value, convenience, content, and optional high-cost experiences around it.**
