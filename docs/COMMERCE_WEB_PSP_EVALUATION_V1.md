# 명하 Commerce Web PSP Evaluation v1

> Product: **명하 (MyeongHa)**  
> Date: **2026-09-05**  
> Repository baseline: `157b12b96238e5f3d382a6c0b7390762e7cb4007`  
> Parent decision: `docs/COMMERCE_LAUNCH_RAIL_DECISION_V1.md`  
> Status: **P0-CM-02 EVIDENCE EVALUATION / NO PROVIDER SELECTED / IMPLEMENTATION HOLD**

---

## 1. Purpose

`P0-CM-01` already fixes launch billing to **Web + one-off**. This document evaluates current Web provider candidates against the provider-neutral Commerce authority without inventing merchant/business facts that are absent from the repository.

This is **not** a provider decision.

```text
P0-CM-02 exact Web PSP = OPEN-P0
```

No SDK, webhook route, production credential, migration, or provider-specific runtime is authorized by this document.

---

## 2. Non-negotiable Commerce fit

A launch provider must support, directly or through a provable equivalent:

```text
server-side payment confirmation / authoritative state lookup
stable provider transaction identity
server-owned order identity correlation
retry-safe/idempotent mutation where applicable
webhook/event redelivery tolerance
refund/cancel state retrieval
post-failure reconciliation query
sandbox/test vs production separation
server-only credential model
no requirement for provider calls inside DB rights transaction
```

Webhook receipt alone is never entitlement authority.

```text
provider notification
→ authenticate/identify notification
→ provider authoritative state re-check when required
→ normalize VerifiedCommerceEvidenceV1
→ short DB apply transaction
```

---

## 3. Candidate summary

| Candidate | Role | Current technical fit | Primary issue before selection |
|---|---|---|---|
| Toss Payments direct | direct PG / PSP | **STRONG CANDIDATE** | merchant contract/onboarding facts and actual launch merchant eligibility remain unverified |
| NHN KCP direct | direct PG / PSP | **VIABLE CANDIDATE** | more certificate/signature-specific integration surface; idempotency/retry semantics need deeper contract proof before selection |
| PortOne V2 | payment orchestration layer over PGs | **CONDITIONAL / NOT DEFAULT V1** | introduces PortOne + underlying PG two-layer provenance not represented by current single-provider authority |
| Stripe | direct global PSP | **CONDITIONAL ON MERCHANT ENTITY** | South Korea is not listed as a supported Stripe business account country as of this review; Korean payment methods are available to qualifying Stripe businesses in supported countries |

No ranking in this table is a business/provider authorization.

---

## 4. Toss Payments direct

### 4.1 Confirm / identity

Official Toss Payments API documentation exposes a server-side confirmation flow:

```text
POST /v1/payments/confirm
paymentKey
orderId
amount
```

`paymentKey` identifies the payment and `orderId` is merchant-generated and expected to be unique. This maps cleanly to MyeongHa Purchase Intent / provider transaction correlation as long as the server resolves and verifies the expected order/amount rather than trusting browser callback values.

### 4.2 Idempotency

Toss documents an `Idempotency-Key` header for POST APIs. The same key returns the first response and the key is valid for 15 days.

This is useful transport-side duplicate protection but does **not** replace MyeongHa's permanent business idempotency and provider-transaction uniqueness.

```text
Toss Idempotency-Key
= provider request retry safety

MyeongHa purchase_intents / receipts / events unique identities
= domain idempotency authority
```

### 4.3 Webhook and ordering posture

For general payment webhooks, Toss documentation states that a general payment webhook does not carry a signature header equivalent to payout/seller HMAC verification. The documented verification pattern is to re-query the Payment API using `paymentKey` and verify authoritative payment state.

This matches Commerce Architecture v1 particularly well:

```text
webhook = wake-up / transport evidence
Payment Query = authoritative provider state
rights apply = only after normalized verified evidence
```

Toss also documents a unique webhook transmission ID and repeated delivery when the merchant endpoint does not return success. Current webhook guidance describes up to seven resend attempts with increasing intervals.

Therefore duplicate and delayed webhook delivery must be treated as normal.

### 4.4 Cancel / reconciliation

Toss exposes payment cancel/refund through the payment API, including full/partial cancellation, and exposes payment/settlement query surfaces. Query capability provides a recovery path for callback loss, webhook loss, and DB-after-provider partial failure.

