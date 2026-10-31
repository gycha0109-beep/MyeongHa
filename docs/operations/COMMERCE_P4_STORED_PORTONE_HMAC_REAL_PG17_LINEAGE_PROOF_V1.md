# Commerce P4 — 저장된 PortOne 취소 HMAC 계보의 PostgreSQL 17 실증

작성일: 2026-11-01

## 목적과 작업 범위

PR #2816의 내부 read-only 후보 `COMMERCE_STORED_PORTONE_CANCEL_HMAC_SOURCE_SQL_V1`는 최소화된 PortOne V2 취소 원장 `commerce_provider_events`와 정확한 Reading 구매 Intent/Receipt/결제 시도/Reader 구매 Grant 사이의 단독 계보를 검증합니다. 해당 SQL의 모의 DB 테스트만으로는 실제 PostgreSQL 17 테이블 계약을 확인했다고 할 수 없으므로, 원본 SQL **그대로** 격리 PG17에서 실행하도록 연결합니다.

- `test/db/commerce_stored_portone_hmac_lineage_pg17_generator.mjs`: 후보에 정의된 원본 SQL 문자열을 읽어 실제 PostgreSQL PL/pgSQL `EXECUTE ... USING`에 결합합니다. 동일 SQL을 별도로 복제하지 않습니다.
- `test/db/commerce_stored_portone_hmac_lineage_pg17.sh`: `myeongha_ci_case_*` 격리 DB와 PostgreSQL 17을 강제하고 기존 공식 Reader/Reading 종합 fixture를 실행한 뒤, B2·B3의 독립 구매에 합성 Payment Attempt와 B2 취소 Provider Event를 생성합니다.
- 같은 B2 Provider Event·원본 Receipt·Purchase Intent·Reader Grant의 유일한 연결, 변경 불가 취소금액/통화/해시/처리 권한 false가 정확히 조회되는지 검사합니다. B3의 별도 Reader Grant 및 존재하지 않는 이벤트에는 동일 결과가 나오지 않아야 합니다.
- 합성 이벤트/시도 추가는 **한 트랜잭션에서 ROLLBACK**합니다. Provider GET 호출·환불 POST·Entitlement Effect는 수행하지 않습니다.
- `scripts/ci/db-suites.json`의 `postgres17` 전용 독립 실행 항목과 `test/db/run_ci_case.sh`에 연결합니다. PostgreSQL 15의 기존 공용 검증은 변경하지 않습니다.

## 검증 상태

- 로컬에서 SQL 생성 성공, Bash 구문 검사, 기존 후보와 동일 SQL 사용/격리 상태에 대한 Vitest 5건과 HMAC 관련 35건 **PASS**, TypeScript typecheck·build PASS.
- **실제 PostgreSQL 17 전체 마이그레이션·Reader fixture·SQL 실행은 GitHub postgres17 CI 완료 전까지 미확인**입니다. 이 테스트가 실패하면 로그에 나온 실제 테이블 계약 차이를 수정합니다.
- Provider 서명/실제 취소/법정 청약철회/Reader R2/T2의 Provider 순서와 권한 회수 승인, 고객 LIVE 결제는 검증 또는 활성화하지 않았습니다.
