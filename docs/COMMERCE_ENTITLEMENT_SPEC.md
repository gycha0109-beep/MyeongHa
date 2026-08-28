# 명하 Commerce / Entitlement Specification v0.5 — Source Aligned

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.5**  
> Date: **2026-08-28**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0` 또는 numbered source-gap 문서에 남기며 Pack이 새 authority를 만들지 않는다.

---

## 1. 목적

Web/iOS/Android 결제가 달라도 entitlement는 명하 서버가 최종 authority가 되도록 한다.

세 개의 독립 blocker를 구분한다.

```text
P0-CM-01
→ Web / Apple / Google provider rail 및 product-type matrix

SRC-18
→ verified purchased product를 entitlement_key/scope/grant_key target으로 변환하는 source authority

SRC-21
→ 이미 authoritative한 grant target/event를 grant projection에 적용하고 여러 grant를 logical entitlement로 합성하는 transition/aggregation authority
```

## 2. Source-Backed Authority Flow

```text
Product stable identity
→ Product Offer immutable provider/platform mapping
→ Purchase Intent immutable minimal offer mapping snapshot
→ Provider verification
→ Receipt / Provider Event provenance
→ [SRC-18: governed Product → Grant target mapping]
→ [SRC-21: Entitlement event apply + grant transition + aggregate recompute]
→ Logical Entitlement projection
→ Access Gate
```

ERD는 grant/event/projection 구조와 transaction **skeleton**을 고정한다. Source가 끝까지 정의하지 않은 target mapping 또는 transition/aggregation 식을 Pack이 채우지 않는다.

## 3. Product / Offer Authority

- `products` = Myeongha saleable product stable identity.
- `product_offers` = provider/platform/external-product mapping.
- `(id, provider, external_product_id, product_id)`는 ERD가 지정한 purchase snapshot verification target이다.
- provider/platform/external-product/product mapping은 생성 후 immutable이다.
- `currency`, `display_price_minor`, `price_cache_updated_at`, enabled/retirement 상태는 immutable purchase-right semantics로 재해석하지 않는다.
- `products.metadata_jsonb`는 source에서 product→entitlement mapping authority로 정의되지 않았다.

## 4. Product → Entitlement Mapping — `SRC-18`

Primary source는 다음을 정의하지 않는다.

```text
product_id/product_key → entitlement_key
resource/global scope resolution
grant_key derivation
one product → multiple grants semantics
historical mapping version/provenance
mapping authority storage form
```

따라서 기존 Pack이 도입했던 `ProductFulfillmentDefinition`, `fulfillmentDefinitionVersion`, `scopeResolver`, `grantClass`, normalized grant-definition snapshot은 **source-backed contract가 아니다**.

동등한 계약이 source authority에서 채택되기 전에는 구현하지 않는다.

## 5. Purchase Intent

Member only.

ERD source가 정의한 safe baseline:

```text
subject_id
product_offer_id
optional provider_account_link_id
idempotency_key
request_hash
offer_snapshot_jsonb   # immutable minimal offer mapping snapshot
offer_snapshot_hash    # version-prefixed digest
status
```

현재 source-backed minimal snapshot은 선택된 offer의 immutable mapping identity만 담는다.

```text
productOfferId
productId
platform
provider
externalProductId
```

같은 idempotency key + 같은 canonical request → 기존 intent replay.  
같은 idempotency key + 다른 request hash → conflict.

표시 가격/통화 cache를 historical entitlement semantics로 pin했다고 주장하지 않는다.

## 6. Provider Account Link

Store/PSP lifecycle event를 subject에 resolve하기 위한 verified mapping이다.

- raw external account ID 대신 keyed fingerprint 사용.
- active link uniqueness 유지.
- purchase intent에 link가 pin되면 owner와 provider가 selected offer와 일치해야 한다.
- revoked link를 같은 row에서 자동 재활성화하지 않는다.

## 7. Receipt Verification

Client success UI는 authority가 아니다.

서버 verification은 source-defined 범위에서 최소 다음 provenance/integrity를 확인한다.

- transaction authenticity
- provider/platform
- resolved product offer mapping
- Purchase Intent snapshot consistency where intent exists
- account/subject linkage where applicable
- provider transaction dedupe

Verified receipt만 이후 authoritative commerce source 후보가 될 수 있다.

단, verified receipt에서 실제 entitlement mutation까지 가려면:

```text
SRC-18 → grant target resolution
SRC-21 → event/grant/projection transition
```

이 모두 필요하다.

## 8. Provider Events

- provider + external_event_id dedupe
- verified subject resolution
- unresolved event → no entitlement effect
- `SRC-07` 해결 전 `resolution_source_type='manual'` production 사용 금지
- occurrence/order metadata preserve
- source는 stale/out-of-order provider event가 최신 grant를 rollback하면 안 된다고 요구한다.

하지만 **provider-specific stale-order comparator 자체는 source가 정의하지 않는다.** `provider_ordering_key`, `effective_at`, provider occurred time의 비교 우선순위를 Pack이 lexical/timestamp 규칙으로 발명하지 않는다. 이 apply-time transition 문제는 `SRC-21`; provider rail semantics는 추가로 `P0-CM-01`이다.

## 9. Grants

ERD가 정의하는 grant model:

```text
entitlement_key
scope_key
grant_key
grant_source_type
status
valid_from / valid_until
revision
last_effective_at
last_provider_ordering_key
```

하나의 logical entitlement에 여러 independent source instance가 동시에 기여할 수 있다.

```text
purchase grant A
promo grant B
subscription grant C
```

한 grant revoke가 다른 grant row를 제거하지 않는다.

이 **구조와 독립성**은 source-backed이다. 그러나:

```text
purchased product → 이 grant identity 산출 = SRC-18
event → grant field transition            = SRC-21
```

이다.

## 10. Entitlement Event Apply — skeleton source-backed, executable semantics `SRC-21`

ERD가 고정한 transaction skeleton:

```text
verified receipt/provider event
→ resolve subject + grant_key
→ lock/upsert grant
→ reject stale provider order
→ append entitlement_event
→ update grant projection
→ recompute logical entitlement from ALL valid grants
→ outbox
→ commit
```

Source가 **정한 것**:

- event ledger는 append-only;
- event가 grant owner/key/scope와 일치해야 함;
- receipt/provider-event source provenance가 verified여야 함;
- one grant의 변경이 다른 independent grant를 삭제하지 않음;
- logical entitlement는 grants에서 파생됨;
- 위 mutation 순서는 atomic해야 함.

Source가 **정하지 않은 것**은 `SRC-21`이다.

### 10.1 Event transition gap

`granted | renewed | expired | revoked | restored | adjusted` 각각이 다음을 어떻게 바꾸는지 완전한 transition table이 없다.

```text
status
valid_from
valid_until
revision
last_effective_at
last_provider_ordering_key
```

`payload_jsonb`의 event-type별 versioned schema도 없다.

### 10.2 Provider ordering gap

Stale provider order를 reject하라고만 되어 있고 comparator/precedence가 없다. 따라서 `provider_ordering_key` 문자열 비교나 `effective_at` 우선순위를 DB에서 임의 결정하지 않는다.

## 11. Logical Entitlement Aggregation — `SRC-21`

ERD projection shape:

```text
status                  # active | inactive
active_grant_count
effective_valid_until
revision
```

Source-backed access check:

```text
status='active'
AND (effective_valid_until IS NULL OR effective_valid_until > now())
```

이 clock-expiry fail-closed rule은 그대로 유지한다.

그러나 `ALL valid grants`가 executable predicate/aggregation formula로 정의되어 있지 않다.

### Missing

- contributing grant predicate: `status`, `valid_from`, `valid_until`의 정확한 조합;
- future `valid_from` 처리;
- `active_grant_count`가 status-active row인지 wall-clock-valid active grant인지;
- 여러 finite `valid_until`의 집계식;
- finite + unbounded(`valid_until NULL`) 혼합 시 `effective_valid_until`;
- aggregation `as_of` 시간 authority;
- first projection row 생성/ID authority;
- revision/no-op update semantics;
- entitlement-change outbox schema/dedupe.

직관적인 `MAX(valid_until)` 또는 NULL-wins 규칙도 source 문장이 아니므로 임의 승격하지 않는다.

## 12. Resource-Scoped Paid Reading / Content

Use Case는 유료 Reading/content 구매를 요구하지만 source는 product→resource scope resolution algorithm을 정의하지 않는다.

따라서 다음을 Pack이 임의 확정하지 않는다.

```text
REQUEST_RESOURCE 같은 resolver enum
client-supplied arbitrary scope acceptance
product type별 fixed/global/resource mapping
```

Cross-subject resource unlock은 항상 deny해야 하며, exact scope mapping authority는 `SRC-18` resolution에 포함되어야 한다.

## 13. Restore

Restore는 provider ownership + transaction/subscription lineage reconciliation + missing verified provenance ingest를 의미한다. 임의 grant 생성 기능이 아니다.

```text
provider rail/restore mechanics             = P0-CM-01
verified historical product → grant target = SRC-18
grant restore event/aggregate transition    = SRC-21
```

모두 필요한 범위가 해결되어야 concrete access mutation이 가능하다.

## 14. Guest

Guest purchase 금지. 구매 전 Member identity 필요.

## 15. Platform Policy

`OPEN-P0: P0-CM-01`.

결정 시 Web/Apple/Google별:

- digital goods applicability
- one-off reading
- episode/content unlock
- subscription/bundle
- restore/refund/revoke
- webhook/server notification authority

를 matrix로 고정한다.

## 16. Security

- raw receipt/token/provider secret 최소화/금지
- client entitlement write 금지
- forged/unverified receipt → no grant/event
- cross-user receipt/account link → deny
- unknown/unresolved product→entitlement mapping → no grant
- unresolved grant-event transition/aggregation → no authoritative access mutation
- client supplied scope만으로 paid resource unlock 금지
- current mutable offer/cache state로 historical purchase entitlement를 재해석하지 않음
- stale projection의 expired `effective_valid_until`이 access를 연장하지 않음

## 17. Verification

### Source-complete now

- guest purchase deny
- Purchase Intent same key/same request replay
- same key/different request conflict
- immutable minimal offer mapping snapshot validation
- provider account link owner/provider/status validation
- duplicate receipt/provider event relational dedupe
- unresolved provider event → entitlement event source deny
- forged/unverified receipt → entitlement event source deny
- entitlement event append-only / grant owner-key-scope FK
- multiple independent grant rows coexist structurally
- one logical entitlement projection row per owner/key/scope
- projection shape active↔count constraints
- current entitlement read
- expired `effective_valid_until` must be denied by access check even if sweeper lags

The existing commerce negative test manually simulates an overlapping-grant projection update; it demonstrates representability, **not an authoritative recompute algorithm**.

### Blocked pending `SRC-18`

- purchased product → exact entitlement key/scope/grant target
- resource-scoped product grant resolution
- historical product→grant mapping version replay

### Blocked pending `SRC-21`

- event-type payload/transition apply
- stale provider-order comparator
- future `valid_from` behavior
- exact contributing-grant predicate
- `active_grant_count` recompute formula
- `effective_valid_until` aggregation
- projection revision/no-op semantics
- entitlement-change outbox contract

### Additionally gated by `P0-CM-01`

- provider-specific payment/receipt/restore production rail.

## 18. Full Purchase→Access Completion

```text
Purchase Intent create                      = implemented source-complete baseline
verified source provenance constraints      = source-complete structural baseline
product → grant target                      = SRC-18
entitlement event transition + aggregation  = SRC-21
provider/store lifecycle                    = P0-CM-01
```

`SRC-18`만 해결되었다고 full commerce path를 완료로 판정하지 않는다.
