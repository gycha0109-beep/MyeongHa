# 명하 Commerce Payment Source Authority Decision V1

> Date: 2026-09-05  
> Status: **DECIDED / FOUNDATION IMPLEMENTED / VERIFIED APPLY STILL HOLD**  
> Scope: Web one-off Commerce provider-neutral source authority  
> Depends on: `COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`, `COMMERCE_GUEST_PURCHASE_OWNERSHIP_DECISION_V1.md`, `COMMERCE_EVIDENCE_DATA_MINIMIZATION_DECISION_V1.md`

## 1. 목적

Commerce 심층 재검수에서 확인된 다음 P0 구조 결함을 provider adapter 이전에 닫는다.

```text
가격/통화가 Purchase Intent에 immutable하게 pin되지 않음
Verified evidence와 실제 결제금액을 exact compare할 persistence slot 부재
sandbox/production + verifier provenance가 first-class DB evidence가 아님
Provider Event가 같은 사용자/같은 provider의 다른 Receipt에 잘못 resolve될 수 있음
verified payload / provider-event resolution이 in-place rewrite될 수 있음
purchase Grant가 exact source Receipt를 first-class로 pin하지 않음
Entitlement Event ledger가 future apply에서 rebuildable target state를 보존할 필드가 부족함
```

이 결정은 PSP를 선택하지 않고 payment/entitlement mutation runtime을 활성화하지 않는다.

## 2. Money Authority

Future Purchase Intent v2는 provider handoff 전에 서버가 결정한 charge terms를 pin한다.

```text
expected_amount_minor
expected_currency
charge_terms_version
```

Client 가격/통화는 authority가 아니다.

Verified Receipt는 provider adapter가 검증한:

```text
verified_amount_minor
verified_currency
```

를 보존할 수 있다.

Purchase Intent에 versioned charge terms가 존재하면 Receipt monetary facts는 반드시 exact match해야 한다.

```text
expected_amount_minor == verified_amount_minor
expected_currency     == verified_currency
```

불일치하면 verified Receipt authority가 성립하지 않는다.

Historical v1 Purchase Intent는 새 charge terms가 NULL인 채 유지된다. NULL legacy slot은 Production payment activation authority가 아니다.

## 3. Environment / Verifier Provenance

Receipt와 Provider Event는 additive first-class provenance를 가진다.

```text
environment = sandbox | production
verifier_revision
```

한 번 기록된 environment/verifier revision은 in-place rewrite하지 않는다.

Provider Event가 Receipt lineage를 사용하면 양쪽 environment가 존재하는 경우 exact match해야 한다.

Sandbox evidence가 Production right를 생성할 수 없다는 기존 invariant는 future apply command에서 별도로 계속 강제한다.

## 4. Exact Provider Transaction Lineage

같은 subject + 같은 provider는 동일 transaction lineage proof가 아니다.

Receipt-based Provider Event resolution은 다음 provider transaction/original-chain identity 중 검증된 일치 관계가 있어야 한다.

```text
Event.external_transaction_id
Event.external_original_transaction_id
↔
Receipt.external_transaction_id
Receipt.external_original_transaction_id
```

관계가 없으면:

```text
NO RESOLUTION
NO ENTITLEMENT MUTATION
→ conflict/reconciliation
```

## 5. Evidence Immutability

Verified evidence row는 lifecycle projection과 구분한다.

다음은 한 번 기록된 뒤 in-place rewrite하지 않는다.

```text
Receipt.environment
Receipt.verifier_revision
Receipt.verified_amount_minor / verified_currency
Receipt.verified_payload_jsonb

ProviderEvent.environment
ProviderEvent.verifier_revision
ProviderEvent.verified_payload_jsonb
ProviderEvent canonical resolution tuple
```

새 provider lifecycle fact는 기존 verified payload overwrite가 아니라 새 Provider Event/evidence로 표현한다.

Receipt state는 기존 verified fact를 보존하면서:

```text
verified → revoked
```

만 허용한다. `rejected`와 `revoked`는 현재 row에서 terminal이다.

## 6. Purchase Grant Source Receipt

`entitlement_grants.source_receipt_id`를 additive source-lineage slot으로 추가한다.

```text
source_receipt_id != NULL
→ grant_source_type = purchase
→ exact same subject Receipt FK
```

Historical grants는 NULL일 수 있다. Future verified purchase apply는 이 field를 반드시 채워야 하며, Production activation 전에 다음 invariant를 command/test로 승격해야 한다.

```text
refund/revoke Receipt R
→ R을 source_receipt_id로 가진 purchase Grant만 target
→ 다른 Receipt/Promo/System Grant는 mutation 금지
```

## 7. Rebuildable Entitlement Event V2

새 event schema `ent-event-v2`는 최소 다음 target state를 ledger에 보존한다.

```text
target_status
target_valid_from
target_valid_until
reason_code
```

Static event mapping:

```text
granted | renewed | restored → active
expired                     → expired
revoked                     → revoked
adjusted                    → explicit target + reason
```

Historical `ent-event-v1` rows는 그대로 허용한다. Future verified Commerce apply는 `ent-event-v2`를 사용해야 한다.

Production activation 전 rebuild verifier는 다음을 증명해야 한다.

```text
Entitlement Grant current state
← replay ent-event-v2 + verified source provenance
```

## 8. 현재 구현

Migration:

```text
supabase/migrations/0930_commerce_payment_source_authority_hardening.sql
```

Verification:

```text
test/db/commerce_payment_source_authority.sql
.github/workflows/db-commerce-entitlement-projection-recompute.yml
```

Implemented now:

- Purchase Intent charge-term slots + pair/format constraints
- charge-term immutability once pinned
- Receipt environment/verifier/verified-money slots
- expected vs verified amount/currency exact DB guard when charge terms are pinned
- Receipt verified evidence one-way immutability
- Receipt verified→revoked-only terminal hardening
- Provider Event environment/verifier slots
- exact Provider Event↔Receipt transaction lineage validation
- Provider Event canonical resolution one-way immutability
- purchase Grant exact source Receipt FK slot
- rebuildable `ent-event-v2` target-state columns/shape constraint

## 9. Explicitly NOT implemented by this slice

```text
Guest Purchase Intent v2
Member-only table trigger supersession
TypeScript commerce-evidence-v2 normalizer
provider authenticity/signature verifier
PSP SDK / checkout route / webhook route
verified Receipt → Grant/Event atomic apply command
provider ordering comparator / CAS
partial-refund product semantics
Guest→existing Member cross-subject purchase idempotency
account deletion vs in-flight payment serialization
Guest-aware composite entitlement read
Production paid catalog
```

따라서 이 migration/CI가 green이어도 **Production Payment Ready**가 아니다.

## 10. 다음 authority-complete slice

다음 구현 순서는:

```text
1. commerce-evidence-v2 structural contract
   - bounded strings
   - amount/currency
   - environment/verifier
   - canonical timestamp grammar

2. Purchase Intent v2
   - active Guest | active Member
   - exact canonical subject context
   - immutable charge terms
   - existing v1 command unchanged
   - 0200 Member-only table trigger supersession

3. source-lineage-safe verified apply
   - initial grant requires Purchase Intent
   - Grant.source_receipt_id mandatory for purchase apply
   - ent-event-v2 only
   - exact Receipt/Event source matching
   - one transaction: event + grant + projection + outbox
```

Exact PSP `P0-CM-02`, launch SKU `P0-CM-03`, parent retention `P0-PR-01`, generic existing-Member Guest merge `SRC-24` remain independent gates.
