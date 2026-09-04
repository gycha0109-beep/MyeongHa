# 명하 결제·권한 아키텍처 v1

> Repository: `gycha0109-beep/MyeongHa`  
> Reviewed `main`: `8924b6be170c0f650fb92d8a4b989cbe78608e3d`  
> Track baseline: `04936f27e4d85be91dfcc9d141f375cf45b4ced8`  
> Platform Integrity source recovered from: `docs/platform-integrity-v1-final-review@04e798dd019300e271400aff910ccc788f14c1ea` + later merged production-integrity evidence on `main`  
> Status: **ARCHITECTURE CLOSED / RECURSIVE SELF-REVIEW PASSED / IMPLEMENTATION HOLD**  
> Closed at design level only. This status does **not** mean Payment Ready, Commerce Complete, Entitlement Production-Safe, Payment Production Ready, or Subscription Ready.

---

# 1. 목적

외부 결제 provider가 duplicate, delayed, out-of-order, timeout, redelivery, callback loss, partial failure를 일으켜도 다음을 보장하는 Commerce / Entitlement authority를 정의한다.

```text
verified payment fact
→ immutable MyeongHa Product meaning
→ canonical Member owner
→ one logical commerce effect
→ independent grant lifecycle
→ append-only rights provenance
→ rebuildable effective entitlement
```

판정 기준은 “결제가 된다”가 아니라 **money / rights correctness**다.

---

# 2. 범위 / 비범위

## 범위

- Product / Offer / Capability authority
- Purchase Intent
- server-side verification boundary
- provider-neutral verified evidence
- receipt / transaction / provider-event idempotency
- webhook/provider-event duplicate/order/stale handling
- entitlement grant / event / effective projection
- refund / revoke / restore
- Member ownership
- cross-platform source composition
- reconciliation / recovery
- privacy / audit / support traceability
- current schema → target migration
- negative / idempotency / concurrency / ordering / recovery tests

## 비범위

- Stripe / Apple / Google 중 임의 provider 선택
- provider SDK 추가
- production webhook route 구현
- production schema mutation
- hosting / secret store / logging vendor / monitoring vendor 재설계
- generic transaction / RLS / locking / idempotency / outbox framework 재설계
- Saju / Character semantic authority 변경
- 실제 가격 / 세금 / 정산 / 법률 정책 확정
- 카드번호/CVV 등 PCI-sensitive payment data 직접 처리

---

# 3. 현재 저장소 상태

검수 시점 최신 `main`:

```text
8924b6be170c0f650fb92d8a4b989cbe78608e3d
```

Track 기준 SHA보다 Birth create/session preflight 1커밋 전진했으며 Commerce semantic delta는 확인되지 않았다.

현재 Commerce DB model은 다음 9개 table을 실제 보유한다.

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

실제 구현 evidence:

- `0080_commerce.sql`: 위 schema
- `0200_commerce_hardening.sql`: ownership, immutable identity, verified-source, append-only constraints
- `0660_purchase_intent_create_command.sql`: Member-only idempotent Purchase Intent command
- `0400_entitlements_current_query.sql`: current entitlement projection read
- `test/db/commerce_negative.sql`: structural negative tests
- `test/db/purchase_intent_create_concurrency.sh`: Purchase Intent replay/conflict/concurrency
- `.github/workflows/db-purchase-intent-create.yml`: dedicated DB verification

Current runtime에는 provider verifier, payment SDK, Commerce webhook, verified receipt→grant apply command, reconciliation runtime이 없다.

## Current-state matrix

| 영역 | DB | Runtime/API | Test | 상태 | 결손 |
|---|---|---|---|---|---|
| Product | 있음 | Purchase Intent resolution에 사용 | fixtures | PARTIAL | launch catalog |
| Offer | 있음 + immutable guard | internal Purchase Intent | negative/command | IMPLEMENTED structurally | provider rail |
| Purchase Intent | command 있음 | internal boundary; public provider handoff 없음 | concurrency | PARTIAL | activation/provider handoff |
| Provider account link | 있음 | verifier 없음 | negative | PARTIAL | adapter |
| Receipt evidence | 있음 | verifier 없음 | negative | PARTIAL | server verification |
| Provider Event | 있음 | webhook/apply 없음 | dedupe/resolution negative | PARTIAL | provider runtime/order |
| Grant | 있음 | apply 없음 | structural negative | PARTIAL | command |
| Entitlement Event | append-only 있음 | apply 없음 | negative | PARTIAL | command |
| Effective Entitlement | projection/read 있음 | internal read | query | PARTIAL | authoritative recompute/rebuild |
| Refund/Revoke/Restore | 표현 가능 | 없음 | dedicated lifecycle 없음 | DOCUMENTED_ONLY | implementation |
| Subscription | vocabulary만 있음 | 없음 | 없음 | DOCUMENTED_ONLY | POST-MVP decision |
| Reconciliation | dedicated table 불필요 | 없음 | 없음 | DOCUMENTED_ONLY | implementation |
| Provider Adapter | N/A | 없음 | 없음 | ABSENT | P0-CM-01 |
| Public Commerce HTTP | N/A | 없음 | 없음 | ABSENT | later activation |

---

# 4. 상위 Authority와 우선순위

트랙 프롬프트가 지목한 4개 Platform Integrity companion 파일은 current `main`에 모두 존재하지 않는다.

