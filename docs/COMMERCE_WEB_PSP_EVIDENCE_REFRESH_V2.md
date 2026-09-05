# 명하 Commerce Web PSP Evidence Refresh v2

> Product: **명하 (MyeongHa)**  
> Date: **2026-09-05**  
> Repository baseline: `d78959054521e984fb4397106b4ef115274557c3`  
> Parent evaluation: `docs/COMMERCE_WEB_PSP_EVALUATION_V1.md`  
> Supersedes current-evidence claims in: `docs/COMMERCE_WEB_PSP_EVIDENCE_REFRESH_V1.md`  
> Merchant intake: `docs/COMMERCE_MERCHANT_FACT_INTAKE_V1.md`  
> Status: **P0-CM-02 CURRENT-EVIDENCE REFRESH / MERCHANT REGISTRATION BLOCKED / NO PROVIDER SELECTED / IMPLEMENTATION HOLD**

---

## 1. Purpose and authority boundary

이 문서는 2026-09-05 현재 다시 확인한 공식 provider 문서와 실제 operator-provided merchant facts를 결합해 `P0-CM-02`의 현재 상태를 재판정한다.

이 문서는 다음을 승인하지 않는다.

```text
provider selection
provider SDK
webhook route
production credential
production schema mutation
production evidence persistence
paid Product activation
money → rights apply runtime
```

Current decision:

```text
P0-CM-02 exact Web PSP = OPEN-P0
selection winner       = NONE
blocking class         = MERCHANT REGISTRATION + REVIEW/CONTRACT GATES
```

Provider operational facts가 v1 refresh와 충돌하면 이 v2의 2026-09-05 재검증 결과를 사용한다. Architecture/domain semantics는 계속 `COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`가 우선한다.

---

## 2. Operator facts now fixed

Operator-provided non-secret launch facts:

```text
M1 merchant legal form           = not_registered
M2 merchant registration country = not_applicable
M3 settlement account country    = not_established
M4 launch buyer geography        = korea_first
M5 presentment currency          = KRW
M6 required payment methods      = domestic_card + easy_pay(kakaopay, naverpay, payco)
```

No registration number, account number, credential or private contract material is recorded.

---

## 3. Immediate consequence of M1-M3

### Toss Payments direct

Current official Toss contracting documentation requires merchant documents aligned to a registered business form:

```text
individual business → business registration certificate
corporation          → business registration certificate + corporate documents
```

The same current guide requires document/homepage/card-company review before production use.

Therefore under the actual current fact:

```text
M1 = not_registered
```

Toss production merchant eligibility is **not satisfied**. Test integration capability does not change this production-contract result.

### NHN KCP direct

Current official KCP signup guidance requires the contracting shop representative to match the representative stated on the business registration certificate. KCP's application/status surfaces are also keyed to business-registration-aligned merchant data.

Therefore under:

```text
M1 = not_registered
```

KCP production merchant eligibility is also **not satisfied**.

### Decision consequence

```text
merchant registration not complete
→ neither Toss nor KCP can be admitted as production PSP for MyeongHa now
→ P0-CM-02 remains OPEN
→ provider-specific production implementation remains HOLD
```

This is a production-selection block, not a ban on local/test-only technical experiments.

---

## 4. M4-M6 capability fit

### M4 — korea_first

The launch buyer scope is now explicitly Korea-first. This does not authorize an international PSP requirement for launch and does not silently change future international expansion scope.

### M5 — KRW

Launch presentment currency is fixed to KRW.

Current official capability evidence is sufficient for the current domestic rail:

```text
Toss → KRW MID supports domestic-card payment
KCP  → standard payment defines KRW as 410 (mobile) / WON (PC)
```

This proves KRW capability, not commercial acceptance for MyeongHa.

### M6 — domestic card + KakaoPay / NaverPay / PAYCO

#### Toss Payments

Current official Toss payment-product and payment-method documentation proves support for:

```text
domestic card
easy pay
- KakaoPay
- NaverPay
- PAYCO
```

Current Toss FAQ also exposes card, NaverPay, KakaoPay and PAYCO in pre-contract test coverage. Production activation remains subject to contract/admin configuration and applicable review.

Verdict:

```text
M6 technical capability fit = PROVEN
M6 commercial availability for MyeongHa = NOT YET CONTRACTED
```

#### NHN KCP

Current KCP official material proves:

```text
credit card support
PAYCO easy payment
partner easy-payment support for KakaoPay and NaverPay
```

KCP explicitly states that partner easy-payment services may require additional service application/contract by payment service.

Verdict:

```text
M6 technical capability fit = PROVEN
M6 exact commercial activation = REQUIRES CONTRACT / ADDITIONAL SERVICE APPROVAL
```

Therefore M6 no longer differentiates Toss from KCP at the architecture-selection level.

---

## 5. Toss Member-only conflict is re-proven

Evidence refresh v1 stated that the current Toss search did not reproduce a mandatory non-member-purchase review rule.

That current-state claim is superseded.

The current official Toss `payment-products` contracting guide now explicitly states in its homepage-review requirements that the merchant site must allow non-member purchase.

MyeongHa Commerce v1 invariant remains:

```text
Guest purchase = DENY
Purchase Intent = active Member only
```

Therefore the current public onboarding evidence produces this state:

```text
Toss homepage review requires non-member purchase = CURRENT OFFICIAL PUBLIC GUIDANCE
MyeongHa allows non-member purchase               = NO
current public onboarding compatibility           = CONFLICT
```

Safe interpretation:

```text
Toss M9 = CONFLICT UNDER CURRENT PUBLIC GUIDANCE
```

This conflict can only be removed by one of the already-authorized paths:

```text
A. Toss explicitly confirms a merchant-specific exception compatible with Member-only purchase
OR
B. MyeongHa product/Commerce authority explicitly reopens and changes the Member-only policy
```

B is not authorized by this evidence refresh.

---

## 6. NHN KCP Member-only status remains unresolved

Current KCP signup/technical material reviewed here does not prove a requirement equivalent to Toss's current non-member-purchase review rule.

It also does not prove that KCP contract/review will accept MyeongHa's Member-only checkout policy.

Therefore:

```text
KCP M9 = NOT PROVEN
```

Absence of a public conflict statement is not provider confirmation.

---

## 7. M7-M9 current state

### M7 Website / merchant review readiness

```text
M7 = NOT READY
```

Reasons:

```text
merchant registration = not_registered
launch paid Product/Capability = P0-CM-03 OPEN
truthful merchant identity disclosure surface = not complete
refund/cancellation customer policy = not closed
payment terms/customer notice surface = not complete
Toss-specific non-member review rule conflicts with current Member-only invariant
```

No fabricated product or merchant identity may be added only to pass provider review.

### M8 Commercial acceptance

```text
M8 = BLOCKED / NOT YET EVALUABLE TO ACCEPTANCE
```

Reason:

```text
merchant is not yet contract-eligible
fees/settlement cycle/provider category review have not been accepted by the actual merchant
M3 settlement account = not_established
```

Public pricing or signup UI is not equivalent to accepted commercial terms.

### M9 Member-only compatibility

```text
Toss = CONFLICT UNDER CURRENT PUBLIC HOMEPAGE-REVIEW GUIDANCE
KCP  = NOT PROVEN
```

---

## 8. Current candidate matrix

| Requirement | Toss direct | KCP direct |
|---|---|---|
| Korea-first launch fit | yes | yes |
| KRW launch fit | proven for current domestic rail | proven for current domestic rail |
| domestic card | proven | proven |
| KakaoPay | proven | proven; additional service/contract may apply |
| NaverPay | proven | proven; additional service/contract may apply |
| PAYCO | proven | proven |
| server authoritative approval/lookup | proven in prior authority | proven in prior authority |
| documented webhook retry | proven | proven |
| provider mutation idempotency | stronger current evidence | not sufficiently proven |
| current merchant production eligibility with `not_registered` | **not satisfied** | **not satisfied** |
| Member-only onboarding compatibility | **current public conflict** | **not proven** |
| M8 commercial acceptance | blocked | blocked |
| selectable as production PSP now | **NO** | **NO** |

No winner is selected.

---

## 9. P0-CM-02 state machine from here

Current:

```text
P0-CM-02
→ OPEN / MERCHANT REGISTRATION BLOCKED
```

Minimum next external facts after merchant registration:

```text
1. merchant legal form changes from not_registered to actual registered form
2. registration country becomes actual country code
3. settlement account country is established for the provider contract
4. truthful website review surface becomes ready
5. commercial terms are reviewed and accepted
6. Member-only compatibility is confirmed
   - Toss: exception required unless public review rule changes or policy is reopened
   - KCP: provider/contract confirmation required
```

Only after those gates may a final provider-selection decision be recorded.

---

## 10. Implementation consequence

Remain HOLD:

```text
Toss production SDK/runtime binding
KCP production SDK/runtime binding
provider-specific canonical evidence serializer
provider-specific verifier/comparator
webhook route
production provider credentials
production receipt/event persistence
provider ordering implementation
money → rights apply runtime
```

Provider-neutral contracts already implemented remain valid and do not imply payment readiness.

P0-CM-03 and P0-PR-01 remain independently open.

---

## 11. Official sources revalidated on 2026-09-05

### Toss Payments

- Payment products / contract and homepage-review requirements: `https://docs.tosspayments.com/guides/v2/get-started/payment-products`
- Payment-method policy: `https://docs.tosspayments.com/guides/v2/get-started/payment-methods`
- Payment product FAQ / payment-method test coverage: `https://docs.tosspayments.com/resources/faq`
- Payment/easy-pay enum codes: `https://docs.tosspayments.com/codes/enum-codes`
- KRW MID / domestic-card currency rail: `https://docs.tosspayments.com/guides/v2/learn/foreign-payment`

### NHN KCP

- Merchant signup/application guidance: `https://developer.kcp.co.kr/support/signup`
- Standard payment / KRW currency codes: `https://developer.kcp.co.kr/guide/payment`
- Partner easy-payment capability: `https://developer.kcp.co.kr/guide/directpay`
- Easy-payment codes: `https://developer.kcp.co.kr/code/etc`

Provider operational evidence must be revalidated again immediately before production contracting or implementation.
