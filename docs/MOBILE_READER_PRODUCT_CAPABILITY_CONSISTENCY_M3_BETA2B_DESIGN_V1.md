# M3-β-2b D-01 — Standard Reader Product eligibility × DB can_initiate 정합성 상세 설계 v1

> Status: DESIGN PROPOSAL / OWNER APPROVAL HOLD / PUBLIC OFF
> 검증 기준: main 474db9371abd6b8cd83fbae8ef5e6f3c02e43727 (2026-10-10 기준 확인)
> 책임: Product(applizing), DB authority, Reader Runtime, Commerce; 구현·정책 결정 권한을 이 문서가 대신하지 않음
> Tracking: #1823, #1828, #1826, #1831

## 1. 실제 불일치의 정확한 위치

**구매 선택(pre-purchase)**, **결제 후 v2 bind**, **A2 승인**, **A3 V2 생성**은 현재 별개 검증이다.

1. apps/api/src/standard-reading-reader-selection-resolver-v4.ts + migration 1150:
   - Product spec, active default content release, Reader catalog enabled/available/unlockable 및 이미 저장된 unlocked projection으로 Reader를 선택.
   - 일반 Standard의 해당 도메인에 대한 character_capabilities.can_initiate는 이 선택 resolver에서 검사하지 않는다.
   - Product enabled=false인 후보도 resolver에서 조회 가능하지만, 구매 가능 여부는 별도 Offer/Charge Terms/DB 실행 권한에서 거부한다.
2. migration 1220의 cmd_bind_standard_reading_access_v2:
   - verified Intent, selected Reader/bundle, exact purchase-backed receipt/grant, Product spec/Offer role을 검사한 뒤,
   - **character_capabilities에서 content_bundle_id × character_id × saju_domain의 can_initiate=true**를 필수로 요구한다.
   - 미충족 시 READER_CAPABILITY_UNAVAILABLE. 도메인 일반 해설과 특수 기능의 의미를 SQL에서 구분하지 않는다.
3. apps/api/src/product-reader-eligibility-policy-v1.ts:
   - Product/Commerce-owned approved standard_all_readers 또는 premium_restricted rule; productId/spec/domain/revision 일치 검사.
   - 이는 상품 적격성뿐이며 Grant·Thread·Release·공개 권한이 아니다. Production approved adapter가 존재한다고 볼 수 없다.
4. apps/api/src/character-saju-official-eligibility-v2.ts:
   - exact A2 Subject×Thread×Reader×Reading scope 및 approved standard_all_readers rule을 요구한다.
   - 전문 Capability 객체를 새로 만들지 않고 A3 proof를 발급하며 premium은 이 일반 Standard V2 proof로 승격하지 않는다.
5. #1826:
   - 공식 9 Reader × 9 Saju Domain 합성 A2/A3 proof 회귀 81개 PASS.
   - 이 조합이 migration 1220 DB bind를 실제 통과하거나 Character가 모두 출판되었음을 증명하지 않는다.

**결론:** DB에서 구독하는 legacy domain can_initiate와 A3의 approved Standard Product rule을 동치로 놓으면 안 된다. 반대로 기존 can_initiate 검사 삭제만으로 해결되었다고 주장해서도 안 된다.

## 2. 분리해야 할 독립 판정 축

| 축 | 권위의 소유자/원본 | 올바른 질문 | 다른 축을 대신할 수 있는가 |
| --- | --- | --- | --- |
| CATALOG | Content/Character | 해당 Reader/Bundle이 실제 출판 가능·사용 가능하고 active/pinned인가 | No |
| UNLOCK | Character/DB | unlockable이면 현재 Subject에게 unlocked인가 | No |
| PRODUCT_ELIGIBILITY | Product/Commerce | exact Product spec + domain + effective revision에서 이 Reader가 standard 또는 premium에 적격인가 | No |
| SKILL_CAPABILITY | Character/DB | 특수 domain 기능·전문 행동에 대한 can_initiate인가 | 일반 Standard 해설 권한을 자동 대체하지 않음 |
| PURCHASE | Payment/Commerce | verified production receipt와 독립 active Grant가 있는가 | No |
| READING | Saju/DB | 해당 공식 Reading이 committed/delivered이고 source hash가 일치하는가 | No |
| ADMISSION | Reader Runtime/DB | Thread·Grant·Rule·Source·Release와 공개 정책을 현 시점에 모두 만족하는가 | No |

모든 축은 상호 독립이다. 일반 Standard 해설에 전문 Capability를 위조하지 않는다. Product eligibility 성공만으로 pending/disabled 상품에 판매 권한을 부여하지 않는다.