실제 조사에서 다음 final-reviewed branch의 monolithic architecture를 복구했다.

```text
docs/platform-integrity-v1-final-review
head 04e798dd019300e271400aff910ccc788f14c1ea
```

이 문서 이후 current `main`에 merge된 production audit / ACL containment evidence가 일부 stale implementation-state를 supersede한다.

Commerce가 재사용하는 precedence:

```text
1. current explicit Architecture / P0 decision
2. current schema/runtime/tests
3. recovered Platform Integrity final-reviewed mechanics + later merged corrections
4. DB ERD / Usecase / Integration Spine / UX Product Flow
5. older derived Commerce specs/comments
6. generic payment pattern
```

현재 `P0-AUTH-01`은 DECIDED다.

```text
ordinary user DB execution
= non-BYPASSRLS API role
+ transaction-scoped trusted canonical subjects.id context
```

오래된 `P0-AUTH-01 unresolved` 문구는 stale status debt다.

`PLATFORM INTEGRITY DOCUMENTATION DELTA REQUIRED`:
final-reviewed monolith와 later production corrections를 언젠가 `main`의 canonical architecture artifact로 통합해야 한다. 이 documentation delta를 해결하기 위해 Commerce가 범용 transaction/RLS/outbox framework를 다시 만들지는 않는다.

---

# 5. 현재 Commerce / Entitlement Gap

Current schema가 표현할 수 있으나 authoritative implementation이 없던 두 semantic gap은 이 Architecture가 명시적으로 닫는다.

```text
SRC-18
→ immutable versioned Product Capability Set
→ Offer / Purchase Intent가 historical capability meaning을 pin

SRC-21
→ Entitlement Effect v1
→ deterministic transition
→ provider-order comparator + CAS
→ exact contributing-grant predicate
→ exact logical aggregate formula
```

동일 branch에서 다음 source-gap companion 문서를 `RESOLVED / IMPLEMENTATION NOT STARTED`로 동기화한다.

```text
docs/source-authority-gaps/SRC-18_COMMERCE_PRODUCT_ENTITLEMENT_MAPPING.md
docs/source-authority-gaps/SRC-21_ENTITLEMENT_EVENT_APPLY_AGGREGATION.md
```

이 resolution은 과거 source 문서가 이미 이 모델을 정의했다고 재해석하지 않는다. 이전 implementation pack이 source silence를 임의로 채우지 않은 것은 올바른 fail-closed 동작이었고, **이번 후속 Commerce Architecture가 새 domain authority를 명시적으로 채택**한다.

---

# 6. 유료 Product / Capability Catalog

상위 Product/UX authority에서 확인되는 범위:

```text
UC-26
→ Paid Reading 또는 Content Unlock
→ Purchase Intent → platform rail → server verification → entitlement

UC-27
→ 로그인 후 restore
→ 필요 시 platform receipt 재검증

UX
→ 첫 grounded Reading은 결제 전에 가치 제공
→ Paid Reading Product와 Character Experience 분리
→ Paid Deep Reading은 후순위 monetization surface
```

아직 확정되지 않은 것:

```text
actual launch SKU
가격
어떤 Reading domain이 유료인지
Character unlock 유료 여부
Story/Episode launch 유료 여부
one-off vs subscription
exact entitlement_key/scope
```

따라서 concrete launch catalog는 `OPEN PRODUCT DECISION`이다.

| 항목 | 분류 |
|---|---|
| Product/Offer/Capability server authority | MVP REQUIRED |
| Member-only Purchase Intent | MVP REQUIRED |
| server verification / one logical effect | MVP REQUIRED |
| Paid Deep Reading concrete SKU | OPEN PRODUCT DECISION |
| Character monetization | POST-MVP unless explicitly selected |
| Story/Episode monetization | POST-MVP unless explicitly selected |
| Subscription | POST-MVP / OUT OF MVP |
| promo/family/regional pricing | FUTURE |
| Guest purchase | OUT OF SCOPE v1 |

---

# 7. Commerce Authority Model

```text
External Provider
→ external transaction/refund/lifecycle fact authority

Provider Adapter
→ authenticity/environment/account/current-state/order semantics

Verified Commerce Evidence
→ provider SDK/raw object를 제거한 normalized verified fact

Product Capability Set
→ MyeongHa Product가 부여하는 internal right meaning authority

Entitlement Grant
→ one independent source instance의 current right state

Entitlement Event
→ append-only grant lifecycle provenance

Effective Entitlement
→ current-access projection aggregated from independent grants
```

금지:

```text
client success → entitlement=true
provider SKU → entitlement_key
client price/product/capability/owner injection
entitlements row → payment source of truth
```

## 7.1 Commerce invariant catalog

`CE-*` namespace를 사용한다.

