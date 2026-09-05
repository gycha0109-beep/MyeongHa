# 명하 Commerce / Entitlement Implementation Specification v0.11

> Product: **명하 (MyeongHa)**  
> Date: **2026-09-05**  
> Architecture Authority: `docs/architecture/COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`  
> Launch Rail Decision: `docs/COMMERCE_LAUNCH_RAIL_DECISION_V1.md`  
> Evidence Minimization Decision: `docs/COMMERCE_EVIDENCE_DATA_MINIMIZATION_DECISION_V1.md`  
> Status: **DERIVED IMPLEMENTATION SPEC / ARCHITECTURE CLOSED / LAUNCH RAIL DECIDED / EVIDENCE MINIMIZATION DECIDED / FINGERPRINT PRIMITIVE IMPLEMENTED / EVIDENCE STRUCTURAL CONTRACT IMPLEMENTED / ENTITLEMENT EFFECT STRUCTURAL CONTRACT IMPLEMENTED / IMPLEMENTATION HOLD**  
> Rule: 이 문서는 Architecture와 이후 explicit P0 decision을 요약해 구현 경계를 연결하는 companion이다. Domain semantics 충돌 시 Architecture가 우선하고, Architecture 작성 뒤 결정된 P0 status는 최신 `docs/P0_DECISION_REGISTER.md`와 해당 decision record가 우선한다.

---

## 1. 현재 판정

```text
Commerce Architecture                         = CLOSED
SRC-18 Product → Capability authority         = RESOLVED BY ARCHITECTURE
SRC-21 Grant apply / aggregate authority      = RESOLVED BY ARCHITECTURE
P0-CM-01 launch rail                          = DECIDED: Web + one-off only
P0-CM-02 exact Web PSP                        = OPEN-P0
P0-CM-03 launch paid Product / Capability     = OPEN-P0 / BLOCKED BY CURRENT SAJU AUTHORITY
P0-PR-01 parent retention/legal/backup        = OPEN-P0
P0-PR-01B provider-evidence minimization      = DECIDED
provider-neutral evidence fingerprint primitive = IMPLEMENTED / PURE HELPER / NOT WIRED TO PROD CONFIG
provider-neutral evidence structural contract = IMPLEMENTED / PURE VALIDATOR / NO PROVIDER AUTHENTICITY
provider-neutral entitlement effect contract  = IMPLEMENTED / PURE VALIDATOR / NO APPLY RUNTIME
provider adapter / webhook / apply runtime    = NOT IMPLEMENTED
```

따라서 Web-first rail shape와 provider-evidence 최소화 경계, provider-neutral fingerprint primitive, `VerifiedCommerceEvidenceV1` structural contract, `EntitlementEffectV1` structural/static-transition contract는 준비됐지만 provider authenticity verification, provider ordering, apply-time entitlement semantics, event dedupe generation, adjusted actor authentication, provider SDK, provider-specific canonical serializer, webhook route, production schema mutation, enabled paid catalog, production evidence persistence는 아직 허가되거나 구현되지 않았다.

---

## 2. Authoritative flow

```text
MyeongHa Product
→ immutable Product Capability Set(version/hash)
→ Product Offer(provider/platform/external product + pinned Capability Set)
→ Member-owned Purchase Intent
→ server-side provider verification
→ minimized verified Receipt / Provider Event provenance
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
raw provider SDK object → persistence authority
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

### Provider-neutral security primitive

```text
apps/api/src/production-commerce-evidence-fingerprint.ts
```

현재 구현 범위:

- HMAC-SHA-256
- `hmac-sha256:k1:<64 lowercase hex>`
- Commerce 전용 32 UTF-8 byte 이상 secret contract
- receipt / provider-event payload / provider-account domain separation
- canonical evidence bytes 입력의 deterministic fingerprint
- unsupported domain / weak secret / non-byte input fail-closed

이 helper는 provider-specific canonicalization, environment binding, DB persistence, verifier, webhook 또는 entitlement mutation을 수행하지 않는다.

### Provider-neutral evidence structural contract

```text
apps/api/src/verified-commerce-evidence.ts
test/verified-commerce-evidence.test.ts
```

현재 구현 범위:

- exact `commerce-evidence-v1` schema version
- `web | ios | android` platform vocabulary
- `sandbox | production` environment vocabulary
- `active | expired | revoked | refunded` current-state vocabulary
- Architecture-authorized optional provider provenance fields
- server-resolved owner binding 3종만 허용
  - `purchase_intent`
  - `account_link`
  - `receipt_lineage`
- `hmac-sha256:k1:<64 lowercase hex>` fingerprint shape validation
- unknown top-level / owner-binding field fail-closed
- raw/client authority field hitchhiking 방지
- 새 frozen normalized object 반환

이 validator는 **provider authenticity를 검증하지 않는다**. Raw provider payload를 파싱하거나 PSP signature/API를 확인하지 않으며 provider ordering을 추론하거나 DB에 저장하거나 entitlement를 변경하지 않는다.

### Provider-neutral Entitlement Effect structural contract

```text
apps/api/src/entitlement-effect.ts
test/entitlement-effect.test.ts
```

현재 구현 범위:

- exact `entitlement-effect-v1` schema version
- exact event vocabulary
  - `granted | renewed | expired | revoked | restored | adjusted`
- exact target status vocabulary
  - `active | expired | revoked`
- `effectiveAt`, `targetValidFrom` non-empty string structure
- `targetValidUntil` explicit `string | null`
- optional `reasonCode`가 존재할 경우 non-empty string
- Architecture가 정적으로 고정한 event → target status 관계 fail-closed
  - `granted | renewed | restored → active`
  - `expired → expired`
  - `revoked → revoked`
  - `adjusted → active | expired | revoked`
- `adjusted`는 structural boundary에서도 `reasonCode`를 요구
- unknown/source/actor/dedupe/provider-order/raw-provider field hitchhiking 방지
- 새 frozen normalized object 반환

이 validator는 timestamp grammar를 발명하거나 해석하지 않는다. `transaction_timestamp()` 기반 future-active 검사, historical interval 보존, renewal의 original `valid_from` 유지, provider ordering, semantic event dedupe key 생성, `adjusted` actor 인증, DB persistence, grant/event/projection mutation은 모두 apply/runtime 책임으로 남아 있으며 현재 구현되지 않았다.

### Missing runtime

```text
provider-specific canonical evidence serializer
provider authenticity verification adapter
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

