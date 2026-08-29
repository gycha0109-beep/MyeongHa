# 명하 Revenue Architecture — Pass 2 Decision Delta v0.1

> Product: **명하 / MyeongHa**  
> Status: **Working research decision delta — NOT production authority**  
> Date: **2026-08-30 KST**

---

## 0. 목적

Pass 1 결론을 지우지 않고, Direct Competitor / Access Architecture 연구로 **무엇이 바뀌었는지** 기록한다.

Pass 1 historical register:
- `03_REVENUE_HYPOTHESES.md`
- `04_REVENUE_ARCHITECTURE_DECISIONS.md`
- `05_REVENUE_EXPERIMENTS.md`

현재 해석 우선순위는 이 문서가 더 높다.

---

# 1. Delta summary

## Pass 1 leading hypothesis

```text
Free Relationship Core
× Paid Saju / Decision Value
× Optional Membership
× Premium Compute
```

## Pass 2 leading candidate

```text
Open Relationship Core
× Replenishing Grounded Analysis Rights
× Paid Structured Artifacts
× Optional Membership
× Premium Compute
```

Key change:

> `free relationship` 자체를 버린 것이 아니라, **새로운 grounded Saju semantic execution을 별도 경제 단위로 분리**했다.

---

# 2. H-R01 — Free Relationship + Paid Value

**Old status:** LEADING_HYPOTHESIS  
**Pass 2 status:** **LEADING ALTERNATIVE / CHALLENGED**

Still supported by:

- Character.AI / Replika type free relationship pattern;
- message-meter immersion risk;
- MyeongHa's independent ordinary-chat runtime.

Challenged by:

- direct Korean Saju competitors already using bounded free usage / subscription / currency;
- RevenueCat hard-paywall early conversion advantage;
- free usage creates real COGS and may not generate enough incremental LTV.

### Decision

Do not kill H-R01. Use it as a control against H-R17.

---

# 3. H-R02 — Subscription Only / Subscription-led

**Old status:** PROPOSED / LOW PRIORITY  
**Pass 2 status:** **UPGRADED — MUST TEST AS CONTROL**

Why upgraded:

1. Jamo currently lists monthly/annual Premium plus Premium+.
2. Sajuping currently lists three monthly tiers at much higher sticker prices.
3. RevenueCat 2026 shows materially stronger early download→paid conversion under hard paywalls than freemium.

Why not promoted to leading architecture:

- listed price is not realized ARPU;
- direct competitors do not publish renewal/contribution economics;
- AI subscription long-term retention remains structurally weak in broad benchmark data;
- MyeongHa relationship/world effects may benefit from open access.

### Decision

Test subscription-led access as an economic control arm, not assumed final BM.

---

# 4. H-R03 — Visible per-message credit

**Old status:** LIKELY REJECT  
**Pass 2 status:** **UNCHANGED — LOW PRIORITY**

Direct competitors prove virtual currency is acceptable in the fortune category, but user reviews also show:

- question rationing;
- frustration after allowance reduction;
- pain from accidental consumption;
- accessibility complaints at higher top-up prices.

MyeongHa therefore distinguishes:

```text
ordinary relationship message
!=
new grounded analysis execution
```

Visible per-message charging remains a poor default.

---

# 5. H-R07 — Premium Compute

**Old status:** LEADING_HYPOTHESIS  
**Pass 2 status:** **STRENGTHENED**

Direct-market evidence:

- Sajuping explicitly differentiates free vs paid Ping partly through higher-performance AI.
- Jamo adds Premium+ answer styles and deeper multi-perspective interpretation.
- companion services commonly monetize better model/memory/voice.

### MyeongHa-specific guardrail

```text
paid compute
may improve depth / context / presentation / latency / modality

paid compute
must not determine whether the Saju semantic claim is valid
```

---

# 6. H-R08 — Decision Reading

**Old status:** LEADING_HYPOTHESIS  
**Pass 2 status:** **STRENGTHENED, BUT PRODUCT UNIT BROADENED**

Direct-market evidence shows users ask not only rare high-stakes questions but many small everyday choices.

