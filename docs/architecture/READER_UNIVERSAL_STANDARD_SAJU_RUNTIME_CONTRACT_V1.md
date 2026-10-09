# Reader 범용화 — 타입·서버 권한·데이터 이행 계약 v1

> 설계 전용. 이 파일은 런타임에서 이미 존재하는 타입을 새 것으로 승인하거나 실제 DB migration을 수행하지 않는다.
> 상위 설계: READER_UNIVERSAL_STANDARD_SAJU_DESIGN_V1.md.
> 점검 main: 595cb414b1768959a3a794efab3ee06a512599e5.

## 1. 기존 소스와 필드의 엄격한 대응

현재 Server Knowledge source는 apps/api/src/character-standard-reading-knowledge.ts의 CharacterStandardReadingKnowledgeSourceV1이며 다음을 포함한다.

- subjectId, readingId, readingSessionId, readerCharacterId, readerContentBundleId
- productId, productSpecVersion, topicKey, sajuDomain, readingPeriod, readingVariant, domainCapabilityVersion
- sourceBirthRevisionId, readingContractVersion, sajuEngineVersion
- responseHash, productResponseState, responseSnapshotJsonb

이 값은 public.qry_character_standard_reading_access_runtime_v2 및 public.qry_standard_reading_artifact_source_runtime_v1의 DB verified source에 의해 생성한다.

**이 중 readingVariant, topicKey, productId 문자열 자체는 상품 정책 권위가 아니다.** domainCapabilityVersion은 Saju/Reading 제품 근거이지 CharacterCapabilityContent.capabilityVersion이 아니다. 기존 SourceTruth 읽기 SQL과 Grant lifecycle은 변경 없는 기준으로 사용한다.

## 2. 신규 제품 적격성 resolver 계약 (제안)

~~~ts
type ProductReaderRuleV1 =
  | Readonly<{
      kind: 'standard_all_readers';
      productId: string;
      productSpecVersion: string;
      sajuDomain: SajuDomain;
      ruleVersion: string;
      approvedPolicyRevision: string;
    }>
  | Readonly<{
      kind: 'premium_restricted';
      productId: string;
      productSpecVersion: string;
      sajuDomain: SajuDomain;
      ruleVersion: string;
      approvedPolicyRevision: string;
      allowedReaderIds: readonly OfficialReaderRuntimeIdV1[];
    }>;

type ProductReaderRuleLookupV1 =
  | { status: 'approved'; rule: ProductReaderRuleV1 }
  | { status: 'withheld'; reason: 'unclassified'|'disabled'|'stale'|'invalid_policy' };

interface ProductReaderEligibilityAuthorityPortV1 {
  readApprovedRule(input: {
    productId: string;
    productSpecVersion: string;
    sajuDomain: SajuDomain;
    effectiveAt: string;
  }): Promise<ProductReaderRuleLookupV1>;
}
~~~

- 정책 조회는 Product/Commerce가 독립 관리하는 **버전화된 승인본**으로만 수행.
- 조회 인자는 서버의 DB-authoritative metadata와 서버 결정 유효시각에서만 획득.
- 정책과 Official Reading source의 productId/specVersion/domain이 하나라도 다르면 거부.
- premium_restricted branch는 추후 실제 Product approval 전까지 운영 HOLD.
- rule이 없는 unknown 상품을 묵시적으로 standard_all_readers로 취급하지 않는다.
- **상품 정책이 승인됐다는 사실은 판매 Offer, Payment 성공, Grant 발급의 대체물이 아니다.**

### 2.1 결정 함수

~~~ts
function assessProductReaderEligibility(input: {
  rule: ProductReaderRuleV1;
  serverReaderId: OfficialReaderRuntimeIdV1;
  officialProductId: string;
  officialProductSpecVersion: string;
  officialSajuDomain: SajuDomain;
}): 'PRODUCT_ELIGIBLE' | 'PRODUCT_READER_DENIED' {
  // Source parity & policy approval verified by server adapter first.
  // standard_all_readers: all canonical Reader IDs eligible.
  // premium_restricted: only explicitly approved allowlist.
  // Unknown/missing/unapproved policies are NEVER passed to this function.
  throw new Error('design pseudocode: no Production implementation');
}
~~~

9명은 apps/api/src/reader-production-rollout-policy-v1.ts의 OFFICIAL_READER_RUNTIME_IDS_V1를 참조하며 **새로운 하드코딩 9명 목록을 각 서비스에 복제하지 않는다**.

