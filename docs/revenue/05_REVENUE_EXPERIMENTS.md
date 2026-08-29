# 명하 Revenue Experiments v0.1

> Product: **명하 / MyeongHa**  
> Status: **Experiment plan — NOT analytics runtime authority**  
> Date: **2026-08-30 KST**

---

## 0. 목적

Revenue Architecture를 토론으로 확정하지 않는다.

다음 순서로 검증한다.

```text
instrument
→ expose product value
→ measure behavior
→ calculate contribution
→ accept / redesign / kill
```

중요:

- 이 문서에 적은 event 이름은 analytics runtime schema를 자동 생성하지 않는다.
- 새 telemetry가 필요하면 `ANALYTICS_EXPERIMENT_SPEC.md`의 event registry/schema version 절차로 추가해야 한다.
- raw chat / Birth / Memory / receipt를 revenue analytics payload에 복제하지 않는다.

---

# 1. Experiment Priority

| Priority | Experiment | Main Question |
|---:|---|---|
| **P0** | AI Cost Ledger | 한 사용자가 실제 얼마를 태우는가? |
| **P1** | Paid Value Conversion | 사용자는 무엇에 돈을 내는가? |
| **P1** | Character Retention Lift | 캐릭터/기억이 실제 재방문을 만드는가? |
| **P1** | Free/Paid Cannibalization | 무료 chat이 유료 Saju를 대체하는가? |
| **P2** | Membership Bundle | 관계 구독에 반복 가치가 있는가? |
| **P2** | Compatibility Share Loop | 결제가 acquisition까지 만드는가? |
| **P2** | Model Routing | 어느 품질에서 얼마가 드는가? |
| P3 | Ads Subsidy | 무료 사용자 cost를 UX 훼손 없이 보조 가능한가? |
| P3 | Authored Episode | 캐릭터 IP에 별도 지불 의향이 있는가? |

---

# 2. EXP-R00 — AI Cost Ledger

**Priority: P0 / launch blocker for economics measurement**

## Question

> completed user-visible turn 하나가 실제로 얼마인가?

## Measure

최소 aggregate dimensions:

```text
execution purpose
provider/model class
input token count
cached input token count
output token count
retry count
success/failure
normalized cost
committed turn / reading linkage
```

필수 outputs:

```text
effective AI cost / committed turn
AI cost / MAU
AI cost / free active user
AI cost / payer
P50 / P75 / P90 / P95 / P99 user AI cost
premium model share
retry waste share
```

## Pass signal

초기 working signal:

```text
ordinary relationship chat
effective cost / committed turn
≤ ₩2~3 range
```

이는 hard product quota가 아니라 economics target.

## Redesign signal

```text
> ₩5 sustained
```

이면 Base model상 free relationship economics가 크게 약화.

우선 대응:

1. context size inspection
2. cache-hit inspection
3. planner call elimination/routing
4. memory Top-K/compression
5. premium leakage inspection
6. retry/failure waste
7. alternative provider/model benchmark

메시지 meter 도입은 첫 대응이 아니다.

---

# 3. EXP-R01 — Paid Value Conversion

**Priority: P1**

## Question

> 사용자는 관계에 돈을 내는가, 답/분석에 돈을 내는가?

## Candidate SKUs

초기 서로 다른 willingness-to-pay를 비교한다.

```text
A. Detailed Saju Reading
B. Decision Reading
C. Compatibility
D. Membership
```

가격 candidate는 authority가 아니라 실험 arm:

```text
Detailed Reading: ₩5,900 / 7,900 / 9,900
Decision:         ₩6,900 / 9,900 / 12,900
Compatibility:    ₩9,900 / 12,900 / 14,900
Membership:       ₩9,900 / 12,900 / 14,900 monthly
```

## Measure

```text
product impression → purchase intent
purchase intent → verified purchase
unique payer conversion
AOV
refund
cross-SKU attach
repeat purchase
```

## Important

캐릭터가 payer state 때문에 sales behavior를 바꾸는 실험은 하지 않는다.

Paywall placement/copy는 UI experiment로 분리한다.

---

# 4. EXP-R02 — Character Retention Lift

**Priority: P1**

## Question

