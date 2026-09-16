# 명하 Commerce / Entitlement Implementation Specification v0.13

> Product: **명하 (MyeongHa)**  
> Date: **2026-09-16**  
> Architecture Authority: `docs/architecture/COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`  
> Launch Rail Decision: `docs/COMMERCE_LAUNCH_RAIL_DECISION_V1.md`  
> Web PSP Decision: `docs/COMMERCE_WEB_PSP_DECISION_V1.md`  
> Guest Purchase Ownership Decision: `docs/COMMERCE_GUEST_PURCHASE_OWNERSHIP_DECISION_V1.md`  
> Evidence Minimization Decision: `docs/COMMERCE_EVIDENCE_DATA_MINIMIZATION_DECISION_V1.md`  
> Status: **DERIVED IMPLEMENTATION SPEC / ARCHITECTURE CLOSED / LAUNCH RAIL DECIDED / WEB PSP DECIDED / GUEST PURCHASE OWNERSHIP DECIDED / PORTONE V2 VERIFICATION+WEBHOOK FOUNDATION IMPLEMENTED / IMPLEMENTATION HOLD**  
> Rule: 이 문서는 Architecture와 이후 explicit P0 decision을 요약해 구현 경계를 연결하는 companion이다. Domain semantics 충돌 시 Architecture가 우선하고, Architecture 작성 뒤 결정된 P0 status는 최신 `docs/P0_DECISION_REGISTER.md`와 해당 decision record가 우선한다.

---

## 1. 현재 판정

```text
Commerce Architecture                         = CLOSED
SRC-18 Product → Capability authority         = RESOLVED BY ARCHITECTURE
SRC-21 Grant apply / aggregate authority      = RESOLVED BY ARCHITECTURE
P0-CM-01 launch rail                          = DECIDED: Web + one-off only
P0-CM-02 exact Web PSP                        = DECIDED: PortOne V2 / portone_v2
P0-CM-03 launch paid Product / Capability     = OPEN-P0 / BLOCKED BY CURRENT SAJU AUTHORITY
P0-CM-04 Guest purchase ownership             = DECIDED: Guest + Member / canonical subjects.id
P0-PR-01 parent retention/legal/backup        = OPEN-P0
P0-PR-01B provider-evidence minimization      = DECIDED
Product Capability Set foundation             = IMPLEMENTED / ADDITIVE DB AUTHORITY / NO SALEABLE CATALOG SEEDED
provider-neutral evidence fingerprint primitive = IMPLEMENTED / PURE HELPER
provider-neutral evidence structural contract = IMPLEMENTED / PURE VALIDATOR / NO PROVIDER AUTHENTICITY BY ITSELF
provider-neutral entitlement effect contract  = IMPLEMENTED / PURE VALIDATOR / NO VERIFIED GRANT/EVENT APPLY BY ITSELF
effective entitlement projection recompute    = IMPLEMENTED / INTERNAL DB PRIMITIVE
PortOne V2 server payment verification        = IMPLEMENTED / REPOSITORY-LOCAL / NO LIVE CREDENTIAL CLAIM
PortOne V2 webhook auth/HTTP/runtime foundation = IMPLEMENTED / PUBLIC PRODUCTION ROUTE HOLD
verified payment evidence persistence         = IMPLEMENTED / REPOSITORY-LOCAL / PRODUCTION DEPLOYMENT SUBJECT TO #680
verified Entitlement Grant/Event apply        = NOT ACTIVATED / P0-CM-03 + LIVE READINESS GATES
```

따라서 Web-first one-off rail, PortOne V2 provider 선택, Guest/Member Commerce ownership, Product Capability foundation, provider-evidence 최소화/structural primitives, Effective Entitlement aggregate/recompute, PortOne V2 server payment verification과 webhook authentication/HTTP/runtime foundation, verified payment evidence persistence까지 repository-local 구현이 진행됐다. 그러나 이것은 saleable Product/SKU, live merchant/PG/channel/credential readiness, public Production webhook activation, verified Entitlement Grant/Event fulfillment activation, refund/reversal/dispute/reconciliation, 또는 Production Commerce readiness를 의미하지 않는다. `P0-CM-03`, `P0-PR-01`, #680 및 live activation gates는 계속 독립적으로 fail-closed다.

---

## 2. Authoritative flow

```text
MyeongHa Product
→ immutable Product Capability Set(version/hash)
→ Product Offer(provider/platform/external product + pinned Capability Set)
→ server-resolved subjects.id-owned Purchase Intent (Guest or Member)
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
product_capability_sets
product_capability_items
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
- Product Capability Set / Capability Item immutable historical meaning foundation
- Guest/Member Purchase Intent v2 ownership + immutable charge authority
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
internal_recompute_entitlement_projection_v1
```

