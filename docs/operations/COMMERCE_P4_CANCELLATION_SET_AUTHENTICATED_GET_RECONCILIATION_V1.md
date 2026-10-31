# Commerce P4 — 저장된 PortOne 취소 집합 ↔ 인증된 현재 GET 재대조 v1

작성일: 2026-11-01
상태: 내부 읽기 전용 검증 후보. 운영 환불 / 자동 Reader 권한 회수 / LIVE 결제 비활성.

## 목표와 선행 근거

병합된 [#2831](https://github.com/gycha0109-beep/MyeongHa/pull/2831)은 검증된 Reading Receipt의 모든 **저장된** `source-v2` 취소 이벤트를 같은 영수증에 결속하고, 서로 다른 취소 HMAC의 합계·최초 누적 취소액·원금 사이의 자기 일관성을 검증했습니다. 이 검사는 **미수신 웹훅**이나 최신 PortOne 상태까지 보증하지 않습니다.

이번 작업에서는 원본 결제 영수증에 결속된 Payment Attempt의 `provider_request_id`에서 실제 결제 ID를 읽은 다음, 동일한 V2 API Secret의 **단 한 번의 GET `/payments/{paymentId}`** 으로 현재 성공한 취소 항목 전체와 기존 원장 집합을 대조합니다.

## 구현

- `apps/api/src/portone-v2-cancellation-readback-get-v1.ts`: 기존 단일 취소 HMAC 검증기가 사용하는 fixed-origin, redirect-disabled, timeout 10초, JSON 최대 256KiB 인증 GET을 공통 내부 함수로 분리합니다. 요청은 여전히 `GET`이며 취소 `POST`는 없습니다.
- `apps/api/src/portone-v2-cancellation-set-get-v1.ts`: 현재 GET을 기존 PortOne V2 결제/원본 거래·통화·LIVE 채널·결제액·취소 합계 검증기로 확인하고, 최대 64개 취소 항목의 원본 ID는 메모리에서만 HMAC으로 변환합니다. 취소 `SUCCEEDED`의 **지문과 정확한 금액**만 내부 결과에 담습니다. 요청 중·실패한 취소가 하나라도 있으면 `unresolvedItemsObserved=true`입니다. 원본 취소 ID, 인증 Secret, 결제 ID/Subject를 반환하지 않습니다.
- `scripts/operations/commerce-portone-cancellation-set-ledger-audit-v1.mjs`: 기존 DB 취소 집합 감사 SQL에 원본 Receipt와 **정확히 연결된 결제 시도**를 추가합니다. 두 번의 완전 가시성 `REPEATABLE READ READ ONLY` 스냅샷을 각각 ROLLBACK하며, 사이에 인증 GET으로 받아온 HMAC·건별 취소액·건수·전체 취소액·전액/부분 취소 형태를 기존 DB 집합과 대조합니다.
- 조회 중 DB 원장·영수증·원 결제 시도·각 이벤트의 어떤 조회 필드라도 바뀌면 `stored_cancel_set_changed_during_provider_get`으로 보류합니다. 행 순서와 취소 시각, 임의의 문자열 `provider_ordering_key`는 취소 순서 판정에 사용하지 않습니다.
- 신규 테이블·마이그레이션·환불/Grant 변경 함수·공개 라우트는 추가하지 않습니다.

## 실패 시 동작

미수신 취소 항목, 추가·중복 항목, 취소액 변경, 원 결제 거래/통화 불일치, 취소 상태 REQUESTED/FAILED, DB의 잘못된/중복된 결제 시도, 읽기 권한 부족·타임아웃·DB 동시 수정은 **모두 효과 없이 보류**합니다.

원본의 정합한 결제와 취소 집합을 관측해도 반환하는 것은 `authenticated_current_cancel_set_matches_recorded`라는 **시점 한정의 관찰 결과**입니다. `providerOrderingProven=false`, `currentProviderStateVerified=false`(집행용 최신성 검증 미충족), `legalRefundAuthority=false`, `readerT2LockHeld=false`, `grantRevocationAuthorized=false`, `writesPerformed=false`를 유지합니다. 인증된 GET 자체가 Provider의 `NEWER/STALE` 순서·정산 완료·법정 청약철회·고객 실제 Reading 전달·Reader R2/T2 원자적 잠금의 증거는 아닙니다.

## 검증 및 다음 단계

- 단일 취소 GET 리팩터링의 기존 테스트, 새 전체 목록 인증 GET 단위 테스트, 집합·HMAC·금액·권한 오류/동시성 검증.
- 기존 [#2831](https://github.com/gycha0109-beep/MyeongHa/pull/2831)의 PostgreSQL 17 두 검사에서 새 `providerPaymentId`가 검증된 Payment Attempt에서 유래했는지 실제 SQL로 대조합니다. 실제 PG17 성공은 **이번 PR CI 전까지 미확인**입니다.
- 향후 권한 회수는 별도의 승인된 Provider ordering/동등한 최신 상태 조정 계약, Legal 결정 및 실제 제공/전달 증거, Reader R2/T2 원자적 잠금과 기존 Grant writer 결속을 완료해야 합니다. 이번 구현은 어떠한 실행 승인도 만들지 않습니다.

공식 문서: https://developers.portone.io/api/rest-v2/payment
