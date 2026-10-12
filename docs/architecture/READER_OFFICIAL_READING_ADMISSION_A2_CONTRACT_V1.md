# A2 — 서버 인증·데이터 계약 상세 v1

> 설계 전용. 부모 문서: READER_OFFICIAL_READING_ADMISSION_A2_DESIGN_V1.md.
> Product/Commerce, DB, Character 공동 검토 후 별도 코드 PR 구현. 현재 운영 정책 row / Grant / 결제 / 사용자 경로를 만들지 않는다.

## 1. Exact metadata 단계

기존 public.qry_character_standard_reading_access_runtime_v2를 accessAuthorityPort.readAccessibleReadings로 호출한다.
인자는 verified canonical subjectId, owned Thread에서 확정한 readerCharacterId, trusted effectiveAt뿐이다.
요청 officialReadingId는 반환 행 중 동일한 값을 하나 선택하기 위한 키다.

접근 metadata의 최소 검증 필드:

| 항목 | 검증 |
| --- | --- |
| subjectId, readingId, readerCharacterId | requested canonical Subject / Reading / owned Thread Reader와 일치 |
| readerContentBundleId | pinned active Thread contentBundleId와 동일 |
| productId, productSpecVersion, sajuDomain | 존재/유효한 SajuDomain. 승인 정책 조회용 원천 |
| readingContractVersion, responseHash | official artifact parity에 사용 |
| readingSessionId, sourceBirthRevisionId, domainCapabilityVersion, sajuEngineVersion | 값과 출처 유효성, 관련 provenance 유지 |

정확한 Reading 행은 하나여야 한다. 없음/중복/타 사용자·타 Reader·bundle 변경이면 Product policy, 원문, Saju HTTP 호출 전에 DENY.
DB access 조회가 반환한 유효 권한이 실제 purchase-backed exact Grant임을 보장하는 함수 계약은 DB/Commerce owner가 검증한다. 단순 product metadata가 구매 증명인 것은 아니다.

## 2. Product policy 결합

A1의 resolveProductReaderEligibilityV1에는 정확히 아래 서버 metadata **projection만** 입력한다.

~~~ts
const source = {
  productId: access.productId,
  productSpecVersion: access.productSpecVersion,
  sajuDomain: access.sajuDomain,
};
// serverReaderId는 owner thread에서 획득.
// effectiveAt은 transaction / server-controlled 시각.
// authorityPort는 Product/Commerce 승인된 server-only dependency.
~~~

A1 함수가 반환한 eligible status는 9명 지원 *상품 능력*만 뜻한다.
서버는 이를 받은 같은 실행 맥락에서 exact Grant와 raw source 검증을 완료해야 한다.
미승인 policy, malformed rule, 버전/도메인/상품 불일치, policy adapter 오류는 fail-closed.
reader ID/productTier/allowedReaderIds를 HTTP나 Character 콘텐츠로부터 받아 결론을 바꾸지 않는다.

현재 A1에는 ProductReaderEligibilityAuthorityPortV1 **인터페이스만 존재**한다. 승인된 Production DB adapter·정책 catalog는 아직 확인되지 않았다.
상품 이름의 standard 접두어 또는 readingVariant 문자열로 임의 standard 정책을 자동 구성하면 안 된다.

## 3. Exact artifact 뒤의 검증

정확한 정책 통과 시 기존 public.qry_standard_reading_artifact_source_runtime_v1을 동일 Subject/Reading/Reader/effectiveAt으로 호출한다.

artifact row의 readingId, productId, readerCharacterId, readingContractVersion, responseHash는 access metadata와 일치해야 한다.
responseSnapshotJsonb는 검증된 공식 ProductReadingResponse object여야 하며 productResponseState/completedAt의 유효성도 검사한다.
허용될 delivered 상태의 실제 enum은 현재 Project response contract를 토대로 구현할 것. 임의의 문자열로 성공 처리 금지.

