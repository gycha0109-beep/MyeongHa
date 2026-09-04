# 명하 Commerce Launch Rail Decision v1

> Product: **명하 (MyeongHa)**  
> Date: **2026-09-05**  
> Repository baseline: `871289f16da2b0a41784dfffc50950ce14f40bb3`  
> Commerce architecture: `docs/architecture/COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`  
> Status: **P0-CM-01 DECIDED / PROVIDER + LAUNCH SKU STILL OPEN / IMPLEMENTATION HOLD**

---

## 1. Decision

```text
P0-CM-01 Commerce launch rail
= WEB
= ONE-OFF PURCHASE ONLY
= NO SUBSCRIPTION
= NO BUNDLE BILLING
= NO APPLE IAP / GOOGLE PLAY BILLING IN LAUNCH MVP
```

This decision selects the launch **channel/rail shape**. It does not select an exact Web PSP/vendor and does not authorize a concrete paid Product SKU.

The remaining gates are split explicitly:

```text
P0-CM-02
→ exact Web payment provider / PSP

P0-CM-03
→ concrete launch paid Product + Capability catalog
```

Both remain `OPEN-P0`.

---

## 2. Source and repository evidence

### Product source scope

The current product/use-case authority assigns long detailed Saju reports and payment to the Web surface, while the Mobile surface centers on Character Hall, chat/episodes, relationship growth, and push/return loops.

Therefore the product source does not require Apple/Google billing as the first launch rail.

### Current client reality

`apps/mobile/README.md` states that Mobile is only a first-class client placeholder and that Expo/React Native bootstrap is a later implementation step after shared contracts are stable.

Current repository reality therefore is:

```text
Web client     = implemented product surface
Mobile client  = placeholder; native bootstrap not started
```

Implementing Apple IAP / Google Play Billing before a real native product client exists would add provider-specific lifecycle and store-policy complexity without satisfying a current launch surface.

### Existing Commerce architecture

`COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md` already keeps Product/Offer/Capability and entitlement semantics provider-neutral. Selecting Web first does not change provider-neutral evidence, grant, event, projection, reconciliation, or idempotency authority.

---

## 3. Why one-off only

Current product authority contains paid detailed/deep Reading as a monetization candidate but does not authorize a subscription product or subscription lifecycle for MVP.

The Commerce architecture therefore already classifies subscription as post-MVP.

Launch rail is narrowed to:

```text
one verified payment transaction
→ one immutable historical Product/Capability meaning
→ one independent purchase grant source
```

This avoids inventing:

```text
renewal cadence
billing retry/grace period
cancel-at-period-end semantics
upgrade/downgrade/proration
subscription restore chain
```

without product authority.

Bundle billing is also excluded until an explicit Product/Capability catalog requires it.

---

## 4. Native mobile policy boundary

Apple/Google billing is not rejected permanently.

When a native iOS/Android client becomes an actual distribution surface and digital paid functionality is sold there, store payment requirements must be re-validated against the then-current Apple App Review Guidelines and Google Play Payments policy before activation.

That future activation requires a new explicit decision because it introduces provider-specific purchase, restore, refund, revoke, server-notification, and ordering semantics.

```text
native client exists
+ native paid surface selected
+ current store policy reviewed
+ provider adapter semantics proven
→ Apple/Google rail may be authorized
```

A Web purchase being usable by an authenticated Member does not by itself authorize an in-app purchase flow or external-purchase steering inside a native app.

---

## 5. P0-CM-02 — exact Web PSP remains open

The repository does not currently contain authoritative merchant/business/settlement facts sufficient to select a specific PSP solely from code.

Before choosing the provider, implementation must establish at least:

```text
merchant legal entity / supported country
settlement currency and payout requirements
actual launch sales geography
one-off digital-goods support
server-side payment verification/lookup
stable transaction identity and idempotency
webhook authenticity + redelivery behavior
refund/cancel/chargeback lifecycle
authoritative current-state lookup for reconciliation
sandbox/test environment separation
credential/secret operational model
```

A provider being popular, Korean, or easy to integrate is not sufficient authority.

Until `P0-CM-02` is decided:

```text
provider SDK                 = HOLD
provider webhook route       = HOLD
provider credential binding  = HOLD
provider-specific evidence comparator = HOLD
```

Provider-neutral schema/command work may start only when it does not depend on provider semantics and the launch Product/Capability gate is also satisfied.

---