| ID | Invariant |
|---|---|
| `CE-01` | unverified client/provider evidence는 entitlement를 생성할 수 없다. |
| `CE-02` | 동일 verified provider transaction은 동일 logical commerce effect를 두 번 만들 수 없다. |
| `CE-03` | 동일 provider event 반복 전달은 하나의 logical effect만 만든다. |
| `CE-04` | stale/out-of-order event는 newer semantic state를 rollback할 수 없다. |
| `CE-05` | client는 Product/Offer/Capability/owner authority를 주입할 수 없다. |
| `CE-06` | provider product/SKU → MyeongHa Product/Capability mapping은 server-owned authority다. |
| `CE-07` | 한 Member의 commerce evidence를 unrelated subject/account가 claim할 수 없다. |
| `CE-08` | 한 independent grant revoke가 다른 active grant를 제거하면 안 된다. |
| `CE-09` | Effective Entitlement는 authoritative grants에서 rebuild 가능하고 grant는 event/source provenance에서 audit/recovery 가능해야 한다. |
| `CE-10` | provider outage/timeout만으로 이미 확립된 entitlement를 자동 무효화하지 않는다. |
| `CE-11` | refund/revoke/restore는 original commerce evidence lineage에 추적 가능해야 한다. |
| `CE-12` | v1 purchase는 Guest promotion 완료 후 active Member에서만 시작하며 Guest-owned commerce effect를 만들지 않는다. |
| `CE-13` | provider verify success + DB failure는 partial rights state 없이 retry/reconcile 가능해야 한다. |
| `CE-14` | DB commit + response loss 후 retry가 duplicate grant를 만들 수 없다. |
| `CE-15` | raw secret/token/Authorization/provider credential은 response/log/observability payload에 노출되지 않는다. |
| `CE-16` | historical Product Capability Set은 immutable/pinned이며 mutable current config로 과거 구매를 재해석하지 않는다. |
| `CE-17` | 한 purchase가 여러 Capability Item을 부여하면 all-or-neither로 commit한다. |
| `CE-18` | wall-clock-expired grant는 stale `status='active'` row만으로 접근을 연장할 수 없다. |
| `CE-19` | MVP는 future-active grant를 생성하지 않는다. Future activation은 별도 scheduler/read-recompute authority 없이는 금지한다. |
| `CE-20` | 일반 API는 `entitlements` projection을 직접 mutation할 수 없다. |
| `CE-21` | sandbox/test evidence는 production grant를 만들 수 없다. |
| `CE-22` | 동일 transaction/source identity에 conflicting verified semantics가 나타나면 overwrite하지 않고 conflict/reconciliation 상태로 둔다. |

---

# 8. Product / Offer / Provider Product Boundary

`products`는 MyeongHa saleable stable identity다.

`product_offers`는 specific platform/provider/external product rail mapping이다.

Provider SKU는 transport/commercial identity이고 Capability 의미가 아니다.

Target Product Capability Set:

```text
Product
→ immutable Capability Set(version/hash)
→ one or more Capability Items
```

Rights semantics가 바뀌면 existing provider SKU/Offer를 repoint하지 않는다.

```text
new Capability Set
+ new Offer/provider product mapping
```

을 만든다.

---

# 9. Purchase Initiation / Purchase Intent

v1은 Member-only다.

```text
Guest
→ free experience
→ canonical promotion completes
→ active Member
→ Purchase Intent
→ provider handoff
```

Client may request:

```text
productOfferId
idempotencyKey
```

Server owns:

```text
canonical subject_id
purchase_intent_id
Product/Offer resolution
request hash
immutable Offer snapshot
Capability Set pin/version/hash
provider account binding where required
```

Client supplied price/currency/product key/entitlement key/scope/subject is not authority.

Current `cmd_create_purchase_intent_v1` remains valid for its current minimal Offer snapshot. Capability pin is added in a new command/schema version rather than silently changing v1 snapshot semantics.

Provider checkout/session TTL is provider handoff policy and is not invented as a generic Purchase Intent TTL before P0-CM-01.

---

# 10. Server-side Verification Boundary

Entitlement mutation begins only from server-verified evidence.

Selected provider adapter must verify at least applicable fields:

```text
authenticity/signature/token
provider/platform
environment
external transaction/original-chain identity
provider product identity
purchase/current lifecycle state
account/ownership binding
expiry/effective time
refund/revoke state
event authenticity
order/current-state semantics
```

Flow:

```text
receive evidence
→ provider verification outside DB mutation transaction
→ normalize VerifiedCommerceEvidenceV1
→ short authoritative DB transaction
```

Client callback is a transport hint only.

---

# 11. Provider-neutral Commerce Evidence

Conceptual internal contract:

```ts
interface VerifiedCommerceEvidenceV1 {
  schemaVersion: 'commerce-evidence-v1';
  provider: string;
  platform: 'web' | 'ios' | 'android';
  environment: 'sandbox' | 'production';
  externalTransactionId: string;
  externalOriginalTransactionId?: string;
  externalEventId?: string;
  externalProductId: string;
  providerOccurredAt?: string;
  providerOrderingKey?: string;
  currentState: 'active' | 'expired' | 'revoked' | 'refunded';
  providerValidUntil?: string;
  ownerBinding:
    | { kind: 'purchase_intent'; purchaseIntentId: string }
    | { kind: 'account_link'; commerceAccountLinkId: string }
    | { kind: 'receipt_lineage'; commerceReceiptId: string };
  evidenceFingerprint: string;
  verifierRevision: string;
}
```

`ownerBinding` is server-resolved internal provenance. Client-provided subject ID is never accepted as this binding.

Sandbox evidence cannot create production grants.

Correctness-critical environment/verifier/order data must be explicitly queryable through additive columns or a minimized versioned verified-payload contract; opaque raw payload storage is not authority.

---

# 12. Transaction / Receipt Idempotency

Existing unique `(provider, external_transaction_id)` remains source transaction identity.