## 3. 기존 계약의 가능한 처리 방안 비교

| 대안 | 내용 | 장점 | 위험/판정 |
| --- | --- | --- | --- |
| A | 9×9 can_initiate 행을 모두 true로 확대 | 기존 v2 DB 함수 거의 그대로 사용 | Specialist Capability 의미 변조, 프리미엄·행동 권한 누출 위험. **권고하지 않음** |
| B | migration 1220의 can_initiate gate를 조건 없이 삭제 | 개발 단순 | DB가 승인 Product 정책 없이 Reader 범위를 늘릴 수 있음. **금지** |
| C | 별도로 승인된 Product Reader rule 기반 standard eligibility를 **v2 bind의 서버·DB authority에 정확히 결속**하고, 전문 기술은 기존 can_initiate로 별도 검사 | A1/A3와 제품 의미 일치, fail-closed 유지 | 실제 Production Product rule source/immutable revision/transaction coherence 승인 필요. **권고 후보, 아직 승인 안 됨** |
| D | 운영 정책·데이터의 문서화 전까지 현행 can_initiate 검사를 유지 | 미승인 결제/해설 실행 차단 | 실제 범용 Standard 9명과 부조화. **현재 안전한 HOLD 대안** |

**조건부 추천:** C를 Product+DB+Reader가 승인할 때만 구현. 승인 source가 없으면 D를 유지. 이 문서는 C를 이미 결정된 운영 정책이라 선언하지 않는다.

## 4. 후보 C의 최소 내부 계약

### 4.1 Product policy source

- Product 소유의 versioned, approved, active-effective policy가 최소 productId, productSpecVersion, sajuDomain, classification, ruleVersion, approvedPolicyRevision, effective window, optional premium allowed Reader IDs를 정의해야 한다.
- server-side Product catalog의 실제 approved 상태에서만 해당 정책을 반환한다. **LLM, client, Reader display 목록, 테스트 mock, Product 이름 문자열**은 승인 source가 아니다.
- 승인된 policy가 DB transaction에서 조회 가능한 형태인지, 서버의 Product resolver와 버전 동일성을 어떻게 보증할지 Product+DB 공동 승인 필요. 새 table/SQL function/Port 형태는 현재 확정하지 않는다.
- 0건, 다중 활성 revision, stale/retired/disabled, Product ID/spec/domain mismatch, invalid premium Reader list, source unavailable 모두 DENY.
- 런타임 A2가 읽는 Product rule과 bind 시의 Product policy는 같은 승인 revision lineage를 추적해야 한다. bind 당시에 허용됐어도 사용 시 정책이 철회되면 실행은 다시 차단한다.

### 4.2 DB 구매 결속 시 동작 후보

- 모든 기존 verified Intent, Receipt, exact Grant, Reader selection/bundle, initial/additional Offer role, canonical Subject, Birth revision, Domain availability 검증은 유지한다.
- standard_all_readers: **Product 정책이 exact Reader의 일반 Standard 해설 자격을 승인하고 Catalog/Release/Unlock이 허용된 경우에 한해** domain specialist can_initiate만으로 거부하지 않는 정책을 검토. 이것은 구매만의 적격성이고 A2/A3 티켓이 아님.
- premium_restricted: 승인 allowlist가 맞아도 그 Reader에게 필요한 실제 Specialist Capability가 적용되는지 owner가 결정. 일반 Standard V2 proof로 premium 우회 금지.
- policy가 없거나 어느 한 요소라도 불일치하면 권한 발급/Reading mutation 전에 중단. client가 kind/allowlist/policyRevision을 넣어 우회하는 경로 금지.
- 추가 Reader는 기존 committed official Reading만 재사용; 신규 공식 Reading을 생성하지 않는다.
- DB 변경 필요 시 migration 1220/1150 내용 재작성 금지. Forward-only migration + PostgreSQL 회귀 + 기존 historical source preservation.

### 4.3 Runtime 및 화면 계약

- 구매 시 사용한 approval revision을 immutable purchase/bind provenance로 추적할 필요가 있는지 owner 결정. 임의로 access_grants에 미승인 필드 추가 금지.
- 실제 Reader 런타임은 current approved policy와 exact purchase Grant를 다시 검사해야 한다. A3가 받은 approved Standard proof가 과거 구매 여부를 대체하지 않는다.
- 앱의 9 Reader 소개 화면은 출시·구매 가능 표시가 아니다. Public OFF, 추가 Reader 가격과 구매 버튼은 미승인 상태 유지.

## 5. 수락 테스트 (명세, 아직 실행 안 함)

