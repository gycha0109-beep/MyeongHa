# 명하 D-01 일반 Reader 상품 정책 선별기 v1

> 2026-10-12 제품 소유자 승인 C 방향: 일반 Standard 사주 해설은 승인 Product 정책 기준, 전문 능력 `can_initiate`와 구분.
> 상태: **INTERNAL PURE ADAPTER ONLY / PRODUCTION PRODUCT AUTHORITY NOT CONNECTED / DB BINDER STILL HOLDS / PUBLIC OFF**.
> 관련 #1828, #1823, `MOBILE_READER_PRODUCT_OWNER_DECISION_20261012_V1.md`.

## 변경

- `createPolicyGuardedStandardReaderSelectionPortV1`가 기존 `StandardReadingReaderSelectionPortV4` (Catalog 출판·사용가능·Unlock 확인)를 감싼다.
- 기존 Catalog가 반환한 Product ID·Spec 버전·Reader·bundle을 변경하지 않고 Product 서버가 소유한 `readCurrentScope`에서 Product exact ID/spec/domain 및 유효시각을 조회한다.
- 해당 시각과 Product ID/spec/domain을 `resolveProductReaderEligibilityV1`로 보내 **명시적 approved rule**이 해당 Reader를 승인한 경우만 그대로 후보를 반환한다.
- Product 정책 없음/철회/불일치/서버 장애, Catalog/Unlock 불일치, Reader ID 불일치 시 `null`; 클라이언트가 Product kind/domain/Revision을 전달해 우회할 수 있는 포트 없음.
- 모든 스키마/Source는 **신뢰되는 서버 authority**여야 한다. 현재는 테스트 포트만 사용하며 실제 Product/DB adapter가 없다.
- 범용 9 Reader×9 Domain 합성 정상·철회·Premium 대상 제외·버전 드리프트·오류·잠금 정책 회귀 테스트.

## 명시적 미구현 및 주의

**이 모듈을 실제 결제/구매 경로에 아직 연결하지 않는다.** Product-approved policy source가 실제 DB 동일 거래에서 제공되지 않으며 migration 1220 `cmd_bind_standard_reading_access_v2`는 기존 specialist `can_initiate` gate를 유지한다. 따라서 이 순수 어댑터의 `eligible`은 DB 구매 결속/Offer/Grant/출시의 증명이 아니다.

다음 단계에서 Product/DB/Reader가 동일 Revision과 유효시각의 trusted Production rule source를 승인하고 DB forward-only migration으로 일반 Standard 조건을 specialist gate와 적절히 분리해야 실제 Positive 결속 사례가 가능하다. Premium에는 여전히 전문 Capability 검사가 필요하다.

출시 전에는 Reader 출판/Unlock, exact purchase-backed verified Grant, Bundle pinning, T2 최종 권한, 실제 PostgreSQL 권한 및 오남용 회귀와 QA가 모두 필요하다. **9×9 전원 자동 공개, fabricated Capability, 기존 SQL migration 수정 금지.**
