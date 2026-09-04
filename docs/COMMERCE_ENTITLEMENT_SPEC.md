# 명하 Commerce / Entitlement Implementation Specification v0.6

> Product: **명하 (MyeongHa)**  
> Date: **2026-09-05**  
> Architecture Authority: `docs/architecture/COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`  
> Status: **DERIVED IMPLEMENTATION SPEC / ARCHITECTURE CLOSED / IMPLEMENTATION HOLD**  
> Rule: 이 문서는 Architecture를 요약해 구현 경계를 연결하는 companion이다. 충돌 시 `COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`가 우선한다.

---

## 1. 현재 판정

```text
Commerce Architecture                         = CLOSED
SRC-18 Product → Capability authority         = RESOLVED BY ARCHITECTURE
SRC-21 Grant apply / aggregate authority      = RESOLVED BY ARCHITECTURE
P0-CM-01 provider rail                        = OPEN-P0
launch paid Product / Capability catalog      = OPEN PRODUCT DECISION
P0-PR-01 provider-evidence retention subset   = OPEN before real evidence persistence
provider adapter / webhook / apply runtime    = NOT IMPLEMENTED
```

따라서 이 문서는 provider SDK, webhook route, production schema mutation을 허가하지 않는다.

---

## 2. Authoritative flow

```text
MyeongHa Product
→ immutable Product Capability Set(version/hash)
→ Product Offer(provider/platform/external product + pinned Capability Set)
→ Member-owned Purchase Intent
→ server-side provider verification
→ verified Receipt / Provider Event provenance
→ Entitlement Effect v1
→ independent Entitlement Grant(s)
→ append-only Entitlement Event(s)
→ Effective Entitlement projection
→ Access Gate
```

금지:

```text
client payment success → entitlement
provider SKU → entitlement_key
client subject/price/capability/scope → authority
current mutable catalog → historical purchase reinterpretation
```

---

## 3. Current implemented baseline

현재 repository는 다음을 실제 구현한다.

### DB schema

```text
products
product_offers
commerce_account_links
purchase_intents
commerce_receipts
commerce_provider_events
entitlement_grants
entitlement_events
entitlements
```

### Hardening

- Product Offer provider/platform/product mapping immutability
- Member-only Purchase Intent
- provider-account owner/provider consistency
- receipt owner/provider/Offer consistency
- provider transaction/event dedupe
- verified receipt/provider-event source requirement
- entitlement event append-only
- grant/projection logical identity constraints

### Commands / reads

```text
cmd_create_purchase_intent_v1
qry_entitlements_v1
```

`cmd_create_purchase_intent_v1`은 현재 minimal Offer mapping만 pin하며 receipt/grant를 만들지 않는다.

### Missing runtime

```text
provider verification adapter
public Commerce payment handoff route
provider webhook/server-notification route
verified receipt → grant/event/projection apply command
reconciliation runtime
```

---

## 4. Product → Capability — SRC-18 RESOLVED

Current Architecture가 다음 relational authority를 채택한다.

### Product Capability Set

```text
product_capability_sets
- id
- product_id
- definition_version
- definition_hash
- created_at
- retired_at
```

### Capability Item

```text
product_capability_items
- capability_set_id
- item_key
- entitlement_key
- scope_mode        # global | fixed
- fixed_scope_key
- validity_mode     # unbounded | fixed_duration | provider_expiry
- duration_seconds
```

v1에서는 client/request-derived dynamic scope를 허용하지 않는다.

### Historical pinning

Target:

```text
product_offers.capability_set_id
FK(capability_set_id, product_id)
→ product_capability_sets(id, product_id)
```

Offer가 pin한 Capability Set은 historical meaning이다. Existing provider SKU/Offer를 새 rights 의미로 repoint하지 않는다.

Purchase Intent v2는 기존 v1 Offer snapshot 의미를 변경하지 않고 별도 필드로 다음을 pin한다.

```text
capability_set_id
capability_snapshot_jsonb
capability_snapshot_hash
```

minimum snapshot:

```text
capabilitySetId
definitionVersion
definitionHash
```

