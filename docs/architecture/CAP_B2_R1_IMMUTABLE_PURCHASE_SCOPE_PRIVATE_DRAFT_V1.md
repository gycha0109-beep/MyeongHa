# CAP-B2/R1 — 구매 당시 최초 Scope 불변 provenance, Private 구현 증명

> 2026-10-13 / Watchtower-Track: applizing
> 상태: **DRAFT / UNMERGED / PRIVILEGED-ONLY / NO LIVE CALLER**
> 기반: #2014 exact HEAD `0d857eeb247b3c9d870685c322b7902d1b0955c3`
> 범위: B2-R1 private snapshot/cancellation scope resolver. R2의 실제 환불·권한 회수 효과는 포함하지 않습니다.

## 1. 확인한 결함

1810의 initial scope candidate는 **현재** `product_offers.enabled`, `standard_reading_product_specs.retired_at`, `birth_profiles.current_revision_id`, 활성 정책/runtime을 조인합니다. 그러므로 결제 이후 상품 은퇴·출생정보 수정이 발생하면 동일 receipt에 대한 취소의 역사적 scope를 회복할 수 없습니다. 1770/1780은 이미 존재하는 Reader Access scope에 한정되어 최초 결속 전 취소를 처리하지 못합니다.

## 2. 신규 전진 Migration 1840

- `standard_reader_initial_purchase_scope_pins_v1`: **Purchase Intent별 append-only** 최초 Scope identity(1810과 동일 JSONB 배열/1830 hash seed), Subject, Offer, Product, Capability, Reader Selection, 최초 자기 Birth Revision/input-hash, Spec, Domain Runtime Version, 승인 Product policy revision을 고정.
- `internal_capture_b2_r1_initial_checkout_scope_pin_v1`: **검증 전 CREATED/PENDING Intent** + 최초 Offer Role + 정확한 선택 Reader + 현재 Standard 정책에서만 허용. Subject 유효 문맥, READ COMMITTED, **initial scope → Product policy → Birth row FOR SHARE** 순으로 잠근 후 재조회·불변 INSERT. 두 번째 호출은 동일 pinned identity만 idempotent.
- `internal_qry_b2_r1_verified_receipt_initial_scope_v1`: 검증된 production Receipt ↔ immutable Purchase/Reader pin. **현재 Birth pointer / 활성 Offer / Spec retirement / Product approval 상태를 조회하지 않음**. 과거 refund scope 조회를 현재 access 판정으로 착각하지 않음.
- `internal_acquire_b2_r1_verified_cancel_initial_scope_lock_v1`: provider `payment.cancelled` verified event ↔ exact production Receipt ↔ independent purchase Grant ↔ pin 확인. **Reader Access 0행에도** 동일 1810 advisory lock. 잠금 후 event/receipt/grant/pin 재검증. 기존 Commerce Grant effect 호출·직접 UPDATE는 수행하지 않음.
- 새 PRIVATE 함수/테이블에 public/anon/authenticated/service/API/Commerce/Chat runtime EXECUTE/SELECT 없음. RLS on, no policy. 기존 1220, 1770/1780, 1800/1810/1820/1830, 운영 Commerce Writer 및 기배포 migration 원본 **변경 없음**.

## 3. 증거 수준

`test/db/standard_reader_initial_scope_pin_r1_real_pg.sh`: PG15 disposable fixture에서 최초 구매 CREATED→pin→verified Receipt+Grant→**결속 전 취소 event scope**→private Binder→Birth Revision 추가→Offer 및 Spec retire→동일 historical scope 검증; 위조 Receipt/불변 UPDATE/ACL 음성; 두 DB 연결에서 1810 hash/seed 잠금 경쟁 및 release 후 retry.

- 새 테스트가 `test/db/run_authority_core.sh` PG15 isolated suite에서 실행되도록 연결되었습니다.
- PG17 및 최종 HEAD CI는 실제 workflow 성공을 확인해야만 PASS로 기록합니다. mock-only 증명 불인정.
- `catalog.expected.sha256`는 실제 합성 PostgreSQL catalog stream의 새 digest로 재계산 후 제출해야 합니다. 과거 값 재사용 금지.

## 4. 중요한 통합 HOLD / 자체 재검토

1. **구매 시점 정확성:** 새 capture는 반드시 서버가 Reader 선택을 기록하는 **동일 trusted purchase transaction**에서 검증 완료 *이전에* 호출해야 합니다. 현재 기존 구매 원본 Writer를 수정하거나 호출자를 연결하지 않았습니다. 늦은 pin/backfill(이미 verified, Birth revision 변경)은 **거절**됩니다. 이 전제 미적용 시 R1이 운영 완료된 것이 아닙니다.
2. **Refund R2:** event lock은 역사를 식별할 뿐 `internal_apply_entitlement_effect_v1`/CAS를 호출하지 않습니다. 운영 provider ingress/자동 환불 거부는 완전히 HOLD. R2는 first binding 부재 시 이 lock을 **Commerce Grant/Provider row lock 이전**에 사용하고 과거/현재 권한을 분리해야 합니다.
3. **Privacy:** pin은 Birth Revision ID와 source input fingerprint까지 보유합니다. DELETE는 privileged Privacy finalizer를 위해 허용하되 별도 source/receipt retention, 계정 삭제·백업·복원, PII classification과 보존기간 승인 전 배포 금지. Birth revision FK를 일부러 추가하지 않아 탈퇴 시 Birth 삭제를 데이터베이스에서 가로막지 않습니다. 이 결정은 Privacy 승인 확정이 아닙니다.
4. **경합:** 모든 기존 Writer가 1840을 채택한 것은 아닙니다. Birth append 자체는 S3 advisory에 참여하지 않으나 pin transaction에서 **Birth row FOR SHARE**로 append FOR UPDATE와 직렬화합니다. Provider/Binder/T2 전체 교차 Writer 증명은 R2/R3입니다.
5. **Approval drift:** 구매 시 `approved_policy_revision`은 pin에 영구 기록되나, 이후 실제 유료 접근에는 현재 Rule/Grant/Release 상태를 반드시 별도 재검증합니다. 역사적 승인 == 현재 접근권은 아닙니다.
6. **Migration merge:** #2014의 1830 이후 1840만 사용. 1770 DB/Product 원 스택 및 RR-03 1720 충돌, #1941 운영 1400~1450 복구, Owner 승인은 이전대로 HOLD.

## 5. 다음

1. R1: exact SHA PG15/17 DB·Commerce·Content·Security·Governance CI, catalog SHA 재계산, 필요한 실패 수정.
2. R2: Purchase pin의 검증된 취소 Scope lock부터 기존 Commerce CAS/Effect와 결합하는 **비공개 별도 Writer**. 두 DB 연결 발급 먼저/환불 먼저 교차 실행과 0-Access 회수.
3. R3 이후 Owner cross-track 승인 없이는 병합·Production migrate·LIVE Checkout·T2 유료 본문 공개 금지.
