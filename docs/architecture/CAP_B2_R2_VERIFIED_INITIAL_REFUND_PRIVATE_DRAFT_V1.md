# CAP-B2/R2 — 검증된 최초 구매 취소·권한 회수 PRIVATE 후보

> 2026-10-13 · Watchtower-Track: applizing
> 상태 **격리 Draft / NO runtime EXECUTE / NO live refund / NO paid reveal**
> 선행: R1 #2029 (1840 pin), S2 #2004 (1770/1780), S4 #2014 (1820/1830)
> **B2-R2 출시 완료가 아니라 합성 실DB 검증 후보입니다.**

## 변경

- `1850_standard_reader_initial_verified_refund_private_v1.sql`: 검증된 `payment.cancelled` event → production Receipt → 구매 당시 1840 immutable pin 및 **정확한 독립 Grant** → 1810과 동일 최초 Scope 잠금.
- 기존 Reader Access 0행 시 기존 `internal_apply_entitlement_effect_v1`의 CAS·정본 원장·Projection·Outbox만 사용해 회수. **직접 Grant UPDATE 없음**.
- Access가 이미 생겼다면 기존 1770 `internal_apply_official_reader_provider_revoke_locked_v1`로 위임해 Reader 범위 잠금 후 같은 Commerce Effect 처리.
- 정확한 Subject는 verified Provider Event/Receipt/Grant에서 파생하고 거래 로컬 문맥을 복구. `READ COMMITTED` 필수. 기존 권한 0행은 결속 실패가 아님. 원본 Binder/Commerce 함수 미변경.
- 신규 SECURITY DEFINER은 privileged DB owner만 실행 가능하며 일반 public/anon/authenticated/service/API/Commerce/Chat 역할의 직접 EXECUTE를 전부 거부.

## 실제 DB 테스트 (CI 결과 별도)

`test/db/standard_reader_initial_refund_r2_real_pg.sh`:
- 독립 PostgreSQL 연결 A가 verified 취소·Effect를 먼저 실행해 커밋 전 잠금 보유 → B의 첫 1820 Binder 대기 → 회수 후 결속 DENY. Grant=revoked, Access=0, Entitlement event=1.
- A의 최초 1820 Binder가 잠금 보유 → 검증된 Provider Event 도착 → 독립 B 환불 Effect가 대기 → Binder 커밋 후 Reader scope 잠금과 Commerce CAS로 revoke. Access 이력 보존, 현재 런타임 Grant 권한 0.
- 실제 DB 세션의 `pg_stat_activity.wait_event_type='Lock'` 관측 필수. mock-only 통과 불가.
- 두 상황 각각 독립 DB fixture 사용. PostgreSQL 15 CI `run_authority_core.sh`에 등록.

## 1860 보강 — Grant 0행 상태에서 verified 취소가 먼저 발생하는 경우

- `internal_apply_b2_r2_initial_receipt_cancel_guarded_private_v1`: 구매 당시 1840 pin scope lock을 먼저 잡고 이미 verified/processed `payment.cancelled` event가 있으면 1830 원본 Receipt issuer 호출 전에 DENY. 호출 후 재검증에서도 이벤트 확인 시 거래 전체 롤백.
- `test/db/standard_reader_initial_no_grant_r2_real_pg.sh`: A의 verified cancellation event 트랜잭션이 최초 Scope lock을 보유한 상태에서 B의 새 gated issuer가 실제 PostgreSQL lock wait 후 취소를 인식하여 거절하는 두 연결 테스트. event-first, Grant 0행, Entitlement Event 0, Reader Access 0 검증.
- **중요:** 실제 verified Provider ingress가 아직 이 Scope lock을 채택하지 않았고, 실제 구매 issuer가 신규 1860으로 전환된 것도 아닙니다. 이 두 Owner 연결이 적용되기 전에는 race 안전을 운영상 보증하지 않습니다.

## 자체 검토: 출시 전 반드시 해결

1. **Grant가 아직 0행인 verified 취소**는 원본 1080 Commerce Effect가 적용할 Grant가 없습니다. 1860 신규 비공개 issuer wrapper는 verified event-first를 거절하지만, 기존 1830 원본의 직접 실행은 변경하지 않았습니다. DB/Commerce Owner의 원자 wrapper 사용·legacy ingress 차단, `receipt→pin→event-gate→issuer` 계약 및 provider ingress shared lock 채택이 필요합니다. 자동 환불 효과 활성화 금지.
2. Provider Event의 verification/commit writer는 아직 1810 초기 잠금에 참여하지 않습니다. 1850은 verified event가 이미 커밋된 경우만 처리하며, 이벤트 도착 순간의 선형화까지 보증하지 않습니다.
3. 최초/추가 Binder, Provider revoke, Receipt issuer, Product Approval/Withdraw, Content Retire, T2 전체 실제 Writer의 잠금 순서·데드락 검증(B2-R3) 미완. 이미 존재하는 extra-reader 접근 경로의 초과 전파 권한을 임의 공개하지 않습니다.
4. 구매 시점 R1 pin이 기존 trusted Purchase Intent 생성 경로에서 원자 호출된다는 실증 없음. 기존 구매에 사후 pin 복구/역산 금지.
5. R1 1840의 신규 Privacy FK 및 Birth Revision 민감정보 보존/탈퇴 처리 정책은 Owner 결정을 요구. P0-PR-01 승인된 140-edge/59-table fingerprint를 이 트랙에서 변경하지 않습니다. GOVERNANCE failure를 임의 무시하거나 승인했다고 선언하지 않습니다.
6. 원 Product 1770/DB 1770, RR-03 1720 충돌 및 Production 1400~1450 DR, full PG15/17 BIND 매트릭스, Owner/Legal/Saju/Reader 결재 모두 HOLD.
7. 테스트 성공하더라도 LIVE PortOne·환불 거부 자동화·운영 migration·T2 공개·Public/Commerce EXECUTE는 **OFF**.

## 다음

- 정확한 HEAD 실PG15·PG17, migration catalog hash, Commerce/Core/Content/Governance CI 검증 및 실패 수정.
- R2 미완 Grant 0행/event-first 취소 처리와 trusted issuance gate 소유자 계약/격리 실DB 증명.
- B2-R3: Writer별 acquisition order 및 scope→Product→Reader 충돌/phantom/현재 Release 검증. 승인 없이 운영 cutover 불가.
