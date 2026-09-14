# 명하 Commerce Web PSP Decision v1

> Product: **명하 (MyeongHa)**  
> Decision: **P0-CM-02**  
> Date: **2026-09-14**  
> Repository baseline: `4272b077c1fe71935e3d61797bb4c1ab6065297f`  
> Governing issue: **#733**  
> Status: **DECIDED — PORTONE V2 / PROVIDER-SPECIFIC IMPLEMENTATION AUTHORIZED WITHIN THIS BOUNDARY / PRODUCTION ACTIVATION STILL BLOCKED**

---

## 1. Decision

```text
P0-CM-02 Web payment provider / PSP
= PortOne V2

canonical MyeongHa provider key
= portone_v2

server API authority
= https://api.portone.io

canonical payment completion authority
= server-side PortOne V2 payment lookup by paymentId

browser redirect / callback
= transport hint only; never payment-success authority
```

This decision selects the launch Web one-off payment orchestration/provider boundary. It does **not** assert that a live merchant account, downstream PG contract, settlement rail, launch currency, or Production credential is already available.

---

## 2. Current authority chain

The repository already owns the provider-neutral chain required below this decision:

```text
Purchase Intent v2
→ Commerce Payment Attempt
→ authenticated provider ingress orchestration
→ server-side provider verification
→ VerifiedCommerceEvidenceV2
→ atomic verified Receipt + receipt-scoped Provider Event persistence
```

PortOne-specific code must terminate at the existing provider-neutral contracts. It must not replace or bypass them.

The resulting authority chain is therefore:

```text
PortOne V2 browser/SDK handoff
→ provider-originated authenticated server ingress
→ exact Payment Attempt / Purchase Intent verification context
→ PortOne V2 server lookup / webhook authenticity verification
→ allowlisted normalized provider facts
→ VerifiedCommerceEvidenceV2
→ existing atomic Receipt/Event persistence
```

`commerce_payment_attempts.status='response_received'` remains operational provenance only. It is never equivalent to `paid`, `verified`, Receipt authority, or entitlement authority.

---

## 3. Provider identity and environment

Canonical repository identity:

```text
provider = portone_v2
environment = sandbox | production
```

`provider` is stored only as a provider-boundary identifier. It does not become a Product, Capability, business-domain, or entitlement key.

Environment is an independent authority dimension. A future PortOne adapter must prove the exact channel/payment environment from provider-owned configuration/data. It must not infer Production solely from request origin, browser callback URL, hostname, or caller input.

Sandbox/test evidence must never mint Production rights.

---

## 4. Server API and authentication authority

Current PortOne V2 official documentation establishes:

```text
API host      = api.portone.io
API auth      = Authorization: PortOne <V2 API Secret>
webhook auth  = PortOne V2 webhook secret verification
payment key   = merchant-generated paymentId
```

V2 API Secret and webhook secret are server-only credentials.

Forbidden:

```text
browser/mobile exposure
repository commit
raw log emission
Receipt/Event payload persistence
verified_payload_jsonb persistence
fingerprint input that could later reveal the credential
```

Credential provisioning and live secret binding are operational activation tasks, not part of this decision PR.

---

## 5. Canonical completion verification

A browser-side SDK result, redirect, query parameter, callback body, or local Payment Attempt state is not sufficient payment authority.

Canonical successful completion requires a server-side PortOne V2 payment lookup using the provider-owned `paymentId`, followed by exact provider-fact verification through the existing MyeongHa verification boundary.

At minimum the concrete adapter must fail closed unless it can prove:

```text
provider identity
exact environment
paymentId / request identity
provider transaction identity when present
provider payment status
amount
currency
product identity semantics required by VerifiedCommerceEvidenceV2
provider occurrence time when used
```

Amount/currency must still equal the immutable Purchase Intent v2 monetary authority. Provider data cannot rewrite Purchase Intent charge terms.

---

## 6. Required exact mapping before concrete adapter merge

The PortOne-specific implementation is authorized only after its PR proves all of the following explicitly.

### 6.1 Status mapping

Every accepted PortOne payment state must map explicitly to the existing `VerifiedCommerceEvidenceV2.currentState` semantics.

Unknown, newly introduced, partially paid, virtual-account-pending, cancelled, partially cancelled, disputed, or otherwise non-proven states must fail closed unless separately mapped and reviewed. The adapter must not collapse provider lifecycle state to a single boolean.

### 6.2 Identity mapping

The implementation must prove the exact mapping of:

```text
PortOne paymentId
↔ MyeongHa provider_request_id

PortOne transactionId (when authoritative/present)
↔ MyeongHa provider_transaction_id
```

Duplicate/retry execution must preserve existing idempotency and collision semantics.

### 6.3 Product identity

`VerifiedCommerceEvidenceV2.externalProductId` must represent an actually authoritative round-trip product identity.

If PortOne payment lookup cannot return the exact server-owned product identity required by the current evidence contract, the adapter must **not fabricate it from caller input**. The provider-neutral evidence contract must be amended by a separate reviewed change instead.

### 6.4 Data minimization

Only an allowlisted normalized subset may reach `VerifiedCommerceEvidenceV2` / Receipt / Provider Event persistence.

Raw provider request/response objects, Authorization headers, webhook secrets, API secrets, PAN/CVV, sensitive payment tokens, or unrelated customer data must not be persisted or logged.

### 6.5 HTTP safety

The concrete adapter must define and test:

```text
request deadline / timeout
redirect policy
bounded response body
content-type / schema validation
provider error-body redaction
retry behavior
idempotency behavior
network failure semantics
```