`cmd_create_purchase_intent_v1`은 historical v1 minimal Offer mapping path다. Current Guest/Member Purchase Intent v2 authority는 기존 v1의 historical semantics를 재해석하지 않고 additive command/runtime boundaries로 확장되며, saleable charge terms나 launch catalog를 스스로 활성화하지 않는다.

`internal_recompute_entitlement_projection_v1`은 API/client command가 아니라 이미-authoritative한 `entitlement_grants`를 한 logical entitlement projection으로 재계산하는 **내부 provider-neutral DB primitive**다. `PUBLIC`, `anon`, `authenticated`, `service_role`, `myeongha_api_executor`에는 EXECUTE를 부여하지 않는다.

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

이 validator는 timestamp grammar를 발명하거나 해석하지 않는다. `transaction_timestamp()` 기반 future-active 검사, historical interval 보존, renewal의 original `valid_from` 유지, provider ordering, semantic event dedupe key 생성, `adjusted` actor 인증, DB persistence, grant/event mutation은 verified apply/runtime 책임으로 남아 있으며 현재 구현되지 않았다. Effective Entitlement aggregate recompute 자체는 아래 internal DB primitive로 별도 구현됐다.

### Provider-neutral Effective Entitlement projection recompute

```text
supabase/migrations/0900_entitlement_projection_recompute_command.sql
public.internal_recompute_entitlement_projection_v1(uuid, text, text)
```

현재 구현 범위:

- one transaction-scoped `as_of = transaction_timestamp()`
- Architecture §17 contributor predicate 그대로 적용
- `count=0 → inactive / 0 / NULL`
- current unbounded contributor가 하나라도 있으면 `active / NULL expiry`
- 모든 current contributor가 finite이면 `MAX(valid_until)`
- future-active Grant는 현재 contributor에서 제외
- wall-clock expired Grant는 stored status가 `active`여도 contributor에서 제외
- global/fixed scope logical identity 분리
- authoritative Grant history가 전혀 없는 임의 key로 inactive projection 생성 금지
- material tuple `(status, active_grant_count, effective_valid_until)`이 바뀔 때만 `revision + 1` / `updated_at` 변경
- exact no-op은 `revision`과 `updated_at` 보존
- 기존 logical projection은 projection row `FOR UPDATE`를 serialization point로 사용
- 최초 projection 동시 생성은 `entitlements_logical_unique`가 winner를 결정하고 loser는 winner를 다시 lock한 뒤 fresh statement snapshot으로 aggregate 재계산
- API-facing role EXECUTE 없음

이 primitive는 provider evidence를 검증하지 않고, Grant/Event를 생성·변경하지 않으며, `event_dedupe_key`를 생성하지 않고, provider ordering을 판정하지 않고, outbox를 쓰지 않는다. 따라서 이것만으로 payment 또는 verified apply runtime이 존재한다고 판정하지 않는다.

### PortOne V2 repository-local foundation

Current `P0-CM-02` authority selects PortOne V2 and canonical provider key `portone_v2`. Repository-local implementation includes:

```text
apps/api/src/portone-v2-payment-verification-adapter.ts
apps/api/src/portone-v2-webhook-payment-completion.ts
apps/api/src/portone-v2-webhook-http.ts
apps/api/src/portone-v2-webhook-runtime.ts
```

이 foundation은 server-side PortOne payment lookup, provider-owned payment fact normalization, webhook authentication, bounded HTTP handling, runtime composition, 그리고 verified payment evidence persistence path를 구성한다. Browser callback/redirect는 payment completion authority가 아니다. Public Production webhook route는 의도적으로 활성화되지 않았고 live merchant/PG/channel/API/webhook credential readiness도 별도 gate다.

### Remaining runtime / activation gates

