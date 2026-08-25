# 명하 Commerce / Entitlement Specification v0.3 — Full Audit

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.3**  
> Date: **2026-08-25**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0`, 비차단 선택은 `CANDIDATE`, source 간 충돌은 `SOURCE_AUTHORITY_GAPS.md`에 기록한다.

---

## 1. 목적

Web/iOS/Android 결제가 달라도 entitlement는 명하 서버가 최종 authority가 되도록 한다. Store rail은 `OPEN-P0: P0-CM-01`.

## 2. Authority Flow

```text
Product stable identity
→ ProductFulfillmentDefinition (provider-independent, versioned)
→ Product Offer (provider mapping)
→ Purchase Intent snapshot
→ Provider verification
→ Receipt / Provider Event provenance
→ Entitlement Grant lifecycle
→ Logical Entitlement projection
→ Access Gate
```

## 3. Product / Offer / Fulfillment 분리

- `products` = Myeongha saleable product stable identity
- `product_offers` = provider/platform/external product mapping
- `ProductFulfillmentDefinition` = 구매가 실제로 어떤 entitlement key/scope grant를 만드는지에 대한 provider-independent authority

`products.metadata_jsonb`는 display metadata이며 fulfillment authority가 아니다. Provider external product ID도 entitlement key가 아니다.

## 4. ProductFulfillmentDefinition

`SHARED_DOMAIN_CONTRACTS_SPEC.md`의 versioned registry가 authority.

```ts
interface ProductFulfillmentDefinition {
  productKey: string;
  version: string;
  grants: readonly {
    entitlementKey: string;
    scopeResolver: 'GLOBAL'|'REQUEST_RESOURCE'|'FIXED';
    fixedScopeKey?: string;
    grantClass: 'one_off'|'subscription'|'promo_compatible';
  }[];
}
```

Purchase Intent 생성 시 current offer mapping + fulfillment definition의 normalized snapshot/hash를 `offer_snapshot_jsonb/hash`에 pin한다.

검증 시 **현재 config를 다시 읽어 과거 purchase 권리를 재정의하지 않는다.**

## 5. Purchase Intent

Member only.

Intent snapshot 최소:

```text
productKey
productOfferId/provider/platform/externalProductId
fulfillmentDefinitionVersion
normalized grant definitions
requested resource scope material when required
request hash
```

같은 idempotency key + 다른 request → conflict.

## 6. Provider Account Link

Store/PSP lifecycle event를 subject에 resolve하기 위한 verified mapping. Raw external ID 대신 keyed fingerprint. revoked link automatic rebinding 금지.

## 7. Receipt Verification

Client success UI는 authority가 아니다.

서버 verification은 최소:

- transaction authenticity
- provider/platform
- product offer mapping
- purchase intent snapshot consistency where intent exists
- account/subject linkage

을 확인한다. Verified receipt만 grant source가 될 수 있다. `verified_payload_jsonb`의 validated schema에는 verifier/provider contract version 또는 동등한 verification-policy provenance를 포함해 당시 검증 규칙을 추적 가능하게 한다.

## 8. Provider Events

- provider + external_event_id dedupe
- subject mapping verified
- unresolved event → no entitlement effect
- `SRC-07` 해결 전 `resolution_source_type='manual'` production 사용 금지
- occurrence/order metadata preserve
- stale/out-of-order lifecycle event가 최신 grant를 rollback하지 못함

## 9. Grants

하나의 logical entitlement에 여러 independent source instance가 동시에 기여 가능.

```text
purchase grant A
promo grant B
subscription grant C
```

한 grant revoke가 다른 grant를 제거하지 않는다. `grant_key`는 source-instance identity다.

## 10. Entitlement Event Apply

```text
resolve verified source + pinned fulfillment snapshot
→ lock grant
→ reject stale provider order
→ append event
→ update grant projection
→ recompute logical entitlement from all valid grants
→ outbox
→ commit
```

Event ledger append-only.

## 11. Effective Entitlement

```text
status='active'
AND active_grant_count > 0
AND (effective_valid_until IS NULL OR effective_valid_until > now())
```

Sweeper 지연이 접근 기간을 연장하면 안 된다.

## 12. Resource-scoped Paid Reading / Content

`scopeResolver='REQUEST_RESOURCE'`인 product는 Purchase Intent 시 server가 owner-authorized resource를 resolve하고 immutable scope key를 snapshot에 넣는다.

예:

```text
paid detailed reading → reading/report resource scope
episode unlock         → episode/content scope
```

Client가 arbitrary scope_key를 넣어 다른 paid resource를 unlock하면 안 된다.

## 13. Restore

Restore = provider ownership + transaction/subscription lineage reconciliation + missing verified provenance ingest + grant recompute. 임의 grant 생성 기능 아님.

## 14. Guest

Guest purchase 금지. 구매 전 Member identity 필요.

## 15. Platform Policy

`OPEN-P0: P0-CM-01`. 결정 시 Web/Apple/Google별:

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
- product offer만 검증하고 fulfillment snapshot 없이 grant 생성 → deny
- client supplied scope without server resolution → deny

## 17. Verification

- duplicate receipt/webhook → once
- unresolved provider event → no entitlement
- offer verified but fulfillment version missing → deny
- purchase snapshot grant definition altered → hash mismatch deny
- resource scope belongs to another subject → deny
- overlapping grants A+B, revoke A → active by B
- all grants expired → immediate deny
- out-of-order old event → no rollback
- restore reconciliation idempotent
- guest purchase → deny
