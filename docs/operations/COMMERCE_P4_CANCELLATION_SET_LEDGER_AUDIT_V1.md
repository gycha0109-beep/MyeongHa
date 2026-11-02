# Commerce P4 — 동일 영수증의 개별 취소 이벤트 집합 검증 v1

작성일: 2026-11-01
상태: 운영 내부 읽기 전용 검증 후보. 공개 API, PG 환불 실행, Grant 회수, LIVE 결제 비활성.

## 구현

기존 `commerce_provider_events`에 보관되는 PortOne V2 `commerce-portone-cancellation-source-v2`의 개별 `SUCCEEDED` 취소 항목을 **원본 Reading Receipt 단위로 모아** 검사합니다. 별도 환불 원장·중복 데이터 테이블은 만들지 않습니다.

- `scripts/operations/commerce-portone-cancellation-set-ledger-audit-v1.mjs`: 완전 가시성·트랜잭션 읽기 전용 권한을 가진 내부 실행기만 허용합니다. 기존 Receipt / verified Purchase Intent / Reading Product / Reader Selection과 결속된 취소 Provider Event를 동일 DB 스냅샷에서 최대 256건 검사한 뒤 반드시 `ROLLBACK`합니다.
- 동일 Receipt/Subject/원 거래, `production` PortOne V2, 승인된 verifier revision, 원본 서명 HMAC/GET HMAC, 개별 취소 ID의 HMAC, 취소 `SUCCEEDED`, 양수 금액·원본 금액/통화/기존 권한 미승인 표시를 각 행마다 확인합니다.
- 서로 다른 웹훅 ID에서 **같은 개별 취소 HMAC을 재사용하면 중복**으로 분류합니다. 동일 Provider Event가 JOIN으로 두 번 나타나도 모호한 계보로 차단합니다.
- 개별 취소액을 단순 합산하고, 첫 관측에 저장된 누적 취소액 중 최대값과 일치하는지 검증합니다. 합계가 원래 Receipt를 초과하거나, 누적액 관측과 달라 누락/불일치 가능성이 있으면 보류합니다. **최대값은 완전성의 필요조건 검사**일 뿐 Provider 최신성이나 처리 순서를 의미하지 않습니다.
- 판정은 `recorded_partial_amount_set_consistent`, `recorded_full_amount_set_consistent` 등 **저장된 데이터 자체의 일관성**에만 한정합니다. DB에 없는 미수신 취소 웹훅까지 전부 존재한다고 주장하지 않으며, 독립적인 인증된 최신 Provider GET의 실제 취소 집합과 비교한 것은 아닙니다.
- 반환 정보는 기록된 항목 수·합계·원금만 최소화해 제공합니다. 원본 취소 ID, Payment ID, Subject ID, 서명/비밀키/HMAC 값은 반환하지 않습니다.

## 검증

- `test/commerce-portone-cancellation-set-ledger-audit-v1.test.mjs`: 두 부분 취소의 3,000원+5,900원 합계, 중복된 HMAC, 원금 초과, 누락된 누적 항목, 잘못된 Provider/Receipt/통화/서명/역할, 잘못된 Provider 시각 추정 등 거부·롤백.
- `test/db/commerce_portone_cancellation_set_pg17_generator.mjs` + `commerce_portone_cancellation_set_pg17.sh`: **실제 전체 PG17 마이그레이션**의 공식 B2/B3 Reader 구매 fixture에서 원본 SQL을 그대로 호출해 정확한 Receipt와 다른 Reader 분리를 검증합니다.
- `test/db/commerce_portone_cancellation_partial_set_pg17_generator.mjs` + `commerce_portone_cancellation_partial_set_pg17.sh`: **독립 빈 PG17 일회용 DB**에서 기존 비배포 취소 저장 함수와 합성 영수증을 설치해 3,000원/5,900원 개별 기록·동일 HMAC 중복 증거를 확인합니다. 다른 PG17 전체 스키마 성공 근거로 혼동하지 않습니다.
- 둘 다 `scripts/ci/db-suites.json`의 PostgreSQL 17 전용 테스트 항목에만 등록했습니다. 로컬 Vitest·SQL 생성 검증과 별도로 **진짜 PostgreSQL 17 CI 실행 성공을 확인하기 전까지 PG17 PASS를 선언하지 않습니다**.
- 로컬 격리 PGlite/PostgreSQL 18.6 WASM에서 별도 2건 부분 취소 SQL 시나리오 실행 PASS. 이는 PostgreSQL 17 실제 CI 결과의 대체가 아닙니다.

## 권한·정책 경계

PortOne V2 REST 명세는 개별 취소 상태 `REQUESTED/FAILED/SUCCEEDED`와 결제 부분·전액 취소를 분리합니다. 다만 본 구현은 취소 상태 완료가 **최신 Provider 처리 순서/법적 청약철회/디지털 Reader 제공·전달/Reader T2 최종 공개 잠금**까지 증명했다고 보지 않습니다.

`recordedSetSelfConsistent`가 true여도 `currentProviderStateVerified=false`, `providerOrderingProven=false`, `latestRefundFinalityProven=false`, `legalRefundAuthority=false`, `grantRevocationAuthorized=false`, `writesPerformed=false`를 유지합니다. 기존 `internal_apply_entitlement_effect_v1`은 호출하지 않습니다.

공식 참고: https://developers.portone.io/api/rest-v2/payment

## 다음 구현

최신 인증 GET의 **성공한 취소 항목 집합**을 저장된 취소 HMAC 집합과 누락·중복 없이 대조하는 읽기 전용 조정, 이후 Provider 순서/법적 결과/Reader R2-T2 원자적 잠금의 승인된 계약을 결합합니다. 어떤 새 소비자 결제·환불 권한도 자동으로 부여하지 않습니다.