Raw provider secret/bearer/receipt object는 normalized evidence contract에 포함시키지 않는다.

`apps/api/src/verified-commerce-evidence.ts`는 위 normalized shape의 **structural validation만** 수행한다. Provider signature/API response authenticity, semantic state truth, provider ordering truth를 증명하는 verifier가 아니므로 이 contract를 통과했다는 사실만으로 verified payment 또는 entitlement grant를 인정하지 않는다.

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

현재 `apps/api/src/entitlement-effect.ts`는 이 section의 **provider-neutral structural/static-transition subset만** 구현한다. `effectiveAt`/validity fields는 structural validator에서 opaque non-empty string으로 유지되며 timestamp grammar나 ordering semantics를 해석하지 않는다. Future-active 판정, renewal interval 보존, no-op/material-state 판정, actor authentication, dedupe/conflict, CAS, persistence는 아직 apply runtime이 없으므로 구현되지 않았다.

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

`P0-CM-01`은 launch rail을 Web + one-off로 결정했으므로 subscription/bundle billing은 launch MVP에서 명시적으로 제외된다.

현재 architecture는 future compatibility invariant만 유지한다.

```text
cancel requested != immediate entitlement inactive
```

실제 subscription을 선택하면 `P0-CM-01` reopen 또는 동등한 explicit future rail decision이 lifecycle matrix를 확정한다.

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

## 15. Privacy / audit — P0-PR-01B DECIDED

Exact legal/accounting/backup retention period는 parent `P0-PR-01`로 계속 OPEN이다.

Provider-evidence minimization은 `P0-PR-01B`로 다음처럼 DECIDED다.

### Never persist / emit

```text
raw provider API secret
Authorization / OAuth / bearer credential
checkout/session bearer secret
raw receipt / raw purchase token / opaque payment bearer token
card PAN / CVV / PIN / raw PCI authentication material
full provider request/response headers or bodies as an archive
```

### Fingerprint-first opaque evidence

```text
algorithm      = HMAC-SHA-256
stored format  = hmac-sha256:k1:<64 lowercase hex>
secret env     = MYEONGHA_COMMERCE_EVIDENCE_HMAC_K1_SECRET
minimum secret = 32 UTF-8 bytes
```

Domains:

```text
myeongha.commerce.receipt-evidence.v1
myeongha.commerce.provider-event-payload.v1
myeongha.commerce.provider-account.v1
```

Runtime primitive:

```text
apps/api/src/production-commerce-evidence-fingerprint.ts
```

이 primitive는 세 domain과 HMAC format/secret minimum을 fail-closed로 고정하지만, 실제 provider canonical bytes는 `P0-CM-02` 이후 adapter contract가 소유한다. Production env secret wiring과 DB evidence persistence는 아직 활성화하지 않는다.

### `verified_payload_jsonb`

Positive allowlist only:

- schema-versioned
- bounded strings/arrays
- correctness/reconciliation/conflict/support에 실제 필요한 provider-specific verified fact만
- unknown field drop/reject
- raw response nesting 금지
- raw secret/token/account identifier/PCI material 금지
- first-class provenance를 불필요하게 중복하지 않음

Provider-specific allowlist와 canonical fingerprint input은 selected adapter implementation/test가 고정한다.

Provider transaction/event/product reference는 **non-secret이며** idempotency/reconciliation에 필요한 경우 first-class column으로 저장할 수 있다.

Support는 Member→Intent→Offer/Capability Set→receipt/event→grant→entitlement event→effective entitlement chain을 raw bearer 없이 재구축 가능해야 한다.

