# MyeongHa Standard Reading Product V1 — 연애·관계 × Reader

> Repository: `gycha0109-beep/MyeongHa`  
> Tracking: #1068  
> Status: **PRODUCT AUTHORITY DEFINED / PRICE UNRESOLVED / NOT SALEABLE / SAJU HOLD**  
> Product key: `standard.love_relationship`  
> Topic: **연애·관계**  
> Reader: **구매/생성 시 선택한 Character**  
> Supersedes as current Product direction: `saju.general_natal.deep.v1` / KRW 9,900 historical inactive candidate

## 1. Decision

The first Standard Reading Product is:

```text
Product = standard.love_relationship
Reader  = selected Character
```

Reader identity is not encoded into Product or Offer identity.

Forbidden catalog shapes:

```text
love.baekheon
love.rahyeon
love.taegyeom
standard.love_relationship.baekheon
...
```

The Product answers **what is read**. Reader answers **who reads it and through which governed lens/presentation**.

## 2. Semantic scope

The Product is a natal/general relationship Reading about the subject's own patterns.

Included Product questions may cover:

- who the subject tends to be attracted to
- how the subject enters relationships
- how affection/emotion is expressed
- expectations toward a partner
- patterns that appear as intimacy increases
- conflict response
- vulnerable/hurt points
- recurring relationship problems
- long-term relationship behavior
- characteristics of relationships that fit the subject

Explicitly excluded:

- whether a specific person likes the subject
- two-person compatibility
- reunion probability
- relationship timing / specific future event prediction
- Character Special products

The relational Saju mapping is:

```text
topic_key       = love_relationship
saju_domain     = relationship
reading_period  = natal
reading_variant = general
```

This mapping is Product request authority only. It does not create Saju claims.

## 3. Product / Reader separation

The relational authority is stored in:

```text
standard_reading_product_specs
```

The current Product pins:

```text
product_id            = 11300000-0000-0000-0000-000000000001
product_key           = standard.love_relationship
spec_version          = v1
reader_selection_mode = required
purchase_unit_mode    = topic_reader_reading
```

A future Purchase Intent pins Reader identity sparsely in:

```text
purchase_intent_reader_selections
```

Therefore:

```text
one Topic Product
+
one selected Reader
+
one Purchase Intent
→ one Reader-bound paid Reading unit
```

No unused Topic × Reader matrix rows are pre-created.

## 4. Reader selection provenance

A Reader selection preserves:

```text
purchase_intent_id
product_id
reader_character_id
reader_content_bundle_id
selection_contract_version
selection_snapshot_jsonb
selection_hash
created_at
```

The selection is append-only. Subject ownership is not duplicated on this row; canonical ownership is derived from the referenced Purchase Intent.

It must match:

- the Product actually referenced by the Purchase Intent's Offer
- the exact Capability Set pinned by the Purchase Intent
- a catalog-eligible Character/content-bundle pair
- the exact server-owned selection snapshot

The ordinary API executor has no direct insert/update/delete authority on this table.

User-specific unlock/access checks for globally `unlockable` Characters remain a future server-command/runtime responsibility; the persistence table does not infer them from client input.

## 5. Capability meaning

The current Product Capability Set is defined before price/Offer activation:

```text
Capability Set:
  id: 11301000-0000-0000-0000-000000000001
  definition_version: v1
  definition_hash:
    sha256:2ac901096369a6ea38cd180dff9fcd078efdfccbfca17117d6c282d116f76524

Capability Item:
  item_key: love-relationship-reader-reading-unit
  entitlement_key: reading.standard.love_relationship.unit.v1
  scope_mode: global
  validity_mode: unbounded
```

Canonical hash material:

```json
{"definitionVersion":"v1","items":[{"durationSeconds":null,"entitlementKey":"reading.standard.love_relationship.unit.v1","fixedScopeKey":null,"itemKey":"love-relationship-reader-reading-unit","scopeMode":"global","validityMode":"unbounded"}],"productKey":"standard.love_relationship"}
```

Important:

> The aggregate entitlement key alone is not permission to generate arbitrary Readers.

The intended future generation authority is:

```text
purchase-backed active grant
+
matching Purchase Intent Reader selection
+
unconsumed/retry-eligible Reading unit
+
authorized Saju relationship Reading runtime
→ create/bind Reading
```

This preserves repeated purchases for different Readers without creating per-Reader SKUs.

## 6. Price / Offer state

Current Product pricing figures are working candidates only.

```text
Standard Reading ≈ KRW 8,900
```

is **not** current charge authority.

Therefore migration 1130 intentionally creates:

```text
Product          = yes, disabled
Capability Set   = yes
Capability Item  = yes
Product Offer    = no
Charge Terms     = no
Purchase Intent  = no
Payment          = no
Entitlement      = no
```

A future price decision must create a new immutable Offer/Charge Terms authority without rewriting this history.

## 7. Historical candidate supersession

Historical migration:

```text
1120_paid_general_natal_product_candidate.sql
```

is not rewritten.

Migration:

```text
1130_standard_love_relationship_reader_authority.sql
```

forward-retires:

```text
saju.general_natal.deep.v1
myeongha-saju-general-natal-deep-v1
KRW 9,900 charge terms
its Capability Set
```

The rows remain historical provenance.

## 8. Saju authority HOLD

Fresh Saju main at #1068 start:

```text
47d493535a2e251ac136bcc56fad54c2fe59f6f3
```

Fresh audit still reports:

```text
PRODUCTION INTERPRETATION AUTHORITY = BLOCKED
PUBLIC PRODUCTION READING RUNTIME   = BLOCKED
```

Relationship-specific research also remains non-Production.

Therefore this Product must remain:

```text
products.enabled = false
saleable Offer   = none
checkout         = blocked
Reading execution= blocked
```

No synthetic fixture, prompt-only inference, research claim, or Character LLM may fill the missing Saju authority.

## 9. Required next activation slices

Before sale activation:

1. Saju production-authorized `relationship + natal/general` interpretation authority.
2. Public Product Reading execution/finalization/grounding path.
3. Atomic Purchase Intent v4-style command that persists Reader selection with the intent.
4. Verified Payment → purchase-backed Grant fulfillment for the exact Capability Set.
5. Reader-bound unit → Reading artifact binding with retry-safe generation.
6. Owner-scoped immutable artifact reread.
7. Existing Reading reference path for Character chat without granting a new Reading.
8. Different Reader full re-analysis requiring a new Reader-bound purchase unit.
9. Exact Product price/Offer/charge-term decision.
10. PortOne Sandbox E2E and refund/revoke behavior tests.

## 10. Hard invariants

```text
Browser/SDK result != payment truth
Verified Payment != Entitlement
Entitlement aggregate != arbitrary Reader generation permission
Entitlement != Saju semantic authority
Product layer != Saju claim generator
Product != Reader
Reader personality != Source Truth
Chat subscription != unpaid Reading entitlement
Existing Reading reference != permission to generate a new Reader Reading
Character private memory != global memory
```

## 11. Current verdict

```text
CURRENT_FIRST_STANDARD_PRODUCT = standard.love_relationship
PRODUCT_READER_SEPARATION      = DEFINED
SPARSE_READER_SELECTION_SCHEMA = DEFINED
PRICE_AUTHORITY                = UNRESOLVED
SALEABLE_OFFER                 = NO
SAJU_RELATIONSHIP_AUTHORITY    = BLOCKED
PRODUCTION_ACTIVATION          = HOLD
```