```text
same transaction + same verified semantics
→ existing receipt/source result replay

same transaction + conflicting product/owner/environment/state identity
→ conflict
→ no overwrite
→ reconciliation/support review
```

A verified receipt maps to one source grant identity per Capability Item.

v1 one-off grant key:

```text
grant_key = 'receipt:' + commerce_receipts.id
```

Raw external transaction ID를 grant key로 직접 사용하지 않는다.

---

# 13. Provider Event / Webhook Model

Selected provider가 server event를 요구할 때:

```text
authenticate inbound transport
→ reject unauthenticated input before commerce authority mutation
→ persist/dedupe authenticated provider event identity
→ verify semantic/provider state
→ resolve canonical Member via purchase/account/receipt lineage
→ classify semantic order
→ apply NEWER effect or classify SAME/STALE/INCOMPARABLE
→ authoritative state + required outbox commit
→ acknowledge
```

`received_at`은 audit time이지 semantic order가 아니다.

Unsupported/verification-failed/unresolved event는 no entitlement effect다.

---

# 14. Event Ordering / Revision / Staleness

DB가 `provider_ordering_key`를 lexical/timestamp guess로 비교하지 않는다.

Provider adapter는 already-verified evidence와 persisted order provenance에 대한 pure comparator를 제공한다.

```text
NEWER
SAME
STALE
INCOMPARABLE
```

Concurrency-safe algorithm:

```text
read grant revision + last order provenance
→ pure comparator
→ begin transaction
→ lock grant
→ expected revision/order CAS
→ changed since read? rollback/re-read/recompare
→ NEWER: eligible apply
→ SAME + same semantic effect: replay/no-op
→ SAME + conflict: conflict
→ STALE: no rights mutation
→ INCOMPARABLE: no rights mutation + reconciliation
```

Provider network call은 comparator가 아니다.

Provider가 safe ordering 또는 equivalent fail-closed current-state reconciliation을 제공할 수 없다면 해당 rail은 production activation하지 않는다.

Refund/revoke가 local purchase application보다 먼저 관찰된 chain은 stale purchase receipt만 보고 grant하지 않고 provider current state를 재검증한다.

---

# 15. Entitlement Grant Authority

Grant = one independent source instance.

```text
subject_id
entitlement_key
scope_key
grant_key
grant_source_type
status
valid_from
valid_until
revision
last_effective_at
last_provider_ordering_key
```

동일 capability에 여러 grant가 공존할 수 있다.

한 grant의 revoke/expiry는 다른 grant row를 mutation하지 않는다.

MVP active effect rule:

```text
targetValidFrom <= apply transaction as_of
```

즉 future-active grant를 만들지 않는다. Future `valid_until`은 허용한다.

---

# 16. Entitlement Event Ledger

Current vocabulary를 유지한다.

```text
granted
renewed
expired
revoked
restored
adjusted
```

Conceptual normalized effect:

```ts
interface EntitlementEffectV1 {
  schemaVersion: 'entitlement-effect-v1';
  eventType: 'granted' | 'renewed' | 'expired' | 'revoked' | 'restored' | 'adjusted';
  effectiveAt: string;
  targetStatus: 'active' | 'expired' | 'revoked';
  targetValidFrom: string;
  targetValidUntil: string | null;
  reasonCode?: string;
}
```

Deterministic transition:

| Event | Preconditions | Grant result |
|---|---|---|
| `granted` | verified source + absent grant/exact replay | active + authoritative validity window |
| `renewed` | existing grant + NEWER | active; preserve original `valid_from`; replace—not add to—authoritative `valid_until` |
| `expired` | verified/wall-clock expiry effective | expired; preserve historical interval |
| `revoked` | verified lineage + revoke effective now | revoked; preserve historical interval |
| `restored` | verified historical ownership + provider current active state | active; same source lineage/current validity |
| `adjusted` | authenticated system/admin actor + reason | exact validated target state |

Future cancellation != immediate revoke.

Provider reaffirmation with no material grant change is no-op and does not append an entitlement event.

`event_dedupe_key` is service-generated from a versioned canonical semantic tuple containing source identity + effect schema/type/time/target state/validity/reason. Client strings are not event dedupe authority.

Same authoritative source identity with conflicting semantics is conflict, not overwrite.

---

# 17. Effective Entitlement Projection

One transaction captures:

```text
as_of = transaction_timestamp()
```

Contributor predicate:

```text
status='active'
AND valid_from <= as_of
AND (valid_until IS NULL OR as_of < valid_until)
```

Aggregate for one `(subject_id, entitlement_key, scope_key_norm)`:

```text
contributors = all qualifying grants
active_grant_count = COUNT(contributors)

count = 0
→ inactive
→ effective_valid_until = NULL

count > 0 and any valid_until IS NULL
→ active
→ effective_valid_until = NULL

count > 0 and all finite
→ active
→ effective_valid_until = MAX(valid_until)
```

Projection mutation:

- first authoritative grant history creates/upserts one logical projection row
- logical UNIQUE arbitrates concurrent first insert
- revision increments only when `(status, active_grant_count, effective_valid_until)` materially changes
- exact no-op recompute does not update revision or `updated_at`
- general API direct projection mutation is forbidden

Access remains fail-closed even if a status-maintenance sweep lags:

```text
status='active'
AND active_grant_count > 0
AND (effective_valid_until IS NULL OR effective_valid_until > now())
```

Rebuild:

