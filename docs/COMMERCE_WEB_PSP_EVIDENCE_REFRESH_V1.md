# 명하 Commerce Web PSP Evidence Refresh v1

> Product: **명하 (MyeongHa)**  
> Date: **2026-09-05**  
> Repository baseline: `2bfbbb193cdc99e03ad39f4eda71a6edc9cd9043`  
> Parent evaluation: `docs/COMMERCE_WEB_PSP_EVALUATION_V1.md`  
> Parent decision: `docs/COMMERCE_LAUNCH_RAIL_DECISION_V1.md`  
> Status: **P0-CM-02 CURRENT-EVIDENCE REFRESH / NO PROVIDER SELECTED / IMPLEMENTATION HOLD**

---

## 1. Purpose and authority boundary

이 문서는 `COMMERCE_WEB_PSP_EVALUATION_V1.md` 이후 동일한 2026-09-05 기준으로 다시 확인한 **공식 provider 문서의 current-state operational evidence**를 기록한다.

이 문서는 Commerce domain authority가 아니며 다음을 승인하지 않는다.

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

Current decision remains:

```text
P0-CM-02 exact Web PSP = OPEN-P0
selection winner       = NONE
```

이 refresh와 parent evaluation의 **current factual claim**이 충돌하면 이 문서의 재검증 결과를 사용한다. Architecture/domain semantics는 계속 `COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`가 우선한다.

---

## 2. Findings summary

| Candidate | Refreshed evidence | Decision impact |
|---|---|---|
| Toss Payments direct | current official docs prove member and anonymous client modes, contract/homepage review, server approval, webhook retry and transmission identity; current search did **not** reproduce a mandatory non-member-purchase review rule | prior `ONBOARDING CONFLICT` wording is too strong; classify M9 as **NOT PROVEN**, not a proven conflict |
| NHN KCP direct | current official docs prove registered webhook URL, transaction identity fields, `0000` acknowledgement and retry up to 10 times; signup flow exposes payment-method selection plus fee/settlement-cycle information | closes the previously open webhook **redelivery/retry** evidence gap; authenticity/stable event identity/idempotency/member-only onboarding remain open |
| PortOne V2 | not materially re-evaluated in this refresh | prior conditional/orchestrator-provenance verdict unchanged |
| Stripe | not required for this narrow refresh; prior merchant-entity condition remains | no winner impact |

This narrows uncertainty but does not provide missing MyeongHa merchant facts M1-M9.

---

## 3. Toss Payments — current-state correction

### 3.1 What current official docs prove

Current Toss Payments documentation describes:

```text
member purchase
→ merchant-generated customerKey

anonymous purchase support
→ TossPayments.ANONYMOUS / equivalent anonymous customer mode
```

This proves that Toss's payment integration itself can represent both member and anonymous buyers. It does **not** prove that MyeongHa must enable anonymous purchase.

Current contract/onboarding documentation also proves a review sequence including:

```text
electronic-payment application
→ business/corporate documents
→ Toss document + homepage review
→ card-company review
→ production use after applicable review
```

Current official deployment/FAQ material likewise describes card-company review against the actual selling site/app and product/payment-window state.

### 3.2 Previous `mandatory non-member purchase` claim is not re-proven

The parent evaluation currently states that Toss's **current** homepage-review guidance requires non-member purchase and therefore creates a direct conflict with MyeongHa Member-only Purchase Intent.

The 2026-09-05 refresh performed exact-term searches against current Toss official developer/product material for:

```text
비회원 구매
비회원 결제
홈페이지 심사
계약 심사
```

Current official material was found for:

- member `customerKey`
- anonymous buyer mode
- document/homepage/card-company review
- at least one sellable product / homepage business-information guidance in older official onboarding notice

but this refresh did **not** reproduce a current official rule saying that **non-member purchase must be enabled as a merchant-review condition**.

Therefore the safe classification is:

```text
Toss supports anonymous purchase technically       = PROVEN
Toss requires MyeongHa to permit anonymous purchase = NOT PROVEN
Toss accepts Member-only MyeongHa checkout          = NOT PROVEN
```

Absence from current search is not proof that no contractual/channel-specific rule exists. The correct P0 treatment is to seek provider/contract confirmation for M9 rather than preserving a claimed conflict without reproducible current evidence.