Selected provider가 raw bearer-like receipt/token의 durable storage를 필수로 요구하면 별도 provider-specific security/retention decision 없이는 `P0-CM-02`를 닫을 수 없다.

---

## 16. Current implementation gates

### Architecture / rail / evidence-minimization resolved

```text
SRC-18      = CLOSED by Commerce Architecture v1
SRC-21      = CLOSED by Commerce Architecture v1
P0-CM-01    = DECIDED: Web + one-off launch MVP
P0-PR-01B   = DECIDED: Commerce evidence minimization/security baseline
```

### Still OPEN before provider-specific / paid-catalog / production activation

```text
P0-CM-02
→ exact Web payment provider / PSP

P0-CM-03
→ launch paid Product / Capability catalog
→ current Paid Deep/Detailed Reading candidate is upstream-blocked because Saju production interpretation authority remains BLOCKED

P0-PR-01 parent
→ legal/accounting evidence retention duration
→ backup retention/deletion
→ account-deletion Commerce retention/tombstone/pseudonymization lifecycle

selected-provider ordering proof
→ safe comparator or equivalent fail-closed reconciliation
```

`P0-CM-01` 결정은 exact PSP나 paid SKU를 승인하지 않는다. `P0-PR-01B` 결정은 retention duration이나 production persistence activation을 승인하지 않는다.

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
raw secret/token/receipt in provider fixture → persistence/log leakage test FAIL CLOSED
unknown/oversized verified payload field → drop/reject
same opaque evidence replay → same versioned HMAC fingerprint
one-byte-different evidence → different fingerprint
missing/weak Commerce HMAC secret → fail before evidence persistence
```

The fingerprint-specific subset above is implemented by `test/production-commerce-evidence-fingerprint.test.ts`.

The provider-neutral evidence structural subset is implemented by `test/verified-commerce-evidence.test.ts`, including unknown/raw/client-authority field rejection, exact owner-binding vocabulary, malformed fingerprint rejection, non-plain input rejection, and validation-error non-leakage. 이 structural test는 provider authenticity 또는 provider-specific payload allowlist를 검증하지 않는다. Provider-specific canonicalization/payload allowlist/authenticity tests remain blocked until a concrete adapter schema exists.

The provider-neutral Entitlement Effect structural subset is implemented by `test/entitlement-effect.test.ts`, including exact schema/event/status vocabulary, required/nullability rules, Architecture-authorized static event→target transitions, `adjusted` reason requirement, unknown/source/actor/dedupe/provider-order/raw-provider field rejection, non-plain input rejection, and validation-error non-leakage. 이 test는 timestamp semantics, future-active apply-time enforcement, renewal interval preservation, provider ordering, actor authentication, event dedupe/conflict generation, CAS, persistence 또는 effective-entitlement recompute를 검증하지 않는다.

---

## 18. Implementation status

```text
Architecture                                      = CLOSED
Launch rail                                       = DECIDED: Web + one-off
Commerce evidence minimization                    = DECIDED: P0-PR-01B
Product Capability Set schema                    = NOT IMPLEMENTED / HOLD UNTIL P0-CM-03
Purchase Intent v2 Capability pin                = NOT IMPLEMENTED / HOLD UNTIL P0-CM-03
provider-neutral evidence fingerprint primitive = IMPLEMENTED / PURE HELPER / MERGED-MAIN CI GREEN
provider-neutral evidence structural contract   = IMPLEMENTED / PURE VALIDATOR / MERGED-MAIN CI GREEN / NO AUTHENTICITY VERIFICATION
provider-neutral entitlement effect contract    = IMPLEMENTED / PURE VALIDATOR / MERGED-MAIN CI GREEN / NO APPLY RUNTIME
provider-specific canonical evidence serializer = NOT IMPLEMENTED / BLOCKED BY P0-CM-02
provider-neutral verification runtime            = NOT IMPLEMENTED
provider ordering comparator/runtime              = NOT IMPLEMENTED / BLOCKED BY P0-CM-02
entitlement apply-time semantics/runtime          = NOT IMPLEMENTED
entitlement event dedupe/conflict generation      = NOT IMPLEMENTED
adjusted-effect actor authentication              = NOT IMPLEMENTED
concrete provider adapter                         = BLOCKED BY P0-CM-02 + P0-CM-03
verified receipt → grant/event/projection command= NOT IMPLEMENTED
webhook/provider event runtime                    = NOT IMPLEMENTED
refund/revoke/restore runtime                     = NOT IMPLEMENTED
reconciliation runtime                            = NOT IMPLEMENTED
provider sandbox E2E                              = NOT IMPLEMENTED
production evidence persistence                   = BLOCKED BY P0-CM-02 + P0-CM-03 + P0-PR-01 PARENT
production Commerce activation                    = NOT AUTHORIZED
```

`COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`, `COMMERCE_LAUNCH_RAIL_DECISION_V1.md`, `COMMERCE_EVIDENCE_DATA_MINIMIZATION_DECISION_V1.md`의 authority를 함께 따른다.