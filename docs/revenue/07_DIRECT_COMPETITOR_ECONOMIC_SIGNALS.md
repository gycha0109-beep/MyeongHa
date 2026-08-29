# 명하 Direct Competitor Economic Signals — Pass 2 v0.1

> Product: **명하 / MyeongHa**  
> Status: **Research / derived sensitivity — NOT forecast, NOT product authority**  
> Snapshot: **2026-08-30 KST**

---

## 0. 목적

`06_DIRECT_COMPETITOR_AND_LAUNCH_BM_REVIEW.md`가 가격/구조를 비교한다면, 이 문서는 공개된 **실제 규모·사용·매출 신호**를 분리해서 본다.

핵심 규칙:

```text
listed price != ARPU
cumulative user != MAU
paid-user count != subscription conversion
message count != committed character turns
company-reported metric != audited financial statement
```

따라서 공개 숫자를 가능한 범위까지만 역산한다.

---

# 1. Sajuping — strongest direct economic signal currently found

## 1.1 Public company-reported milestones

### 3-month milestone

2026-02-25 ChosunBiz article, citing the company:

```text
cumulative users       10,000
cumulative conversations/messages  400,000+
paid users             800+
cumulative revenue     ₩10,000,000
D+7 revisit rate        15%
monthly revenue growth  4x over the same period
```

Source:
- https://biz.chosun.com/industry/business_info/2026/02/25/BAKOEIEFNVF4ZJLNIRK3BIL3OU/

The article is secondary media and the metrics are company-reported, not audited.

### 5-month milestone

2026-04-06 Korea Economic Daily article, citing the company:

```text
cumulative users       20,000
cumulative messages    1,000,000
```

The company also said growth occurred without separate marketing and that repeated conversational usage was visible.

Source:
- https://www.hankyung.com/article/202604060939O

Again, this is a company statement reproduced by media.

### Current official site surface

2026-08-30 official homepage currently displays:

```text
8만+ downloads
400+ reviews
App Store rating 4.5
```

Source:
- https://www.sajuping.ai/home

This is current product marketing surface, not active-user or revenue data.

---

# 2. Safe derived metrics from Sajuping

Derived only from the published milestones.

## 2.1 Messages per cumulative user

At 3 months:

```text
400,000 messages / 10,000 cumulative users
= ~40 messages / cumulative user
```

At 5 months:

```text
1,000,000 messages / 20,000 cumulative users
= ~50 messages / cumulative user
```

Do **not** interpret these as monthly turns/MAU.

Cumulative-user denominator mixes:

- one-time visitors
- retained users
- payers
- inactive accounts

The useful observation is merely:

> conversation volume grew faster than cumulative users between the two disclosed milestones.

3→5 month growth:

```text
users     2.0x
messages  2.5x
```

This is directionally consistent with repeat use, but does not provide cohort retention.

---

## 2.2 Cumulative paid-user incidence

At the 3-month milestone:

```text
800+ paid users / 10,000 cumulative users
= at least ~8% ever-paid incidence
```

This is **not** the same as:

- monthly payer conversion
- subscription attach
- D35 download-to-paid
- active payer share

because the numerator is cumulative `paid users` and the denominator is cumulative users over the first three months.

Still, it is one of the few direct Korean AI-Saju payment signals currently public.

---

## 2.3 Cumulative revenue per cumulative user

At the same milestone:

```text
₩10,000,000 / 10,000 cumulative users
= ~₩1,000 cumulative gross/company-reported revenue per acquired user
```

This is not monthly ARPU.

It is early-life cumulative revenue per cumulative user at that snapshot.

---

## 2.4 Revenue per paid user — upper-bound-like reading only

If paid users were exactly 800:

```text
₩10,000,000 / 800
= ₩12,500 cumulative revenue / paid user
```

But the article says **800+**, so the true value using the disclosed numerator would be `<= ₩12,500` if all revenue is attributed to those paid users and the metrics cover exactly the same population/time window.

Therefore do not call ₩12,500 ARPPU.

It is only a rough ceiling from incomplete public data.

This matters because the current App Store now displays monthly plans as high as:

```text
₩35,900
₩74,900
₩189,000
```

The early revenue milestone demonstrates why **listed plan price cannot be used as realized ARPPU**.

---

## 2.5 Revenue / message ratio

At the 3-month snapshot:

```text
₩10,000,000 / 400,000 messages
= ~₩25 company-reported cumulative revenue / message
```

This is **not** price/message and not margin/message.

It mixes:

- free messages
- paid messages
- possibly different Ping consumption
- subscriptions
- top-ups
- content purchases

But it provides a useful scale ratio.

If a MyeongHa-like service had:

```text
effective AI cost / committed turn = ₩2.5
```

then ₩2.5 is 10% of this rough ₩25 revenue/message ratio before all other costs.

This is not a competitor margin estimate; it simply demonstrates why effective AI cost must be materially below blended monetization per interaction.

---

# 3. What Sajuping's D+7 = 15% signal means

Company-reported D+7 revisit rate:

```text
15%
```

Without metric definition, we do not know:

- install cohort vs signup cohort
- exact event qualifying as revisit
- rolling vs fixed cohort
- app-open vs conversation
- organic source composition

Therefore it cannot be directly compared with MyeongHa's future D7 without a matching definition.

However, it provides a useful warning:

> `AI Saju + memory + conversation` does not automatically imply exceptionally high retention.

MyeongHa must prove its Character / Relationship / Life Record architecture produces a material incremental lift over a simpler direct competitor experience.

---

# 4. Jamo — actual MAU growth signal

POSTECH Industry-Academic Cooperation Foundation reported in August 2026:

```text
Jamo MAU
5,560 → 14,788
= 2.66x

74 countries
```

Source:
- https://aif.postech.ac.kr/kor/support/performance-guide.do?articleNo=17529&mode=view

This is significantly stronger evidence than App Store review count because it gives an explicit active-user metric.

The same article says four participating companies collectively generated `₩151.588M` in cumulative revenue, but does **not** attribute a specific revenue amount to C341/Jamo.

Therefore:

```text
Jamo MAU = publicly supported
Jamo individual revenue = UNKNOWN from this source
Jamo payer conversion = UNKNOWN
Jamo ARPU = UNKNOWN
```

---

# 5. What the two direct competitors tell us together

## Sajuping

Evidence supports:

```text
conversation-heavy Saju
+ memory
+ replenishing currency
+ subscription
+ top-up
+ at least some paid conversion
```

## Jamo

Evidence supports:

```text
Saju + daily retention surfaces
+ conversation
+ memory improvements
+ subscription / Premium+
+ fast MAU growth
```

### Important

Neither public dataset establishes which monetization architecture has superior:

- contribution margin
- LTV
- D30/D90
- renewal
- CAC

So Pass 2 does **not** conclude `copy Sajuping` or `copy Jamo`.

The actual useful result is:

> both subscription-led and allowance-hybrid Saju conversation products have enough real-world traction to deserve controlled comparison.

---

# 6. Comparison with RevenueCat 2026 — do not mix denominators

RevenueCat reports D35 download→paid median:

```text
hard paywall  10.7%
freemium       2.1%
```

Sajuping reported:

```text
800+ cumulative paid users
/ 10,000 cumulative users
= >=8% ever-paid incidence at ~3 months
```

These numbers are **not directly comparable**.

Differences include:

- D35 cohort vs multi-month cumulative population
- subscription conversion vs any paid user
- RevenueCat cross-category aggregate vs one AI Saju company
- unknown Sajuping acquisition cohort timing

The only legitimate conclusion:

> a direct AI-Saju service can generate a nontrivial paid-user population without a pure hard paywall.

---

# 7. Reverse implication for MyeongHa launch expectations

Pass 1 Base assumed `5% unique payer share`.

Sajuping's `>=8% cumulative ever-paid incidence` means 5% is **not obviously absurd** as a hypothesis, but it does not validate it.

Why not:

```text
ever-paid
!=
monthly active payer
!=
monthly recurring payer
```

MyeongHa still needs its own:

```text
D35 first payer conversion
monthly active payer share
repeat payer share
membership attach
90d cumulative ever-paid
```

as separate metrics.

---

# 8. Revenue ceiling lesson from current Sajuping pricing

Current listed Sajuping prices are very high relative to its disclosed early cumulative revenue per paid user.

This suggests at least one of the following may be true:

1. current prices were introduced after the early milestone;
2. low-priced Ping purchases dominate;
3. high plans have low attach;
4. high plans act as anchors for heavy users;
5. later monetization may be much higher than February data;
6. paid-user count includes very small purchases.