## 3. 서버 발급 Admission Ticket (제안)

~~~ts
type OfficialReadingReaderAdmissionV1 = Readonly<{
  kind: 'official_standard_reader_admission_v1';
  subjectId: string;
  readingId: string;
  readerCharacterId: string;
  readerContentBundleId: string;
  productId: string;
  productSpecVersion: string;
  sajuDomain: SajuDomain;
  readingContractVersion: string;
  responseHash: string;
  approvedPolicyRevision: string;
  readerAccessEvidenceRevision: string;
}>;
~~~

조건:
1. canonical subject transaction, exact owner Thread and single server Reader.
2. pinned content release/bundle, exact owner Reader Grant.
3. verified ProductReaderRule, exact Reading product/spec/domain.
4. delivered Official Artifact의 response hash/version parity.
5. 기존 공개/내부 rollout admission 별도 통과.
6. 서버 module private mint function에서 인스턴스 정체성/브랜드 검증(WeakSet 등). 외부 plain object의 타입 일치만으로 입장시키지 않는다.
7. 메모리 안의 현재 실행 단위에만 유효. 캐시·DB 저장·클라이언트/LLM/Saju transport 전달 금지.

독립 Grant가 revoked라면 티켓은 재발급되지 않아야 한다. 비동기 Saju 호출과 권한 변경의 경쟁 상황은 최종 reveal 직전 entitlement 재검증 또는 DB snapshot pinning 정책을 DB owner가 결정한 뒤 반영한다. 현재 transaction 규칙을 조용히 변경하지 않는다.

## 4. Character Saju Context V2: 경로를 명시한 tagged union

현재 CharacterSajuRuntimeContextV1.capability는 CharacterCapabilityContent 타입이며 Character의 특정 Saju domain 필수 일치를 의미한다. 이를 무효화하거나 위조된 {domain}으로 채워 V1 타입만 만족시키는 구현을 금지.

~~~ts
type CharacterSajuEligibilityV2 =
  | Readonly<{
      source: 'legacy_character_capability';
      characterCapability: CharacterCapabilityContent;
    }>
  | Readonly<{
      source: 'official_standard_product_rule';
      admittedDomain: SajuDomain;
      productId: string;
      policyRevision: string;
      readingRef: string;
    }>;

interface CharacterSajuRuntimeContextV2 {
  readingRef: string;
  domain: SajuDomain;
  eligibility: CharacterSajuEligibilityV2;
  // original protectedSegments, disclosures, ambiguity,
  // admitted grounding reference / provenance remain mandatory
}
~~~

실제 구현에서는 V1 기능을 사용하는 Consumer를 구분한 v2 context/adapter를 새로 제공한다.

- 일반 채팅/기존 SP2/Face/Council에 새 official product authorization을 무조건 주입하지 않는다.
- Original non-Saju Character runtime은 legacy path 그대로.
- Official Standard Reading context만 server-minted admission을 요구하여 Character.capabilities.some(domain) 검사 대체.
- domain/source/readingRef/hash/version 확인은 반드시 남긴다. 같은 SajuDomain이라도 다른 Reading으로 admission ticket 재사용 불가.
- Selector/renderer는 eligibility.source를 확인한 뒤 verified admittedDomain과 SourceTruth domain이 일치하는지 판단. 다른 Saju semantic guard 삭제 금지.
- 게시 Character의 canon/persona/speech/sajuProfile/voiceAuthority/relationshipContent는 기존 requireAuthoredCharacter 및 pinned content validation을 그대로 요구.
- Authored CharacterCapabilityContent의 role, canInitiate는 일반 Product Reader 자격/가격/구매권으로 확대 해석하지 않는다.

## 5. 기존 함수별 변경 계획