```text
saleable Product/Capability catalog and charge terms (P0-CM-03)
verified receipt → Entitlement Grant/Event/projection fulfillment activation
provider lifecycle ordering/reconciliation beyond the implemented paid-payment completion slice
refund/reversal/dispute execution
live merchant/PG/channel/API/webhook credential binding
public Production checkout/handoff activation
public Production PortOne webhook route activation
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

Implemented foundation:

```text
product_offers.capability_set_id
FK(capability_set_id, product_id)
→ product_capability_sets(id, product_id)
```

Offer가 pin한 Capability Set은 historical meaning이다. Existing provider SKU/Offer를 새 rights 의미로 repoint하지 않는다.

Purchase Intent v2의 **Capability Set pin**은 launch Product/Capability가 정해지기 전 활성화하지 않는다. Activation 시 기존 v1 Offer snapshot 의미를 변경하지 않고 별도 immutable fields로 다음을 pin한다.

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

Historical v1 safe baseline (retained compatibility path):

```text
active Member only
server-owned canonical subjects.id
selected enabled/non-retired Product + Offer
optional same-owner/same-provider active account link
immutable minimal Offer snapshot
same idempotency key + same canonical request → replay
same key + conflicting request → conflict
```

Current v2 ownership authority additionally permits active Guest and active Member Purchase Intents through canonical server-resolved `subjects.id`, with immutable charge authority and Guest→Member continuity governed by `P0-CM-04`. This does not seed or enable saleable charge terms; `P0-CM-03` remains required before launch catalog activation.

Client가 보낸 가격/통화/Product key/entitlement key/scope/subject ID는 authority가 아니다.

Capability Set pin activation은 Section 4의 immutable historical mapping을 사용하며 current launch Product/Capability authority가 없는 상태에서 arbitrary mapping을 만들지 않는다.

---

## 6. Provider verification

Client callback은 transport hint다.

Provider-specific verifier는 DB rights transaction 밖에서 applicable facts를 검증하고 provider-neutral verified Commerce evidence로 normalize한다.

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

`apps/api/src/verified-commerce-evidence.ts`는 provider-neutral normalized shape의 **structural validation만** 수행한다. 이 validator 자체는 Provider signature/API response authenticity, semantic state truth, provider ordering truth를 증명하지 않는다.

`P0-CM-02`가 선택한 PortOne V2의 repository-local payment verification adapter는 merchant-generated paymentId에 대해 server-side `api.portone.io` lookup을 수행하고, verified payment facts를 기존 provider-neutral Commerce boundaries로 투영한다. 이 concrete verifier의 존재만으로 live credential/PG/channel readiness, public endpoint activation, 또는 Entitlement fulfillment가 승인되는 것은 아니다.

---

## 7. Provider Event ordering

`received_at` 또는 raw string lexical order를 semantic ordering으로 사용하지 않는다.

Selected provider adapter/lifecycle runtime은 verified evidence와 persisted grant ordering provenance에 대해 다음을 판정해야 한다.

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

`STALE`/`INCOMPARABLE`은 rights mutation 없이 reconciliation 대상으로 남긴다. PortOne V2 paid-payment completion foundation이 구현됐다는 사실은 refund/reversal/dispute를 포함한 전체 provider lifecycle ordering/reconciliation 구현 완료를 의미하지 않는다.

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

현재 `apps/api/src/entitlement-effect.ts`는 이 section의 **provider-neutral structural/static-transition subset만** 구현한다. `effectiveAt`/validity fields는 structural validator에서 opaque non-empty string으로 유지되며 timestamp grammar나 ordering semantics를 해석하지 않는다. Future-active **verified Grant apply** 판정, renewal interval 보존, Grant/Event material-state 판정, actor authentication, dedupe/conflict, provider ordering CAS, Grant/Event persistence는 아직 apply runtime이 없으므로 구현되지 않았다. Effective Entitlement projection의 material/no-op aggregate 판정은 Section 9의 internal recompute primitive로 구현됐다.

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

현재 이 aggregate/rebuild subset은 `internal_recompute_entitlement_projection_v1`으로 구현됐다. Existing projection은 row lock으로 동일 logical entitlement의 recompute를 직렬화하고, concurrent first insert는 logical unique constraint로 단일 projection을 확정한 뒤 loser가 winner를 lock/re-read/recompute한다. Grant 자체의 verified transition/event append/provider-order CAS/outbox는 이 primitive의 책임이 아니다.

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
→ provider re-verification/restore or provider-independent historical entitlement recovery where already authorized
→ same historical receipt/grant lineage
→ immutable Offer + Capability Set where historically pinned
→ idempotent missing effective-right recovery within the implemented restore boundary
```

Restore는 arbitrary admin grant 생성 기능이 아니다. Existing provider-independent server entitlement restore and direct merged-Guest lineage support do not authorize a new saleable SKU or unimplemented PortOne refund/reversal lifecycle.

Refund 후 이미 생성된 Reading/content artifact의 열람/삭제는 Product/UX OPEN DECISION이다.

---

## 11. Guest / Member

`P0-CM-04`는 **DECIDED**다.

```text
active Guest 또는 active Member
→ server resolves canonical subjects.id owner
→ Purchase Intent / historical Commerce ownership

new Member promotion
→ same subject continuity

existing Member merge
→ historical Commerce owner rewrite 금지
→ current rights는 direct merged-Guest lineage로 조합
```

