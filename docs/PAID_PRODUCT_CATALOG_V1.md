# MyeongHa Paid Product Catalog V1 — General Natal Deep Reading

> **SUPERSEDED / HISTORICAL CANDIDATE — DO NOT USE AS CURRENT PRODUCT AUTHORITY**  
> Commerce v2 current first Standard Product authority is `docs/STANDARD_LOVE_RELATIONSHIP_PRODUCT_V1.md` (`standard.love_relationship`).  
> Migration `1120_paid_general_natal_product_candidate.sql` remains immutable history; migration `1130_standard_love_relationship_reader_authority.sql` forward-retires this candidate.

> Repository: `gycha0109-beep/MyeongHa`
> Tracking: #1027
> Status: **PRODUCT AUTHORITY DEFINED / NOT SALEABLE / ACTIVATION HOLD**
> Product key: `saju.general_natal.deep.v1`
> Consumer name: **명하 정밀 원국 리포트**
> Rail: Web + PortOne V2 + one-off
> Price authority: **KRW 9,900**
> Upstream gate: `gycha0109-beep/Saju/docs/product/22-production-interpretation-authority-audit.md`

## 1. Decision

The first paid MyeongHa Product is the **General Natal Deep Reading V1**.

This decision deliberately does not activate checkout. Current Saju main still reports:

```text
PRODUCTION INTERPRETATION AUTHORITY = BLOCKED
PUBLIC PRODUCTION READING RUNTIME   = BLOCKED
```

Therefore this repository may define immutable Product / Capability / Offer / Price authority now, but the Product and Offer remain disabled until the upstream interpretation gate and the downstream paid-artifact delivery gates are independently proven.

## 2. Product contract

```yaml
Product:
  id: 11200000-0000-0000-0000-000000000001
  key: saju.general_natal.deep.v1
  name: 명하 정밀 원국 리포트
  version: v1
  product_type: reading

  target_user:
    canonical self Birth Profile이 있고
    무료 명식/첫 grounded overview보다 더 깊은
    general + natal 해석을 장기적으로 읽고 싶은 사용자

  core_value:
    source-authorized general-natal 의미를
    더 깊은 구성, 더 넓은 section, 개인화 조합,
    narrative quality, 시각적 presentation,
    저장/재열람 가능한 reading artifact로 제공

  free_vs_paid_boundary:
    free:
      - Birth Profile 생성/저장
      - canonical Saju calculation facts
      - 명식 네 기둥 / 일간 / 오행 분포 / ambiguity 등 계산 사실
      - upstream production interpretation authority가 열리면 최초 grounded overview
    paid:
      - 같은 authoritative general+natal claim/evidence의 deep composition
      - long-form structured sections
      - richer cross-section synthesis without new Saju semantics
      - persistent versioned reading artifacts and reread UX

  authoritative_sources:
    - Saju general + natal production-authorized interpretation only
    - MyeongHa must not create missing T8 claims
    - Character runtime may render but must not change Saju semantic truth

  purchase_type: one_off
  repeat_purchase_policy:
    same product version + active entitlement => deny duplicate purchase
  regeneration_policy:
    active entitlement may regenerate for a new canonical self Birth revision
    failed/incomplete generation may retry without another purchase
    successful historical artifacts are immutable and remain version-addressable

  ownership: server-resolved subjects.id

  price:
    amount_minor: 9900
    currency: KRW
    terms_version: krw-9900-v1

  capability:
    item_key: general-natal-deep-access
    entitlement_key: reading.saju.general_natal.deep.v1
    scope_mode: global
    validity_mode: unbounded

  entitlement_duration: permanent until a governed revoke/refund effect

  refund_effect:
    revoke only the purchase-backed grant
    paid artifact rows/provenance are not destructively rewritten
    paid artifact access is denied after no active grant remains
    exact data destruction/retention follows P0-PR-01

  version_migration_policy:
    v1 purchases keep v1 semantics
    future v2 requires a new Product/Capability/Offer identity
    historical v1 artifacts are never reinterpreted through mutable current config
```

## 3. Why General Natal first

The current Saju production-interpretation audit explicitly names **general natal** as the smallest honest production-unblock path. Career, Wealth, Relationship, Annual, Compatibility, and Question-specific surfaces require their own governed T8/T9/T10/T11 coverage and are not bundled into this first paid Product merely for monetization.

