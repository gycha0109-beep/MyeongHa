# 명하 Unit Economics Model v0.1

> Product: **명하 / MyeongHa**  
> Status: **Parameterized business model — NOT quota / pricing authority**  
> Model date: **2026-08-30 KST**

---

## 0. 목적

이 문서는 다음 질문에 숫자로 답하기 위한 계산 모델이다.

> 사용자가 늘어날수록 명하는 돈을 버는가, 아니면 AI 비용 때문에 적자가 커지는가?

이 문서의 숫자는 출시 예측이 아니다.

```text
시장 근거 + 현재 제품 구조
→ stress-test용 가정
→ 실제 telemetry로 교체
```

실제 무료/유료 quota는 `COST_QUOTA_ABUSE_SPEC.md`가 최종 실행 경계이며, 실제 commerce rail은 `COMMERCE_ENTITLEMENT_SPEC.md`를 따른다.

---

# 1. Core Formula

월 MAU = `N`

```text
Gross Billings / MAU
= membership_attach × membership_price
+ fortune_attach × fortune_AOV
+ premium_compute_attach × premium_compute_AOV

Net Revenue
= Gross Billings × revenue_realization_rate

AI Variable Cost / MAU
= free_share × free_turns × effective_chat_cost
+ payer_share × payer_turns × effective_chat_cost
+ premium_compute_attach × premium_compute_AI_cost
+ fortune_attach × fortune_AI_cost

Contribution / MAU
= Net Revenue / MAU
- AI Variable Cost / MAU
- Other Variable Cost / MAU
```

`revenue_realization_rate`는 모델 편의를 위한 묶음 변수다.

포함 후보:

- 소비자 가격에 포함된 VAT 영향
- Web PG / Apple / Google commission
- refund / chargeback
- channel mix

실제 모델에서는 이 항목을 분리해야 한다.

---

# 2. 왜 평균이 아니라 분포가 필요한가

AI companion은 heavy-tail usage가 핵심 위험이다.

반드시 실측:

```text
turns / active user / month
P50
P75
P90
P95
P99
MAX / abuse-separated
```

그리고:

```text
AI cost / user
AI cost / payer
AI cost / free user
```

도 같은 percentile로 본다.

평균 100 turns/user라고 해도 P99가 5,000 turns라면 unlimited economics는 전혀 다르다.

---

# 3. Scenario Assumptions v0.1

## 3.1 Bear

| 변수 | 값 |
|---|---:|
| Unique payer share | 2.2% |
| Membership attach / MAU | 0.6% |
| Fortune transaction attach / MAU | 1.6% |
| Premium compute attach / MAU | 0.3% |
| Membership price | ₩9,900 |
| Fortune AOV | ₩5,900 |
| Premium compute AOV | ₩4,900 |
| Revenue realization | 75% |
| Free user turns/month | 110 |
| Payer turns/month | 850 |
| Effective chat cost/turn | **₩6.0** |
| Premium compute AI cost/purchase | ₩600 |
| Fortune AI cost/purchase | ₩80 |
| Other variable cost / MAU | ₩40 |

해석:

> 낮은 monetization + 많은 payer usage + 비싼 chat routing.

---

## 3.2 Base

| 변수 | 값 |
|---|---:|
| Unique payer share | **5.0%** |
| Membership attach / MAU | 2.0% |
| Fortune transaction attach / MAU | 3.5% |
| Premium compute attach / MAU | 0.8% |
| Membership price | ₩12,900 |
| Fortune AOV | ₩7,900 |
| Premium compute AOV | ₩6,900 |
| Revenue realization | 79% |
| Free user turns/month | 70 |
| Payer turns/month | 450 |
| Effective chat cost/turn | **₩2.5** |
| Premium compute AI cost/purchase | ₩500 |
| Fortune AI cost/purchase | ₩60 |
| Other variable cost / MAU | ₩40 |

해석:

