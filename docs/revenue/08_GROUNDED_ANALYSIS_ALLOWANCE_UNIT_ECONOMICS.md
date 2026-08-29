# 명하 Grounded Analysis Allowance Unit Economics — H-R17 v0.1

> Product: **명하 / MyeongHa**  
> Status: **Sensitivity model — NOT launch quota, NOT pricing authority**  
> Snapshot: **2026-08-30 KST**

---

## 0. 목적

Pass 2의 새 후보:

```text
Open Relationship Core
+ Replenishing Grounded Analysis Rights
+ Paid Artifacts
+ Optional Membership
+ Premium Compute
```

가 정말 경제적으로 유리한지 검증하려면 `AI cost/turn` 하나로는 부족하다.

최소 두 원가를 분리해야 한다.

```text
C_chat
= ordinary committed relationship turn의 effective variable AI cost

C_read
= 새 governed Saju Reading execution의 effective variable cost
```

`C_read`에는 deterministic Saju computation만이 아니라 해당 execution을 완결하기 위해 실제 필요한:

- retrieval/grounding
- planner if separately billed
- narrative/rendering
- retry/failure waste
- memory/context work attributable to the Reading

를 포함한다.

---

# 1. Why a separate Reading cost matters

Pass 1 model은 대부분의 AI 사용량을 `effective chat cost`에 묶었다.

그러나 H-R17에서는 product access boundary가 다음처럼 달라진다.

```text
ordinary conversation
→ Chat Runtime

new Saju meaning required
→ governed Reading execution
```

따라서 무료 allowance의 경제성은:

```text
free_analysis_cost / MAU
=
average free Reading executions consumed / MAU
× C_read
```

으로 직접 계산할 수 있다.

---

# 2. Base reference values — inherited assumptions only

Pass 1 Base sensitivity에서 사용한 값:

```text
Detailed Reading AOV candidate     ₩7,900
Revenue realization               79%
Ordinary chat cost candidate       ₩2.5 / committed turn
Other variable cost                ₩40 / MAU
```

따라서 한 `₩7,900` purchase의 단순 net-revenue equivalent:

```text
₩7,900 × 0.79
= ₩6,241
```

이 값은 실제 launch net revenue가 아니다.

---

# 3. Free allowance cost sensitivity

아래는 `무료 grounded Reading이 실제 사용된 횟수` 기준이다.

| C_read / execution | 1 use / MAU | 2 uses / MAU | 4 uses / MAU |
|---:|---:|---:|---:|
| ₩50 | ₩50 | ₩100 | ₩200 |
| ₩100 | ₩100 | ₩200 | ₩400 |
| ₩250 | ₩250 | ₩500 | ₩1,000 |
| ₩500 | ₩500 | ₩1,000 | ₩2,000 |

이 비용은 ordinary free chat COGS에 **추가**된다.

예:

```text
70 free chat turns × ₩2.5
= ₩175

+ 2 free readings × ₩100
= ₩200

→ AI-related variable cost candidate ≈ ₩375 / such free active user
```

before other variable costs.

---

# 4. What uplift must free analysis create?

순수하게 `₩7,900 Reading` 한 종류의 추가 구매로만 회수한다고 가정한 극단적으로 단순한 sensitivity.

Net revenue equivalent / purchase:

```text
₩6,241
```

Required **absolute incremental purchase conversion equivalent**:

```text
free allowance cost / MAU
÷ ₩6,241
```

| C_read | Free uses / MAU | Cost / MAU | Required incremental ₩7,900-purchase conversion equivalent |
|---:|---:|---:|---:|
| ₩50 | 1 | ₩50 | **0.8%p** |
| ₩50 | 2 | ₩100 | **1.6%p** |
| ₩50 | 4 | ₩200 | **3.2%p** |
| ₩100 | 1 | ₩100 | **1.6%p** |
| ₩100 | 2 | ₩200 | **3.2%p** |
| ₩100 | 4 | ₩400 | **6.4%p** |
| ₩250 | 1 | ₩250 | **4.0%p** |
| ₩250 | 2 | ₩500 | **8.0%p** |
| ₩250 | 4 | ₩1,000 | **16.0%p** |
| ₩500 | 1 | ₩500 | **8.0%p** |
| ₩500 | 2 | ₩1,000 | **16.0%p** |
| ₩500 | 4 | ₩2,000 | **32.0%p** |

### Interpretation

This table is intentionally harsh.

In reality free allowance may create value through several paths simultaneously:

```text
first transaction
+ repeat transaction
+ membership attach
+ retention lift
+ referral/share
+ improved onboarding activation
```

Therefore the table does **not** say `2 free readings at ₩100 require payer conversion to rise exactly 3.2%p`.

It says:

> MAU당 ₩200을 추가로 태우는 정책은 장기 contribution LTV에서 그만큼의 incremental value를 반드시 만들어야 한다.

---

# 5. Main implication: C_read must be measured before quota design

A replenishing allowance is attractive only after we know whether:

```text
C_read ≈ ₩50
or
C_read ≈ ₩500
```

The product policy can be completely different at those two points.

Therefore launch engineering telemetry should expose separately:

```text
cost / committed general chat turn
cost / successful governed Reading execution
cost / failed Reading attempt
cost / compatibility execution
cost / premium reasoning execution
```

Do not backsolve all of them from one blended `AI cost / user` metric.

---

# 6. Subscription-led payer ceiling sensitivity

