# 명하 Revenue Architecture — Pass 4 Pricing Decision Delta v0.1

> Product: **명하 / MyeongHa**  
> Status: **Research decision delta — NOT product authority**  
> Snapshot: **2026-08-30 KST**

---

## 1. 무엇이 바뀌었나

Pass 3까지의 leading access hypothesis:

```text
H-R17
Open Relationship Core
+ separately measurable Grounded Analysis execution
+ replenishing analysis-right candidate
```

Pass 4는 H-R17의 **측정 경계**는 유지하지만, **consumer billing unit**으로서의 visible analysis-right 우선순위를 낮춘다.

새 launch-leading formulation:

```text
H-R19 — Explicit Value Artifact Launch

Open / low-friction relationship core
+ free grounded first value
+ explicit paid structured artifacts
+ optional membership
+ premium compute cost guard
```

`Grounded Analysis Right`는 삭제하지 않는다.

상태 변경:

```text
before: leading consumer access primitive
now:    experiment/control primitive
```

---

## 2. 이유

### D-P4-01 — C_read가 생각보다 훨씬 낮을 수 있다

최신 API 가격에서 illustrative 10k-input / 1.5k-output Reading direct cost는 대략:

```text
cheap model        single-digit KRW
mid model          tens of KRW
Sonnet-class       ~₩50 direct
```

MyeongHa architecture는 first production personalized renderer를 deterministic template path로 두므로, paid Reading이 반드시 비싼 reasoning workflow일 이유도 없다.

따라서:

> `Reading = 비싸니까 coin으로 막는다`

는 핵심 논리에서 제외한다.

### D-P4-02 — C_chat가 더 큰 장기 리스크다

Reading 1회보다 반복 chat 수백~수천 turn이 더 큰 monthly variable cost가 될 수 있다.

따라서 원가 방어의 중심은:

```text
model routing
context compression
memory retrieval cap
P95/P99 monitoring
premium-compute entitlement
abuse / rate policy
```

이다.

### D-P4-03 — visible currency는 UX tax다

사주핑 review signal과 Pass 2 friction 분석은 allowance가:

- 질문 억제;
- accidental consumption 불만;
- 가격 해석 난이도

를 만들 수 있음을 보여준다.

원가 필요성이 약하면 이 UX tax를 launch day부터 감수할 이유도 약해진다.

### D-P4-04 — 시장은 explicit artifact 가격도 충분히 지지한다

현재 한국 가격 surface에는:

```text
₩1k~5k      commodity/entry automated fortune
₩5.9k~17k   mainstream digital report/subscription
₩19k~27k    deeper digital reading/report
₩30k~110k   human consultation
```

가 공존한다.

MyeongHa는 따라서 `질문 몇 개 = 몇 코인`만으로 수익화할 필요가 없다.

---

## 3. 현재 launch SKU hypothesis

### Free

```text
first grounded natal value
ordinary relationship chat
basic continuity
light daily value
```

정확한 chat quota는 revenue 문서가 결정하지 않는다.

### Entry paid artifact

```text
₩4,900 candidate
```

목적:

- first-purchase friction test;
- compact deep topic;
- commodity ₩1,900 tier보다 높은 value anchor.

### Core artifact

```text
₩7,900 / ₩9,900 candidate
```

목적:

- Decision Reading;
- deep domain analysis;
- structured saved result.

### High-value artifact

```text
₩12,900 / ₩14,900 candidate
```

목적:

- compatibility;
- annual deep report;
- multi-axis decision;
- future Life Chronicle.

### Membership

```text
₩9,900~12,900 candidate
```

Only if recurring behavior is proven.

Bundle candidate:

- one included meaningful paid value;
- continuity/deeper memory service;
- premium depth allowance;
- convenience/ad-free/discount.

---

## 4. 가격은 아직 결정이 아니다

현재 숫자는 market anchor + unit-economics hypothesis다.

가격 결정 기준:

```text
net contribution per eligible exposure
```

이지:

```text
purchase conversion only
```

가 아니다.

예:

```text
₩7,900 → ₩9,900
```

에서 높은 가격은 purchase conversion이 약 20% 떨어져도 gross revenue/exposure가 비슷할 수 있다.

따라서 price A/B는 반드시 revenue/contribution 기준으로 판정한다.

---

## 5. 무료 Reading 정책도 수정

Pass 2:

```text
free Reading allowance는 C_read 때문에 매우 조심
```

Pass 4:

```text
free Reading depth는 cost보다
retention vs cannibalization 문제
```

로 수정한다.

테스트할 것:

```text
first grounded value only
vs
first grounded value + recurring light micro-analysis
```

무료 full paid-equivalent artifact를 반복 제공하는 것은 아직 권하지 않는다.

---

## 6. Payment channel delta

### Web

Toss general card fee 기준 direct web는 VAT 포함 consumer price 대비 대략 **87% class**의 economic value가 남는 planning model이 가능하다.

### iOS

Small Business Program eligible 상태의 15% commission은 early-stage 기준 중요한 baseline이다.

한국 iOS third-party in-app payment entitlement는 Apple commission 26%가 남기 때문에:

> external PSP = 무조건 싸다

가 아니다.

따라서 초기 제품 channel decision은 BM과 별도로 비교해야 한다.

---

## 7. Hypothesis registry delta

| ID | Hypothesis | Pass 4 status |
|---|---|---|
| H-R17 | Grounded Analysis as measurable boundary | **KEEP** |
| H-R17a | Visible replenishing analysis currency as default launch BM | **DEMOTE → CONTROL** |
| H-R18 | Layered Value Monetization | **KEEP / STRONGER** |
| H-R19 | Explicit Value Artifact Launch | **NEW LEADING LAUNCH HYPOTHESIS** |
| H-R07 | Premium Compute separate | **KEEP, primarily cost guard** |
| H-R05 | Optional relationship membership | **KEEP, only after recurring value proof** |
| H-R10 | Compatibility/Gift loop | **KEEP, strong second-wave candidate** |

---

## 8. Guardrails unchanged

1. no Pay-to-love;
2. no payer-state sales persona;
3. no default visible per-message meter;
4. no semantic validity difference by price tier;
5. no surprise consumption;
6. no sticker-price copying;
7. no unlimited premium compute promise;
8. no commerce incentive contaminating Saju semantics.

New Pass 4 guardrail:

9. **Technical execution boundary != mandatory billing unit.**

---

## 9. Next required evidence

Desk research is now close to saturation.

Next unknowns cannot be solved well by more competitor browsing:

```text
actual C_chat from MyeongHa prompt/runtime
actual C_read from implemented renderer path
first-purchase conversion by price
free micro-analysis retention lift
free micro-analysis cannibalization
30/90-day repeat purchase
membership demand after repeat use
P95/P99 chat COGS
```

---

## 10. Current concise revenue architecture

```text
Retention
= natural character relationship + grounded free trust

First monetization
= explicit useful result, not message tax

Repeat monetization
= more decisions / compatibility / annual & life artifacts

Recurring monetization
= membership only when repeat behavior exists

Cost protection
= cheap routing + context discipline + premium-compute boundary
```

The current business thesis is therefore:

> **돈은 '대화를 계속하는 권리'보다 '의미 있는 결과를 얻는 순간'에서 먼저 받는다.**

This remains a research hypothesis until real MyeongHa behavior and payment data exist.