One-off paid grant source identity:

```text
grant_key = 'receipt:' + commerce_receipts.id
```

One Product가 여러 Capability Item을 부여하면 **all-or-neither**로 apply한다.

---

## 5. Purchase Intent

Current v1 safe baseline:

```text
active Member only
server-owned canonical subjects.id
selected enabled/non-retired Product + Offer
optional same-owner/same-provider active account link
immutable minimal Offer snapshot
same idempotency key + same canonical request → replay
same key + conflicting request → conflict
```

Client가 보낸 가격/통화/Product key/entitlement key/scope/subject ID는 authority가 아니다.

Target v2는 Section 4의 Capability Set pin을 추가하며 v1 replay/ownership semantics를 약화하지 않는다.

---

## 6. Provider verification

Client callback은 transport hint다.

Provider-specific verifier는 DB rights transaction 밖에서 applicable facts를 검증하고 provider-neutral `VerifiedCommerceEvidenceV1`으로 normalize한다.

Minimum semantic fields:

```text
provider / platform / environment
external transaction identity
original-chain identity when applicable
provider event identity when applicable
external product identity
current provider state
valid-until/effective/order provenance when applicable
server-resolved owner binding
evidence fingerprint
verifier revision
```

Sandbox evidence는 production grant를 만들 수 없다.

---

## 7. Provider Event ordering

`received_at` 또는 raw string lexical order를 semantic ordering으로 사용하지 않는다.

Selected provider adapter는 verified evidence와 persisted grant ordering provenance에 대해 다음을 판정해야 한다.

```text
NEWER
SAME
STALE
INCOMPARABLE
```

Apply는 grant revision/order provenance CAS를 사용한다.

```text
read revision/order
→ pure compare
→ lock
→ expected revision/order parity
→ mismatch: re-read/recompare
```

`STALE`/`INCOMPARABLE`은 rights mutation 없이 reconciliation 대상으로 남긴다.

---

## 8. Entitlement Effect / Grant transition — SRC-21 RESOLVED

Normalized effect vocabulary:

```text
granted
renewed
expired
revoked
restored
adjusted
```

MVP active effect는:

```text
targetValidFrom <= apply transaction as_of
```

을 요구한다. Future-active grant는 v1에서 금지한다.

Key transition:

- `granted`: verified source → active + authoritative validity window
- `renewed`: NEWER evidence → active; original `valid_from` 유지; authoritative `valid_until`로 replace
- `expired`: effective expiry → expired
- `revoked`: verified effective revoke/refund → revoked
- `restored`: verified historical ownership/current active state → same source lineage active
- `adjusted`: authenticated system/admin + explicit reason only

Provider reaffirmation이 material grant state를 바꾸지 않으면 entitlement event를 추가하지 않는다.

---

## 9. Effective Entitlement aggregate

One transaction captures:

```text
as_of = transaction_timestamp()
```

Contributing grant:

```text
status='active'
AND valid_from <= as_of
AND (valid_until IS NULL OR as_of < valid_until)
```

Aggregate:

```text
count = 0
→ inactive / active_grant_count=0 / effective_valid_until=NULL

count > 0 + any unbounded grant
→ active / effective_valid_until=NULL

count > 0 + all finite
→ active / effective_valid_until=MAX(valid_until)
```

한 grant revoke는 다른 independent contributor를 제거하지 않는다.

Projection revision은 material projection change에만 증가하고 exact no-op recompute는 revision/updated_at을 바꾸지 않는다.

Access는 stale sweeper 상태에도 fail-closed여야 한다.

```text
status='active'
AND active_grant_count > 0
AND (effective_valid_until IS NULL OR effective_valid_until > now())
```

---

## 10. Refund / Revoke / Restore

Refund/chargeback/revoke:

```text
verified original transaction lineage
→ revoked effect
→ only source-derived grant(s) revoked
→ aggregate remaining grants
```

Restore:

```text
verified Member
→ provider re-verification/restore
→ same historical receipt lineage
→ immutable Offer + Capability Set
→ idempotent missing grant/effect recovery
```