Public evidence does not resolve which.

### MyeongHa rule

> Do not use competitor top-tier price as launch willingness-to-pay evidence.

Price experiments should be based on:

```text
conversion
× realized net revenue
× repeat/renewal
× incremental COGS
```

not competitor sticker price.

---

# 9. More important competitor signal: conversation intensity

At 5 months, Sajuping disclosed:

```text
20K cumulative users
1M cumulative messages
```

The company explicitly frames Saju as a low-friction entry into longer emotional/self-understanding conversation.

This is strategically important for MyeongHa because it supports the **behavioral premise** that Saju can open a conversation loop instead of being only a static report.

But it also creates the central economic risk:

```text
conversation succeeds
→ inference usage rises
→ free-user cost rises
```

Therefore MyeongHa should optimize for:

> **valuable retained conversation, not maximum messages.**

Success metric should not be raw turns/user alone.

---

# 10. Pass 2 economic interpretation

The strongest architecture candidate remains:

```text
ordinary relationship conversation
→ cheap/open enough to preserve immersion

new governed Saju semantic execution
→ replenishing bounded right / entitlement candidate

structured high-value artifact
→ transaction

continuity + allowance + service bundle
→ membership candidate

expensive modality/reasoning
→ premium compute
```

Why this becomes stronger after the direct economic data:

1. Sajuping shows conversation volume can become material very quickly.
2. Its allowance system shows an operational mechanism for bounding valuable Saju usage.
3. Jamo shows subscription-led pricing is also viable enough to grow MAU materially.
4. Neither competitor publicly proves high long-term monetization efficiency.
5. MyeongHa's existing architecture lets it meter the semantic Reading execution more precisely than a generic `message`.

---

# 11. Launch benchmark table — evidence vs target

| Metric | External signal | MyeongHa use |
|---|---:|---|
| Sajuping cumulative users, month ~3 | 10K | scale reference only |
| Sajuping cumulative messages, month ~3 | 400K | conversation intensity reference |
| Sajuping paid users, month ~3 | 800+ cumulative | first-payer plausibility signal |
| Sajuping cumulative revenue, month ~3 | ₩10M | early monetization scale reference |
| Sajuping D+7 revisit | 15% company-reported | competitor floor/reference after definition alignment |
| Sajuping cumulative users, month ~5 | 20K | growth reference |
| Sajuping cumulative messages, month ~5 | 1M | usage growth reference |
| Jamo MAU, Aug 2026 public report | 14,788 | direct active-user scale reference |
| RevenueCat freemium D35 paid | 2.1% median | broad cross-category reference |
| RevenueCat hard paywall D35 paid | 10.7% median | economic control case |

No external number becomes an automatic MyeongHa launch target.

---

# 12. Next quantitative research questions

Priority order:

1. Obtain credible current estimated monthly revenue/download trend for Sajuping and Jamo if publicly observable.
2. Resolve Jamo free-chat allowance and Premium/Premium+ usage constraints.
3. Estimate MyeongHa `general chat` vs `new Reading execution` frequency from product prototype or synthetic session corpus.
4. Build H-R17 unit economics with two separate cost units:
   - KRW / ordinary committed chat turn
   - KRW / governed Reading execution
5. Backsolve required payer conversion for replenishing allowance variants.
6. Model allowance cap/cadence without using arbitrary `messages/day`.
7. Measure whether allowance replenishment itself increases D7/D30 returns or simply introduces frustration.

---

# 13. Current factual bottom line

Pass 2 now has two direct, current Korean comparables with real scale evidence:

```text
Sajuping
→ 10K users / 400K messages / 800+ paid / ₩10M cumulative revenue at ~3 months
→ 20K users / 1M messages at ~5 months
→ current official site says 80K+ downloads

Jamo
→ reported MAU 14,788 in Aug 2026
→ current ₩8,800 monthly / ₩17,000 Premium+ price surface
```

This makes the competitive problem more concrete:

> **MyeongHa cannot win merely by being an AI Saju chat that remembers.**

The economic/product differentiation must come from some combination of:

- stronger deterministic Saju authority and consistency;
- richer character relationship retention;
- better separation between cheap conversation and valuable governed analysis;
- Life Record compounding value;
- multi-character/world/IP layer;
- superior value-per-paid-execution.