Raw client owner/subject identity는 authority가 아니다. Guest/Member ownership authority는 saleable Product/SKU를 만들지 않으며 `P0-CM-03`은 계속 OPEN-P0다.

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

PortOne server lookup/webhook foundation과 replay-safe verified payment persistence가 존재하더라도 complete reconciliation worker/lifecycle은 별도 구현 gate다. Provider call은 DB mutation transaction 밖에서 수행하고 authoritative persistence/apply boundary를 재사용해야 한다.

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

Section 9의 recompute 단계와 verified payment evidence persistence foundation은 구현되어 있지만, verified payment에서 Product Capability Item(s)을 concrete Entitlement Grant/Event로 all-or-neither fulfillment하는 전체 transaction은 `P0-CM-03` 및 activation gates 전에는 활성화하지 않는다.

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

이 primitive는 세 domain과 HMAC format/secret minimum을 fail-closed로 고정한다. `P0-CM-02`는 이미 PortOne V2를 selected provider로 결정했으며 provider-specific canonical/verified evidence behavior는 PortOne adapter/runtime과 해당 테스트가 소유한다. Production env secret/live credential binding은 별도 activation gate다.

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

Support는 canonical subject(Guest/Member)→Intent→Offer/Capability Set→receipt/event→grant→entitlement event→effective entitlement chain을 raw bearer 없이 재구축 가능해야 한다.

PortOne V2 또는 future provider가 raw bearer-like receipt/token의 durable storage를 필수로 요구하면 current evidence-minimization authority를 우회하지 않는다. 별도 provider-specific security/retention decision 또는 decision reopen 없이 raw durable storage를 추가할 수 없다.

---

## 16. Current implementation gates

### Architecture / rail / provider / ownership / evidence-minimization resolved

```text
SRC-18      = CLOSED by Commerce Architecture v1
SRC-21      = CLOSED by Commerce Architecture v1
P0-CM-01    = DECIDED: Web + one-off launch MVP
P0-CM-02    = DECIDED: PortOne V2 / portone_v2
P0-CM-04    = DECIDED: Guest + Member canonical subjects.id ownership
P0-PR-01B   = DECIDED: Commerce evidence minimization/security baseline
```

### Still OPEN before paid-catalog / Production activation

```text
P0-CM-03
→ launch paid Product / Capability catalog
→ current Paid Deep/Detailed Reading candidate is upstream-blocked because Saju production interpretation authority remains BLOCKED

P0-PR-01 parent
→ legal/accounting evidence retention duration
→ backup retention/deletion
→ account-deletion Commerce retention/tombstone/pseudonymization lifecycle

live PortOne merchant/PG/channel/API/webhook credential readiness
→ operational proof required before Production activation

#680 Production Supabase deployment authorization
→ governed Production migration path remains blocked until project authorization is restored

public PortOne webhook route
→ intentional Production HOLD / 404 NOT_FOUND

full provider lifecycle ordering/reconciliation proof
→ paid-payment completion foundation does not imply refund/reversal/dispute lifecycle completion
```

`P0-CM-01`과 `P0-CM-02` 결정은 Web one-off + PortOne V2 선택을 고정하지만 saleable SKU, price/currency, live merchant/PG/channel/credentials 또는 Production activation을 승인하지 않는다. `P0-CM-04`는 ownership만 결정하며 saleability를 만들지 않는다. `P0-PR-01B` 결정은 retention duration을 승인하지 않는다. Effective Entitlement recompute 또는 repository-local payment/webhook foundation 역시 Production activation을 승인하지 않는다.

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

The provider-neutral evidence structural subset is implemented by `test/verified-commerce-evidence.test.ts`, including unknown/raw/client-authority field rejection, exact owner-binding vocabulary, malformed fingerprint rejection, non-plain input rejection, and validation-error non-leakage. 이 structural test 자체는 provider authenticity를 검증하지 않는다.

PortOne V2-specific server payment verification, webhook authentication/HTTP/runtime composition, bounded transport/error handling, and verified payment persistence/replay regressions exist as repository-local provider implementation evidence. 이 evidence는 live merchant/API/webhook credential provisioning, public Production webhook activation, saleable catalog, verified Entitlement fulfillment, full provider lifecycle reconciliation 또는 Production readiness 증거가 아니다.

