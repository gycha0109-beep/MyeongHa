# 명하 유료 해설 환불 접수 내부 분류기 v1 — 2026-10-12

> 상태: 내부 서버 전용, 읽기 전용. 실제 구매·환불·PG 취소·Grant 회수·공개 엔드포인트 **미연결**.
> 기준: `COMMERCE_DIGITAL_READING_REFUND_DISCLOSURE_POLICY_V1.md`, `MOBILE_READER_PRODUCT_OWNER_DECISION_20261012_V1.md`.
> 담당: Commerce/Legal/DB. 제품 방향 승인과 법무의 개별 거래 청약철회 최종 판정은 별개.

## 구현

- `apps/api/src/commerce-digital-reading-withdrawal-review-v1.ts`: `assessDigitalReadingWithdrawalReviewV1` (동기·순수·외부효과 0).
- `test/commerce-digital-reading-withdrawal-review-v1.test.ts`: 미제공, 내부 생성, T2 완료, 실제 인도 증빙, 사전 고지, 개별 단위 불일치, 예외 요청, 잘못된 시간, 민감정보 및 권한 상승 방어.
- 특정 `purchaseIntentId × unitId × productSpecVersion`의 **독립적** 검증 구매·고지·배송 기록을 요구한다. 하나의 상품 단위 인도는 다른 가분적 상품 단위 인도의 증거가 아니다.
- 내부 생성/PG 결제/T2 DB COMMIT/브라우저 표시 플래그만으로는 콘텐츠의 소비자 제공 개시를 증명하지 않는다.
- 법정 예외·하자·미제공·중복결제·가분적 미제공은 일반 단순변심 제한 후보에서 **항상 분리**한다.
- 규격을 충족한 증빙이 있더라도 반환은 `restriction_review_candidate`일 뿐 환불 자동 거절/Provider 취소/Grant mutation 허가가 아니다. 모든 응답은 `automaticDenialAuthorized=false`, `providerRefundAuthorized=false`, `entitlementMutationAuthorized=false`이며 식별자와 해설 원문을 포함하지 않는다.

## 책임 분리

- 이 함수는 브라우저 요청을 믿고 전달해도 된다는 뜻이 아니다. `verified`, `server_checkout_snapshot`, `server_delivery_record` 사실은 추후 **서버 소유의 검증된 독립 저장소/포트**에서 가져와야 한다. 현재 단순 태그 값만으로 authenticity를 증명할 수 없다.
- `restriction_review_candidate`는 Legal/Commerce의 법정 기간, 실제 제공 시작, 사전 고지·시험 제공 적법성, 계약 예외 검토의 *대상*이다. 판정 자동화 금지.
- 단일 상태 `DELIVERED_PROVABLE` 자체가 실제 제공 증빙을 증명하지 않는다. `server_delivery_record`에 대한 서버 소유의 durable 교차 확인과 배송 사건 정의는 미구현이다.
- 정확한 상품 가분 범위, 개별 취소 요청 경로, notice revision/acknowledgment, 실제 인도 기록의 개인정보 보존기간/접근권 승인 후에만 실행 시스템에 연결한다.
- 환불이 실제 승인된 뒤 Provider 검증 이벤트가 현재 Grant 상태에 반영되는 거래와, T2 사용자 결과 공개 직렬화는 #1827에서 독립 구현·검증한다. 이 함수가 환불을 수행하거나 권한을 막지 않는다.

## S7 구매 전 고지 증빙 원본 결속 — 비공개 구현 (2026-10-23)