Commerce therefore consumes only future upstream authority; it does not manufacture it.

## 4. Capability semantics

The existing Commerce architecture allows only `global` or server-owned `fixed` scopes. A client/request-derived reading artifact id is not an authorized entitlement scope.

Accordingly V1 sells a permanent account-level capability:

```text
reading.saju.general_natal.deep.v1
```

rather than pretending the current schema already supports a per-artifact paid ownership scope.

The capability grants the right to generate and reread the V1 Deep General Natal experience for the canonical self Birth Profile. Artifact identity remains in the Reading lifecycle, not in client-controlled entitlement scope.

### Capability definition hash

The Capability Set definition hash is SHA-256 over the UTF-8 bytes of this exact canonical JSON (no trailing newline):

```json
{"definitionVersion":"v1","items":[{"durationSeconds":null,"entitlementKey":"reading.saju.general_natal.deep.v1","fixedScopeKey":null,"itemKey":"general-natal-deep-access","scopeMode":"global","validityMode":"unbounded"}],"productKey":"saju.general_natal.deep.v1"}
```

Result:

```text
sha256:f2843708cb1d42e1e1e08d9cad0a4117ac6438f01c62a11f193e0fb79ea3fcf4
```

`products.metadata_jsonb` is descriptive catalog metadata only. Product→Capability rights authority remains the immutable relational Capability Set/Item rows.

## 5. Artifact contract

Existing MyeongHa Reading persistence already has immutable response provenance:

```text
reading_sessions
→ readings
→ reading_execution_attempts
→ reading_refs.response_snapshot_jsonb / response_hash
→ reading_groundings
```

For this paid Product:

```text
active entitlement
+ canonical self Birth revision
+ general+natal Product contract
→ governed Reading execution
→ immutable persisted Reading response
→ owner-scoped reread
```

Current runtime does **not yet** prove the complete paid Product↔Reading binding or full paid-artifact reread authorization path. Those are activation blockers; this catalog definition does not claim otherwise.

## 6. Generation failure

Payment evidence and entitlement remain separate from artifact generation.

A verified payment may grant the capability even if generation later fails. Generation failure must be retryable under the same active entitlement and must not require a second charge.

No browser callback or PortOne SDK result may grant this capability.

## 7. Refund semantics

For this one-off permanent capability:

```text
refund / verified reversal
→ revoke the purchase-backed entitlement grant
→ effective entitlement recompute
→ if no independent active grant remains, paid access closes
```

Existing generated artifacts remain immutable provenance. They are not deleted or rewritten as a refund side effect. Their user-visible paid access closes when entitlement becomes inactive. Legal/privacy retention and later destructive deletion remain governed by the still-open `P0-PR-01`.

## 8. Catalog activation state

Migration `1120_paid_general_natal_product_candidate.sql` creates:

- immutable Product identity
- immutable Product Capability Set V1
- one unbounded global Capability Item
- Web / PortOne V2 Offer mapping
- immutable KRW 9,900 charge terms

but intentionally sets:

```text
products.enabled       = false
product_offers.enabled = false
```

This is a fail-closed catalog authority, not a sale activation.

## 9. Activation gates

All of the following must be green before enabling this Product/Offer:

1. Saju real production interpretation pack for `general + natal`.
2. Public production Reading runtime authorized beyond calculation-only P0-SA-01.
3. Product↔Reading execution contract pinned to this Product version.
4. Entitlement-gated generation and full artifact reread path.
5. Same-version duplicate-purchase prevention against active entitlement.
6. Verified Payment → Entitlement fulfillment E2E for this exact Capability Set.
7. PortOne TEST Store/Channel browser SDK Sandbox E2E.
8. Failure/retry proof: payment success + generation failure does not double-charge.
9. Refund/revoke artifact-access behavior tested.
10. Fresh-main / exact-head CI / authority review.

Until then:

```text
P0-CM-03 = OPEN-P0
Product authority = DEFINED
Saleable Product = NO
```

## 10. Non-goals

This decision does not:

- enable `@portone/browser-sdk`
- mount public checkout
- enable a LIVE Store/Channel
- activate webhook/public Commerce routes
- invent Saju rules or promote research rules
- include Career/Wealth/Relationship/Annual/T10/T11 in the paid SKU
- decide P0-PR-01 retention
- implement refund/cancellation provider lifecycle