> 기본 관계 대화는 cheap routing, 중요한 기능에서만 paid value/compute가 발생하는 경우.

---

## 3.3 Bull

| 변수 | 값 |
|---|---:|
| Unique payer share | 9.0% |
| Membership attach / MAU | 4.0% |
| Fortune transaction attach / MAU | 6.5% |
| Premium compute attach / MAU | 1.8% |
| Membership price | ₩14,900 |
| Fortune AOV | ₩9,900 |
| Premium compute AOV | ₩9,900 |
| Revenue realization | 83% |
| Free user turns/month | 80 |
| Payer turns/month | 500 |
| Effective chat cost/turn | **₩1.2** |
| Premium compute AI cost/purchase | ₩400 |
| Fortune AI cost/purchase | ₩50 |
| Other variable cost / MAU | ₩40 |

해석:

> 강한 monetization + 매우 효율적인 cheap routing/caching.

---

# 4. Scenario Output

단위: **백만원 / 월**

## 4.1 Bear

| MAU | Gross Billings | Net Revenue | AI Variable Cost | Other Variable | Contribution |
|---:|---:|---:|---:|---:|---:|
| 1K | 0.169 | 0.126 | 0.761 | 0.040 | **-0.674** |
| 10K | 1.685 | 1.264 | 7.608 | 0.400 | **-6.744** |
| 100K | 16.850 | 12.637 | 76.076 | 4.000 | **-67.439** |
| 1M | 168.500 | 126.375 | 760.760 | 40.000 | **-674.385** |

판정:

> **Scale-negative. 사용자가 늘수록 적자가 거의 선형으로 커진다.**

이 상태에서 growth를 사면 안 된다.

---

## 4.2 Base

| MAU | Gross Billings | Net Revenue | AI Variable Cost | Other Variable | Contribution |
|---:|---:|---:|---:|---:|---:|
| 1K | 0.590 | 0.466 | 0.229 | 0.040 | **0.197** |
| 10K | 5.897 | 4.659 | 2.286 | 0.400 | **1.973** |
| 100K | 58.970 | 46.586 | 22.860 | 4.000 | **19.726** |
| 1M | 589.700 | 465.863 | 228.600 | 40.000 | **197.263** |

Contribution / MAU:

> 약 **₩197 / month**

Contribution margin on net revenue:

> 약 **42.3%**

주의:

- fixed payroll/marketing/legal/content OPEX 제외.
- 100K MAU라고 해도 월 contribution 약 1,973만원이므로 큰 팀 경제성은 아직 약하다.

---

## 4.3 Bull

| MAU | Gross Billings | Net Revenue | AI Variable Cost | Other Variable | Contribution |
|---:|---:|---:|---:|---:|---:|
| 1K | 1.418 | 1.177 | 0.152 | 0.040 | **0.985** |
| 10K | 14.177 | 11.767 | 1.518 | 0.400 | **9.849** |
| 100K | 141.770 | 117.669 | 15.181 | 4.000 | **98.488** |
| 1M | 1,417.700 | 1,176.691 | 151.810 | 40.000 | **984.881** |

판정:

> AI COGS가 충분히 낮고 conversion이 강하면 digital-content 수준의 economics도 가능.

단 이 시나리오는 검증 전 기대값이 아니다.

---

# 5. Break-even Boundaries

현재 scenario 구조를 그대로 유지하고 monetization mix가 payer share에 비례한다고 가정한 sensitivity다.

| Scenario | Break-even payer share | Break-even chat cost / turn |
|---|---:|---:|
| Bear | 약 **60.1%** | 약 **₩0.66** |
| Base | 약 **2.61%** | 약 **₩4.72** |
| Bull | 약 **1.09%** | 약 **₩9.56** |

중요:

> 이 값은 목표 KPI가 아니라 **현재 가정하의 경계값**이다.

Base에서 `₩4.72/turn`이 나왔다고 production hard limit을 4.72원으로 만들지 않는다.

실제 목표는 margin buffer가 필요하므로 더 낮아야 한다.