```text
entitlements ← entitlement_grants at one as_of
entitlement_grants ← append-only entitlement_events + verified source provenance
```

---

# 18. Refund / Revoke / Restore

```text
refund / chargeback / provider revoke
→ verify original transaction lineage
→ normalized revoked effect + reason
→ revoke only grants derived from that source receipt
→ aggregate all remaining independent grants
```

Restore:

```text
verified Member
→ provider restore/reverification
→ ingest/reuse verified receipt lineage
→ immutable Offer + Capability Set
→ restore missing source grant/effect idempotently
```

Restore is not an arbitrary admin entitlement-create path.

Refund 후 이미 생성된 paid Reading/artifact의 열람/삭제 정책은 `OPEN PRODUCT DECISION`이며 Commerce core가 임의 삭제하지 않는다.

---

# 19. Subscription Lifecycle — explicit MVP non-scope

Subscription schema vocabulary는 존재하지만 launch Product로 확정되지 않았다.

MVP implementation에는 포함하지 않는다.

Compatibility invariant만 유지한다.

```text
cancel requested != immediate entitlement inactive
```

실제 subscription 도입 시 provider/product decision에서 initial purchase, renewal, grace/billing retry, effective expiry, upgrade/downgrade, refund/revoke, restore를 확정한다.

---

# 20. Guest → Member Commerce Ownership

v1은 Guest purchase를 금지한다.

```text
Guest
→ promotion completes
→ canonical active Member
→ Purchase Intent
```

이로써 다음 race를 v1에서 제거한다.

```text
Guest payment in flight
+ promotion
+ provider callback
```

Commerce receipt/grant owner는 Purchase Intent의 canonical Member다.

Future Guest purchase는 별도 architecture delta와 existing promotion/merge authority 검토 없이는 추가하지 않는다.

---

# 21. Cross-platform Policy

Web/Apple/Google transaction은 distinct source로 유지한다.

```text
distinct verified receipt/grant sources
→ same entitlement key/scope에서 aggregate
```

Provider transaction 자체를 merge하지 않는다.

같은 capability duplicate purchase를 UX에서 block/warn/allow할지는 launch Product decision이다.

Cross-provider restore/portability는 기본 가정하지 않는다.

---

# 22. Reconciliation / Recovery

Webhook-only architecture를 금지한다.

Target adapter capability:

```ts
interface CommerceProviderAdapter {
  verifyClientEvidence(...): Promise<VerifiedCommerceEvidenceV1>;
  verifyProviderEvent(...): Promise<VerifiedCommerceEvidenceV1>;
  compareOrderingKeys?(previous: string | null, next: string | null):
    'NEWER' | 'SAME' | 'STALE' | 'INCOMPARABLE';
  fetchAuthoritativeTransactionState?(...): Promise<VerifiedCommerceEvidenceV1>;
  restoreForVerifiedAccount?(...): Promise<readonly VerifiedCommerceEvidenceV1[]>;
}
```

Reconciliation trigger:

- client paid / callback lost
- webhook lost/delayed
- provider verify success / DB fail
- unresolved/incomparable provider event
- same transaction conflicting evidence
- support-triggered **provider re-verification**
- periodic provider reconciliation where rail supports it

Support re-verification은 manual subject-resolution shortcut가 아니다. Existing manual provider-event resolution remains disabled unless audited authority is separately added.

Provider call은 DB mutation transaction 밖에서 수행하고, resulting evidence는 동일 apply command를 재사용한다.

---

# 23. Platform Integrity Transaction Mapping

새 범용 mechanism을 만들지 않는다.

## Purchase Intent — existing

```text
authority = canonical Member + server Product/Offer
idempotency = subject + idempotency key + canonical request hash
concurrency = unique insert arbitration/replay conflict
writes = purchase_intents only
```

## Verified commerce effect — target

```text
provider verification outside DB transaction
→ resolve immutable Offer/Capability Set
→ begin DB transaction
→ lock source/grant logical target in fixed order
→ validate expected revision/order CAS
→ dedupe/conflict
→ append material entitlement event
→ mutate only target grant
→ recompute logical entitlement at one as_of
→ enqueue outbox iff effective logical right materially changed
→ mark provider event processed if applicable
→ commit
```

한 Product Capability Set에 여러 item이 있으면 모든 item effect를 한 transaction에서 both-or-neither로 적용한다.

Reconciliation은 privileged alternate mutation path가 아니라 동일 apply path의 evidence producer다.

---

# 24. Outbox / Side-effect Boundary

Effective rights가 materially change할 때:

```text
entitlement event
+ grant projection
+ effective entitlement projection
+ deduped outbox event
= one DB transaction
```

Exact no-op recompute에는 새 outbox event를 만들지 않는다.

Outbox consumer retry가 entitlement state를 재적용하면 안 된다.

Generic worker backoff/dead-letter/manual replay는 Platform Integrity / Production Operations authority를 따른다.

---

# 25. Privacy / Retention / Sensitive Data

`P0-PR-01`은 exact retention/legal period에 대해 OPEN이다.

Hard requirements:

```text
raw provider secret/bearer/Authorization
→ business DB column 금지
→ response/log/trace 금지

receipt/purchase token/provider account identity
→ raw 저장 최소화
→ versioned keyed fingerprint/reference 우선

verified payload
→ correctness/support에 필요한 minimized field만

card number/CVV/raw PCI data
→ MyeongHa 직접 처리/저장 금지
```

