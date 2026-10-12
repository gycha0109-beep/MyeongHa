# Reader 범용화 — 승인 테스트·이행 계획 v1

> 설계 및 검증 계획. 운영 환경 실행 결과가 아니다.
> Main authority 595cb414b1768959a3a794efab3ee06a512599e5.
> 상위 설계: READER_UNIVERSAL_STANDARD_SAJU_DESIGN_V1.md.

## 1. 판정 정의

- **PRODUCT_ELIGIBLE**: Product/Commerce에서 승인한 해당 일반 상품을 이 Reader가 해설할 제품 능력이 있음.
- **READER_ACCESS_GRANTED**: 해당 사용자에게 그 정확한 Reading × Reader 구매 기반 접근권한이 있음.
- **CONTENT_RELEASE_READY**: 캐릭터 발표용 콘텐츠/voice/프리뷰 또는 공개 출시 자격 존재.
- **SAJU_SOURCE_READY**: 공식 Reading delivered + 검증된 Saju grounding / Source Truth 존재.
- **READY_TO_RENDER**: 위 판정 모두 만족. 어느 하나라도 거부면 본문 생성/전달 안 함.
- **PROTECTED_FALLBACK**: 모든 접근 권한은 있지만 Saju 의미의 보호 렌더링 한계 또는 semantic guard가 발생한 경우에만 가능.

## 2. 일반 상품 적격성 테스트

Canonical Reader 9명: seyeon, baekheon, yeoul, seorin, rahyeon, mira, taegyeom, yunho, doyun.

현재 타입에 등록된 SajuDomain: general, family, relationship, compatibility, career, business, wealth, life_stage, question_specific.

| 입력 시나리오 | 기대 |
| --- | --- |
| 승인된 일반 상품 × 9 Reader | 모든 Reader PRODUCT_ELIGIBLE (9/9) |
| 각 도메인별 Synthetic 승인 일반 상품 × 9 Reader | domain-specific Character capability 없어도 전원 적격; 9×9 계약 fixture |
| 일반 상품 + 미출시 Reader content | PRODUCT_ELIGIBLE일 수 있지만 CONTENT_RELEASE_READY는 false |
| 일반 상품 + Reader A만 구매 | A만 READER_ACCESS_GRANTED, 다른 Reader 8명은 DENY |
| 같은 공식 Reading + 별도 Reader B 추가 구매 | B access 허용, Official Reading count/Hash unchanged |
| Reader A revoke/return/refund | A만 거부, 기존 B Access 유지 |
| 유효 않은 Reader ID | 전 단계 중 어떤 곳에서도 승격 불가 |
| 모르는 Product, 아직 승인되지 않은 SKU | HOLD_PRODUCT_POLICY, 사주 호출 0 |
| 이름에 'standard'가 들어간 미분류 상품 | 거부, 키 문자열 기반 분류 불가 |
| Premium (미래 Synthetic fixture) 허용 리스트에 있는 Reader | 적격 + 나머지 Grant/출시 검증 필수 |
| Premium (미래 Synthetic fixture) 허용 리스트 밖 | 상품 정책 차단, 사주 호출 0 |
| Premium 상품 결정 자체 없음 | 운영 활성화 금지 |

Synthetic 9×9 매트릭스는 **소프트웨어의 모든 Reader/domain 지원 능력** 검증이다. 미출시 Saju domain 상품을 판매/계산 가능으로 주장하는 증거가 아니다.

## 3. 서버 API 및 정확한 소스 권한