sourceResponseHash, groundingHash, officialArtifactResponseHash를 동일한 값으로 가정하지 않는다.
Raw snapshot은 user-facing Preview 또는 Saju 외부 입력으로 그대로 투영하면 안 되며 기존 Saju Grounding adapter의 최소 허용 필드 계약을 지킨다.

## 4. 단일 실행 경계의 서버 proof 계약

~~~ts
type OfficialReadingReaderVerifiedScopeV1 = Readonly<{
  subjectId: string;
  readingId: string;
  readerCharacterId: string;
  readerContentBundleId: string;
  contentReleaseId: string;
  productId: string;
  productSpecVersion: string;
  sajuDomain: SajuDomain;
  readingContractVersion: string;
  officialArtifactResponseHash: string;
  productRuleVersion: string;
  approvedPolicyRevision: string;
}>;
~~~

실제 구현은 서버 전용 비공개 issuer + opaque handle 구조로 작성한다.

- 서버 issuer만 인증된 metadata/Grant/Policy/Artifact 경로를 순서대로 호출한 뒤 발급할 수 있음.
- TypeScript 형태만 맞는 plain object나 caller-supplied A1 eligible 객체로 발급 불가.
- private brand/WeakMap + invocation-scoped 상태 + 소비 시 exact scope 비교 + 단일 사용 보장.
- WeakSet 소속 확인만으로 복제·재사용·다른 요청 전용 증명이 되지 않는다는 점을 명시.
- 다른 Reader, Reading, Subject, bundle, release, product, policy revision, hash로 전용 불가.
- raw 사주 snapshot, Birth 입력, Purchase Intent, 결제번호는 proof에 저장/로그/직렬화하지 않음.
- Proof가 한번 발급됐어도 영구 Grant가 아니므로 후속 채팅/재열람 시 DB access를 다시 확인.
- A3 consumer가 server-verified proof를 사용하도록 이행하고, CharacterCapabilityContent를 가짜 도메인 객체로 채워 기존 필수검사를 우회하지 않는다.

## 5. Transaction / revoke 동시성 검토

현행 executePostgresSubjectTransactionV1은 DB Subject role을 callback 전체 동안 유지하며, callback이 Saju HTTP까지 실행하면 트랜잭션이 외부 I/O 동안 지속될 수 있다.
A2는 현행 DB/Subject 코드와 transaction-local access row 계약을 유지한다. 이 설계만으로 트랜잭션 분리나 revoke race 해결을 주장하지 않는다.

가능한 후속 설계:
1. 짧은 transaction에서 access → policy → official artifact 확인.
2. 외부 Saju 호출을 별도 실행.
3. 반환 직전에 새로운 canonical Subject transaction으로 exact Reading×Reader Grant, content, Product rule revision/hash 재확인.
4. 실패하면 결과 자체를 공개하지 않음.

전환 시 isolation policy, revoke race, 중복 호출 및 timeout, 서브젝트 컨텍스트 만료, connection pool 점유량은 DB owner의 별도 동시성 테스트가 필수다.
상세 구현 결정 전까지 원격 요청을 무작정 트랜잭션 밖으로 이동시키지 않는다.

## 6. 오류 모델

내부: AUTH_REQUIRED, ROLLOUT_HOLD, ACCESS_DENIED, POLICY_HOLD, PRODUCT_READER_DENIED, SOURCE_CONFLICT, PROOF_INVALID.
외부: 기존 ApiCommandError / Reader Interpretation Runtime의 generic NOT_FOUND/DENY/INVALID_REQUEST 호환 mapper만 적용.
타인 Reading 존재/구매 내역/상품 승인 여부 추론을 유발하는 상세 메시지 금지.

No authorized access → artifact 0, Saju 0, protected fallback 0.
Unknown policy → artifact 0, Saju 0.
Verified access/policy but invalid raw source → artifact fetched, Saju 0.
Valid source but semantic guard fail → 그 Reader의 유효 권한 확인 후에만 protected fallback.
