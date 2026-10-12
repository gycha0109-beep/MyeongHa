# A2 — 공식 Reading × Reader 서버 승인 경계 설계 v1

> 2026-10-09. 설계 전용 · 런타임/결제/DB/공개 변경 없음.
> 기준: MyeongHa main c62b573e053361e851235ef768385e6da9d66058.
> 연결: PR #1777 전체 설계, #1778 공통 Reader 해설 선택, #1782 A1 Product eligibility.
> 상세 구현 계약과 테스트는 같은 디렉터리의 A2 CONTRACT / A2 TEST MATRIX 문서 참조.

## 1. 설계 목표

정식 캐릭터 9명은 승인된 일반 사주를 모두 해설할 *능력*이 있다. 그러나 이 능력은 사용자 사주에 대한 자동 접근권이 아니다.

실제 Reading으로 접근하려면 다음 사항을 모두 통과해야 한다.

1. A1 Product policy: 정확한 productId / productSpecVersion / sajuDomain을 서버가 승인한 일반 상품이면 모든 정식 Reader가 상품 적격.
2. 사용자별 exact Grant: verified Subject + officialReadingId + 서버가 Thread에서 확정한 Reader의 활성 구매 기반 접근권.
3. 콘텐츠 및 운영: owner single-Character Thread, pinned content bundle/release, 현재 Reader 출시 정책.
4. Official Saju Source: 저장된 공식 Reading의 정확한 source provenance, delivered 상태, version/hash 및 grounding 검증.

A1 eligible, 실제 구매권한, 운영 공개 가능, Character authored persona는 서로 다른 판정이다. 향후 프리미엄 제한만 Product Owner가 특정 Reader allowlist를 별도 결정한다.

## 2. 기존 구현에 존재하는 연결 지점

| 실제 경로 | 현행 상태 | A2 대상 |
| --- | --- | --- |
| apps/api/src/product-reader-eligibility-policy-v1.ts | A1 순수 판정 + Product/Commerce 조회 포트, 운영 정책 adapter 없음 | 승인 정책 조회에 재사용 |
| apps/api/src/reader-interpretation-preview-postgres-execution.ts | canonical Subject 트랜잭션, OFF/cohort 게이트, transaction-local DB ports | Product policy 서버 포트 결속 |
| apps/api/src/reader-interpretation-preview-http.ts | 요청 body는 threadId / officialReadingId만 | 그대로 유지. 사용자 Policy/Reader 주입 금지 |
| apps/api/src/reader-interpretation-preview-runtime-v1.ts | Thread → pinned content → server runtime → Saju projection | A2 검증 후에만 Saju HTTP 호출 |
| apps/api/src/character-standard-reading-server-runtime-authority.ts | owned Thread 검증 및 관계·기억 조회 | 초기 권한 preflight 재구성 |
| apps/api/src/character-standard-reading-knowledge.ts | access metadata 직후 raw artifact 조회, 하나의 결과로 반환 | access 단계와 artifact 단계 분리 |
| apps/api/src/postgres-character-standard-reading-knowledge.ts | 기존 Reader access/artifact SQL 함수 2개 | 동일 DB 함수/권한 재사용 |
| apps/api/src/character-standard-reading-chat-context.ts | Character capabilities에 해당 Saju domain 요구 | A2 인증 연동. domain gate 교체는 A3 |
| apps/api/src/postgres-subject-execution.ts | BEGIN, SET LOCAL ROLE, COMMIT/ROLLBACK | 변경하지 않음 |

현재 resolveCharacterStandardReadingKnowledgeV1는 권한 조회 후 즉시 raw artifact를 읽는다. 정책 검사를 함수 호출 *다음*에 추가하면 미승인 상품의 원문을 먼저 읽게 된다. 따라서 기존 reader knowledge 결과/테스트는 유지하면서 내부 순서를 분리해야 한다.

## 3. A2가 강제할 실행 순서

~~~text
(0) client body: {threadId, officialReadingId}
(1) verified identity → transaction-local canonical Subject
(2) OFF / cohort gate, 불허 시 더 이상 query하지 않음
(3) owner Thread → 정확히 1명의 server Reader ID
(4) pinned immutable Character release 및 bundle 검증
(5) DB exact Reader access metadata 조회 및 단일행 확인
(6) metadata subject/reader/reading/bundle/domain/source version/hash 검증
(7) approved ProductReaderEligibilityAuthorityPortV1 조회
    - standard_all_readers: 정식 Reader 9명 모두 상품 적격
    - premium_restricted: 실제 승인된 allowlist 내 Reader
    - missing/invalid/unknown/disabled: HOLD
(8) metadata가 승인된 경우에만 raw Official artifact 읽음
(9) artifact와 metadata source identity/responseHash/contract/state parity
(10) active Thread/content 재검증 후 opaque server-only proof 발급
(11) A3 Character Runtime 소비 / Saju grounding / guarded rendering
~~~

읽기 권한이 없는 경우 raw artifact 호출, Saju HTTP 호출, fallback 결과 본문은 모두 0이어야 한다. 다른 Reader가 이미 구매한 동일 Official Reading이 있어도 사용자별 Reader Grant를 새로 확인한다.

## 4. 진행 범위

A2는 **상품 적격성 + 구매한 Reader 접근권 + 공식 Reading source의 결합**만 만든다. Character domain gate의 코드 변경은 A3에서 별도 수행한다.

A2 내부 implementation은 Product/Commerce 운영 승인 source가 없을 경우 fail-closed, public route/paid Reader는 계속 OFF로 둔다. 실제 상품 승인 전 synthetic 테스트가 통과하더라도 실사용 가능으로 표시하지 않는다.

선행 정책은 P0-CM-03 OPEN-P0. standard.love_relationship는 비활성 후보이며 현재 실행 가능한 결제 Offer가 없다는 기존 결정 기록을 유지한다.

**판정:** A2 상세 설계, 코드 미구현, 서비스 HOLD.