| 케이스 | 기대 판정 / side effect |
| --- | --- |
| verified Subject 없음 | AUTH_REQUIRED. DB Artifact/Saju 0회 |
| wrong Subject, 다른 사용자 Reading | generic NOT_FOUND/DENY, Raw source 0회 |
| Reading ID 없는 접근 | NOT_FOUND. 정책/원문/의미 호출 0회 |
| Reader A 구매, Reader B Thread로 요청 | Exact Reader Grant 없음, DENY |
| revoked, expired, failed purchase 기반 Reader Grant | DENY; protected fallback 불가 |
| one-character Thread 아닌 그룹 Thread | DENY |
| Reader content bundle swap, stale pinned release | DENY |
| HTTP body에 readerId / isPremium / allowedReaderIds / sourceResponse 추가 | INVALID_REQUEST |
| server Product Rule 누락/장애 | HOLD/DENY, Saju 0회 |
| productId / productSpecVersion / sajuDomain / ruleVersion drift | DENY, Ticket 미발급 |
| 단순 객체 구조를 ticket으로 위조 | server brand / issuer 검증 실패 |
| Official Artifact unreadable, pending/failed | No Reader interpretation |
| Official Reading version / responseHash mismatch | No Reader interpretation |
| Saju HTTP invalid admitted header / 401 / timeout / invalid hash | protected flow or bounded error only after valid access |
| 동일 사용자·Reading·Reader 재시도 | source proof/deterministic output consistency |
| 서로 다른 Reader·동일 공식 Reading | same Official source/grounding hash, 각자 독립 Grant; 전달 프레이밍은 pinned Content 기준 |
| Reader revoke vs in-flight HTTP | Reveal 이전 실효 권한 재확인, 또는 DB owner 승인된 snapshot semantics을 테스트 |

권한 DENY에서는 원문 및 Saju 호출이 없어야 하며 **보호용 공식 사주 문장이라도 반환해서는 안 된다**.

## 4. Character Runtime regression

- legacy_character_capability 경로: 기존 domain 특화 기능/role/canInitiate 테스트 그대로 PASS.
- official_standard_product_rule 경로: Character.capabilities에 해당 도메인이 없어도 server-minted Admission으로만 올바른 Saju context 구성.
- 서버 Admission 없는 일반 호출: existing direct-Saju context ban 유지.
- Cross-character Voice Authority, stale contentVersion, cloned speech/communication 객체 모두 기존 보호 검사 PASS.
- context.saju.domain vs admittedDomain vs grounding.readingDomain 검증.
- 제공된 원문이 없는 invented domain/capability 우회 불가.
- 기존 common_bounded strategy와 Saju Grounding admissions/profile validation/semantic preservation tests 모두 PASS.

## 5. 의미·출력 검증

- Saju 의미 원천, Source Response Hash / Grounding Hash / Official Artifact Hash를 혼동하지 않는다.
- sourceUnitRefs 없는 semantic claim 금지; canonicalMeaning에 없는 결과·시기·금액·확신 강화·반대 의미 문장 거부.
- ambiguity/limitation/requiredDisclosure, companion closure 보존.
- protected_only unit 처리, no-grounding, zero-selectable-unit, new Saju source unavailable → protected fallback 또는 명시적 실패; 새 일반 명리 해석 생성 금지.
- Reader별 authored safeFraming/voice가 없으면 '정상 캐릭터 해설 완료'라고 세지 않는다.
- 해설 선택이 같은 데이터+버전에서 결정적이고 독립 Reader의 공식 SourceTruth가 불변인지 확인.

## 6. 현재 테스트를 중심으로 변경할 파일

