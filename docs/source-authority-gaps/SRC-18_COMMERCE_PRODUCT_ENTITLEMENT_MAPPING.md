# SRC-18 — Commerce Product → Entitlement Mapping Authority

> Status: **RESOLVED BY `docs/architecture/COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md` / IMPLEMENTATION NOT STARTED**  
> Domain: Commerce / Entitlement  
> Resolution authority: 명하 결제·권한 아키텍처 v1  
> Upstream source reviewed: `Usecase_re_reviewed_v2`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST`, UX Product Flow, current Commerce schema/runtime/tests

---

## 1. Historical gap

기존 source는 verified purchased Product를 concrete `entitlement_key` / `scope_key` / `grant_key`로 변환하는 규칙과 그 historical versioning authority를 정의하지 않았다.

따라서 이전 implementation pack은 다음을 임의 도입할 수 없었다.

```text
ProductFulfillmentDefinition
fulfillmentDefinitionVersion
REQUEST_RESOURCE 같은 범용 scope resolver
client-derived paid scope
grantClass를 통한 미정 product semantics
```

이 제한은 유효했다. 특히 과거 repository에서 source에 없는 fulfillment registry/version residue를 제거한 것은 올바른 fail-closed 조치였다.

이번 resolution은 그 과거 invented contract를 source-backed였다고 재해석하지 않는다. **후속 Commerce Architecture가 명시적인 새 domain authority를 채택하여 source silence를 닫는다.**

---

## 2. Adopted authority

Commerce Architecture v1은 **immutable versioned relational Product Capability Set**을 채택한다.

```text
Product
→ Product Capability Set(version/hash)
→ Capability Item(s)
→ Product Offer pins exactly one Capability Set
→ Purchase Intent v2 pins the same set/version/hash
→ verified receipt resolves historical Offer
→ grant(s)
```

### 2.1 Product Capability Set

Target authority:

```text
product_capability_sets
- id
- product_id
- definition_version
- definition_hash
- created_at
- retired_at nullable
```

Semantic content는 생성 후 immutable이다.

`retired_at`은 신규 Offer 배정을 막기 위한 monotonic operational retirement이며 `NULL → timestamp`만 허용하고 되돌릴 수 없다. Retirement는 historical purchase 의미를 바꾸지 않는다.

### 2.2 Capability Items

Target authority:

```text
product_capability_items
- capability_set_id
- item_key
- entitlement_key
- scope_mode          # global | fixed
- fixed_scope_key     # fixed only
- validity_mode       # unbounded | fixed_duration | provider_expiry
- duration_seconds    # fixed_duration only
```

v1에서 `fixed` scope는 server-owned/global content identity에만 사용할 수 있다.

다음은 v1에서 금지한다.

```text
client/request-derived arbitrary scope
user-owned resource ID를 client가 entitlement scope로 주입
REQUEST_RESOURCE 같은 범용 dynamic resolver
```

사용자 생성 resource에 대한 paid scope가 필요해지면 별도 Product/Commerce architecture delta와 server-owned resolver가 필요하다.

### 2.3 Offer pin

`product_offers`는 정확히 하나의 Capability Set을 pin한다.

강제 관계:

```text
product_offer.product_id
= product_capability_set.product_id
```

Provider/platform/external-product/product/capability-set mapping은 historical identity다. 기존 Offer/SKU를 새 rights 의미로 repoint하지 않는다.

Rights semantics가 바뀌면:

```text
new Capability Set
+ new Offer/provider product mapping
```

을 생성한다.

### 2.4 Purchase Intent pin

기존 `cmd_create_purchase_intent_v1`의 minimal Offer snapshot 의미는 유지한다.

새 command/schema v2는 별도 immutable fields로 다음을 pin한다.

```text
capability_set_id
capability_snapshot_jsonb
capability_snapshot_hash
```

Minimum snapshot:

```text
capabilitySetId
definitionVersion
definitionHash
```

기존 `offer_snapshot_jsonb`에 새 의미를 조용히 끼워 넣지 않는다.

### 2.5 Grant source identity

v1 one-off paid purchase grant source identity:

```text
grant_key = 'receipt:' + commerce_receipts.id
```

Raw external transaction ID를 internal grant key로 노출하지 않는다.

한 verified purchase가 여러 Capability Item을 가지면 각 logical capability grant는 독립 row로 표현하되 **모든 mapped item effect는 한 authoritative DB transaction에서 all-or-neither**로 적용한다.

Subscription grant source identity는 MVP scope가 아니므로 이 resolution이 정의하지 않는다.

---

## 3. Historical reproducibility

Historical purchase는 mutable current catalog로 재해석하지 않는다.

```text
receipt
→ immutable Product Offer
→ immutable Capability Set id/version/hash
→ immutable Capability Items
```

Restore도 같은 chain을 재사용한다.

`products.metadata_jsonb`는 Product→Capability mapping authority가 아니다.

Capability Set hash는 versioned canonical representation을 대상으로 service가 계산하고, DB는 pinned ID/version/hash parity와 relational mapping을 강제한다. Exact canonicalization implementation은 migration/command contract에서 고정하되 같은 version에서 변경할 수 없다.

---

## 4. Migration constraints

Current schema에서 additive migration한다.

```text
expand nullable structures
→ inspect existing offers/receipts
→ backfill only when historical mapping is explicitly provable
→ verify hashes/relationships
→ activate command v2
→ enforce non-null only for the activated commerce slice
→ contract obsolete path only after evidence
```

기존 verified receipt가 존재한다면 현재 Product 의미를 근거 없이 historical Capability Set으로 추론해서 backfill하지 않는다. Mapping proof가 없으면 해당 row는 review/quarantine 대상이다.

필수 relational enforcement:

- Capability Set `(id, product_id)` unique target
- Offer `(capability_set_id, product_id)` composite FK
- Capability Set semantic fields immutable
- retirement monotonic
- Offer `capability_set_id` immutable once assigned
- Capability Item semantic fields immutable
- Purchase Intent v2 capability pin immutable

---

## 5. Verification gate

- verified purchase maps only to pinned Capability Set
- unknown/unmapped Offer → no grant
- mismatched Product↔Capability Set → DENY
- Capability Set version/hash mismatch → DENY
- old purchase is not reinterpreted after new Capability Set release
- same provider SKU/Offer cannot be repointed to new rights
- client cannot inject entitlement key/scope
- v1 dynamic request-derived paid scope → DENY
- one Product with multiple items applies all-or-neither
- restore resolves same historical receipt/Offer/Capability Set
- duplicate receipt produces no duplicate logical grant

---

## 6. Remaining independent decisions

This resolution does **not** decide:

```text
P0-CM-01 provider rail
actual launch Product/SKU
price
subscription
refund 후 generated artifact access policy
P0-PR-01 evidence retention
```

These remain independent implementation/product gates, not SRC-18 blockers.
