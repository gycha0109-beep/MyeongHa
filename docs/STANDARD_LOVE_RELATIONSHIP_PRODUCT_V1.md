# MyeongHa Standard Reading Product V1 — 연애·관계 × Reader

> Repository: `gycha0109-beep/MyeongHa`  
> Tracking: #1068  
> Status: **PRODUCT AUTHORITY DEFINED / LIST PRICE DECIDED / NOT SALEABLE / SAJU HOLD**  
> Product key: `standard.love_relationship`  
> Topic: **연애·관계**  
> Reader: **구매 시 선택한 Character; 공식 Reading identity와 분리**  
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

## 3. Product / Official Reading / Reader separation

The relational Product request authority remains stored in:

```text
standard_reading_product_specs
```

The historical v1 Product spec still pins:

```text
product_id            = 11300000-0000-0000-0000-000000000001
product_key           = standard.love_relationship
spec_version          = v1
reader_selection_mode = required
purchase_unit_mode    = topic_reader_reading
```

That immutable field is preserved as historical provenance. It is **not** the current target Reading identity model.

Migration `1210_official_standard_reading_reader_interpretation_authority.sql` overlays the current delivery policy:

```text
reading_identity_mode       = official_subject_product_scope_birth_authority
reader_interpretation_mode  = per_reader_purchase_grant
```

The target runtime is:

```text
one Topic Product
+
one exact reusable official Reading
├─ Reader A Interpretation / Access
├─ Reader B Interpretation / Access
└─ Reader C Interpretation / Access
```

The official Reading is Reader-independent. Its reusable identity is pinned to:

```text
subject
Product / topic
Reading scope (domain / period / variant)
immutable source Birth revision
Product spec version
domain capability version
```

Reader identity remains sparse purchase provenance in `purchase_intent_reader_selections`; it does not become part of the official Reading Source Truth.

Historical `standard_reading_unit_bindings` and `cmd_bind_standard_reading_unit_v1` from #1090 remain immutable legacy lineage. New runtime work must use the v2 official-Reading authority rather than create another Reader-bound Reading.

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

User-specific unlock/access checks for globally `unlockable` Characters are resolved at runtime only from the already-stored current Character Unlock projection. The application resolver checks that projection before purchase, and migration 1150 adds a DB constraint trigger so future v4 command activation cannot bypass the same stored-unlock requirement. Neither layer evaluates or mutates unlock conditions, and the persistence table does not infer them from client input.

## 5. Capability meaning

The current Product Capability Set remains the existing inactive pre-sale authority:

```text
Capability Set:
  id: 11301000-0000-0000-0000-000000000001
  definition_version: v1

Capability Item:
  item_key: love-relationship-reader-reading-unit
  entitlement_key: reading.standard.love_relationship.unit.v1
  scope_mode: global
  validity_mode: unbounded
```

The existing Capability identity is not silently redefined into Saju semantic authority.

For the v2 target model, an **exact purchase-backed Entitlement Grant** is consumed as Reader-access provenance:

```text
first eligible purchase
→ create one official Reading if no exact reusable official Reading exists
→ grant selected Reader Interpretation / Access

additional eligible Reader purchase
→ reuse committed official Reading
→ create only selected Reader Interpretation / Access
→ official Reading count does not increase
```

Important:

> Aggregate entitlement alone is never sufficient for Reader Knowledge.

Current access requires:

```text
exact official Reading
+
exact selected Reader
+
exact purchase-backed active Grant
```

Refund/revoke/expiry of Reader A's exact Grant closes Reader A access only. It does not delete the official Reading and does not revoke Reader B.

## 6. Price / Offer state

Product Owner decision on 2026-09-19 fixes the Standard Reading list price:

```text
Standard Reading list price = KRW 8,900
currency                    = KRW
```

This is **Product price authority**, not yet sale/charge authority. It does not by itself create an Offer, immutable Charge Terms, checkout eligibility, or payment authority.

Therefore migration 1130 remains unchanged and intentionally creates:

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

A future sale-activation slice must materialize the decided KRW 8,900 price into a new immutable Offer/Charge Terms authority without rewriting migration 1130. Until that separate authority exists, clients and payment code must not treat KRW 8,900 as executable charge terms.

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
3. Purchase runtime and Reader eligibility remain fail-closed as implemented in #1075; public purchase activation remains HOLD.
4. Verified Payment → purchase-backed Grant fulfillment for the exact authorized Capability.
5. **Official Reading + Reader Interpretation binding.** Migration 1210 and the v2 application/DB adapter implement the PR candidate: the first purchase may create one Reader-independent pending Reading; later Reader purchases reuse only a committed exact official Source Truth.
6. **Reader-scoped artifact source.** #1099 v1 remains legacy internal provenance. New `internal_qry_standard_reading_artifact_source_v2` requires exact Reader access and exact active purchase Grant. Raw ProductReadingResponse remains unavailable to ordinary runtime roles.
7. **Character Reader Knowledge.** `internal_qry_character_standard_reading_access_v1` returns only metadata for official Readings opened to that exact Character; it does not expose raw ProductReadingResponse.
8. Additional Reader Interpretation UX/Commerce materialization after Product/Offer authority explicitly distinguishes initial Reading purchase from lower-priced additional Reader access. No price/Offer is activated by this document.
9. Offer/charge-term materialization for the separately decided first-Reading list price only when Commerce activation authority permits it.
10. PortOne Sandbox E2E and independent refund/revoke tests.

## 10. Hard invariants

```text
Browser/SDK result != payment truth
Verified Payment != Entitlement
Entitlement aggregate != Reader Knowledge
Entitlement != Saju semantic authority
Product layer != Saju claim generator
Product != Reader
Official Reading = Saju Source Truth artifact
Reader Interpretation = presentation / explanation artifact
Reader personality != Source Truth
Additional Reader purchase != new official Reading generation
Reader A access != Reader B access
Reader refund/revoke != official Reading deletion
Character Chat may read only official Readings opened to that exact Character
Raw ProductReadingResponse != ordinary runtime payload
Historical #1090/#1099 provenance != permission to revive Reader-bound Reading identity
Character private memory != official Reading authority
```

## 11. Current verdict

```text
CURRENT_FIRST_STANDARD_PRODUCT       = standard.love_relationship
PRODUCT_READER_SEPARATION            = DEFINED
SPARSE_READER_SELECTION_SCHEMA       = DEFINED
OFFICIAL_READING_IDENTITY            = PR_CANDIDATE_FAIL_CLOSED
READER_INTERPRETATION_IDENTITY       = PR_CANDIDATE_FAIL_CLOSED
READER_ACCESS_GRANT_AUTHORITY        = PR_CANDIDATE_FAIL_CLOSED
CHARACTER_READER_KNOWLEDGE_SOURCE    = INTERNAL_PR_CANDIDATE_FAIL_CLOSED
LEGACY_READER_BOUND_BINDING_1090     = PRESERVED_IMMUTABLE
LEGACY_ARTIFACT_SOURCE_1099          = PRESERVED_INTERNAL
LIST_PRICE_KRW                       = 8900
PRICE_AUTHORITY                      = DECIDED_PRODUCT_OWNER
ADDITIONAL_READER_PRICE_AUTHORITY    = NOT_MATERIALIZED
SALEABLE_OFFER                       = NO
SAJU_RELATIONSHIP_AUTHORITY          = BLOCKED
PUBLIC_ARTIFACT_REREAD               = NO
PUBLIC_PURCHASE_ROUTE                = NO
PRODUCTION_ACTIVATION                = HOLD
```