### 3.3 Revised Toss verdict

Superseding only the current-state onboarding-conflict wording in the parent evaluation:

```text
Toss runtime/technical fit          = STRONG
Toss homepage/merchant review       = REQUIRED / PROVEN
Toss Member-only compatibility      = NOT PROVEN
Toss mandatory anonymous-purchase rule = NOT RE-PROVEN IN CURRENT OFFICIAL MATERIAL
Toss production eligibility         = NOT PROVEN
P0-CM-02                             = OPEN
```

This is **not** a Toss selection. M1-M9 still require actual merchant/provider evidence.

---

## 4. Toss Payments — webhook evidence remains strong

Current official Toss webhook documentation proves:

- payment-state webhook event types such as `PAYMENT_STATUS_CHANGED`;
- webhook transmission headers include transmission time, retry count and a unique transmission ID;
- general payment webhook signature is not the same broad signature model as payout/seller events; the documented signature header is limited to specified event families;
- failed webhook delivery is retried up to 7 times on the documented schedule when a timely success response is not received.

Commerce consequence remains:

```text
webhook transport evidence
!= entitlement authority

webhook / callback
→ server-side authoritative payment verification or lookup as required
→ normalize VerifiedCommerceEvidenceV1
→ short domain apply transaction
```

No change to Architecture is required.

---

## 5. NHN KCP — webhook redelivery gap closed

### 5.1 Webhook registration and retry

Current NHN KCP official webhook guide states:

```text
merchant registers webhook URL in partner admin
payment-state change triggers webhook
merchant successful handling → return '0000'
initial delivery fails / no '0000' → KCP retries up to 10 times
```

The API reference exposes common fields including:

```text
site_cd
transaction number (tno)
merchant order number (order_no)
transaction/work code (tx_cd)
processing time (tx_tm)
```

`tno` is documented as the KCP transaction unique number and should be used in full.

Therefore the previous unresolved item:

```text
webhook redelivery/retry contract
```

can be changed to:

```text
KCP webhook redelivery/retry contract = PROVEN AT DOCUMENTED TRANSPORT LEVEL
```

Duplicate delivery must be treated as normal and domain dedupe remains required.

### 5.2 What is still not proven

The current KCP webhook reference reviewed here does not establish enough evidence to close all provider-event authority questions.

Still open before provider selection/runtime:

```text
notification authenticity contract
stable provider event identity distinct from transaction identity, if any
exact duplicate approval behavior
exact duplicate cancel behavior
provider-side mutation idempotency semantics or required merchant compensation
Member-only merchant onboarding compatibility
selected payment-method commercial acceptance
```

KCP has service certificates and SHA256withRSA signed request material for applicable merchant→KCP APIs. That must **not** be silently generalized into proof that inbound webhook messages themselves carry an equivalent cryptographic signature contract.

### 5.3 Reconciliation posture

The existence of transaction identity plus previously reviewed transaction-query/recovery APIs remains compatible with MyeongHa's provider-neutral model:

```text
webhook duplicate/delay/loss
or provider success + local DB failure
→ authoritative provider query/re-verification
→ same normalized evidence contract
→ idempotent domain apply
```

No webhook should directly grant rights.

---

## 6. NHN KCP — merchant application facts improve M6/M8 evidence quality

Current KCP signup documentation proves that merchant application asks the merchant to select required payment services, including examples such as:

```text
credit card
account transfer
virtual account
mobile payment
easy payment (PAYCO default)
gift certificate
ARS
```

It also states that fee and settlement-cycle information for selected methods is shown in the application service-information surface, with additional negotiation/request notes available.

The application also requires business-registration-aligned merchant/representative information and an actual shop URL.

Decision impact:

```text
KCP supports a selectable payment-method set = PROVEN
KCP exposes fee/settlement information during application = PROVEN
MyeongHa required methods (M6) = STILL UNKNOWN
MyeongHa accepted fees/settlement/commercial terms (M8) = STILL UNKNOWN
```

Provider capability must not be confused with merchant choice or contractual acceptance.

---

## 7. Refreshed evidence matrix