- `commerce-reader-checkout-notice-proof-v1.ts`는 구매 **전** 저장된 Purchase Intent × 고정 Capability Item 키를 기준으로 고지 revision·안내/예시 revision·서버 기록 표시/확인 시각과 최초 결제 시도 시각을 비교한다. **발급된 Grant ID는 결제 전 존재하지 않으므로 구매 전 고지 기록의 원래 키로 사용하지 않는다.**
- 내부 Commerce Checkout Owner 포트는 결제 이후 해당 Purchase Intent의 **원본 Receipt → 원본 Grant → 고정 Capability Item**을 독립적으로 대조해 하나의 구매 단위에만 고지 기록을 연결해야 한다. 단순 구조적 `authority` 태그, 브라우저 체크·시각, 다른 영수증 또는 형제 Grant는 증거가 아니다.
- S7 비공개 환불 검토 `commerce-reader-private-withdrawal-evidence-v1.ts`는 원본 구매·고지 레코드가 정확히 결속되고 `snapshotRecordedAt <= noticePresentedAt <= acknowledgedAt < originalPaymentAttemptCreatedAt <= S5 committedAt`일 때에만 **Checkout Owner 제공 원본 레코드가 형식·순서상 부합**했다고 표시한다. 그렇지 않으면 `missing_or_unverifiable`로 보류한다.
- 위 확인은 디지털 콘텐츠가 소비자에게 실제 제공됐다는 증명이 아니다. S7 제공 준비/클라이언트 ACK만으로 `DELIVERED_PROVABLE`을 합성하지 않고, 자동 청약철회 거절·결제 취소·Grant 변경·공개 응답은 계속 금지한다.
- **아직 미구현·승인 대기:** 실제 불변 Checkout 고지 스냅샷 저장소·원본 Capability Item↔Grant 영속 결속 조회 어댑터, 최소 보존 기간·접근 권한, Legal 고지 방식 승인. 이 코드 변경은 운영 테이블·권한·상업 결제 페이지를 생성하거나 승인하지 않는다. 미승인 어댑터는 `null`을 반환하며 고지 증거를 만들 수 없다.

## S7 기존 Commerce 원장 기반 Checkout 고지 조회 어댑터 (2026-10-23)

- `apps/api/src/commerce-reader-postgres-checkout-notice-authority-v1.ts`를 추가했다. 기존 비공개 `internal_qry_official_reader_withdrawal_delivery_state_v2`를 먼저 호출하여 **S1 범위 잠금과 원본 Receipt·Grant·보호 본문 검증**을 재사용한다. 취소된 영수증이라면 원래 함수의 검증된 Provider 회수 사건 요구도 그대로 따른다.
- 같은 비공개 DB 트랜잭션에서 Purchase Intent에 고정된 Capability Set의 **유일한 Item**을 원본 Grant의 `entitlement_key/scope_key_norm`과 결속한다. 해당 Receipt의 `grant_key`, 최초 결제 시도 `attempt_no=1`·provider·environment·시각을 별도로 확인한다. 다른 Receipt/Grant/상품 항목·모호한 Item 수·결제 시도 누락 시 Checkout 고지 사실은 **불인정**한다.
- **고지의 진실 공급자는 Checkout Owner가 소유한 독립 불변 저장소**다. 소유자 어댑터는 Purchase Intent × 고정 Item × 상품 revision별 실제 기록 고지/표시/확인 시각을 조회하고, 레코드의 동일 항목 정합성을 다시 증명해야 한다. DB 원장의 존재 또는 `authority` 문자열 자체로 고지 확인을 합성하지 않는다.
- `CommerceReaderImmutableCheckoutNoticeStoreV1`가 없으면 DB 조회도 수행하지 않고 `null`을 반환한다. Store/DB 오류, 잘못된 회원·범위, 다중 결과 또는 후행 고지는 `missing_or_unverifiable` 상태다. 단위·통합 모의 DB 시험은 `commerce-reader-postgres-checkout-notice-authority-v1.test.ts`에 포함한다.
- **저장소·보존기간·실제 운영 연결은 미승인:** 새 Checkout 증빙 테이블, 실행 권한, 개인정보 처리/파기 정책, 운영 결제 페이지, 공개 API/자동 환불 판단을 만들거나 활성화하지 않았다. Commerce·Privacy·Legal Owner의 원본 스냅샷 저장 및 보존 범위 승인 후에만 실제 저장소를 연결한다. 이 비공개 어댑터의 구조 및 합성 테스트는 실제 PostgreSQL 원장 자료 검증이나 법률상 콘텐츠 제공 증명이 아니다.

## 다음 수락 게이트

1. Commerce/Legal이 실제 상품 단위와 법정 기간·고지/미리보기·취소 경로를 승인.
2. DB/Commerce가 검증 구매 사실과 immutable 상품 항목·구매 전 고지·실제 전달 사건을 최소정보로 저장/읽는 트랜잭션 안전 포트 구현.
3. 인증된 본인 요청만 반영하고 다른 회원·다른 구매의 내역 존재 여부 미노출, 요청 및 검토 단계가 유료 접근권을 **변경하지 않음**.
4. 실제 제공되지 않은 구매, 하자, 가분적 미제공, 고지 누락, 이미 revoke된 구매 모두 단순변심 일괄 거절 **0**.
5. Provider refund/chargeback 순서·T2 경합·R2 공동 잠금의 실제 PostgreSQL 테스트 및 스테이징 거래를 통과하기 전 `PUBLIC OFF`, `Offer OFF`.
