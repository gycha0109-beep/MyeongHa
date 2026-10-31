# Commerce P4 — PortOne 재조회 이후 Reader Grant 및 취소 증거 재검사 v1

작성일: 2026-11-01
상태: 내부 읽기 전용 검증. 자동 권한 회수·환불·LIVE 결제 모두 비활성.

## 이번 구현

PR #2819까지 PostgreSQL 17에서 확인한 저장된 PortOne 취소 Event → Receipt → Purchase Intent → Reader Grant 계보를 재사용합니다.

- 기존 `commerce-stored-portone-cancellation-hmac-recheck-v1.mjs`가 **첫 번째 완전 가시성 읽기 전용 DB 스냅샷**에서 정확한 취소 이벤트와 Reader 구매권을 읽고, 트랜잭션을 ROLLBACK한 다음 인증된 PortOne GET에서 해당 HMAC 개별 취소 항목을 검사합니다.
- 같은 PortOne GET이 성공한 후에도 **두 번째 독립 DB 스냅샷**을 생성해 같은 원본 SQL을 다시 실행합니다. Provider Event 상태/서명·개별 취소액·첫 GET 증거, 원본 Receipt 금액/통화/검증 상태, 결제 Attempt, Reader Grant 상태·revision·마지막 provider ordering key를 비롯한 모든 반환 필드가 일치해야만 `same_exact_cancellation_success_reobserved`로 분류합니다.
- 스냅샷이 사라지거나 하나가 아닌 여러 행이 나오거나 하나의 필드라도 달라지면 `stored_source_or_grant_changed_during_provider_get`으로 보류합니다. 두 번 모두 complete-visibility read-only 계정을 확인하며 반드시 ROLLBACK합니다. 두 번째 검사가 실패하거나 권한이 부족해도 실패를 무시하지 않습니다.
- DB 값 변경은 보류하지만 외부 GET이 자체적으로 provider order를 비교할 수 있는 공인 cursor를 제공한다는 의미는 아닙니다. 거래의 `NEWER/STALE` 분류, Reader T2 전역 잠금, 법적 청약철회·제공 결정, Grant 회수 승인을 **생성하지 않습니다**.
- 조회가 끝난 직후 상태가 다시 바뀔 수도 있으므로 이 두 번의 검사는 **실제 권한 변경과 원자적인 잠금이 아니며**, 운영 실행 전에는 기존 `commerce-exact-reader-revoke-cas-locked-preflight-v1.mjs`의 Event → Grant 잠금 및 revision CAS가 별도로 필요합니다. 해당 잠금만으로도 부족한 provider/legal/T2 조건은 그대로 HOLD입니다.

## 실제 변경과 검증

- 구현: `scripts/operations/commerce-stored-portone-cancellation-hmac-recheck-v1.mjs`.
- 동시성/실패 검증: `test/commerce-stored-portone-cancellation-hmac-recheck-v1.test.mjs`. GET 도중 Grant revision/status/order key 변경, Provider Event 상태·원본 서명·금액 변경, Receipt 검증 변경, 결제 Attempt 변경, 행 삭제/중복, 권한 부족, 두 번째 DB 오류/롤백 검증.
- 실제 PG17 계약: 기존 `test/db/commerce_stored_portone_hmac_lineage_pg17_generator.mjs`에 신규 조회 필드 검사를 추가하고, `test/commerce-stored-portone-hmac-lineage-pg17-contract-v1.test.mjs`에서 **운영 후보 SQL 자체**를 계속 사용하도록 보장합니다. DB 실행의 성공 여부는 필수 CI 확인 전까지 미확정입니다.
- 운영 마이그레이션·공개 API·권한 Grant 변경·PortOne 환불 POST는 모두 **변경 없음**.

## 다음 선행 조건

Provider가 제공한 신뢰할 수 있는 순서 근거 또는 승인된 동등한 최신 상태 조정 방식, 정확한 디지털 Reader 제공/전달 증거와 법적 검토 결론, Reader R2/T2 전역 잠금/공개 경계의 원자적 연결. 이 조건을 만들거나 승인했다고 간주하지 않습니다.