| Requirement | Toss direct | KCP direct |
|---|---|---|
| server authoritative approval/lookup | proven in parent evaluation | proven in parent evaluation |
| stable merchant order correlation | proven | proven |
| provider transaction identity | proven | `tno` proven |
| documented webhook retry | **yes, up to 7 retries** | **yes, up to 10 retries** |
| webhook transport identity | transmission ID documented | transaction identity documented; separate stable webhook-event identity not proven |
| broad inbound webhook authenticity proof | general-payment signature model remains limited; authoritative re-query required by MyeongHa posture | **not proven by reviewed webhook reference** |
| provider-side mutation idempotency | Toss POST idempotency documented in parent evaluation | not sufficiently proven |
| Member-only merchant onboarding compatibility | **not proven** | **not proven** |
| merchant payment-method selection | provider capability documented | signup selection documented |
| MyeongHa commercial acceptance | not proven | not proven |
| MyeongHa production eligibility | not proven | not proven |

This table is evidence status, not a provider ranking.

---

## 8. M1-M9 after refresh

```text
M1 merchant legal form
→ UNKNOWN in repository / actual merchant evidence required

M2 merchant registration country
→ UNKNOWN

M3 settlement bank/account country
→ UNKNOWN

M4 launch buyer geography
→ UNKNOWN

M5 presentment currency
→ UNKNOWN

M6 required payment methods
→ UNKNOWN
→ provider menus are known, MyeongHa selection is not

M7 website/merchant review readiness
→ NOT READY / launch paid Product still blocked by P0-CM-03
→ actual merchant identity/refund/customer notice surfaces not complete

M8 commercial acceptance
→ UNKNOWN
→ public/provider application fee information does not equal accepted MyeongHa contract terms

M9 Member-only purchase compatibility
→ Toss: NOT PROVEN, prior mandatory-anonymous conflict not re-proven
→ KCP: NOT PROVEN
```

Therefore:

```text
P0-CM-02 = OPEN-P0
```

---

## 9. Current narrowing after evidence refresh

The technical shortlist remains direct providers:

```text
Toss Payments direct
- strong runtime semantics
- explicit retry/transmission identity
- Member-only onboarding compatibility still needs provider/contract confirmation
- prior hard onboarding-conflict wording is no longer evidence-safe

NHN KCP direct
- viable server approval/reconciliation model
- webhook redelivery/retry now proven
- merchant application payment-method and fee/settlement surfaces now proven
- inbound webhook authenticity, stable event identity, mutation idempotency and Member-only onboarding still require proof
```

No evidence in this refresh justifies selecting one as winner.

Selection rule remains:

```text
Commerce technical correctness proof
AND
actual merchant production eligibility/onboarding proof
AND
actual merchant/business facts M1-M9
```

---

## 10. Implementation consequence

This evidence refresh authorizes **no provider-specific implementation**.

Remain HOLD:

```text
Toss SDK/runtime
KCP SDK/runtime
provider-specific canonical evidence serializer
provider-specific verifier/comparator
webhook route
production credentials
production receipt/event persistence
money → rights apply runtime
```

The next provider-specific code slice is still blocked by `P0-CM-02`.

P0-CM-03 remains independently blocked by Saju production interpretation/public reading authority.

---

## 11. Official sources revalidated on 2026-09-05

### Toss Payments

- Payment products / contracting flow: `https://docs.tosspayments.com/guides/v2/get-started/payment-products`
- Payment widget integration / member and anonymous customer modes: `https://docs.tosspayments.com/guides/payment-widget/integration`
- Webhook guide / retry policy: `https://docs.tosspayments.com/guides/v2/webhook`
- Webhook event/header reference: `https://docs.tosspayments.com/reference/using-api/webhook-events`
- FAQ / card-company review and customerKey guidance: `https://docs.tosspayments.com/resources/faq`
- Older official homepage-review notice used only as historical corroboration for business footer/sellable-product review, not as proof of a current non-member-purchase requirement: `https://www.tosspayments.com/notice/79`

### NHN KCP

- Webhook guide / retry policy: `https://developer.kcp.co.kr/guide/webhook`
- Webhook API reference: `https://developer.kcp.co.kr/reference/webhook`
- Signup/application flow: `https://developer.kcp.co.kr/support/signup`
- Standard payment guide: `https://developer.kcp.co.kr/guide/payment`
- Signature-data reference: `https://developer.kcp.co.kr/reference/signdata`

Provider documentation is external operational evidence and must be revalidated again immediately before production implementation/contracting.