## 6. P0-CM-03 — launch paid Product is blocked by Saju production authority

UX/Product authority suggests Paid Deep/Detailed Reading as a monetization surface. That is a **candidate**, not a saleable production SKU.

Current `gycha0109-beep/Saju` authority still records:

```text
PRODUCTION INTERPRETATION AUTHORITY = BLOCKED
PUBLIC PRODUCTION READING RUNTIME   = BLOCKED
```

The Saju productization transport boundary is complete, but that closure explicitly does not create new production Saju meaning. The later production interpretation authority audit says no real repository-backed production interpretation registry currently satisfies the production authorization contract.

Therefore MyeongHa MUST NOT convert the UX hypothesis into a paid catalog row merely to unblock Commerce.

Forbidden before Saju authority closes:

```text
Paid Deep Reading → enabled Product Offer
synthetic/empty interpretation pack → sellable reading
research-grade T8/T9 claims → paid production semantics
LLM-generated missing interpretation → paid artifact
calculation-only output → marketed as governed detailed interpretation
```

Minimum unblock condition for the first Saju paid Product:

```text
Saju production interpretation authority for the selected domain
+ public production Reading runtime authorized for that domain
+ MyeongHa host/adapter positive-path validation
+ exact Product Capability meaning selected
+ refund/access-after-refund policy selected
```

Until then:

```text
P0-CM-03 = OPEN-P0 / BLOCKED BY UPSTREAM SAJU AUTHORITY
```

---

## 7. Capability-scope consequence

Commerce Architecture v1 supports `global | fixed` Capability scope and deliberately forbids arbitrary request-derived resource scope.

Therefore the first paid Product cannot silently assume "payment for whichever Reading artifact ID the client requested".

When `P0-CM-03` is resolved, the Product decision must explicitly choose one of the Architecture-compatible rights meanings or separately reopen scope authority. It must answer:

```text
What exact entitlement_key is granted?
Is scope global or a server-owned fixed scope?
Is validity unbounded or fixed-duration?
Does one purchase unlock future readings, one governed product class, or another fixed right?
What happens to already-created paid artifacts after verified refund/revoke?
```

If product intent genuinely requires one-purchase-per-reading-artifact ownership, that is not smuggled into the existing `global | fixed` model. It requires an explicit Commerce Architecture revision for resource-scoped ownership/right semantics before implementation.

---

## 8. Implementation gate after this decision

This decision closes only the rail-shape part of Commerce launch planning.

```text
Commerce Architecture                         = CLOSED
P0-CM-01 launch rail                           = DECIDED: Web + one-off
P0-CM-02 exact Web PSP                         = OPEN-P0
P0-CM-03 launch paid Product/Capability        = OPEN-P0 / upstream-blocked
P0-PR-01 commerce evidence retention subset   = OPEN-P0
provider SDK/webhook                           = HOLD
production Commerce activation                 = NOT AUTHORIZED
```

No database migration, provider dependency, webhook route, or production secret is authorized by this document alone.

---

## 9. Reopen triggers

`P0-CM-01` must be reopened if any of the following becomes an actual MVP requirement:

1. native iOS/Android paid digital functionality;
2. subscription billing;
3. bundle billing with distinct lifecycle semantics;
4. a Web-only decision becomes incompatible with the approved launch distribution plan;
5. a material store/provider policy change requires a different compliant rail.

Exact PSP selection does **not** reopen `P0-CM-01`; it closes `P0-CM-02`.

Concrete paid catalog selection does **not** reopen `P0-CM-01`; it closes `P0-CM-03` unless it requires a new rail or unsupported capability-scope model.

---

## 10. Status supersession

`COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md` was closed before this launch-rail decision and therefore contains historical status text that names `P0-CM-01` as still open.

Those statements remain valid as historical evidence of the Architecture closure point but are **superseded for current P0 status** by this decision and `docs/P0_DECISION_REGISTER.md`.

Interpretation rule:

```text
Architecture provider-neutral semantics
→ unchanged and authoritative

Architecture text: "P0-CM-01 open / provider selection blocked"
→ read using latest P0 split:
   P0-CM-01 = DECIDED Web + one-off
   P0-CM-02 = exact Web PSP OPEN
   P0-CM-03 = launch paid Product/Capability OPEN
```

No Architecture invariant, schema authority, entitlement transition, ordering rule, reconciliation rule, or provider-neutral evidence contract is modified by this supersession.
