# D-01 — PostgreSQL 일반 Reader 상품 원본 범위 조회 v1

> 2026-10-12 사용자 승인 제품 방향: 일반 Standard 해설 자격과 전문 `can_initiate` 분리.
> 상태: **READ-ONLY SERVER SOURCE CONNECTED / PRODUCT APPROVED RULE SOURCE NOT INSTALLED / BIND V2 UNCHANGED / PUBLIC OFF**.
> 관련: #1828, #1823, `MOBILE_READER_STANDARD_PRODUCT_SELECTION_POLICY_GUARD_V1.md`.

## 구현된 범위

- forward-only migration `1720_standard_reader_product_scope_read_v1.sql` 추가.
- 새 `public.qry_standard_reading_product_scope_v1(productId,specVersion)`: 기존 Product·Standard Product spec에서 정확히 현재 `enabled=true`, 미폐기, 상품 유형 reading, Reader 선택 단위가 맞는 Product의 ID, spec 버전, sajuDomain, PostgreSQL UTC 유효 시각을 읽는다.
- Public/anon/authenticated/service_role EXECUTE 차단, `myeongha_api_executor`만 실행 가능. 민감한 본문이나 구매권을 반환하지 않는다.
- `createPostgresStandardReaderProductScopeAuthorityPortV1(client)`: 단일 Product scope 행·ID·버전·Domain·정확한 UTC 시각을 검증한다. 0행은 null, 복수/위조 행은 실패.
- `createPostgresPolicyGuardedStandardReaderSelectionPortV1(client, approvedRulePort)`: 이전 Catalog/Unlock + DB Product source + **별도의 명시적 승인 Product Reader rule**을 같은 SQL client에서 조합한다. 미승인 규칙/조회 실패는 fail closed.
- 기존 격리 PostgreSQL Standard 구매 원본 fixture에서 synthetic 활성 Product 양성·비활성 실제 후보 및 잘못된 버전 음성·실행 권한을 검증. TypeScript 판정과 Product 정책 주입 부정 테스트 추가.

## 이 구현이 해결하지 않은 문제

- 이 SQL은 **승인된 Product Reader 정책을 저장하거나 승인하지 않는다.** Product owner가 승인한 immutable revision/rule source는 아직 별도 필요하다. 테스트의 `approved`는 합성 정책일 뿐 실제 상품 출시 정책이 아니다.
- migration 1220 `cmd_bind_standard_reading_access_v2`의 기존 specialist `character_capabilities.can_initiate` 요구는 **변경되지 않았다**. Product rule만으로 v2 실제 구매 바인딩이 가능하다는 주장은 금지한다.
- Product enabled=true는 **상품 구매 가능 또는 Offer/ChargeTerms 승인 의미가 아니다.** 다른 Product/Commerce 원본과 구분한다.
- 이 구성 함수는 아직 운영 구매 흐름에 설치되지 않았으며, 공개 HTTP/Reader 해설/PortOne 실결제/유료 권한 미활성이다.
- #1827 환불·T2 공동 잠금 및 L1 공개 시점, 법정 환불 처리는 별도 기술 승인·검증이 남았다.

## 다음 순서

1. Product/DB가 버전 고정된 실제 approved Reader rule source(활성/폐기/시간·동일 revision transaction) 스키마 및 ACL 결정.
2. Product rule을 1220 v2 구매 바인딩의 **DB 원자적 권한 판정과 정합**시킬 forward-only migration 작성, 전문 `can_initiate`와 일반 해설의 정책 분리. 기존 1220 원본 수정 금지.
3. Purchase Intent/Receipt/Grant 동일 transaction PostgreSQL 실제 성립과 분리된 premium DENY, refund/revoke Race 검증 뒤에만 유료 Reader 출시 여부 검토.