Jamo currently lists a `₩8,800/month` subscription. This is **market observation**, not a recommended MyeongHa price.

Using the existing Pass 1 `79% revenue realization` only for structural sensitivity:

```text
₩8,800 × 0.79
= ₩6,952 net-revenue equivalent / subscriber-month
```

Subtract `₩40` other variable cost and included Reading execution cost, then the remaining amount is the maximum budget available for ordinary chat before payer contribution reaches zero.

Assume:

```text
C_chat = ₩2.5 / turn
```

| C_read | Included readings used | Reading COGS | Remaining budget for chat | Zero-contribution chat ceiling |
|---:|---:|---:|---:|---:|
| ₩50 | 4 | ₩200 | ₩6,712 | ~2,685 turns |
| ₩50 | 10 | ₩500 | ₩6,412 | ~2,565 turns |
| ₩50 | 20 | ₩1,000 | ₩5,912 | ~2,365 turns |
| ₩100 | 4 | ₩400 | ₩6,512 | ~2,605 turns |
| ₩100 | 10 | ₩1,000 | ₩5,912 | ~2,365 turns |
| ₩100 | 20 | ₩2,000 | ₩4,912 | ~1,965 turns |
| ₩250 | 4 | ₩1,000 | ₩5,912 | ~2,365 turns |
| ₩250 | 10 | ₩2,500 | ₩4,412 | ~1,765 turns |
| ₩250 | 20 | ₩5,000 | ₩1,912 | ~765 turns |

### Critical caveat

This is **payer-only zero-contribution ceiling**, not viable business usage.

It ignores:

- free-user subsidy
- fixed payroll/content/support/legal
- CAC
- refund variance
- taxes/fee differences beyond the generic realization assumption
- desired profit margin

A healthy fair-use level must be far below the zero-contribution ceiling.

---

# 7. Why even a subscription may still need usage architecture

The table above shows:

- when `C_chat` is very low, an ₩8,800-type subscription can absorb substantial chat usage;
- when `C_read` is high and readings are frequent, the same subscription loses room quickly;
- if ordinary chat moves from ₩2.5 to ₩5~10, the safe usage level shrinks sharply.

Therefore:

> `subscription = unlimited compute` is not a safe architectural assumption.

Membership can feel unlimited at the relationship UX layer while the backend still uses:

- cheap routing
- bounded context
- caching
- fair-use/abuse controls
- explicit premium compute paths
- bounded expensive Reading executions

---

# 8. H-R17 vs H-R01 — economic difference

## H-R01

```text
Free Relationship
+ first grounded value
+ paid deeper artifacts
```

Primary risk:

- free chat may fail to create a recurring monetization trigger;
- or ordinary chat may cannibalize shallow Reading purchases.

## H-R17

```text
Open Relationship
+ replenishing governed-analysis rights
+ paid artifact / top-up / membership
```

Potential economic advantage:

- expensive/new semantic execution becomes explicitly bounded;
- user has a recurring return trigger;
- subscription/top-up naturally expands the same value unit.

Potential economic disadvantage:

- free allowance adds real variable COGS;
- visible rights can create rationing/friction;
- implementation/UX is more complex than pure transaction.

Hence H-R17 is not automatically superior.

---

# 9. The minimum viable H-R17 experiment

Do not start by testing a complicated currency economy.

### Variant R0 — Paid-only new analysis after onboarding sample

```text
ordinary relationship chat = open
first sample Saju value      = free onboarding
new governed analysis        = paid
```

### Variant R1 — Small replenishing analysis right

```text
ordinary relationship chat = open
new governed analysis      = small replenishing allowance
extra                      = paid/top-up
```

### Variant R2 — Membership-expanded allowance

```text
R1
+ membership increases allowance / holding capacity
+ included artifact or premium compute
```

Do not introduce five currencies, streak multipliers, loot-box-like mechanics, or complex expiry in the first test.

---

# 10. Required experiment outputs

For R0/R1/R2 compare:

```text
Activation
- first grounded value completion
- first ordinary chat continuation

Demand
- attempted new Reading executions / MAU
- successful Reading executions / MAU
- entitlement-boundary abandonment

Monetization
- D7/D35 payer conversion
- transaction attach
- membership attach
- realized net revenue / MAU

Retention
- D1 / D7 / D30
- active days / month
- voluntary return before/after replenishment

Cost
- C_chat
- C_read
- free-user COGS
- payer COGS
- P90/P99 cost/user

Behavioral friction
- analysis-right hoarding
- question compression
- repeated boundary probing
- paywall-frustration feedback
```

Character behavior / affection / initiative stays identical between variants.

---

# 11. H-R17 go/no-go boundaries — to be calibrated

Before real telemetry, only directional rules are justified.

## Strong positive signal

```text
R1 vs R0
→ materially better D30 / repeat demand / LTV
AND
incremental value > incremental free-analysis COGS
```

## Strong negative signal

```text
free allowance consumed heavily
AND
payer conversion / retention lift weak
```

or:

```text
users materially suppress natural questions because allowance is visible
```

Then drop replenishment and return toward transaction-only or membership-led access.

---

# 12. Current conclusion

The new Pass 2 insight is not:

> `give free users X readings per day`.

It is:

> **Create a separately measurable economic unit for new governed Saju analysis, then decide its free/paid/replenishing policy from measured C_read and incremental LTV.**

This is materially cleaner than tying monetization directly to every character message.
