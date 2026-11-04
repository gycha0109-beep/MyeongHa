# 결제 트랙 — 고객 청약철회 접수와 원본 Reader S5/S7 보유 기록 결속

**로드맵:** docs/operations/COMMERCE_PAYMENT_TRACK_STATUS_IMPLEMENTATION_ENDPOINTS_20261030.md 6절 3번. 개발 전용, 운영 비활성.

## 구현

- 기존 고객 청약철회 접수에서 **DB에 이미 저장된 Claim의 Subject·Purchase Intent·checkout 단위 ID**만 사용합니다.
- 기존 내부 소유자 전용 읽기 전용 REPEATABLE READ 스냅샷에서 원본 PortOne Verified/Revoked Receipt, 동일 구매에서 발급된 Reader Entitlement Grant, 선택된 Reader와 고정 콘텐츠 번들, S5 유료 답변 본문, 보존 기간 내 S7 준비/ACK를 관계형 조인으로 재검증합니다. 호출자가 Grant나 paid body를 지정하지 않습니다.
- 정확한 유료 해설 본문이 없거나 동일 구매에 모호한 본문이 여러 건이면 S7 timeline을 null로 둡니다. 다른 구매의 Reader 본문을 대신 표시하지 않습니다.
- 서버 준비·인증된 클라이언트 ACK의 **보존된 건수와 최초 시각**만 읽고, 지워졌거나 90일 보존 기한이 지난 영수증을 배송이 없었다는 증거로 오인하지 않습니다.
- 모든 반환 결과의 consumerDeliveryProven=false, legallyProvenDeliveredAt=null, providerRefundAuthorized=false, grantMutationAuthorized=false. ACK는 고객이 실제 콘텐츠를 열람·소비했다는 법적 확인이 아닙니다.
- 기존 계정·구매권·일반 채팅·환불 원장과 실제 포트원 POST·운영 DB·공개 라우트 및 LIVE는 변경하지 않습니다.

## 검증·후속

- test/commerce-recorded-reader-withdrawal-private-review-v1.test.ts에서 정확한 Checkout 단위→Grant→S5/S7 결속, 준비만 된 시도, ACK 유무, 보존 후 S7 기록 없음, 잘못된/모호한 기록과 교차 구매 보류를 검증합니다.
- 기존 계정 삭제·Privacy 재실행에서는 S7 보존 만료와 사용자 삭제를 별도로 구분합니다.
- 성공한 CI와 실제 PostgreSQL 17 종단 간 경합 검증 없이는 해당 로드맵 완료나 법적 콘텐츠 전달 완료를 선언하지 않습니다.