Working engineering target candidate:

```text
healthy effective chat cost
≈ ₩2~3 / completed character turn 이하
```

하지만 이것도 실제 품질/usage/price telemetry 후 재결정한다.

---

# 6. Effective Chat Cost 정의

단순 model token price가 아니다.

```text
effective_chat_cost
=
planner
+ context assembly related AI calls
+ renderer
+ retries
+ memory summarization amortization
+ safety/moderation paid calls if any
+ provider failure waste
```

무료 관계 전략의 경제성을 판단할 때 반드시 **completed committed turn 기준**으로 계산한다.

실패/재시도 비용도 분자에 포함한다.

---

# 7. AI Cost Ledger — 필수 telemetry

각 AI execution에 최소 다음 cost dimensions가 필요하다.

```text
provider
model / model class
execution purpose
input tokens
cached input tokens
output tokens
reasoning tokens if billed separately
provider charge or normalized estimated charge
retry lineage
chat turn ref / reading execution ref
success / failure class
```

사용자-facing analytics stream에 raw chat text를 복제하지 않는다.

기존 `ANALYTICS_EXPERIMENT_SPEC.md` privacy boundary를 유지한다.

Revenue analysis는 pseudonymous aggregation 또는 server-side cost ledger를 소비한다.

---

# 8. Free-user Cost Guard

무료 사용자의 경제적 질문은:

> `무료 몇 메시지?`가 아니라 `무료 사용자 1명의 월 예상 variable cost가 얼마인가?`

이다.

Base 가정의 chat-only free cost:

```text
70 turns × ₩2.5 ≈ ₩175/month
```

여기에 infra/기타 비용이 붙는다.

따라서 기본 relationship chat이 무료여도 user acquisition/retention value가 월 수백 원 이상이면 loss-leader로 성립할 수 있다.

반대로 chat cost가 ₩10/turn이면 같은 usage가 ₩700/month이 되어 economics가 크게 악화된다.

---

# 9. Payer Cost Guard

payer가 많이 쓰는 것은 좋은 engagement이면서 동시에 위험이다.

반드시 측정:

```text
payer net revenue
payer AI COGS
payer other variable COGS
payer contribution
```

Working warning threshold candidate:

```text
AI + directly attributable variable COGS
> payer net revenue의 30~35%
```

지속되면 unlimited-like benefit을 재설계한다.

이 역시 production authority가 아니라 revenue experiment threshold다.

---

# 10. Fixed OPEX Break-even Example

Base contribution / MAU 약 ₩197을 단순 적용하면:

| Monthly fixed OPEX | Approx MAU needed |
|---:|---:|
| ₩10M | 약 51K |
| ₩50M | 약 254K |
| ₩100M | 약 508K |

이 계산은 paid CAC 및 growth spend를 fixed OPEX에 어떻게 배분하느냐에 따라 달라진다.

즉 `100K MAU = 성공`으로 판단하지 않는다.

---

# 11. 아직 빠진 변수

v0.2에서 반드시 추가:

- Web / Apple / Google 실제 sales mix
- VAT 처리 방식
- actual refund/chargeback
- paid acquisition CAC
- organic acquisition cost allocation
- support / moderation cost
- content production amortization
- push/notification cost
- storage / egress / vector-search cost
- voice/image actual attach and COGS
- annual plan deferred revenue / retention
- subscription involuntary churn
- seasonal Saju revenue concentration

---

# 12. 현재 Unit Economics 판정

Revenue Architecture에서 가장 위험한 조합:

```text
low payer conversion
+ high free usage
+ payer heavy usage
+ premium model leakage into ordinary chat
```

가장 유리한 조합:

```text
cheap relationship turns
+ high-value transaction
+ optional membership
+ expensive compute separately metered
+ organic/share acquisition
```

따라서 현재 우선순위는 **가격 최적화보다 effective cost/turn과 payer conversion 동시 검증**이다.
