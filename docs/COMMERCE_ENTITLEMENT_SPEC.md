# 명하 Commerce / Entitlement Specification v0.4 — Source Aligned

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.4**  
> Date: **2026-08-28**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0` 또는 `SOURCE_AUTHORITY_GAPS.md`에 남기며 Pack이 새 authority를 만들지 않는다.

---

## 1. 목적

Web/iOS/Android 결제가 달라도 entitlement는 명하 서버가 최종 authority가 되도록 한다.

두 개의 독립 blocker를 구분한다.

```text
P0-CM-01
→ Web / Apple / Google provider rail 및 product-type matrix

SRC-18
→ verified purchased product를 entitlement_key/scope/grant로 변환하는 source authority
```

## 2. Source-Backed Authority Flow

```text
Product stable identity
→ Product Offer immutable provider/platform mapping
→ Purchase Intent immutable minimal offer mapping snapshot
→ Provider verification
→ Receipt / Provider Event provenance
→ [SRC-18: governed Product → Entitlement mapping]
→ Entitlement Grant lifecycle
→ Logical Entitlement projection
→ Access Gate
```

`SRC-18` 해결 전 마지막 네 단계 중 **purchase provenance를 concrete entitlement grant로 변환하는 mutation**은 production authority로 승격하지 않는다.

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

단, **verified receipt가 어떤 entitlement를 발급해야 하는지는 SRC-18 해결 전 확정하지 않는다.**

## 8. Provider Events

- provider + external_event_id dedupe
- verified subject resolution
- unresolved event → no entitlement effect
- `SRC-07` 해결 전 `resolution_source_type='manual'` production 사용 금지
- occurrence/order metadata preserve
- stale/out-of-order lifecycle event가 최신 grant를 rollback하지 못하도록 source-defined ordering provenance를 보존

Provider event가 실제 entitlement effect를 만들기 위해서는 추가로 `SRC-18` product→grant authority가 필요하다.

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
```

하나의 logical entitlement에 여러 independent source instance가 동시에 기여할 수 있다.

```text
purchase grant A
promo grant B
subscription grant C
```

한 grant revoke가 다른 valid grant를 제거하지 않는다.

이 구조는 source-backed이지만, purchased product에서 이 필드들을 **어떻게 산출하는지**는 SRC-18이다.

## 10. Entitlement Event Apply

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

이 skeleton을 구현할 수 있다는 것과 product→grant semantic resolver가 정의됐다는 것은 별개다.

`SRC-18` 해결 전 purchase/provider source에 대한 concrete grant apply command는 production-authoritative가 아니다.

## 11. Effective Entitlement

Source-backed current-access rule:

```text
status='active'
AND active_grant_count > 0
AND (effective_valid_until IS NULL OR effective_valid_until > now())
```

Sweeper 지연이 접근 기간을 연장하면 안 된다.

## 12. Resource-Scoped Paid Reading / Content

Use Case는 유료 Reading/content 구매를 요구하지만 source는 product→resource scope resolution algorithm을 정의하지 않는다.

따라서 다음을 Pack이 임의 확정하지 않는다.

```text
REQUEST_RESOURCE 같은 resolver enum
client-supplied arbitrary scope acceptance
product type별 fixed/global/resource mapping
```

Cross-subject resource unlock은 항상 deny해야 하며, exact scope mapping authority는 SRC-18 resolution에 포함되어야 한다.

## 13. Restore

Restore는 provider ownership + transaction/subscription lineage reconciliation + missing verified provenance ingest를 의미한다. 임의 grant 생성 기능이 아니다.

Provider rail/restore mechanics는 `P0-CM-01`; verified historical source를 어떤 grant로 복원하는지는 `SRC-18`이다.

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
- forged/unverified receipt → no grant
- cross-user receipt/account link → deny
- unknown/unresolved product→entitlement mapping → no grant
- client supplied scope만으로 paid resource unlock 금지
- current mutable offer/cache state로 historical purchase entitlement를 재해석하지 않음

## 17. Verification

Source-complete now:

- guest purchase deny
- Purchase Intent same key/same request replay
- same key/different request conflict
- immutable minimal offer mapping snapshot validation
- provider account link owner/provider/status validation
- duplicate receipt/provider event dedupe
- unresolved provider event → no effect
- overlapping already-authoritative grants read/recompute invariants
- expiry immediate deny
- out-of-order source cannot rollback newer grant state

Blocked pending `SRC-18`:

- purchased product → exact entitlement key/scope/grant mapping
- resource-scoped product grant resolution
- historical mapping-version replay after mapping changes
- restore → concrete missing grant reconstruction

Blocked/additionally gated by `P0-CM-01`:

- provider-specific payment/receipt/restore production rail.
