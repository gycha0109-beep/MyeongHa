# Commerce P4 — 정확한 Reader Grant 잠금·버전 검사 연결 v1

**기준:** 2026-10-31, 병합 완료된 PR #2801 이후 `main`
**상태:** operations-only 비배포 내부 사전검사. 운영 환불·Grant 회수·Reader 최종 제공 권한 **미활성화**.

## 구현

`scripts/operations/commerce-exact-reader-revoke-cas-locked-preflight-v1.mjs`는 기존 Commerce 이벤트/Reader Grant 계약을 **동일한 직렬화 트랜잭션** 안에서 재확인하는 준비 단계입니다.

1. 내부 실행용 DB 계정의 완전한 조회 권한과 읽기·쓰기 트랜잭션 권한을 확인합니다. 사용자-facing 인증 역할과 service role은 차단합니다.
2. 정확한 PortOne Production `commerce_provider_events` 행을 `FOR UPDATE`로 잠근 뒤, 이미 검증된 원본 영수증으로 Subject·Purchase Intent를 조회합니다. 외부 요청이 전달한 Subject·Reader·영수증은 받지 않습니다.
3. 해당 원본 영수증/Subject/Purchase Intent에 연결된 **단 하나의 구매 `entitlement_grants`** 행을 `FOR UPDATE`로 잠급니다. 기존 `internal_apply_entitlement_effect_v1`과 같이 Provider Event를 먼저 잠그고 Grant를 잠급니다. 다른 Reader의 Grant를 잠그지 않습니다.
4. 잠금 안에서 Grant `revision`과 `last_provider_ordering_key`를 이전에 읽은 예상값에 대조하고, 변경되었으면 즉시 보류합니다. 이전 단독 read-only 검사의 결과를 이 트랜잭션의 권한으로 사용하지 않습니다.
5. 같은 트랜잭션에서 취소 이벤트 ↔ 원본 영수증 ↔ 정확한 Reader Grant ↔ `source-v2` 개별 성공 취소액 ↔ 기존 Entitlement Effect를 다시 대조합니다. 같은 이벤트의 기존 revocation이면 **재전송 관측**으로만 분류합니다.
6. 어떤 결과도 실제 Entitlement Effect를 실행하지 않으며, **항상 ROLLBACK**으로 잠금 해제합니다.

## 제한

- 이 기능의 잠금은 **Reader R2/T2 최종 공개용 범위 잠금이 아닙니다**. R2 범위·Birth Profile·동시 신규 Reader 구매 바인딩 전역 잠금 순서는 아직 승인/구현되지 않았습니다.
- `provider_ordering_key`가 존재하더라도 **신뢰 가능한 NEWER/STALE 비교가 아닙니다**. Provider ordering comparator가 아직 연결되지 않았으므로 모든 새로운 권한 회수는 차단합니다.
- 기존 `internal_apply_entitlement_effect_v1`은 Grant/Event/Projection/Outbox를 원자적으로 기록하고 revision CAS를 지원하지만, **Provider ordering·법적 청약철회 판단·제공 증거는 판단하지 않습니다**. 이 함수를 직접 호출하는 코드는 추가하지 않았습니다.
- 실제 환불이나 누적 취소액만을 근거로 특정 Reader Grant를 회수하지 않습니다. 부분 취소는 별도 검토로 보류합니다.
- 이 사전검사는 SQL migrations, 소비자 API, 취소 webhook, Provider 환불 POST, Grant 변경을 만들지 않습니다.

## 검증

- `test/commerce-exact-reader-revoke-cas-locked-preflight-v1.test.mjs`: 23개 테스트. 정확한 잠금 순서·Revision/Ordering CAS 충돌·기존 동일 이벤트 회수·부분 취소·여러 부분 취소·권한 부족·DB 실패 시 롤백 확인.
- `test/db/commerce_reader_revoke_locked_cas_preflight_v1_sql_smoke_runner.mjs`: 기존 합성 Reader A/B fixture에서 실제 PostgreSQL SQL `FOR UPDATE` 잠금과 버전 확인, 다른 Reader Grant 보존 확인. 격리 **PGlite 0.5.13 / PostgreSQL 18.6 WASM**에서 `COMMERCE_READER_REVOKE_LOCK_CAS_SQL_SMOKE_PASS`.
- 이것은 PostgreSQL 17 전체 실제 migrations/trigger 또는 동시 접속 두 세션 간 교착·직렬화 경쟁의 실증이 아닙니다. 운영 DB 쓰기는 발생하지 않았습니다.

## 다음 구현

승인된 Provider 처리 순서 또는 동등한 최신 상태 조정 증거, 원본 취소 금액과 실제 법적 결과, Reader 제공/전달 사실, R2/T2 범위·전역 잠금 규칙이 충족되면 **기존** `internal_apply_entitlement_effect_v1`에 정확한 Entitlement Effect를 연결할 수 있습니다. 그전에는 잠금 사전검사를 실행해도 회수 권한은 **항상 false**입니다.
