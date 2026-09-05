# Commerce Evidence V2 Implementation Contract

> Repository: `gycha0109-beep/MyeongHa`  
> Authority: `docs/architecture/COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`, `docs/COMMERCE_EVIDENCE_DATA_MINIMIZATION_DECISION_V1.md`, `supabase/migrations/0930_commerce_payment_source_authority_hardening.sql`  
> Status: **PROVIDER-NEUTRAL STRUCTURAL CONTRACT / NO PROVIDER AUTHENTICITY / NO RIGHTS APPLY**

## Purpose

`VerifiedCommerceEvidenceV2` is an additive normalized evidence contract. It does not replace or reinterpret `VerifiedCommerceEvidenceV1`.

V2 closes the structural mismatch between the original runtime evidence validator and the payment-source authority added by migration `0930` by requiring the verified money terms and MyeongHa server verification time that a future verified Receipt apply path must carry.

## Required additive fields

```text
verifiedAmountMinor
verifiedCurrency
verifiedAt
```

Rules:

- `verifiedAmountMinor` is a positive JavaScript safe integer in minor currency units.
- `verifiedCurrency` is exactly three uppercase ASCII letters, matching the DB currency grammar.
- `verifiedAt` is MyeongHa server verification provenance and must be canonical UTC with millisecond precision: `YYYY-MM-DDTHH:mm:ss.sssZ`.

V2 otherwise preserves the V1 provider-neutral fields and owner-binding vocabulary.

## Deliberately opaque provider provenance

The following remain non-empty provider-native tokens when present:

```text
providerOccurredAt
providerOrderingKey
providerValidUntil
```

Their grammar and semantic ordering cannot be invented before `P0-CM-02` selects a provider and its adapter authority is established.

## Security / minimization boundary

The contract uses an exact top-level allowlist. Raw or client-authoritative fields such as the following are rejected rather than carried through:

```text
subjectId
price
rawReceipt
authorization
paymentKey
providerResponse
```

The existing approved Commerce evidence fingerprint shape remains required. Validation errors do not echo rejected raw evidence values.

## Environment boundary

`sandbox` remains a valid structural evidence environment so adapters/tests can normalize sandbox facts. Passing this validator does **not** authorize a production entitlement effect. CE-21 remains a verified-apply/runtime invariant.

## Not implemented by this contract

```text
provider authenticity/signature/API verification
provider-specific canonical evidence serializer
provider event ordering comparator
Purchase Intent expected-money comparison
Receipt persistence
Grant/Event mutation
Effective Entitlement mutation
sandbox → production authorization
PSP selection or SDK
webhook/payment route
```

Those remain later layers. In particular, this validator must never be treated as proof that payment occurred merely because an arbitrary object satisfies the structural shape.