| ID | 테스트 | 기대 |
| --- | --- | --- |
| CAP-01 | 승인 Standard 9×9 정책 + 실제 출판 Reader + 유효 Unlock + live-equivalent synthetic exact receipt/grant | DB binder 및 A2/A3 domain eligibility 일치. 기존 Saju source 1건 유지 |
| CAP-02 | 9×9 합성 A3만 제공, DB 정책 source 없음 | v2 bind 0, 판매 0, raw artifact 0 |
| CAP-03 | specialist can_initiate=false, approved Standard=true | Product/DB/Reader가 승인한 C 정책에서만 일반 해설 허용; 전문 행동 불가 |
| CAP-04 | Premium restricted에서 대상 Reader 제외 | 선택/bind/A2/A3 모두 DENY; Standard fallback 통한 premium 우회 금지 |
| CAP-05 | Premium allowlisted이나 specialist Capability 누락 | 별도 premium policy 범위에서 DENY, 일반 Standard eligibility 위조 금지 |
| CAP-06 | unapproved/disabled/stale/multi-revision Product policy | 결제 바인딩/공식 Reading mutation/원본 조회 0 |
| CAP-07 | Reader not published/disabled/coming_soon 또는 unlockable 미해제 | 선택과 구매/실행 모두 차단 |
| CAP-08 | Content bundle 교체 / Release revision drift | 이미 pin된 구매 증거를 새 bundle로 자동 이관 금지; 정책 결론 전 HOLD |
| CAP-09 | Standard 9×9 중 Product Saju domain unavailable | 도메인 availability 우선 DENY |
| CAP-10 | historical Reader-bound v1 vs 공식 v2 identity | 현재 정책으로 과거 Saju/구매 이력 일괄 재작성 금지 |
| CAP-11 | 실상품 standard.love_relationship enabled=false, Offer 없음 | synthetic CAP-01 PASS와 관계없이 운영 구매 0 |
| CAP-12 | Product revision이 구매 후 철회 | 기존 원본 삭제 0, 새 실행은 current policy 판정대로 DENY |

최소 검증: Vitest 정책·selector, PostgreSQL migration 1130/1150/1220, scoped DB case, A2/A3 증거, staging current approved version 교차 검증. 실데이터 출판/결제 검증은 별도 Release gate.

## 5.1 실제 PostgreSQL 부분 검증 — PR #1838 병합

- **PR #1838**: merged SHA `2ec39bc55a08b38b625bbc2ec10382b2341a9d58`; isolated scoped DB + Integration CI PASS.
- verified synthetic purchase/Reader selection과 구매 기반 Grant가 있어도, 정확한 Reader×bundle×relationship `character_capabilities` 행이 **존재하지 않으면** `cmd_bind_standard_reading_access_v2`가 `reader_capability_unavailable`로 거부함을 검증. 거부 시 official Reading/interpretation/access 신규 row 0. 출판된 Capability row를 갱신하지 않고 fixture의 정상 행을 새로 INSERT하면 기존 positive test 정상.
- 출판된 Character Capability row는 immutable trigger가 UPDATE/DELETE를 차단하므로 직접 값 변조 Fixture 사용 금지.
- **검증 범위 주의:** 이번 DB 테스트는 **missing Capability row** DENY. 이미 출판된 `can_initiate=false` 행의 별도 SQL 사례 및 Product-approved 9×9 정책 일치는 미검증. CAP-01~12 전체 PASS가 아니며 #1828은 OPEN.
- **권한 미변경:** SQL migration·Product/Reader 정책·출판 콘텐츠·실구매 Grant·Public Reader OFF에 변화 없음.

## 6. 구현 순서와 종료 조건

- CAP-A (Product/Character): Standard vs Specialist 용어·권한·프리미엄 정책과 실제 Rule version/source 결정. Product/DB/Reader owner 승인 필요.
- CAP-B (DB): 승인 정책을 v2 binding 경계에 도입하는 최소 forward-only 보강 또는 현행 HOLD 결론. SQL ACL/RLS, effective window, idempotence·replay tests.
- CAP-C (API/Reader): A1 Product Port와 DB binder 정책 revision 정합성, A2/A3의 actual source parity; 승인 없는 policy adapter는 fail-closed.
- CAP-D (QA): 81 synthetic와 **실제 DB 적격성 조합**은 별도 검증. Content 출판, Commerce saleability, live E2E 미승인 상태 보존.

**판정:** 상세 정책 대안과 acceptance 설계 작성 PASS. C 대안의 Product/DB/Reader owner 합의는 HOLD. Production grant/public API/Reader 활성 HOLD.