> Character / Memory / Relationship architecture가 실제로 retention을 올리는가?

## Suggested cohort design

제품 품질을 훼손하지 않는 연구 환경에서 가능한 비교:

```text
Cohort A
→ reading-forward experience

Cohort B
→ character relationship + permitted memory continuity
```

단 동일 기간에 Saju semantic quality 차이가 생기지 않게 한다.

## Metrics

```text
D1
D7
D30
D60
D90
WAU/MAU
active days / month
voluntary return without notification
```

## Current kill candidate

```text
D30 lift < 1.25x
```

가 여러 cohort에서 지속되면 Character Runtime 투자 규모를 재검토.

이 threshold는 실험 가설이며 authority가 아니다.

## Strong signal

```text
D30/D90 retention가 report-only 대비 materially higher
AND
incremental AI cost보다 incremental contribution/LTV가 큼
```

단순 사용시간 증가만으로 PASS하지 않는다.

---

# 5. EXP-R03 — Free/Paid Cannibalization

**Priority: P1**

## Question

> 무료 캐릭터에게 물어보면 유료 Reading을 살 이유가 없어지는가?

## Principle

무료 모델을 의도적으로 멍청하게 만들지 않는다.

비교해야 하는 value boundary:

```text
Free chat
→ conversation / reflection / already-grounded light explanation

Paid artifact
→ new governed analysis
→ multi-axis comparison
→ period/timing analysis where supported
→ structured/savable result
```

## Measures

구매자 survey/product behavior candidate:

```text
paid artifact completion
follow-up usage
repeat purchase
refund
"free chat was sufficient" response rate
paid artifact share/save rate
```

## Kill / redesign

```text
paid users consistently report no meaningful incremental value
OR
high refund + low completion/repeat
```

이면 `더 긴 답변` 상품을 폐기하고 artifact 자체를 재설계.

---

# 6. EXP-R04 — Membership Bundle

**Priority: P2**

## Question

> 기본 관계가 무료일 때도 월 구독에 충분한 반복 가치가 있는가?

## Compare

### Variant A — Chat-centric

```text
more / unlimited premium chat
```

### Variant B — Value bundle

```text
continuity/memory benefit
+ monthly paid reading/value included
+ premium allowance
+ proactive interaction
+ content benefit
```

Current expectation:

> B가 명하 identity와 cost architecture에 더 잘 맞을 가능성이 높다.

## Metrics

```text
membership start
first renewal
month-2 / month-3 retention
benefit utilization
included reading utilization
premium allowance utilization
incremental chat cost
cancellation reason
```

## Warning candidate

```text
monthly churn > 25% sustained
```

또는 구독자의 핵심 benefit utilization이 매우 낮으면 bundle 재설계.

---

# 7. EXP-R05 — Compatibility / Gift Viral Loop

**Priority: P2**

## Question

> 하나의 결제가 다른 사람의 유입을 만드는가?

## Funnel

```text
compatibility purchased
→ share artifact created
→ share opened
→ visitor enters MyeongHa
→ own birth record completed
→ first reading delivered
→ payer / return user
```

## Measure

```text
share rate / purchase
unique opens / share
new sessions / share
birth completion / referred visit
new member / share
payer / share
viral coefficient
referred CAC equivalent
```

Privacy invariant:

- target-person PII를 analytics에 복제하지 않는다.
- share artifact는 existing revocable/opaque authority를 따른다.

## Strong signal

Revenue만 보는 것이 아니라:

```text
product contribution
+
CAC saved from referred users
```

를 같이 본다.

---

# 8. EXP-R06 — Model Routing / Quality-Cost Frontier

**Priority: P2**

## Question

> 어느 모델 class까지 내려가도 캐릭터가 살아있는가?

## Routing classes

```text
CHEAP
MEDIUM
PREMIUM
```

provider/model 이름은 실험마다 바꿀 수 있다.

## Representative test sets

- ordinary small talk
- emotional support but non-high-risk
- memory reference
- return visit
- conflict/reconciliation behavior
- Saju protected-segment framing
- long-context question
- multi-character scene

## Measure

```text
human preference / blind evaluation
persona consistency
memory factuality
latency
cost / committed turn
fallback rate
policy violation rate
```

