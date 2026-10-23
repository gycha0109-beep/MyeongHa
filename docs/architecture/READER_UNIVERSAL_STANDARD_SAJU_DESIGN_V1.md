# 일반 사주 × 전 Reader 범용화 상세 설계 v1.1

> Track: applizing / PRODUCT–COMMERCE–CHARACTER 공동 검토
> Status: DESIGN DRAFT. 구현·DB 반영·유료 출시 미승인.
> 코드 기준: MyeongHa main 595cb414b1768959a3a794efab3ee06a512599e5, 2026-10-09 (PR #1778 병합 이후).
> 본 문서는 v1 초안을 최신 사실에 맞춰 교체한다. 세부 TypeScript/DB 계약은 READER_UNIVERSAL_STANDARD_SAJU_RUNTIME_CONTRACT_V1.md, 검증 계획은 READER_UNIVERSAL_STANDARD_SAJU_TEST_PLAN_V1.md 참조.

## 1. 승인된 제품 원칙

- **일반 사주:** 공식 사주가 제공하는 모든 일반 Reading 주제를 명하의 모든 정식 캐릭터가 해설할 능력이 있어야 한다. 캐릭터가 가진 제한적인 사주 관심축이나 역할 때문에 특정 일반 Reading의 자격을 박탈하지 않는다.
- **캐릭터 차이:** 주목 순서, 안전한 문장·반응·화법 및 후속 대화. 공식 사주 의미·계산·근거는 변하지 않는다.
- **프리미엄:** 향후 별도로 정의된 개별 프리미엄 상품에 한해서만 특정 Reader에게 제한 가능. 지금 출시 SKU·전용 Reader 목록을 만들지 않는다.
- **Reading Knowledge:** 모든 캐릭터가 읽을 수 있음 ≠ 모든 캐릭터에게 구매 없이 해당 사용자의 Reading이 공개됨. Subject × Official Reading × Reader exact purchase-backed Grant는 계속 각각 검증한다.
- **출시 승인:** 9명 제품적 적격성과 9명 공개 가능 상태는 별개. 현재 내부 Preview 허용 Reader는 세연만, 공개 유료 Reader OFF.

## 2. 업로드 원본 설계와 관계

- UX Reading Reader Knowledge Spec v1.1: 공식 Reading 재사용, 추가 Reader별 구매·열람권·후속대화 격리를 유지.
- Character ↔ Saju Rendering Architecture v1.1: Saju가 canonical meaning과 grounding을 제공하며 Character는 attention/organization/delivery만 변경. Semantic Guard 및 Protected Fallback 유지.
- Integration Spine: 상품/결제·사주 의미·캐릭터 표현의 ownership 분리 유지.
- OFFICIAL_STANDARD_READING_READER_INTERPRETATION_V1: Reader-independent Official Reading, exact Reader Grant, 추가 Reader 구매 시 동일 Official Reading 재활용.
- P0_DECISION_REGISTER P0-CM-03: 후보 standard.love_relationship는 enabled=false, 판매 Offer/Charge Terms·공개 실행 불가. 본 설계로 출시 승인을 대신하지 않음.
- 과거 Character↔Saju 설계에서 Character capability를 접근 Gate로 썼던 부분은 현재 코드의 기원이다. 그러나 사용자의 최신 제품 요구와 충돌하므로 **일반 상품의 적격성을 Product authority로 옮기는 변경**을 명시한다. 원본 문서를 임의로 승인·정정했다고 주장하지 않는다.

## 3. 완료된 항목과 남은 충돌

### 이미 구현: PR #1778
- packages/domain/src/character-saju-perspective-registry.ts의 **백헌·태겸 전용 매핑 제거 완료**.
- packages/domain/src/character-saju-common-perspective.ts의 source-neutral common_bounded 전략 완료.
- Preview Reader Runtime은 이 공통 전략을 사용하고 세연도 전용 관심축 매핑 없이 해설할 수 있는 Synthetic 테스트를 통과함.
- 이 작업은 재구현하지 않는다. 백헌·태겸 매핑을 복구하거나 나머지 7명을 임의 매핑하는 것도 금지.

### 현재 남은 구현 충돌 (3개 지점)
1. **apps/api/src/character-standard-reading-chat-context.ts**: prepareCharacterStandardReadingChatContextV1에서 Character capabilities.some(domain == source.sajuDomain)이 없으면 공식 Reading 열람을 거부.
2. **packages/domain/src/character-runtime-context.ts**: assembleCharacterRuntimeContextCore에서 Character capabilities.find(saju.domain)이 필수이며 CharacterSajuRuntimeContextV1.capability: CharacterCapabilityContent로 고정.
3. **packages/domain/src/character-saju-insight-selector.ts**: requestedDomain, saju.domain, saju.capability.domain의 3자 일치 강제.

위 세 검사를 무조건 삭제하거나 단순 true로 바꾸면 안 된다. **인증된 상품 정책 + 실제 Reader Grant + 공식 사주 domain Source Truth**를 증명하는 새 경계를 세워 **세 군데 모두** 같은 authority에 연결해야 한다.

기존 CharacterCapabilityContent의 필드(domain, role, canInitiate, capabilityVersion)는 캐릭터 저작 역할/특화 능력 표현으로 계속 보존. 일반 유료 사주의 접근권한을 인증하는 용도로 사용하지 않는다. Official Reading domainCapabilityVersion은 캐릭터의 capabilityVersion과 다르다.

## 4. 계층별 단일 책임

| 계층 | 소유권 | 일반 사주 지원과의 관계 |
| --- | --- | --- |
| Saju | 계산, ProductReadingResponse, 도메인, 공식 Grounding·불확실성·hash | 공식 의미 원천. Reader ID/가격/entitlement 결정 불가 |
| Product/Commerce | 승인된 상품 종류, Reader 적격성 정책, Offer, Grant, revoke | 일반 상품의 모든 Reader 적격성 및 정확한 Reader 접근권한 |
| API/Subject | canonical Subject transaction, owned Thread, exact Reading/access/artifact, policy 증명 | Client 요청을 신뢰하지 않고 서버에서 조합 |
| Character | 정식 캐릭터 콘텐츠, persona, voice, safeFraming, 관계, 선택적 검토된 스타일 | 모든 Reader가 일반 상품을 읽는 공통 기능을 막지 않음 |
| Runtime | 공통 선택, Reader delivery, source/semantic/output guards | 없는 의미 생성 금지 |
| Web/Mobile | 상품·Reader 선택, Reading scene, archive, 상태 표시 | 서버 결과 소비; Browser 권한 창설 금지 |
| Release/CI | staging cohort/public flags/CI/운영 SHA | 제품 능력과 공개 여부 독립 |

## 5. Product Reader Eligibility 정책

- 별도의 **Product-owned 승인 레코드/authority resolver**가 반환하는 종류를 사용한다.
- 승인된 일반 상품은 모든 정식 Reader ID에 PRODUCT_ELIGIBLE. 그 Reader가 실제 출시에 승인되지 않았다면 여전히 RELEASE_HOLD.
- 미래의 명시적 프리미엄만 exact allowedReaderIds를 관리. 구체 SKU/목록 미결정이므로 현재 활성화 금지.
- Unknown, disabled, 미승인 Product 정책은 fail-closed.
- Product 'standard' 접두어, readingVariant='standard', topicKey, Character ID, 웹 카탈로그 노출로 상품 종류 추측 금지.
- 서버가 DB에서 얻은 productId + productSpecVersion + sajuDomain의 동등성을 정책 조회에서 검증한다. 모든 상품을 무조건 일반 사주라고 판정하지 않는다.
- 상품 정책 approved는 판매 승인, 유료 checkout 또는 Grant 생성 승인이 아니다. 매 요청 exact entitlement/access를 별도 검증한다.

## 6. 데이터·권한 경로

~~~text
verified canonical Subject
   → active Thread (single server-resolved Reader)
   → pinned Character content release and bundle
   → exact subject × officialReadingId × Reader access/Grant metadata
   → Product-owned Reader eligibility rule
   → exact official artifact + source/version/hash parity
   → server-only admission ticket
   → Character Runtime Saju context v2
   → approved Saju Grounding (no Reader/Subject/commerce identity in Saju payload)
   → common_bounded selection and pinned Reader style
   → semantic/output guard
   → Reader interpretation OR explicit protected fallback
~~~

기존 HTTP 요청은 {threadId, officialReadingId}만 사용한다. client Reader / product tier / policy / source snapshot 입력 불가. 서버 API 내부에서 이전 PR #1775의 Saju HTTP Projection을 재사용한다.

### 중요한 안전 순서
- 미구매/타인/잘못된 Reader → Artifact 원문·Grounding HTTP 호출 전 DENY.
- 미승인 상품 또는 대상 Reader 제한 → Grounding 호출 전 DENY.
- Saju Grounding 오류·semantic guard 실패는 **접근권한이 있던 사용자에 대해서만** protected fallback 또는 재시도.
- Renderer fallback을 ACL/상품 거부의 우회로 사용하지 않는다.
- 현재 reader-knowledge 서버가 metadata + artifact를 연속 조회하므로 상품 정책을 metadata와 artifact 사이에 적용하려면 읽기 흐름을 분리해야 한다. 이 작업은 별도 좁은 API PR로 수행.
- 현재 PostgreSQL transaction 안의 원격 Saju HTTP 호출과 revoke race는 실측·테스트 대상이다. 성급히 트랜잭션을 끊지 않는다.

## 7. Character Runtime 경계

현재 Character Saju context v1에 포함된 capability 필드를 '가짜 CharacterCapabilityContent'로 채우지 않는다. **버전된 tagged admission union**으로 이행한다.

- 기존 path: legacy_character_capability (다른 경로/기존 Character 특화 기능 보호).
- 새 경로: official_standard_product_rule (서버 발급된 ticket만 인정하며 granted productId/domain/readingRef 결속).
- domain selector의 일치 조건은 **source.domain == requestedDomain == official product admission.domain**.
- 기존 Character voice, Saju profile, content bundle, relationship, required disclosure·ambiguity·grounding hash 검증 유지.
- 새로운 API를 통하지 않는 direct Saju context 주입은 계속 차단.
- V1 consumer를 일괄 수정하지 않고 V2 전용 path에서 단계적으로 전환한다.

## 8. Premium과 UI는 후속

- Premium policy 코드는 초안 contract만 작성. Product Owner/Commerce가 SKU, Reader allowlist, Offer/Charge Terms, revocation을 구체적으로 승인한 뒤 적용.
- Web/Mobile은 서버가 제공한 Product eligibility / entitlement / release state를 분리해서 표시. '모든 Reader 지원' 카탈로그는 곧바로 '모든 Reader 선택·구매 가능'을 의미하지 않는다.
- 현재 public Reader OFF와 세연-only 내부 Preview gate는 해제하지 않는다.

## 9. 구현 PR 체계 및 종료

- **A1 Product policy authority:** pure decision contract, 9 Reader×standard 테스트, 미승인 Product 거부. 운영 판매/DB 변경 없음.
- **A2 API admission:** exact Grant/Thread/Source 뒤에 Product rule을 합성하고 signed/opaque server-only ticket 부여.
- **A3 Runtime V2:** Character.capabilities 직접 의존 대신 official admission 경로, selector와 기존 runtime 사용자 이중회귀.
- **A4 integration:** Web/Mobile/후속 Chat/기록 호환 및 hosted smoke. 출시 코호트 확대 전 각 Reader release 검증.
- **A5 premium:** 실제 Product별 제한 정보 결정 이후 별도 진행.

**A(설계):** 세 하드게이트·authority·계약·순서·테스트가 실제 코드 기반으로 일관됨.
**B(구현):** A1–A3 코드+회귀 CI 완료 전 HOLD.
**C(공개):** Product/Commerce·DB/Reader 품질·실사용 E2E·운영 승인이 모두 완료돼야 PASS.

미확정: 개별 standard SKU/Policy 저장 권한, Premium SKU, 캐릭터별 published release 일정, 과거 Grant와 새 정책 revision pinning, DB migration/RLS, 운영 결제와 public Reader activation.

상세 타입/쿼리/호환성 규칙: READER_UNIVERSAL_STANDARD_SAJU_RUNTIME_CONTRACT_V1.md.
테스트 케이스 및 실패/CI 매트릭스: READER_UNIVERSAL_STANDARD_SAJU_TEST_PLAN_V1.md.
