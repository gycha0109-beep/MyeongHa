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

## 다음 수락 게이트

1. Commerce/Legal이 실제 상품 단위와 법정 기간·고지/미리보기·취소 경로를 승인.
2. DB/Commerce가 검증 구매 사실과 immutable 상품 항목·구매 전 고지·실제 전달 사건을 최소정보로 저장/읽는 트랜잭션 안전 포트 구현.
3. 인증된 본인 요청만 반영하고 다른 회원·다른 구매의 내역 존재 여부 미노출, 요청 및 검토 단계가 유료 접근권을 **변경하지 않음**.
4. 실제 제공되지 않은 구매, 하자, 가분적 미제공, 고지 누락, 이미 revoke된 구매 모두 단순변심 일괄 거절 **0**.
5. Provider refund/chargeback 순서·T2 경합·R2 공동 잠금의 실제 PostgreSQL 테스트 및 스테이징 거래를 통과하기 전 `PUBLIC OFF`, `Offer OFF`.