Restore는 arbitrary admin grant 생성 기능이 아니다.

Refund 후 이미 생성된 Reading/content artifact의 열람/삭제는 Product/UX OPEN DECISION이다.

---

## 11. Guest / Member

v1 Guest purchase는 금지한다.

```text
Guest
→ promotion completes
→ canonical active Member
→ Purchase Intent
```

Guest-owned purchase/receipt/grant를 만들지 않는다.

---

## 12. Subscription

**MVP 비범위**다.

현재 architecture는 다음 compatibility invariant만 유지한다.

```text
cancel requested != immediate entitlement inactive
```

실제 subscription을 선택하면 별도 provider/product decision이 lifecycle matrix를 확정한다.

---

## 13. Reconciliation

Webhook-only truth를 금지한다.

Reconciliation 대상:

- paid callback lost
- webhook lost/delayed
- provider verify success + DB fail
- unresolved/incomparable provider event
- same transaction conflicting evidence
- support-triggered provider re-verification
- periodic provider reconciliation where supported

Provider call은 DB mutation transaction 밖에서 수행하고 결과는 동일 authoritative apply command를 재사용한다.

---

## 14. Atomic apply target

```text
verified evidence outside DB tx
→ resolve immutable Offer/Capability Set
→ begin DB tx
→ lock source/grant target
→ revision/order CAS
→ dedupe/conflict
→ append material entitlement event
→ update only target grant
→ recompute effective entitlement from all contributors
→ outbox iff effective rights materially change
→ provider event processed marker where applicable
→ commit
```

Ledger/grant/projection/outbox partial commit은 허용하지 않는다.

---

## 15. Privacy / audit

Exact retention period는 `P0-PR-01`이다.

Implementation hard requirements:

- raw provider secret/bearer/Authorization을 business DB/log/response/trace에 노출하지 않음
- raw receipt/purchase token 저장 최소화; keyed/versioned fingerprint/reference 우선
- verified payload는 correctness/support 최소 필드만
- card number/CVV/raw PCI data 직접 저장 금지
- support는 Member→Intent→Offer/Capability Set→receipt/event→grant→entitlement event→effective entitlement chain을 재구축 가능해야 함

---

## 16. Current implementation gates

### Architecture-resolved

```text
SRC-18 = CLOSED by Commerce Architecture v1
SRC-21 = CLOSED by Commerce Architecture v1
```

### Still OPEN before provider-specific implementation

```text
P0-CM-01
→ actual Web / Apple / Google rail

OPEN PRODUCT
→ launch Product / Capability catalog

P0-PR-01 subset
→ real provider evidence retention/legal handling

selected-provider ordering proof
→ safe comparator or equivalent fail-closed reconciliation
```

---

## 17. Verification target

Implementation must cover at minimum:

```text
forged/unverified evidence → no rights
same transaction ×N → one source effect
same webhook ×N → one effect
conflicting same identity → conflict
concurrent same transaction → one effect
stale/out-of-order → no rollback
incomparable order → no mutation/reconcile
verify success/DB fail → retry-safe
DB success/response loss → replay-safe
multiple grants + one revoke → remaining access
expired wall-clock grant → no access
projection rebuild → deterministic same result
restore repeated → same receipt/grant
cross-account claim → deny
outbox retry → no rights reapply
```

---

## 18. Implementation status

```text
Architecture                                      = CLOSED
Product Capability Set schema                    = NOT IMPLEMENTED
Purchase Intent v2 Capability pin                = NOT IMPLEMENTED
provider-neutral verification runtime            = NOT IMPLEMENTED
concrete provider adapter                         = BLOCKED BY P0-CM-01
verified receipt → grant/event/projection command= NOT IMPLEMENTED
webhook/provider event runtime                    = NOT IMPLEMENTED
refund/revoke/restore runtime                     = NOT IMPLEMENTED
reconciliation runtime                            = NOT IMPLEMENTED
provider sandbox E2E                              = NOT IMPLEMENTED
production Commerce activation                    = NOT AUTHORIZED
```

`COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`의 implementation phases와 gates를 따른다.