| 정확한 경로/함수 | 변경 |
| --- | --- |
| character-standard-reading-chat-context.ts / prepareCharacterStandardReadingChatContextV1 | exact Reading Knowledge 재조회 후 별도 Product rule admission. Character capabilities.some(domain) 일반 Reading 차단은 이곳에서 제거하되 상품/Grant 검증으로 **대체** |
| character-standard-reading-server-runtime-authority.ts / prepareCharacterStandardReadingServerRuntimeV1 | 서버 Subject/Thread/content/relationship/memory authority 유지. 신규 approved rule/Admission을 기존 context plan에 결속 |
| character-runtime-context.ts / assembleCharacterRuntimeContextFromServerAuthorizedSajuV1 | official standard reading에서만 v2 assembler/opaque authorized scope 사용. V1 함수 및 direct Saju injection denial은 계속 유지 |
| character-saju-insight-selector.ts / assertSelectorContext | SourceTruth domain와 official admission domain을 비교. legacy branch는 기존 capability.domain 검증 보존 |
| reader-interpretation-preview-runtime-v1.ts | common_bounded 방식 유지. server-authorized Product Eligibility를 사용하고 unauthorized Saju HTTP 호출 없이 종료 |
| reader-interpretation-preview-http.ts | HTTP request body 변경하지 않음. Reader/Policy 값을 client에서 받지 않음 |
| postgres-character-standard-reading-knowledge.ts | 현재 Access metadata / Artifact source query 분리 사용. 필요할 때만 query composer 추가; 신규 임의 Grant 없음 |
| reader-production-rollout-policy-v1.ts | 세연 internal-only / public OFF 유지. Product eligibility와 rollout gate 별개 |

## 6. 단계별 실행 경계

~~~text
(1) HTTP body strict {threadId, officialReadingId} 확인
(2) Subject verified + transaction & activation gate
(3) owner Thread → serverReaderId + pinned content
(4) exact active Reader access metadata
(5) product policy authority exact lookup → product/reader eligibility
(6) official artifact fetch / delivered source / version/hash parity
(7) internal Admission Ticket mint
(8) Character Saju runtime v2 with official eligibility
(9) Saju-owned grounding HTTP projection
(10) common_bounded → plan → bounded renderer → semantic + output guard
(11) scoped response OR protected fallback
~~~

정확한 **효과적 Reader Access**에는 purchase-backed Grant 상태와 effectiveAt이 필요하다. 정책 조회나 Client display만으로 (4)를 대체하지 않는다.

기존 prepareCharacterStandardReadingChatContextV1는 metadata/artifact를 한 함수로 읽는다. (5)와 (6)의 순서를 엄밀히 보장하려면 내부 Knowledge resolver를 metadata 준비 단계와 Artifact 후속 단계로 나눠야 한다. 둘 다 같은 DB transaction/local Subject authority를 사용한다.

## 7. DB/Commerce 승인 전제

현재 Product Reader Eligibility 정책 전용 운영 테이블이 구현됐다는 근거는 확인되지 않았다. 다음은 선택적 제안이며 최종 테이블명/DDL이 아니다.

- policy identity: product_id + product_spec_version + rule_version + approved_revision
- product kind: standard_all_readers / premium_restricted
- source domain parity: saju_domain
- approval/effective_at window / archived policy revision, active state
- Premium만 별도 normalized allowed_reader_ids를 가진다.
- 기존 Official Reading 독립 저장 구조, standard_reading_reader_interpretations, entitlement_grants, qry_character_standard_reading_access_runtime_v2 등은 유지.
- 새 policy reader query/migration/RLS/role execute grant는 Product/Commerce/DB 책임으로 별도 PR.
- 운영 데이터가 없으면 policy resolver는 DENY/HOLD. 허위 '테스트용 승인 상품'을 운영 데이터로 seed하지 않는다.
- 기존 Grant가 상품 정책 revision 변화로 갑자기 다른 Reader에게 확장되지 않도록 migration/revocation/temporal semantics 별도 결정.

## 8. 보안·캐시·호환성

- No client-provided characterId, productTier, eligibility, per-domain capabilities, Official Saju response.
- No Subject or Reader IDs, purchase evidence, birth PII in Saju projection request.
- Interpretation output에는 canonical response copy를 노출하지 않음. protected fallback은 반드시 권한 확인 뒤.
- 캐시 필요 시 readingId+sourceHash+groundingHash+selectionVersion+policyRevision+CharacterContentVersion+ReaderId+access effective scope 동등성 재검증 후 사용. 전역 Reader cache로 Grant 우회 금지.
- External HTTP error schema는 기존 버전을 유지하고, 새 내부 DENY/HOLD 사유는 후방 호환 mapper로 변환한다. 민감한 구매 여부/타인의 Reading 존재는 감추기.
- 기존 Character Saju v1 타입을 일괄 삭제하지 않고 V2 context/adapter를 additive 구현한 후 새 경로의 모든 소비자가 이행됐는지 확인한다.