Capability Set catalog metadata는 historical purchase 의미를 재현하는 동안 immutable하게 유지한다.

Real provider evidence persistence / production activation 전에는 `P0-PR-01` 아래 implementation-safe commerce evidence retention subset을 결정한다.

---

# 26. Audit / Support Traceability

다음 chain을 재구축할 수 있어야 한다.

```text
canonical Member
→ Purchase Intent
→ pinned Offer
→ pinned Capability Set id/version/hash
→ provider transaction/event verification
→ receipt
→ independent grant(s)
→ entitlement events
→ effective entitlement
```

Support는 최소 다음에 답할 수 있어야 한다.

- 무엇을 구매했는가
- 어떤 external transaction인가
- 왜 이 Member 소유인가
- 어떤 verifier/environment에서 검증됐는가
- 어떤 Capability가 발생했는가
- 어떤 event가 rights를 바꿨는가
- 왜 현재 active/inactive인가
- refund/revoke/restore가 어떻게 반영됐는가
- 어떤 stale/conflicting event가 무시/보류됐는가

Raw token/receipt/credential은 support UI authority가 아니다.

---

# 27. Provider Adapter Boundary

Provider adapter owns:

```text
signature/token verification
provider API call
environment semantics
current-state semantics
event authentication
provider-specific ordering comparator
transaction/original-chain identity extraction
provider product identity extraction
expiry/revoke semantics
```

Provider adapter does not own:

```text
MyeongHa Product meaning
Capability Set content
canonical subject authority
grant coexistence policy
aggregate formula
```

`P0-CM-01` 이전에는 concrete provider SDK/adapter/webhook route를 추가하지 않는다.

---

# 28. Failure Model

| # | Failure | 허용 state | 금지 state | Retry / recovery | User state |
|---|---|---|---|---|---|
| 1 | payment success + callback lost | no local effect yet | client-only grant | provider verify/reconcile | 처리 확인 중 |
| 2 | provider verify timeout | existing rights unchanged | timeout revoke | retry | 확인 실패 |
| 3 | verify success + DB fail | whole DB apply rollback | partial grant/ledger | same transaction evidence retry | 처리 확인 중 |
| 4 | DB commit + response lost | full committed effect | duplicate grant | idempotent replay | 재조회 |
| 5 | same tx concurrent verify | one source effect | duplicate receipt/grant | unique/lock/CAS replay | 정상 |
| 6 | same webhook N | one event/effect | N rights effects | dedupe | 정상 |
| 7 | delayed webhook | newer state preserved | rollback | comparator/reconcile | 정상/지연 |
| 8 | out-of-order webhook | newer state preserved | stale overwrite | comparator/reconcile | 정상 |
| 9 | webhook lost | local may temporarily lag | webhook-only permanent truth | reconciliation | 지연 가능 |
| 10 | revoke before local purchase apply | no blind grant | stale purchase grant | provider current-state verify | 확인 중 |
| 11 | restore + reconciliation concurrent | serialized source result | lost update/duplicate | same apply/CAS | 정상 |
| 12 | Guest→Member + payment | payment starts after Member | Guest commerce owner | structural prevention | 가입 후 결제 |
| 13 | provider outage | existing rights unchanged | mass deactivate | after recovery | 신규 확인 실패 |
| 14 | wrong provider credential | no verified effect | fallback trust | config fix + reverify | 확인 불가 |
| 15 | unknown/mismatched mapping | no grant | arbitrary Capability | catalog review | 처리 보류 |
| 16 | same tx conflicting evidence | conflict | overwrite | authoritative reverify/support | 처리 보류 |
| 17 | projection update fail | whole transaction rollback | ledger-only commit | replay | 처리 확인 중 |
| 18 | outbox delivery retry | rights committed + side effect pending | entitlement reapply | delivery retry only | 권한 정상 |

---

# 29. Migration Strategy

Current 9-table model을 유지하고 additive delta만 만든다.

## `product_capability_sets`

Conceptual target:

```text
id
product_id
definition_version
definition_hash
created_at
retired_at nullable
UNIQUE(product_id, definition_version)
UNIQUE(id, product_id)
```

Semantic fields are immutable.

`retired_at`은 `NULL → timestamp` one-way operational retirement만 허용하며 historical meaning을 바꾸지 않는다.

## `product_capability_items`

```text
capability_set_id
item_key
entitlement_key
scope_mode        # global | fixed
fixed_scope_key   # fixed only
validity_mode     # unbounded | fixed_duration | provider_expiry
duration_seconds  # fixed_duration only
```

v1 `fixed` scope는 server-owned/global content identity만 허용한다. User-owned/request-derived resource scope는 v1에서 금지한다.

## Offer pin

Add nullable-first:

```text
product_offers.capability_set_id
```

Required target constraint:

```text
FK (capability_set_id, product_id)
→ product_capability_sets(id, product_id)
```

기존 product/provider/external-product mapping과 함께 `capability_set_id`도 immutable historical identity가 된다.

## Purchase Intent v2 pin

Add:

```text
capability_set_id
capability_snapshot_jsonb
capability_snapshot_hash
```

Snapshot minimum:

```text
capabilitySetId
definitionVersion
definitionHash
```

Current `offer_snapshot_jsonb` v1 의미는 바꾸지 않는다.

## Historical backfill rule

