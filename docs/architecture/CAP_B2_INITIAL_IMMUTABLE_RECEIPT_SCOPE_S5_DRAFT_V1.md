# CAP-B2 S5 — 최초 Reading 구매 당시 잠금 범위 불변 증빙

> 상태: PRIVATE · DRAFT · 운영 Checkout/Reader/T2/자동 환불 OFF
> Watchtower-Track: applizing
> 의존: #2014 최초 Reading 결속·영수증 발급, #2013 초기 scope 및 정책 잠금, #2004 Provider 회수 후보

## S5 신규 범위

- **개인정보·삭제 정책 차단:** 새로운 subject-linked 테이블에 대한 기존 P0-PR-01 기록은 고정된 별도 Owner 자산입니다. 이 PR은 해당 FK 그래프를 임의 변경하지 않고, 대신 비공개 테이블의 삽입을 **검증 영수증·Grant·Subject·Birth·Product·승인 규칙의 서버측 검증 트리거**로 제한합니다. 정식 FK/삭제·보존·DR 분류, 개인 데이터 삭제 절차 승인 없이는 운영 마이그레이션 금지입니다.\n- **1840 마이그레이션:** `standard_reader_initial_purchase_scope_pins_v1` (receipt PK, exact purchase intent/subject/product/birth revision/Grant/approved policy revision, 서버 유도 scope identity). 과거 거래 범위는 append-only. Client SELECT/쓰기 및 런타임 함수 EXECUTE 금지.
- `internal_issue_initial_reader_receipt_with_scope_pin_v1`: S4 기존 verified initial Receipt→Grant 발급 경로와 **같은 트랜잭션**에서 정확한 구매 Grant 1건과 승인 Standard revision을 확인하고 불변 scope pin을 기록. 불일치·미승인·중복 provenance는 트랜잭션 전체 롤백.
- `internal_acquire_initial_receipt_scope_pin_for_revoke_v1`: Provider Event→검증된 생산 Receipt→구매 Grant→불변 scope pin을 따라 **구매 시점의 initial advisory lock**을 획득. 현재 Birth 개정·Offer 활성 상태를 참조하지 않는다. unbound purchase도 scope만 확인 가능하며 실제 회수 Grant 변경은 하지 않는다.
- 격리 PostgreSQL에서 최초 Reader 결속 없는 상태의 verified cancellation, 현재 Birth 개정 및 Offer 비활성화, preflight 권한/잘못된 Grant 거부, 별도 두 DB connection 경쟁 잠금 테스트 추가.

## 구분해야 할 완료 범위

1. 최초 Reading 유료 결속 후보(1820) 및 원 발급 후보(1830)는 #2014의 실제 PostgreSQL 통과 상태.
2. **새 S5 pin 발급 경로는 아직 다른 기존 issuer가 자동 사용하지 않음.** 런타임 연결 전에 S4 1830 직접 경로 차단/교체 및 API 경유 정책 검증 필요.
3. S5 회수 함수는 `scope lock preflight`에 한정. 실제 Commerce Provider `internal_apply_entitlement_effect_v1` 호출·CAS/outbox/Refund/expiry·Reader scope/T2 차단 연동은 **별도 비공개 Writer + 두 방향 경합 증명 후** 가능.
4. 1820 최초 Binder가 pin의 exact Grant/approved revision을 강제 확인하도록 통합하는 작업이 필요(현재 S4에는 해당 보강 없음).
5. 구매 전후 Birth 개정, Content retire/Unlock 회수, 여러 Reader 스코프의 lock order와 historical Grant revoke 순서 정렬은 DB·Commerce Owner 판단이 필요.
6. Product 1770/1790, RR-03 1720 번호 충돌 및 DR 복구·승인은 미해결. **미병합/운영 불가.**

**안전 경계:** 환불 경합 중 단순히 'Grant가 없어서 환불 거절'하지 않는다. 이 S5 preflight가 지원하지 않는 구버전/미핀 거래는 운영에서 별도 검증·수동 회수 경로가 필요하며, 자동 환불 차단 기능으로 연결하지 않는다.