### 4.5 Environment separation

Official docs distinguish test keys (`test_*`) from live keys (`live_*`). Production rights must continue to reject test/sandbox evidence independently of provider key selection.

### 4.6 Merchant onboarding gate

Toss documents that production electronic-payment contracting includes business documentation and website review. The current MyeongHa repository does not establish the actual merchant applicant, business registration status, contract eligibility, settlement account, or approved payment methods.

Therefore:

```text
Toss technical fit = strong
Toss production eligibility = NOT YET PROVEN
P0-CM-02 = still OPEN
```

---

## 5. NHN KCP direct

### 5.1 Server-side approval / integrity

NHN KCP documents a server-to-server HTTPS payment approval stage after user authentication. Standard payment documentation requires merchant-side order/payment information to be preserved and sent during approval.

KCP also documents payment-information validation using merchant-side expected amount, payment type, and order number.

This fits MyeongHa's rule that client-returned amount/order data cannot be authority.

### 5.2 Transaction query as recovery authority

KCP explicitly documents a transaction-query API for checking payment status and payment information, including when merchant DB processing failed.

That is a strong fit for MyeongHa reconciliation:

```text
provider approval succeeded
+ local DB failed / response lost
→ query KCP authoritative transaction state
→ normalize same evidence
→ retry same domain apply command
```

### 5.3 Credential/signature surface

KCP uses merchant service certificates and signature data for merchant authentication/non-repudiation in relevant APIs. Cancel/query documentation uses signed request material.

This is compatible with Production Operations secret handling but creates more certificate lifecycle/rotation operational surface than a simple API-secret model.

### 5.4 Cancel / webhook

KCP documents full/partial cancellation APIs and production/test endpoints. Developer security documentation also identifies webhook network endpoints/IP information.

However, before selection MyeongHa still needs provider-specific proof for:

```text
notification authenticity contract
redelivery/retry contract
stable event identity, if exposed
exact duplicate approval/cancel retry behavior
idempotency guarantees or required merchant-side compensation
```

The currently reviewed KCP material does not justify assuming Toss-style idempotency semantics.

### 5.5 Current verdict

```text
KCP technical fit = viable
reconciliation query = strong
credential surface = heavier
idempotency/event proof = requires deeper provider contract review
production eligibility = NOT YET PROVEN
```

---

## 6. PortOne V2

### 6.1 What PortOne solves

PortOne V2 provides browser payment integration, server-side payment lookup, payment cancellation, and webhook verification. Its documentation explicitly requires the merchant server to query payment state and verify expected payment data rather than trusting the browser result.

This is compatible with MyeongHa's verification posture.

### 6.2 The provenance problem

PortOne is not merely a direct single PG in the same sense as Toss/KCP. It orchestrates underlying PG providers.

Current Commerce v1 schema has one primary provider axis in structures such as:

```text
product_offers.provider
commerce_receipts.provider
commerce_provider_events.provider
provider + external_transaction_id
provider + external_event_id
```

If PortOne is the integration authority while an underlying PG is the actual payment processor, MyeongHa must decide whether authoritative identity is:

```text
PortOne paymentId
PortOne transaction identity
underlying PG transaction identity
or a governed pair/chain of both
```

Collapsing these into one opaque provider string risks losing support/reconciliation provenance. Treating only the underlying PG as provider while verifying through PortOne hides the verification intermediary.

Therefore current v1 should not select PortOne merely for convenience.

### 6.3 Authorization condition

PortOne becomes a strong candidate if there is an actual requirement for:

```text
multi-PG routing
provider switching/failover
one normalized integration across multiple Korean PGs
or commercial/operations reasons that outweigh two-layer provenance cost
```

If such a requirement appears, Commerce Architecture must first define orchestrator + processor identity/pinning before provider implementation.

Current launch requirement does not establish that need.

### 6.4 Current verdict

```text
PortOne feature fit = strong
current authority-shape fit = conditional
v1 default = NO, unless multi-PG/orchestration requirement is explicitly adopted
```

---

## 7. Stripe

### 7.1 Current business-country constraint

Stripe's current global availability page lists supported countries/regions for businesses that can open Stripe payment accounts. South Korea is not listed in that supported-business-country list as of this review.

Stripe separately advertises South Korean local payment methods and KRW presentment for Stripe businesses located in eligible supported countries.

Therefore these statements are distinct:

```text
"Stripe can accept Korean customer payment methods"
!=
"a South-Korean merchant entity can open a domestic Stripe payment account"
```

### 7.2 Conditional eligibility

If the actual merchant entity is registered in a Stripe-supported country and meets Stripe account requirements, Stripe can remain a candidate.

If the actual merchant is only a South-Korean entity with no eligible supported-country entity, current public Stripe availability does not support selecting Stripe as the launch PSP.

The repository does not contain authoritative merchant-entity facts, so the branch cannot choose between those conditions.

### 7.3 Current verdict

```text
Stripe = conditional candidate only
Korean customer support alone = insufficient selection evidence
merchant entity/country must be proven first
```

---

## 8. Evidence matrix against Commerce failure model

| Requirement | Toss direct | KCP direct | PortOne V2 | Stripe |
|---|---|---|---|---|
| server authoritative lookup | yes | yes | yes | generally yes; not the current blocker |
| server-side confirmation/verification | yes | yes | yes | generally yes; not the current blocker |
| stable merchant order correlation | yes | yes | yes | generally yes |
| documented POST idempotency | **yes** | not proven in reviewed docs | intermediary-dependent / needs exact API review | generally available but merchant eligibility unresolved |
| webhook duplicate handling required | yes | yes | yes | yes |
| webhook verification model | payment re-query for general payments | provider-specific proof still needed | signed webhook verification + payment lookup | signed webhook model generally available |
| authoritative recovery query | yes | **yes; explicitly documented for DB failure** | yes | yes |
| full/partial cancel support | yes | yes | yes | yes |
| test/production separation | yes | yes | yes | yes |
| fits current one-provider provenance without schema extension | **yes** | **yes** | **no / conditional** | yes, if merchant eligible |
| production merchant eligibility proven for MyeongHa | **no** | **no** | **no** | **no** |

`yes` here means documentation evidence exists for the technical capability, not that MyeongHa is contractually enabled for production.

---

## 9. Current narrowing

Based on architecture fit alone, without inventing merchant facts:

```text
Tier A — direct-provider shortlist
1. Toss Payments
2. NHN KCP

Tier B — only if orchestration requirement appears
3. PortOne V2

Conditional by merchant entity
4. Stripe
```

Toss is the current **technical lead candidate**, not the selected provider, because:

1. server confirmation/query/cancel surfaces map cleanly to current provider-neutral contract;
2. documented POST idempotency complements MyeongHa retry handling;
3. general webhook verification by authoritative payment re-query matches the existing webhook-as-hint invariant;
4. test/live key separation is explicit;
5. direct-provider identity avoids adding an orchestrator/processor provenance dimension.

This ranking MUST NOT be promoted to `P0-CM-02 DECIDED` until merchant/contract facts are supplied and verified.

---

## 10. Exact missing facts to close P0-CM-02

The next decision requires evidence for:

```text
M1. merchant legal form
    individual business / corporation / other eligible entity

M2. merchant registration country

M3. settlement bank/account country and supported payout requirements

M4. launch buyer geography
    Korea-only / Korea-first / international

M5. launch presentment currency
    KRW only / KRW + foreign currency

M6. required payment methods
    domestic cards / easy pay / transfer / virtual account / foreign cards etc.

M7. website/merchant review readiness
    production domain, seller identity disclosure, refund terms, sellable product page

M8. commercial acceptance
    provider contract/fees/settlement schedule/industry review
```

These are business facts, not values that can be inferred from the current codebase.

---

## 11. Selection rule

P0-CM-02 may close only when one candidate has both:

```text
A. Commerce technical correctness proof
AND
B. actual merchant production eligibility proof
```

A provider cannot be selected solely because its SDK is easy, its brand is familiar, or it is common in Korea.

---

## 12. Sources reviewed

Official provider material reviewed on 2026-09-05 includes:

- Toss Payments Developer Center: Payment APIs, Core API, webhooks, payment products/contracting.
- NHN KCP Developer Center: standard payment, payment approval, transaction query, payment validation, cancellation, security/webhook network information.
- PortOne Developers V2: payment quick guide, server verification, REST V2, webhook/cancel integration.
- Stripe: Global Availability, South Korean payment methods, account-country requirements.

Current provider documentation is external operational evidence, not MyeongHa domain authority. Provider-specific behavior must be revalidated again immediately before production implementation because provider contracts and policies can change.