```text
expand nullable
→ inventory existing offers/receipts
→ backfill only when exact historical mapping is provable
→ verify Product/Set/hash parity
→ activate command v2
→ enforce non-null only for activated Commerce slice
→ contract old path after evidence
```

Existing verified receipt/history가 있다면 current product hypothesis를 근거로 historical Capability Set을 추론해서 backfill하지 않는다. Proof가 없으면 review/quarantine 상태로 둔다.

No destructive migration of receipt/grant/event history.

---

# 30. Negative Test Matrix

| Case | Expected |
|---|---|
| client-only success | NO ENTITLEMENT |
| forged/unverified evidence | DENY |
| sandbox evidence in production | DENY |
| unknown provider product | DENY/no grant |
| Offer↔provider mismatch | DENY |
| Product↔Capability Set mismatch | DENY |
| Capability Set version/hash mismatch | DENY |
| client entitlement key/scope injection | DENY/ignored as non-authority |
| unrelated owner claim | DENY |
| Guest purchase intent | DENY |
| revoked account link used as binding | DENY |
| unverified receipt as entitlement source | DENY |
| unresolved provider event creates grant | DENY |
| future-active grant under MVP | DENY |
| dynamic request-derived paid scope | DENY |
| raw secret/token in response/log | FAIL gate |

---

# 31. Idempotency Test Matrix

| Case | Expected |
|---|---|
| same Purchase Intent key/same request ×N | one intent/replay |
| same key/different request | conflict |
| same provider transaction ×N | one receipt/source effect |
| same provider event ×N | one logical effect |
| same entitlement effect semantic dedupe | no-op/replay |
| same source identity/conflicting effect | conflict |
| DB commit/response loss retry | existing result |
| same restore transaction ×N | same receipt/grant |
| same tx conflicting product/owner/env | conflict/review |

---

# 32. Concurrency Test Matrix

| Race | Expected |
|---|---|
| same tx concurrent verification | one source effect |
| webhook + provider re-verification | one result |
| restore + provider event | lock/CAS serialization |
| multi-item Capability Set | all-or-neither |
| two independent grants same capability | both retained/count 2 |
| revoke one while another renews | correct surviving aggregate |
| first projection concurrent create | one logical row |
| comparator based on stale read | CAS fail/re-read/recompare |
| provider event + projection rebuild | no lost update |

---

# 33. Ordering / Stale Event Test Matrix

| Case | Expected |
|---|---|
| newer effect then stale event | no mutation |
| same order/same meaning | no-op |
| same order/conflicting meaning | conflict |
| `received_at` newer but semantic state older | no rollback |
| revoke newer than delayed renewal | revoked source state preserved |
| order key missing/incomparable | no mutation + reconcile |
| concurrent change after comparator read | CAS reject/retry |
| revoke observed before local purchase apply | current provider state reverify |

---

# 34. Recovery / Reconciliation Test Matrix

| Failure | Expected verification |
|---|---|
| client paid/callback lost | provider reconciliation creates one effect |
| webhook lost | local state converges after reconcile |
| verify success/DB fail | same evidence retry succeeds once |
| DB success/response fail | replay existing result |
| provider outage | existing entitlement read remains available |
| future-active effect | DENY under MVP |
| wall-clock-expired grant with stale active status | no access |
| finite 7d + finite 30d | count 2 + max expiry |
| finite + unbounded | active + effective expiry NULL |
| revoke one of multiple grants | remaining access preserved |
| no contributors | inactive/count 0 |
| corrupted effective projection | rebuild from grants produces same result |
| grant recovery | event/source provenance reproduces grant |
| outbox crash/retry | no entitlement reapplication |

---

# 35. MVP / POST-MVP / FUTURE

## MVP REQUIRED architecture

```text
server-owned Product/Offer/Capability authority
Member-only Purchase Intent
immutable Capability Set pin
provider-neutral server verification boundary
transaction/event dedupe
independent grants
append-only lifecycle ledger
exact effective aggregation
refund/revoke/restore provenance
reconciliation contract
full failure/concurrency/order/recovery tests
```

## MVP PRODUCT — OPEN

```text
first paid Product
exact entitlement_key/scope
validity mode
actual rail
price/presentation
refund 후 artifact access policy
```

## POST-MVP

```text
subscription
Character monetization
Story/Episode monetization unless selected for launch
expanded restore/cross-platform duplicate-purchase UX
```

## FUTURE

```text
promo codes
family sharing
regional pricing
cross-provider portability
Guest purchase
dynamic user-resource paid scope
future-dated entitlement activation
```

---

# 36. Open Decisions

These are deliberately isolated and do **not** reopen the provider-neutral Architecture.

## `P0-CM-01`

```text
Web provider
Apple IAP
Google Play Billing
one-off/subscription/bundle rail matrix
```

Blocks concrete provider adapter/SDK/webhook implementation.

## Launch paid catalog

```text
Product key/type
Capability Item(s)
entitlement_key/scope
validity_mode
price/presentation
```

## Paid artifact after refund

Generated Reading/content의 historical access/delete policy.

## `P0-PR-01`

Commerce/accounting/support evidence의 exact retention/legal duration. Real provider evidence persistence 전 implementation-safe subset 필요.

## Selected-provider ordering proof

Adapter must prove safe comparator or equivalent fail-closed current-state reconciliation before activation.

## Platform Integrity documentation consolidation

