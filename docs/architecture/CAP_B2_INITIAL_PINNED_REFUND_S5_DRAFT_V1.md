# CAP-B2 S5 — Immutable Initial Purchase Scope & Verified Refund

> Watchtower-Track: applizing
> 상태: PRIVATE DRAFT / 운영 미연결 / 기존 1220·1820·1830 이력 불변

## 구현

- `1840_standard_reader_initial_immutable_scope_pin_private_v1.sql`: 최초 verified Receipt가 기존 Commerce 발급 Writer를 호출하기 전에 Subject × Initial Purchase Intent × Receipt × Product × 현재 Birth Revision × S3 DB-derived `initial_scope_identity`를 원자적으로 **불변 pin**으로 적재. 재시도는 같은 Scope만 인정하고 다른 Receipt/Scope는 거절. UPDATE/DELETE 및 runtime SELECT 모두 차단.
- `1850_standard_reader_initial_provider_revoke_pinned_private_v1.sql`: 서버가 검증한 `payment.cancelled` Provider Event → production Receipt → purchase-backed Grant → immutable initial pin을 확인. S3의 **원래와 동일한** advisory initial lock을 먼저 취득. 초기 Reading 결속이 존재하면 현재 Reader scope lock도 획득한 뒤 원본 `internal_apply_entitlement_effect_v1`의 CAS·이벤트·Projection/Outbox에 위임.
- 환불 때는 **현재 Offer 상태, 현재 출생정보 revision, 최신 Product Rule**을 조회해 초기 잠금을 재생성하지 않음. 구매 뒤 Offer가 은퇴해도 이력상 Grant 환불·회수 가능해야 함.
- 초기 결속 전 환불은 Reader/Reading ID를 가짜로 만들지 않으며, 기발급 Grant가 revoked 상태면 S4 Binder에서 거절. 결속 후 환불은 immutable Access 이력은 보존하고 현재 Grant/Reader 원문 열람만 거절.
- 이 함수는 verified Provider Event만 인정하고 다른 Subject context를 덮어쓰지 않음. 기존 1780 **추가 Reader** 환불/회수 브리지는 변경하지 않음.

## 검증

- `test/db/standard_reader_initial_provider_revoke_pinned_real_pg.sh`: **bound** / **unbound** 별도 격리 PostgreSQL 15, S4 verified synthetic Receipt/Grant 연결로 실제 Commerce revoke 및 비공개 ACL/불변 pin/Reader 현재권한 거절을 확인.
- `test/db/standard_reader_initial_refund_bind_race_s5.sh`: 별도 두 연결에서 **refund-first** 및 **bind-first** 양방향. 한 transaction이 private Writer + 최초 scope lock을 보유할 때 상대가 lock_timeout으로 차단되고, 해제 후 원본 Commerce revoke 또는 현재 Grant 거절 확인.
- `1860_standard_reader_initial_pinned_grant_admission_private_v1.sql`: 초기 Binder가 S5 immutable pin의 **정확한 Receipt와 현재 Grant 동일성**을 별도로 입증해야만 official Reading을 INSERT. 다른 unpinned/private issuance 경로가 초기 Reader 권한을 우회하지 못함.
- **개인정보 삭제:** pin은 Birth Profile 수정·삭제 이후에도 환불 감사 증거가 필요하므로 deletable Birth Revision이나 Subject를 직접 FK로 묶지 않는다. 그러나 여전히 간접 Subject 이력이며 retention/삭제/익명화 **정책 미결정**, Privacy Owner 검토 전 운영 불가.
- S3 초기 잠금과 동일한 키의 양방향 별도 세션 경합을 신규 테스트로 확인. Refund/T2 운영 범위 전체 및 실제 Provider ingress worker는 별도 Owner 검토.
- 현 테스트 결과/CI는 PR exact HEAD 확인 후만 기록. 운영 Provider ingress, 환불 처리 정책/자동 거부, Content release/T2 공개, 실상품 승인/마이그레이션 적용을 활성화하지 않음.

## 출시 차단

1. 구매 이전 취소·Receipt/Grant 미생성 이벤트에서의 Provider replay/compensation 의미를 Commerce Owner가 확정해야 함.
2. 최초 Reader Lock → Reader T2 lock → Grant row lock의 전 경로 (기존 S2 추가 Reader/Grant 발급 및 Reader T2 포함) 데드락·경합/승인철회 시점 회귀 검증 필요.
3. S5 pin은 S4 비공개 Issuer에서 생성되며, 운영의 모든 initial Issuance Writer를 대체하지 않았음. 별도 운영 경로에서 직접 과거/미pin Grant를 되돌리려면 Owner-controlled migration/bridge 필요.
4. 변경된 Product/DB migration 1720·1770 스택 및 운영 DR 합의, Product/Commerce/DB/Reader/Legal 승인 전 Merge/EXECUTE/Paid Release HOLD.