The provider-neutral Entitlement Effect structural subset is implemented by `test/entitlement-effect.test.ts`, including exact schema/event/status vocabulary, required/nullability rules, Architecture-authorized static event→target transitions, `adjusted` reason requirement, unknown/source/actor/dedupe/provider-order/raw-provider field rejection, non-plain input rejection, and validation-error non-leakage. 이 test는 timestamp semantics, future-active verified-apply enforcement, renewal interval preservation, provider ordering, actor authentication, event dedupe/conflict generation, CAS 또는 Grant/Event persistence를 검증하지 않는다.

The provider-neutral Effective Entitlement aggregate/recompute subset is implemented by:

```text
test/db/entitlement_projection_recompute.sql
test/db/entitlement_projection_recompute_concurrency.sh
.github/workflows/db-commerce-entitlement-projection-recompute.yml
```

이 검증은 finite max-expiry, unbounded contributor, zero-current-contributor inactive, future-active exclusion, wall-clock expiry fail-closed, fixed/global scope isolation, exact no-op revision/update preservation, no-Grant-history projection manufacture rejection, API-facing EXECUTE denial, concurrent first insert single-row arbitration, 서로 다른 Grant의 concurrent mutation 후 projection serialization/final aggregate convergence를 실제 PostgreSQL에서 검증한다. Provider authenticity, verified Grant/Event apply, provider ordering, event dedupe generation, outbox atomicity는 이 workflow의 검증 범위가 아니다.

---

## 18. Implementation status

```text
Architecture                                      = CLOSED
Launch rail                                       = DECIDED: Web + one-off
Web PSP                                           = DECIDED: PortOne V2 / portone_v2
Guest purchase ownership                         = DECIDED: Guest + Member / canonical subjects.id
Commerce evidence minimization                    = DECIDED: P0-PR-01B
Product Capability Set schema                    = IMPLEMENTED / FOUNDATION / NO SALEABLE CATALOG SEEDED
Purchase Intent v2 Guest/Member ownership        = IMPLEMENTED / MERGED-MAIN / NO SALEABLE CHARGE TERMS IMPLIED
Purchase Intent v2 Capability pin                = NOT ACTIVATED / HOLD UNTIL P0-CM-03 CATALOG AUTHORITY
provider-neutral evidence fingerprint primitive = IMPLEMENTED / PURE HELPER / MERGED-MAIN CI GREEN
provider-neutral evidence structural contract   = IMPLEMENTED / PURE VALIDATOR / MERGED-MAIN CI GREEN / NO AUTHENTICITY BY ITSELF
provider-neutral entitlement effect contract    = IMPLEMENTED / PURE VALIDATOR / MERGED-MAIN CI GREEN / NO VERIFIED GRANT/EVENT APPLY BY ITSELF
effective entitlement projection recompute      = IMPLEMENTED / INTERNAL DB / MERGED-MAIN CI GREEN
PortOne V2 payment verification adapter          = IMPLEMENTED / SERVER-SIDE LOOKUP / REPOSITORY-LOCAL
PortOne V2 webhook auth/HTTP/runtime foundation  = IMPLEMENTED / REPOSITORY-LOCAL / PUBLIC PRODUCTION ROUTE HOLD
verified payment evidence persistence/replay     = IMPLEMENTED / REPOSITORY-LOCAL / PRODUCTION DEPLOYMENT SUBJECT TO #680
full provider ordering/reconciliation lifecycle  = NOT IMPLEMENTED / PAID-PAYMENT SLICE DOES NOT COVER REFUND/REVERSAL/DISPUTE
verified Grant/Event fulfillment transaction     = NOT ACTIVATED / P0-CM-03 + LIVE READINESS GATES
entitlement event dedupe/conflict generation     = NOT COMPLETE FOR FULL LIFECYCLE
adjusted-effect actor authentication              = NOT IMPLEMENTED
outbox-on-rights-material-change                 = NOT IMPLEMENTED
server entitlement restore v1                    = IMPLEMENTED / PROVIDER-INDEPENDENT HISTORICAL-RIGHTS BOUNDARY
provider refund/reversal/dispute runtime          = NOT IMPLEMENTED
production evidence deployment                    = HOLD / #680 + LIVE READINESS
public PortOne webhook route                     = HOLD / 404 NOT_FOUND
saleable Product/Capability catalog              = HOLD / P0-CM-03 OPEN-P0
production Commerce activation                    = NOT AUTHORIZED
```

`COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`, `COMMERCE_LAUNCH_RAIL_DECISION_V1.md`, `COMMERCE_WEB_PSP_DECISION_V1.md`, `COMMERCE_GUEST_PURCHASE_OWNERSHIP_DECISION_V1.md`, `COMMERCE_EVIDENCE_DATA_MINIMIZATION_DECISION_V1.md`의 authority를 함께 따른다.