## Goal

ordinary chat에서 premium class가 필수인지 확인.

Working target candidate:

```text
Cheap 90~95%
Medium 4~8%
Premium automatic ordinary-chat use 1~2%
```

이 비율은 authority가 아니라 cost hypothesis.

---

# 9. EXP-R07 — Ads as Subsidy

**Priority: P3**

## Question

> 광고가 관계 몰입을 훼손하지 않고 free-user cost를 보조할 수 있는가?

## Test surface candidate

허용 후보:

```text
discovery
free daily content
non-sensitive feed/result exploration
optional rewarded action
```

avoid candidate:

```text
private emotional chat midpoint
sensitive consultation midpoint
paid content
```

## Measure

```text
ad revenue / free MAU
retention delta
session exit delta
chat return delta
brand/trust feedback
```

PASS는 eCPM이 높다는 것만이 아니다.

```text
ad subsidy > incremental retention/LTV damage
```

이어야 한다.

---

# 10. CAC / Distribution Experiments

초기 acquisition channel candidate:

```text
Saju SEO
New Year seasonal search
SNS viral cards
Character short-form content
Compatibility sharing
Friend/couple invitation
Gift product
Influencer
Paid social
App Store discovery
Web content
```

각 channel에서:

```text
CAC
D30 cohort retention
payer conversion
contribution LTV
payback
```

을 따로 본다.

싸게 데려온 low-retention user와 비싸게 데려온 high-LTV user를 동일 CAC 평균으로 섞지 않는다.

---

# 11. Initial CAC Guardrails

초기 decision rule candidate:

```text
Contribution LTV : CAC >= 3 : 1
```

그리고:

```text
CAC payback <= 6 months
```

을 healthy candidate로 둔다.

하지만 early organic cohorts에서는 CAC가 거의 0처럼 보여도 founder/content labor cost를 무시하지 않는다.

---

# 12. Revenue Kill Matrix

한 지표만 보고 BM을 kill하지 않는다.

## Strong redesign combination A

```text
payer conversion < 3%
AND
effective chat cost > ₩5
```

→ Free Relationship economics 재설계.

## Strong redesign combination B

```text
Character D30 lift < 1.25x
AND
incremental AI/content cost material
```

→ Character investment/relationship depth 재평가.

## Strong redesign combination C

```text
paid artifact repeat < 20% at 90d
AND
membership demand weak
```

→ transaction catalog / long-term value thesis 재평가.

## Strong redesign combination D

```text
LTV:CAC < 3
AND
payback > 6 months
```

→ paid acquisition scale 중지.

이 수치들은 V0.1 working thresholds이며 실제 cohort variance에 따라 수정.

---

# 13. First Launch Dashboard — 최소 질문

초기 dashboard는 화려한 metric보다 다음 질문에 답해야 한다.

```text
1. 이번 달 active user 한 명이 평균/상위 percentile에서 얼마를 태웠나?
2. 무료 사용자 중 몇 %가 돈을 냈나?
3. payer 한 명에서 실제 contribution이 얼마 남았나?
4. 캐릭터/기억 사용자가 30일 뒤 더 많이 돌아왔나?
5. 어떤 상품을 두 번째로 샀나?
6. 궁합/공유가 신규 사용자를 데려왔나?
7. acquisition channel별 payback이 얼마인가?
```

이 7개에 답할 수 없으면 MAU/GMV dashboard만으로 Revenue Architecture를 판단하지 않는다.

---

# 14. Experiment Order

```text
Stage 0
AI Cost Ledger
→ mock/payment willingness tests
→ basic paid artifact

Stage 1
Paid Value Conversion
+ Character Retention Lift
+ Cannibalization
+ routing cost

Stage 2
Membership
+ Compatibility viral loop
+ pricing optimization

Stage 3
Ads / authored episode / IP monetization

Stage 4
self-host / B2B / marketplace options
```

---

# 15. Final Experiment Principle

> 매출이 올랐다는 것만으로 실험 성공이 아니다.

성공은:

```text
Revenue lift
- incremental AI/infra/content/payment cost
- retention damage
- acquisition damage
=
positive incremental contribution / LTV
```

로 판단한다.