| 현행 테스트 | 추가 및 변경 |
| --- | --- |
| test/character-standard-reading-chat-context.test.ts | Character capability domain mismatch 차단의 기대값을 일반 상품 정책 및 exact Grant 검증으로 교체. 미승인 Product는 계속 차단 |
| test/character-standard-reading-server-runtime-authority.test.ts | 서버 minted admission, owned single Thread, stale content, cross-reader hold |
| test/character-standard-reading-chat-turn-context.test.ts | HTTP/Saju 경계, owner-bound Reader + policy proof |
| test/reader-interpretation-preview-runtime-v1.test.ts | 기존 PR #1778 common baseline 보존, Reader/domain × Admission matrix 연결 |
| packages/domain/src/character-saju-insight-selector.test.ts | tagged eligibility 각각의 검증 + forged domain reject |
| packages/domain/src/character-saju-semantic-guard.test.ts | 기존 semantic invariants 보존 |
| test/reader-interpretation-preview-postgres-execution.test.ts | transaction/rollback/out-of-cohort/Saju-no-call |
| test/reader-interpretation-preview-production-saju-postgres.test.ts | 실제 Saju HTTP adapter 및 server admission proof 연결 |
| test/postgres-character-standard-reading-knowledge.test.ts | DB exact Reader grant와 policy adapter 권한 오류 검증 |
| test/reader-interpretation-preview-http.test.ts | body whitelist와 client permission fields reject |
| test/production-reader-interpretation-activation.test.ts | public OFF/seyeon-only Preview 유지 |
| Web/Mobile Reader runtime and API client tests | API payload backward compatibility, eligibility vs entitlement vs rollout 표시 |

## 7. 권장 PR·완료 게이트

### PR-A1 — Product Eligibility interface (앱화 + Commerce 검토)
- 테스트 가능 순수 타입/결정 함수, authority port. 런타임 전체 허용이나 DB/Offer 활성화 없음.
- 종료: normal 9x9, unknown deny, future premium allowlist synthetic tests.

### PR-A2 — Server Admission composer (앱화 + DB/Commerce 검토)
- Metadata-first access → Product policy → Artifact parity → server-only ticket.
- 종료: authorized/unauthorized/expired/revoked/forged / no-Saju-call tests.

### PR-A3 — Character Saju Runtime V2 (Character/domain owner)
- Tagged eligibility; Product-authorized official Reading에서만 Character domain-gate 교체; legacy branch 유지.
- 종료: Runtime typecheck, selector/guard/voice tests PASS, no profile reauthoring.

### PR-A4 — Web/Mobile + hosted E2E (각 UI/운영 owner)
- 정확한 서버 상태 표시, active Reader만 release; 처음은 세연 bounded internal Preview.
- 이후 프로덕션 판매/구매·후속 채팅 활성화는 별도 승인.

### PR-A5 — Premium optional restriction (Product/Commerce)
- 실제 Premium SKU, policy/version, allowlist/가격/Offer/Charge Terms 승인 뒤 진행. 지금 HOLD.

## 8. CI 및 트랙 운영 규칙

1. PR별 책임을 단일 변경으로 묶는다. Character voice canon 추가·Saju source meaning 변경·Commerce grant mutation을 동시 수행하지 않는다.
2. Affected Tests + TypeScript + API Client + Governance + security + Web/Mobile/Saju targeted gates PASS.
3. HEAD/base 최신 SHA 기준 기본 CI PASS일 때만 ci-integration-ready 한 번 부여.
4. Full Integration CI DB authority, PostgreSQL, Commerce Payment/Entitlement, Character Content/Runtime main regression PASS 확인.
5. PR squash merge 후 main SHA와 deployed canonical Production SHA/READY 일치 확인.
6. 공개 Reader OFF, 처음 internal Preview 세연-only, 결제 상품 activation HOLD를 변경하지 않는다.

## 9. 종료 조건 A/B/C

**A — 상세 설계:** 3개 Character 도메인 hard-gate를 모두 대체하는 구조가 문서상 명시되고 Product policy·exact Reader grant·release gate가 충돌하지 않음. 본 설계 PR에서 가능.

**B — 코드 검증:** A1–A3 각각 승인/병합 + 위 matrix PASS + 기존 동작 regressions PASS. 본 설계 PR만으로 달성하지 못함.

**C — 운영 출시:** 실제 Product/Saju 의미 제공 승인, DB/Commerce Offer/Entitlement, published Character quality, live browser/mobile E2E, verified deployment SHA, 운영승인 필요. 현재 HOLD.

남은 위험: 미정 Product authority row, Character content release readiness, 서버 원격 호출 중 Grant revoke race, v1→v2 타입 전환 영향, 실제 사주 의미 제공 scope/Reader 후속 대화 검증.