No provider HTTP request may run while an internal Commerce PostgreSQL transaction is held open.

---

## 7. Webhook boundary

A future webhook route may be implemented after this decision, but the route itself is not payment authority.

Required ordering:

```text
raw webhook HTTP request
→ exact PortOne webhook authenticity verification
→ minimal authenticated provider identity
→ existing provider-neutral completion orchestration
→ server payment lookup / verification
→ VerifiedCommerceEvidenceV2
→ atomic Receipt/Event persistence
```

Webhook authenticity and server payment lookup solve different problems and must not be conflated.

A valid webhook signature proves transport/provider authenticity; it does not by itself prove the final amount/currency/product/current-state facts required for fulfillment.

---

## 8. Why PortOne V2

PortOne V2 is selected because the current official provider surface supports the requirements already imposed by the MyeongHa Commerce authority model:

1. server-side V2 REST payment lookup at a stable provider API boundary;
2. server-held V2 API Secret authentication;
3. merchant-generated `paymentId` suitable for MyeongHa-owned request correlation;
4. webhook-secret verification for authenticated asynchronous ingress;
5. payment status, amount, currency, transaction data, cancellation/refund lifecycle surfaces;
6. multiple domestic/overseas downstream PG/channel choices behind one MyeongHa provider adapter boundary.

This is an orchestration/provider selection, not a declaration that every PortOne-supported PG/channel is already contracted, interchangeable, or eligible for the MyeongHa merchant entity.

---

## 9. Historical P0-CM-02 identifier collision

Closed Issue #610 historically used the textual label `P0-CM-02` for the immutable Product Capability Set authority foundation.

That historical issue is complete and must not be rewritten or reinterpreted.

The canonical `docs/P0_DECISION_REGISTER.md` currently defines `P0-CM-02` as **Web payment provider / PSP**. This decision closes that current register item with PortOne V2.

Interpretation rule:

```text
Issue #610 textual P0-CM-02
= historical implementation issue label
= Product Capability Set foundation
= CLOSED historical provenance

Canonical Decision Register P0-CM-02
= Web payment provider / PSP
= PortOne V2
= DECIDED 2026-09-14
```

---

## 10. Explicit non-goals

This decision PR does not implement or activate:

```text
PortOne SDK
PortOne webhook route
PortOne payment parser
PortOne API client
API Secret or webhook secret provisioning
live merchant account
PG/channel contract
settlement account
launch sales geography
tax/legal policy
launch currency
Production endpoint activation
Production Supabase migration
Product Offer enablement
Entitlement Grant/Event mutation
refund/reversal execution
reconciliation worker
```

---

## 11. Independent gates preserved

### Production database

Issue #680 remains the independent Production Supabase deployment-authorization blocker.

```text
Production migration/application = HOLD
manual migration bypass          = FORBIDDEN
```

### Saleable Product

`P0-CM-03` remains `OPEN-P0` and upstream-blocked by Saju production interpretation authority.

PortOne selection does not make Paid Deep/Detailed Reading saleable.

### Retention/legal

Parent `P0-PR-01` remains OPEN. Existing `P0-PR-01B` provider-evidence minimization remains binding, but it does not decide legal/accounting/backup retention duration.

### Merchant activation

Before live payment activation, separately prove:

```text
merchant/legal entity eligibility
exact PortOne account ownership
selected downstream PG/channel contract
launch currency + settlement support
sandbox/live channel identity separation
live API/webhook secret provisioning through supported secret storage
Production deployment path healthy
saleable Product/Capability authority closed
```

---

## 12. Implementation effect

After this decision merges:

```text
provider-specific PortOne adapter design/implementation
= AUTHORIZED within the exact boundary above

Production merchant activation
= NOT AUTHORIZED

Production DB migration/application
= HOLD under #680

saleable Product activation
= BLOCKED under P0-CM-03 / upstream Saju authority
```

The next provider-specific implementation must remain additive and must reuse the provider-neutral Payment Attempt, authenticated-ingress orchestration, `VerifiedCommerceEvidenceV2`, and atomic Receipt/Event persistence authorities already present in the repository.

---

## 13. Migration impact

```text
PostgreSQL migration = NONE
```

Current provider columns are provider-neutral text and already separate provider from `sandbox|production` environment authority. This decision introduces no schema rewrite and no Production mutation.

---

## 14. Change / reopen policy

A new explicit decision/review is required to:

- replace PortOne V2 as the launch Web PSP boundary;
- add a second provider as an equal launch authority;
- weaken server payment lookup into browser callback authority;
- permit unsigned/unverified webhook ingress;
- collapse sandbox/test and Production evidence;
- persist raw provider secrets or sensitive provider payloads;
- enable subscription/native-store billing under this decision;
- reinterpret PortOne selection as approval of a specific downstream PG contract, merchant entity, settlement rail, launch SKU, or Production activation.

---

## 15. Provider references revalidated 2026-09-14

- PortOne REST API V2: `https://developers.portone.io/api/rest-v2`
- PortOne V2 payment API: `https://developers.portone.io/api/rest-v2/payment`
- PortOne V2 checkout/completion guide: `https://developers.portone.io/opi/ko/integration/start/v2/checkout`
- PortOne V2 webhook guide: `https://developers.portone.io/opi/ko/integration/webhook/readme-v2`
- PortOne V2 PG integration index: `https://developers.portone.io/opi/ko/integration/pg/v2/readme`

These references establish provider capability and integration semantics only. Merchant eligibility and live-account readiness remain separate operational evidence.