Therefore product taxonomy should test:

```text
micro decision inquiry
vs
structured high-stakes Decision Reading artifact
```

Do not assume every decision question should be a ₩6,900~₩12,900 standalone SKU.

Some can consume a bounded analysis right; larger multi-axis decisions can become a paid artifact.

---

# 7. H-R16 — Monetization-neutral Character Behavior

**Old status:** LEADING_HYPOTHESIS  
**Pass 2 status:** **STRENGTHENED GUARDRAIL**

Direct competitors show monetization discovery can be handled by:

- Home/Hall;
- recommended questions;
- daily fortune;
- widgets;
- notifications;
- rewards/referral;

without requiring the character to behave differently because a user is free.

### Current strong guardrail

```text
payer state
↛ affection
↛ concern
↛ warmth
↛ relationship score
↛ proactive Saju sales pressure
```

Product surfaces may show monetization opportunities independently.

---

# 8. H-R17 — Replenishing Grounded Analysis Rights

**Status: NEW LEADING HYPOTHESIS / PASS 2**

## Definition

```text
ordinary relationship conversation
→ open/cheap path

new Saju semantic meaning required
→ governed Reading execution
→ analysis-right boundary candidate
```

Possible rights cover:

- new Saju domain execution;
- period/timing execution;
- compatibility analysis;
- other bounded governed semantic analyses.

Not covered:

- ordinary small talk;
- emotional/reflective conversation that does not require Saju execution;
- clarification of already-grounded material when no new Reading is needed.

---

# 9. Why H-R17 moved to rank 1A

## Architecture fit

MyeongHa already separates Chat and Reading authority paths.

This avoids inventing an arbitrary credit boundary inside the LLM response.

## Economic fit

The expensive/value-bearing semantic execution can be independently measured as `C_read`.

## UX fit

Natural relationship messages can remain unmetered.

## Market fit

Direct Korean AI-Saju products already train users to understand bounded conversational/analysis usage.

## Growth fit

Analysis rights can potentially serve as referral/reward currency without manipulating relationship semantics.

---

# 10. H-R17 is not yet a decision

H-R17 fails if any of the following occurs:

```text
allowance visibility materially suppresses natural questions

free analysis rights create large COGS
without enough retention / conversion / referral lift

users cannot understand when a new Reading is required

paid artifacts become redundant because analysis-right answers are sufficient

subscription-led control materially outperforms on contribution LTV
without unacceptable retention/brand damage
```

Therefore status remains hypothesis.

---

# 11. New primary experiment — access architecture before price optimization

Before fine-grained ₩5,900 vs ₩7,900 vs ₩9,900 price testing, compare access architecture.

## R0 — Open relationship + paid new analysis

```text
onboarding grounded sample = free
ordinary relationship chat = open
new governed Reading       = paid
```

Purpose:
- clean transaction baseline;
- no replenishment subsidy.

## R1 — Open relationship + replenishing analysis

```text
R0
+ small deterministic replenishing analysis allowance
+ extra analysis paid
```

Purpose:
- test whether free analysis creates return/activation lift worth its COGS.

## R2 — Open relationship + membership-expanded allowance

```text
R1
+ membership expands allowance / continuity value
+ included artifact / premium compute candidate
```

Purpose:
- test recurring revenue without selling relationship affection.

## S1 — Subscription-led control

```text
short free grounded demonstration
→ subscription gates most sustained Saju depth / analysis access
```

Purpose:
- measure opportunity cost of freemium/open access.

---

# 12. Hold constant across access experiments

Do not contaminate the experiment by changing:

```text
Saju semantic validity
Character persona
Character affection/concern
Relationship progression policy
Safety behavior
Initial onboarding value quality
```

Only access/economic boundary changes.

---

# 13. Required cost telemetry now changes

Pass 1 focused on:

```text
effective AI cost / committed chat turn
```

Pass 2 requires at least:

```text
C_chat
= effective variable cost / ordinary committed relationship turn

C_read
= effective variable cost / successful governed Reading execution

C_premium
= effective variable cost / premium compute unit
```

Also separately track:

- failed/uncommitted execution waste;
- retry cost;
- compatibility cost;
- multi-character cost;
- voice/image cost later.

Without `C_read`, replenishment policy cannot be rationally set.

---

# 14. Required business outcome metrics

Per experiment arm:

```text
D1 / D7 / D30
active days / month
first-payer conversion
D35 payer conversion
first purchase latency
monthly active payer share
90d cumulative ever-paid
repeat purchase
membership attach
first renewal
refund
analysis attempts / MAU
analysis completions / MAU
entitlement-boundary abandonment
ordinary chat turns / MAU
C_chat
C_read
AI COGS / free user
AI COGS / payer
contribution / MAU
contribution LTV
share/referral rate
activated referred users
question-rationing / hoarding behavior
paywall-frustration signal
```

Do not use raw MAU or gross revenue alone as winner criterion.

---

# 15. New UX guardrails for limited analysis rights

Competitor review friction adds these experiment guardrails:

```text
G-R17-01
No silent consumption on ordinary chat.

G-R17-02
Explicit scope + cost/entitlement confirmation before a new governed Reading.

G-R17-03
Failed/uncommitted execution must not consume final right.

G-R17-04
Recommendation-chip mis-tap must not directly spend a limited right.

G-R17-05
Allowance changes must be evaluated as total experienced value, not accounting bucket only.

G-R17-06
Early serious-analysis replenishment should be deterministic rather than random/roulette dependent.

G-R17-07
No reward may mutate affection/trust/relationship score.
```

These are revenue experiment guardrails. Runtime adoption requires authority review.

---

# 16. Monetization discovery delta

Old unresolved idea:

```text
free user
→ character recommends Saju more often
```

Pass 2 conclusion:

```text
DO NOT revive as default.
```

Better architecture:

```text
Character Runtime
→ genuine relationship behavior

Hall/Home/Reading UI
→ daily value
→ recommended topics
→ unresolved prior questions
→ compatibility/social entry
→ explicit paid/new-analysis entry
```

This solves monetization discovery without making the character an ad unit.

---

# 17. Referral delta

Pass 1 compatibility/gift growth loop remains strong.

Pass 2 adds:

> reward **activation**, not signup.

Candidate flow:

```text
A shares
→ B joins
→ B creates own Birth Record
→ B gets first grounded value
→ B completes activation threshold
→ reward granted
```

Reward candidate:

- bounded analysis right;
- artifact discount;
- premium compute sample.

Never relationship score.

---

# 18. Current rank after Pass 2

| Rank | Candidate | Current status |
|---:|---|---|
| **1A** | H-R17 Open Relationship + Replenishing Grounded Analysis + Paid Artifact + Optional Membership + Premium Compute | **Leading hypothesis** |
| **1B** | H-R01 Free Relationship + Paid Value + Optional Membership + Premium Compute | **Leading alternative** |
| **2** | Subscription-led Saju / Relationship access | **Required control** |
| **3** | Free Chat + transaction-only Saju | plausible simplification |
| **4** | Hard paywall subscription | control / high product-risk |
| **5** | Visible per-message ordinary-chat credits | low priority |

Component priorities independent of top-level BM:

```text
Premium Compute            HIGH
Decision / structured value HIGH
Compatibility / referral    HIGH
Life Chronicle              MEDIUM / longer-term
Ads subsidy                 OPEN
B2B                         OPTION VALUE
Expert marketplace          LATE
```

---

# 19. What remains unchanged

These Pass 1 decisions survive:

- Revenue research != runtime authority.
- No Pay-to-love.
- No payer-state sales persona.
- No visible ordinary-message meter by default.
- Paid value should be distinct, not merely longer prose.
- Expensive compute separated from cheap core path.
- Growth spend after contribution economics.
- early self-hosting not default.

---

# 20. Current one-line revenue thesis

> **관계는 끊지 않고, 새로운 명리 의미를 계산하는 실행을 경제 단위로 삼아 무료·충전·건별결제·구독 중 어떤 조합이 실제 LTV를 가장 크게 만드는지 검증한다.**

This is the Pass 2 working thesis, not a final business model authority.
