# SRC-18 — Commerce Product → Entitlement Mapping Authority

> Status: **OPEN / BLOCKING for verified purchase → entitlement grant application**  
> Domain: Commerce / Entitlement  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`

---

## 1. Gap

Source authority defines the commerce persistence/provenance chain and the final entitlement authority, but it does **not** define the governed mapping that turns a verified purchased product into one or more entitlement grants.

The missing authority includes, at minimum:

- which `product_key` / `product_id` grants which `entitlement_key`;
- whether the grant is global or resource-scoped and how any `scope_key` is resolved;
- one-off vs subscription/bundle grant semantics where that changes grant identity or validity;
- the deterministic `grant_key` derivation/source-instance rule for purchase/subscription sources;
- whether one product may produce multiple grants and, if so, their governed ordering/atomicity;
- what immutable/versioned artifact, table, code registry, or other authority owns that mapping;
- what provenance/version/hash must be pinned so later configuration changes cannot reinterpret an already verified historical purchase.

## 2. What source authority already fixes

### ERD v0.6

`product_offers` fixes an immutable provider/store mapping:

```text
product_id
platform
provider
external_product_id
```

The ERD explicitly calls `(id, provider, external_product_id, product_id)` the purchase snapshot verification target and states that provider/platform/external-product/product mapping is immutable after creation.

`purchase_intents` stores:

```text
product_offer_id
request_hash
offer_snapshot_jsonb   # immutable minimal mapping snapshot
offer_snapshot_hash
```

and requires member ownership plus idempotency conflict detection.

`commerce_receipts` / `commerce_provider_events` preserve verified provider transaction provenance.

`entitlement_grants` defines independent grant source instances with:

```text
entitlement_key
scope_key
grant_key
grant_source_type
valid_from / valid_until
```

`entitlement_events.product_id` may record a nullable source product, and the source-defined apply skeleton is:

```text
verified receipt/provider event
→ resolve subject + grant_key
→ lock/upsert grant
→ reject stale provider order
→ append entitlement_event
→ update grant projection
→ recompute logical entitlement from ALL valid grants
→ outbox
```

However, the source never defines the rule that resolves the purchased `product_id` into the target entitlement key/scope/grant semantics.

### UC-26 / UC-27

The use cases require:

```text
Purchase Intent
→ platform payment rail
→ server verification
→ entitlement issuance / restore
```

and require the server, not client payment UI, to be final entitlement authority. They do not define a product-to-entitlement mapping registry or fulfillment-definition schema.

## 3. What the implementation pack must NOT invent

Until source authority resolves this gap, the implementation pack must not claim any of the following as source-backed authority:

- `ProductFulfillmentDefinition` as a required source-controlled registry;
- a `fulfillmentDefinitionVersion` field;
- normalized grant-definition payloads inside `purchase_intents.offer_snapshot_jsonb`;
- `GLOBAL | REQUEST_RESOURCE | FIXED` scope-resolver semantics;
- `one_off | subscription | promo_compatible` grant-class semantics;
- a required fulfillment-definition hash/version in Purchase Intent or release evidence;
- receipt verification or entitlement apply logic that derives grant semantics from such an invented registry.

Those may become valid **only after source authority explicitly adopts an equivalent contract**.

## 4. Current safe implementation boundary

The following remain source-complete and may be implemented independently:

- Product / Product Offer relational persistence;
- immutable provider/platform/external-product/product mapping;
- Purchase Intent member-only ownership and idempotency;
- Purchase Intent immutable **minimal offer mapping snapshot** and version-prefixed digest;
- provider-account-link ownership/provider validation;
- receipt/provider-event provenance and dedupe/integrity constraints already defined by the ERD;
- current entitlement read projection from already-authoritative grants.

The following is blocked by SRC-18:

```text
verified receipt/provider event
→ create/renew/restore a concrete entitlement grant for a purchased product
```

Provider-specific transaction verification/restore additionally remains subject to `OPEN-P0: P0-CM-01`.

## 5. Required source resolution

Source authority should choose and define one governed product→entitlement mapping model. The resolution must specify enough information to deterministically reproduce historical entitlement effects without reading mutable current configuration.

Possible implementation shapes are **not decisions** and are listed only to make the missing authority explicit:

```text
A. immutable versioned registry artifact
B. relational product-entitlement mapping table/version
C. source-controlled product policy keyed by product identity/version
D. another explicitly governed equivalent
```

Whichever model is chosen must define mapping identity/versioning, scope resolution, grant source identity, historical pinning/provenance, and compatibility with purchase/restore/provider-event flows.

## 6. Verification gate after resolution

At minimum:

- verified purchase maps to the source-approved entitlement key/scope only;
- same historical purchase is not reinterpreted after mapping changes;
- cross-subject resource scope cannot be granted;
- duplicate receipt/provider event creates one logical source effect;
- one grant revoke does not remove access supplied by another valid grant;
- restore reproduces missing authoritative provenance idempotently;
- unknown/unsupported product mapping fails closed with no entitlement mutation.

## 7. Relationship to P0-CM-01

`P0-CM-01` decides the Web / Apple / Google commerce rail and product-type matrix. It does **not**, by itself, define the missing provider-independent product→entitlement mapping authority described here.

Therefore:

```text
P0-CM-01 = provider/platform commerce rail decision
SRC-18    = source-level purchased product → entitlement grant semantics
```

Both must be resolved before a complete production purchase→grant pipeline can be claimed.