Recovered final-reviewed monolith + later merged production corrections를 main canonical doc로 정리하는 documentation delta.

---

# 37. Acceptance Criteria

Architecture design closure:

- [x] latest main inspected
- [x] Commerce schema/runtime/test inventory established
- [x] recovered final-reviewed Platform Integrity architecture mechanics reviewed
- [x] later merged Platform Integrity corrections recognized
- [x] Production Operations boundary reviewed
- [x] DB ERD / Usecase / UX paid scope recovered
- [x] Product / Offer / Capability authority defined
- [x] historical Capability mapping version/pin defined
- [x] Purchase Intent authority defined
- [x] server-side verification boundary defined
- [x] provider-neutral evidence defined
- [x] transaction/provider-event idempotency defined
- [x] duplicate/out-of-order/stale rules defined
- [x] grant authority defined
- [x] event transition table defined
- [x] future-active gap closed by explicit MVP deny
- [x] effective aggregation formula defined
- [x] refund/revoke/restore defined
- [x] subscription explicitly non-MVP
- [x] Guest→Member Commerce policy defined
- [x] partial failure/reconciliation defined
- [x] privacy/audit boundary defined
- [x] current→target migration strategy defined
- [x] negative/idempotency/concurrency/ordering/recovery matrices defined
- [x] MVP/POST-MVP/FUTURE separated
- [x] SRC-18 resolved and companion status synchronized
- [x] SRC-21 resolved and companion status synchronized
- [x] recursive self-review completed

Implementation remains HOLD until applicable gates are decided/implemented/tested.

---

# 38. Implementation Phases

Architecture Authority is now design-closed. Implementation has **not** started.

## Phase 1 — Authority synchronization

- sync root Commerce spec / source-gap register references to this Architecture
- preserve Platform Integrity documentation delta as separate work

## Phase 2 — additive schema delta

- Product Capability Set tables/constraints
- Offer capability-set pin
- Purchase Intent v2 capability pin
- provider evidence provenance fields only as required

## Phase 3 — launch Product / Offer / Capability catalog

Only after Product decision.

## Phase 4 — Purchase Intent v2

Extend current safe v1 command; do not weaken existing owner/idempotency guarantees.

## Phase 5 — provider-neutral verification boundary

No provider SDK types in domain core.

## Phase 6 — selected provider adapter

Only after `P0-CM-01`.

## Phase 7 — atomic verified evidence apply

receipt/source → grant/event/effective projection/outbox.

## Phase 8 — provider event/webhook

Only where selected rail requires it.

## Phase 9 — refund/revoke/restore

Same source/apply path; no shortcut mutation.

## Phase 10 — reconciliation

callback/webhook/order/conflict recovery.

## Phase 11 — ownership E2E

Member-only, cross-account negative, restore ownership.

## Phase 12 — full Commerce verification

negative + idempotency + concurrency + ordering + partial failure + rebuild + reconciliation + provider sandbox contract.

## Phase 13 — Operations binding

Provider secret/monitoring/alerting through Production Operations authority.

## Phase 14 — production Commerce smoke

Only after exact-head CI, migration evidence, provider contract tests, rollback/reconciliation proof.

---

# Recursive Self-Review Result

## Review A — Authority conflict: PASS

- Platform Integrity의 idempotency/transaction/ownership/RLS/locking/outbox mechanism을 재설계하지 않았다.
- provider call은 DB transaction 밖에 유지했다.
- Production Operations의 hosting/secret/logging/monitoring mechanics를 재설계하지 않았다.
- Product Capability Set은 과거 source가 이미 정했다고 주장하지 않고, 이번 후속 Commerce Architecture가 명시적으로 새 authority를 채택했다.
- concrete launch Product/provider/subscription은 source보다 앞서 확정하지 않았다.

## Review B — Money / Rights correctness: PASS

- client-only grant path 없음.
- provider transaction/event duplicate one-effect 규칙 존재.
- stale/incomparable ordering fail-closed.
- historical Product meaning pinned.
- one grant revoke는 다른 grant에 영향 없음.
- exact aggregate formula 존재.
- future-active projection undergrant gap은 MVP future-active DENY로 제거.
- sandbox→production grant 금지.

## Review C — Failure / Recovery: PASS

- verify success/DB fail = atomic rollback + retry/reconcile.
- DB success/response loss = idempotent replay.
- webhook loss = reconciliation.
- provider outage = existing rights preserved.
- comparator stale read = CAS/re-read.
- outbox retry = rights mutation과 분리.

## Review D — Scope: PASS

- subscription/provider/launch SKU를 임의 MVP로 올리지 않았다.
- dynamic client-derived scope를 v1에서 금지했다.
- Guest purchase를 미래 확장으로 분리했다.
- refund 후 artifact access는 Product decision으로 남겼다.

## Review E — Migration: PASS

- current 9-table model 유지.
- additive expand/backfill/verify/enforce/contract.
- Product↔Capability Set composite FK 및 immutable Offer pin 필요성을 명시했다.
- historical mapping을 추론 backfill하지 않는다.
- existing receipt/grant/event history destructive rewrite 없음.

## Final architecture verdict

```text
additional mandatory architecture correction = none
optional/documentation follow-up = root spec/register sync + Platform Integrity doc consolidation
external decisions required before provider implementation = P0-CM-01 + launch Product + P0-PR-01 safe subset

결제·권한 설계 CLOSED
implementation HOLD
```
