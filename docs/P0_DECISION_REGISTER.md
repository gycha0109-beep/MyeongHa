# 명하 Production P0 Decision Register — Full Audit v0.9

> **2026-11-14 현재 실행 기준:** [현행 제품 소유자 범위 결정](LAUNCH_SCOPE_OWNER_DECISION_AND_TRACK_CLASSIFICATION_20261113.md) · [통합 실행 게이트](LAUNCH_ROADMAP_CANONICAL_GATE_MATRIX_20261114.md)가 첫 출시 범위에 대한 후속 승인이다. **14개 구매 Offer(묶음 5개 포함) / 7개 해석 구성 / 6명 동시 채팅 및 공식 Reader / 500명 품질 개선 / 웹 일괄 공개**가 현재 목표다. 기존 1/11/12상품 관련 결정 기록은 당시 상태로 보존하고, 실결제·운영 DB·법적 고지 등 필수 조건은 완료로 승격하지 않는다.

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.11**  
> Date: **2026-09-19**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`, `docs/architecture/COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md`, `docs/COMMERCE_GUEST_PURCHASE_OWNERSHIP_DECISION_V1.md`, `docs/COMMERCE_WEB_PSP_DECISION_V1.md`  
> Rule: 본 문서는 위 source authority를 구현 수준으로 구체화한다. source가 결정하지 않은 사항은 임의 확정하지 않고 `OPEN-P0` 또는 `CANDIDATE`로 표시한다. Production 운영을 열기 위해 별도 security/operations decision을 확정할 경우 source requirement를 좁혀야 하며, 상위 미결정 retention/legal policy를 대신 결정한 것으로 간주하지 않는다.

---

## 1. 목적

미결정 production P0를 여러 문서에 중복 작성하지 않고 이 문서에서 단일 관리한다.

## 2. Decision Register

| ID | Decision | Status | Current Options / Required Resolution |
|---|---|---|---|
| `P0-SA-01` | Saju transport | **DECIDED** | authenticated internal HTTP service; calculation-only V1; no `/api/readings` activation |
| `P0-CM-01` | Commerce launch rail | **DECIDED** | Web + one-off PortOne V2 payments; 2026-11-14 approved bundles are one-off package Offers (5), not recurring bundle billing; no subscription/native-store billing |
| `P0-CM-02` | Web payment provider / PSP | **DECIDED** | PortOne V2; canonical provider key `portone_v2`; server lookup authority at `api.portone.io`; live merchant/credential/Production activation remains separately gated |
| `P0-CM-03` | Saju-page-wide launch scope / paid Product & Capability catalog | **OPEN-P0 (activation)** | 2026-11-06 approved 14 Offer IDs/prices and 7 shared components supersede the historical single `standard.love_relationship` candidate for launch scope; P0-CM-03 remains OPEN-P0 only for actual sale/Charge Terms/fulfillment/Production activation. The 5 package Offers are included; Reader eligibility remains separately gated. Historical `standard.love_relationship` KRW 8,900 and retired deep candidate remain historical, not the 14-Offer pricing baseline |
| `P0-CM-04` | Guest purchase ownership / continuity | **DECIDED** | active Guest 구매 허용; canonical `subjects.id` 소유; 새 Member promotion은 same-subject; 기존 Member merge 후 direct merged-Guest lineage로 권리 조합; historical Commerce owner rewrite 금지 |
| `P0-AI-01` | AI provider/model/fallback | **DECIDED (selection policy); implementation/model pin HOLD** | Preserve existing DeepSeek-based GEPA track; compare actual implemented candidates on quality, latency and cost before selecting production provider/model. Only a verified same-provider standby model may be retried; if unavailable or validation fails, fail closed. No unapproved cross-provider fallback or external paid GEPA calls. |
| `P0-AGE-01` | Minimum age / character content policy | **DECIDED (product policy); enforcement HOLD** | 만 19세 이상 성인 전용. 성인 대상 몰입형 로맨스·플러팅 허용, 노골적인 성적 묘사는 제외. 연령 확인·콘텐츠 분류·캐릭터별 실제 적용/검증 전 공개 금지. |
| `P0-PR-01` | Retention / backup / legal retention | **DECIDED** | service/personalization DELETE; 4 structural tombstones ANONYMIZE; 9 Commerce evidence/history tables RETAIN `P5Y`; existing encrypted backup lifecycle `P30D` + restore reconciliation before serviceability |
| `P0-PR-02` | Official Reader paid interpretation privacy | **DECIDED — PRODUCT POLICY ONLY** | [기본 브랜치 제품 개인정보 정책 정본](OFFICIAL_READER_S4_PRIVACY_POLICY_DECISION_V1.md); 24h 본 DB 삭제 목표/90d 일반 로그 상한, 정확한 유료 권한, 원문 격리. 법무·기술·저장·운영 승인은 별도 HOLD |
| `P0-PR-01A` | Guest bearer/session authentication TTL | **DECIDED** | 7 days / 604800 seconds for newly issued Guest credentials; does not decide expired-Guest data deletion or parent retention policy |
| `P0-PR-01B` | Commerce provider-evidence data minimization | **DECIDED** | no raw secret/bearer/receipt/PCI storage; versioned keyed fingerprints + allowlisted bounded verified payload; parent `P0-PR-01` now supplies the separate `P5Y` retention baseline |
| `P0-AUTH-01` | API→PostgreSQL execution identity / RLS enforcement model | **DECIDED** | non-BYPASSRLS API execution role + transaction-scoped trusted canonical `subject_id` context |


> **2026-11-14 후속 제품 소유자 결정 적용 (현행 범위, 역사 보존):** 2026-09-05 P0-CM-01의 웹·1회성 결제 및 구독·네이티브 스토어 결제 제외는 유지한다. 당시 *bundle billing 제외*는 현재 승인된 **1회성 묶음 Offer 5개**를 제외하는 정책으로 더 이상 적용하지 않는다. 묶음은 구독·정기결제가 아닌 단일 구매이고 구성요소별 발급/권한·환불 검증이 필수다. P0-CM-03의 예전 8,900원 연애 상품과 미정 가격 문구는 당시 후보 기록이며 현행 14개 상품 가격의 근거가 아니다. **상품 구성·정가 승인과 실제 Offer/Charge Terms 발행·실판매 허가는 별개**이므로 P0-CM-03의 운영 활성화는 OPEN-P0/HOLD를 유지한다. [최신 범위 결정](LAUNCH_SCOPE_OWNER_DECISION_AND_TRACK_CLASSIFICATION_20261113.md) · [승인 카탈로그 코드(PR #3174)](https://github.com/gycha0109-beep/MyeongHa/blob/feat/saju-approved-checkout-admission-20261109/packages/contracts/src/approved-saju-catalog.ts).

### 2026-11-14 제품 소유자 AI·연령·Reader 범위 추가 결정

- **AI 공급자/모델:** 현재 **DeepSeek 기반 GEPA 연구**를 진행 중인 기존 구현을 출발점으로 유지한다. OpenAI/Gemini/Claude 등 다른 공급자를 임의로 기본값으로 지정하거나 기존 GEPA를 대체하지 않는다. 운영 공급자·정확한 모델 ID는 **기존 구현의 실제 품질·응답 속도·비용 비교 후 선정**하며, 아직 선정/승인/운영 배포되었다고 기록하지 않는다. 장애 시에는 사전 검증된 **동일 공급자의 예비 모델만** 재시도하고, 없거나 검증 실패 시 중단한다. Saju 원본·권한·근거/출력 Guard는 우회하지 않는다. 기존 GEPA 연구의 별도 500원 상한·유료 송신 HOLD는 유지한다.
- **연령/콘텐츠:** **만 19세 이상** 성인 전용. 성인 몰입형 로맨스와 플러팅을 허용하되 **노골적인 성적 묘사는 제외**한다. 연령 확인 방식, 캐릭터별 정책 태그, 실제 필터·검증은 구현/출시 게이트이며 결정만으로 기능을 공개하지 않는다.
- **Reader 범위:** 최초 공개 여섯 명(세연·라현·백헌·여울·윤호·태겸) **전원이 7개 해석 구성요소 모두 지원**하도록 제품 범위를 승인한다(6×7=42 조합). 구매 Offer 14개와 묶음상품은 이 7개 구성요소의 권한 있는 조합으로 처리한다. 42개 지원은 **목표**이지 현재 구현·콘텐츠·모델·Grant·T9/T10/발급·환불 검증 통과를 의미하지 않는다. 각 조합이 실제로 안전하게 구현·검증되기 전에는 차단하고, 임의의 다른 Reader/모델로 대체하지 않는다.
- **남은 승인/증거:** 운영 모델의 정확한 선택 및 가격·품질 증거, 동일 공급자 예비 모델의 실증, 연령·표현 정책 적용, 42조합과 14개 Offer의 실제 종단 검증. 새 공급자·모델을 사용한다는 결정은 아직 없음.

### 현재 승인된 14개 Offer 및 정가 (판매 비활성)

| Offer ID | 상품 | 정가 | 구분 |
| --- | --- | ---: | --- |
| `career` | 직업·커리어운 | KRW 9,900 | 단일 |
| `business` | 사업운 | KRW 9,900 | 단일 |
| `wealth` | 재물운 | KRW 9,900 | 단일 |
| `relationship` | 나의 인연·관계운 | KRW 9,900 | 단일 |
| `year` | 올해의 사주 | KRW 7,900 | 단일 |
| `month` | 이번 달의 사주 | KRW 4,900 | 단일 |
| `first-counterpart` | 첫 번째 상대방과 관계 비교 | KRW 12,900 | 관계 비교/결합 |
| `additional-counterpart` | 두 번째 이후 상대방 1명당 | KRW 9,900 | 관계 비교/결합 |
| `relationship-plus-first` | 나의 인연·관계운 + 첫 관계 비교 | KRW 19,900 | 관계 비교/결합 |
| `career-economy` | 커리어·경제 패키지 | KRW 24,900 | 1회성 묶음 |
| `basic` | 전체 사주 기본 | KRW 29,900 | 1회성 묶음 |
| `basic-year` | 전체 사주 + 올해 | KRW 35,800 | 1회성 묶음 |
| `basic-month` | 전체 사주 + 이번 달 | KRW 33,800 | 1회성 묶음 |
| `basic-year-month` | 전체 사주 + 올해 + 이번 달 | KRW 39,700 | 1회성 묶음 |

> 이 가격표는 초안 PR #3174의 승인 카탈로그 코드에 있는 가격을 반영한 **제품 결정 기록**이다. 운영 Charge Terms, PG 계약, 과금·환불 실증, Official 서명 발급, 6명 Reader 지원 행렬을 완료했다고 뜻하지 않는다.

## 3. 상태 규칙

```text
OPEN-P0
→ 설계는 adapter/interface/policy slot만 만든다.

DECIDED
→ 결정 근거, 결정일, 선택안, migration impact 기록.

SUPERSEDED
→ 새 decision ID를 가리킨다.
```

## 4. Decision Records

### P0-PR-02

```yaml
id: P0-PR-02
status: DECIDED
approval_scope: PRODUCT_POLICY_ONLY
decided_at: 2026-10-19
owner: PRODUCT_OWNER
record: docs/OFFICIAL_READER_S4_PRIVACY_POLICY_DECISION_V1.md
scope:
  - protected paid content separate from ordinary Chat/Memory/Outbox
  - current exact Grant checked on each server read; revoke/refund/expiry immediately blocks further access and model reinjection when no valid right remains
  - primary database paid body removal within 24 hours after a valid deletion trigger (internal target, not legal deadline)
  - non-content ordinary operations logs maximum 90 days (internal policy ceiling)
  - existing Commerce P5Y and encrypted backup P30D unchanged
  - no additional external processors or paid-body external transfers authorized
does_not_approve:
  - production database migration, protected content storage, public paid response or checkout
  - LEGAL-002 or actual third-party data-flow/international-transfer review
  - protected-table FK/deletion graph, RLS and restored-state privacy acceptance
  - Saju Production source attestation or S5 final commit
```

### P0-SA-01

```yaml
id: P0-SA-01
status: DECIDED
decided_at: 2026-09-03
choice: authenticated internal HTTP service for governed production calculation-only V1
consumer: MyeongHa server runtime
producer: gycha0109-beep/Saju calculation-only production host
network_contract:
  health: GET /healthz
  calculation: POST /api/calculations
  readings: NOT AUTHORIZED by this decision
authentication:
  transport: HTTPS
  scheme: opaque high-entropy service Bearer credential
  consumer_bindings:
    - MYEONGHA_SAJU_SERVICE_ORIGIN
    - MYEONGHA_SAJU_SERVICE_BEARER
  producer_requirement: active credential plus bounded previous credential during rotation
scope:
  decides:
    - MyeongHa-to-Saju calculation transport topology
    - mandatory server-to-server authentication
    - independent producer deployment and exact deploy-SHA evidence
    - fail-closed calculation transport behavior
  does_not_decide:
    - ProductReadingResponse positive validation
    - /api/readings activation
    - Reading persistence/finalization
    - Character Saju grounding
    - compatibility / second-Birth transport
    - interpretation/narrative production authority
rationale:
  - Saju already exposes a calculation-only HTTP host and MyeongHa already implements the matching HTTP consumer adapter.
  - MyeongHa already owns a strict calculation ingress that preserves calculation-only authority and rejects interpretation promotion.
  - The Saju repository currently has no GitHub Release/package-publish pipeline and its package remains private/version 0.0.0, so the package option would require a new reproducible distribution authority before consumption.
  - Independent deployment preserves the Saju repository as producer authority while avoiding vendoring/copying engine internals into MyeongHa.
security_invariants:
  - internal service credential never reaches browser/mobile clients
  - raw service credential is not persisted or logged
  - invalid/missing credentials fail before calculation execution
  - producer credential verification is timing-safe for equal-length decoded material
  - redirects are not followed by the MyeongHa consumer
  - upstream error bodies/secrets are not passed through to Product clients
  - service outage never falls back to LLM/generic Saju generation
version_invariants:
  - producer deployment records an exact Saju Git SHA and successful producer CI
  - MyeongHa still validates producer HTTP schema/runtime/policy through the governed calculation ingress
  - endpoint reachability or a newer producer deployment does not imply semantic compatibility
independent_gates_preserved:
  - SRC-08
  - SRC-09
  - SRC-33
migration_impact:
  - no PostgreSQL migration required
  - add producer service-auth/correlation enforcement
  - add MyeongHa service-bearer/correlation transport support
  - provision and verify an independent Saju calculation-only deployment
  - bind MyeongHa production service origin/credential before thin route activation
rollback_or_change_policy: operational rollback may target the last verified compatible authenticated calculation-service deployment; changing to in-process package, enabling /api/readings, weakening service authentication, or bypassing governed ingress requires a new explicit decision/review
record: docs/SAJU_TRANSPORT_DECISION_V1.md
```

### P0-CM-01

```yaml
id: P0-CM-01
status: DECIDED
decided_at: 2026-09-05
choice: Web + one-off purchase only for launch MVP
scope:
  decides:
    - launch payment surface is Web
    - launch billing shape is one-off purchase
    - subscription billing is not launch MVP
    - recurring bundle billing is not launch MVP; 2026-11-14 approved one-off package Offers are in launch scope
    - Apple IAP and Google Play Billing are deferred until a real native paid surface exists and current store policy is revalidated
  does_not_decide:
    - exact Web PSP/vendor
    - merchant legal entity or launch sales geography
    - exact price/currency/tax/settlement policy
    - concrete launch Product or Capability key/scope/validity
    - paid Reading artifact ownership semantics
    - commerce/legal/accounting evidence retention duration
    - future native-store purchase/restore/refund lifecycle
rationale:
  - primary product/use-case authority assigns long detailed Saju reports and payment to Web while Mobile centers on Character Hall/chat/relationship/push flows.
  - current apps/mobile is only a placeholder and explicitly defers Expo/React Native bootstrap.
  - historical 2026-09-05 rationale: no bundle catalog had then been approved; 2026-11-14 approved one-off package Offers supersede this historical limitation.
  - selecting a native store rail before a real native paid product surface would introduce provider-specific lifecycle complexity without satisfying a current launch requirement.
  - provider-neutral Commerce Architecture v1 already preserves Web/iOS/Android future compatibility without requiring an Apple/Google adapter now.
implementation_gates_preserved:
  - P0-CM-02 exact Web PSP must close before provider SDK/webhook/credential implementation.
  - P0-CM-03 concrete launch paid Product/Capability must close before enabled paid catalog rows or purchase fulfillment implementation.
  - P0-PR-01B Commerce evidence data-minimization boundary is DECIDED; selected provider must fit it or receive a new explicit provider-specific security decision.
  - parent P0-PR-01 legal/accounting/backup retention was OPEN at this decision time; it is now DECIDED by the 2026-09-19 account-deletion/retention policy.
  - selected-provider ordering/reconciliation semantics must be proven before provider lifecycle activation.
upstream_saju_gate:
  status: BLOCKED
  evidence: gycha0109-beep/Saju docs/product/22-production-interpretation-authority-audit.md on current main still states PRODUCTION INTERPRETATION AUTHORITY and PUBLIC PRODUCTION READING RUNTIME are BLOCKED.
  consequence: Paid Deep/Detailed Reading remains a UX/product candidate and MUST NOT be promoted to an enabled production SKU merely to unblock Commerce.
migration_impact:
  - no PostgreSQL migration required for this decision itself
  - no provider dependency or production secret authorized
  - provider-neutral additive Commerce schema remains governed by COMMERCE_ENTITLEMENT_ARCHITECTURE_V1
reopen_triggers:
  - native iOS/Android paid digital surface becomes MVP scope
  - subscription or recurring bundle billing with distinct lifecycle semantics becomes MVP scope
  - approved launch distribution plan is incompatible with Web-first payment
  - material current store/provider policy requires a different compliant launch rail
record: docs/COMMERCE_LAUNCH_RAIL_DECISION_V1.md
```

### P0-CM-02

```yaml
id: P0-CM-02
status: DECIDED
decided_at: 2026-09-14
choice: PortOne V2 as the launch Web one-off payment orchestration/provider boundary
canonical_provider_key: portone_v2
server_api_authority: https://api.portone.io
completion_authority: server-side PortOne V2 payment lookup by merchant-generated paymentId
authentication:
  api: V2 API Secret in server-only Authorization header
  webhook: PortOne V2 webhook secret verification
scope:
  decides:
    - launch Web PSP/orchestration vendor is PortOne V2
    - canonical provider key is portone_v2
    - browser redirect/callback is transport hint only
    - server payment lookup is canonical completion verification path
    - provider status, amount, currency, identity, and environment must be verified before downstream evidence promotion
    - concrete PortOne adapter implementation may proceed only through existing provider-neutral Commerce authority boundaries
  does_not_decide:
    - merchant/legal entity eligibility
    - exact downstream PG/channel contract
    - settlement account or launch currency
    - live API/webhook credential provisioning
    - Production endpoint activation
    - launch paid Product/Capability catalog
    - legal/accounting/backup retention duration
    - refund/reversal execution or reconciliation worker implementation
provider_mapping_gates:
  - exact PortOne status to VerifiedCommerceEvidenceV2 state mapping must be explicit and fail-closed
  - paymentId to provider_request_id mapping must be proven
  - provider transactionId to provider_transaction_id mapping must be proven when authoritative/present
  - sandbox/production must come from provider-owned configuration/data, not request origin or caller input
  - externalProductId must be an authoritative round-trip identity; never fabricate it from caller input
  - amount/currency must exactly match immutable Purchase Intent v2 authority
  - raw provider payloads/secrets must be minimized/redacted before persistence or logging
  - HTTP deadline, redirect policy, body bounds, schema validation, error redaction, retry and idempotency behavior must be defined
  - no provider network await may occur inside an open internal Commerce PostgreSQL transaction
historical_identifier_collision:
  issue_610: historically used textual P0-CM-02 for immutable Product Capability Set authority foundation
  rule: preserve #610 as historical provenance; canonical Decision Register P0-CM-02 is the Web PSP decision and is now PortOne V2
independent_gates_preserved:
  - P0-CM-03 launch paid Product/Capability remains OPEN-P0 and upstream-blocked
  - P0-PR-01 was still OPEN at this decision time; it is now DECIDED by the 2026-09-19 account-deletion/retention policy
  - Issue #680 Production Supabase deployment authorization remains independently blocking Production migration/application
  - live merchant/PG/channel/credential readiness requires separate operational proof
migration_impact:
  - no PostgreSQL migration required
  - current provider columns remain provider-neutral text with independent sandbox/production environment authority
  - no Production mutation is authorized by this decision
rollback_or_change_policy: replacing PortOne V2, adding an equal launch provider, weakening server lookup into browser success authority, collapsing sandbox/production, or treating provider selection as live merchant/Production approval requires a new explicit decision/review
record: docs/COMMERCE_WEB_PSP_DECISION_V1.md
```

### P0-CM-03 — Saju page full-scope launch direction / individual Product activation HOLD

```yaml
id: P0-CM-03
status: OPEN-P0
candidate_updated_at: 2026-09-19
scope_direction_approved_at: 2026-10-16
scope_direction: approved_14_offers_full_web_launch_including_5_one_off_packages
scope_boundary: all_saju_page_sections_in_launch_plan_not_automatic_sale_activation
pricing_boundary: approved_14_offer_prices_20261106_supersede_historical_8900_candidate
current_candidate:
  product_key: standard.love_relationship
  consumer_name: 연애·관계
  product_type: reading
  enabled: false
  reading_intent:
    domain: relationship
    period: natal
    variant: general
  reader_selection:
    mode: required
    product_reader_separation: true
    purchase_unit: topic_reader_reading
    persistence: purchase_intent_reader_selections
  capability:
    capability_set_version: v1
    entitlement_key: reading.standard.love_relationship.unit.v1
    meaning: one purchased Reader-bound Standard Reading unit
  price_authority:
    status: decided_product_owner
    decided_at: 2026-09-19
    currency: KRW
    list_price_minor: 8900
    offer_created: false
    charge_terms_created: false
    executable_charge_authority: false
stale_candidate:
  product_key: saju.general_natal.deep.v1
  historical_price: KRW_9900
  disposition: forward_retired
  historical_migration_rewritten: false
approved_launch_catalog:
  source: packages/contracts/src/approved-saju-catalog.ts
  source_pr: 3174
  offer_count: 14
  shared_saju_component_count: 7
  one_off_package_offer_count: 5
  prices: approved_product_owner_not_executable_charge_terms
catalog_activation:
  product_enabled: false
  saleable_offer_exists: false
  checkout_activation: forbidden
upstream_gate:
  repository: gycha0109-beep/Saju
  evidence: docs/product/22-production-interpretation-authority-audit.md
  fresh_state: PRODUCTION_INTERPRETATION_AUTHORITY_BLOCKED
  public_reading_runtime: BLOCKED
activation_requires:
  - production-authorized relationship + natal/general interpretation authority
  - public Product Reading transport/finalization/grounding admission
  - atomic Purchase Intent + Reader selection command/runtime
  - verified payment -> purchase-backed grant -> Reader-bound Reading unit fulfillment
  - entitlement-gated Reading creation and immutable artifact binding
  - reread/reference authorization for owned Reading artifacts
  - Offer/charge-terms materialization for the decided KRW 8,900 Product price
  - PortOne sandbox E2E for the exact enabled Offer
invariants:
  - Product is the Topic; Reader is not encoded into Product/Offer SKU identity
  - all normal eligible Characters may use the same Standard Topic contract
  - Reader lens must not change Saju source truth
  - unpaid or PLUS-only access cannot create this paid Reading
  - existing Reading reference does not authorize another Reader to regenerate it
  - Commerce must not invent missing Saju claims
  - historical migrations are never rewritten to erase stale candidates
record: docs/STANDARD_LOVE_RELATIONSHIP_PRODUCT_V1.md
tracking: issue #1068
```

**2026-11-14 CURRENT SCOPE:** The Product Owner has approved all 14 catalog Offers, including five one-off package Offers and their listed prices, for the first simultaneous Web launch. The previously described single-product approach is historical. The existing `standard.love_relationship` record remains the currently specified inactive Commerce Product, with its KRW 8,900 list price decided; the current 14-Offer price list above supersedes that historical pricing gap. This record still deliberately leaves **sale activation, executable Charge Terms, Offer creation, and Product Reading runtime blocked**. Migration `1120_paid_general_natal_product_candidate.sql` remains immutable history; the supersession is forward-only in migration `1130_standard_love_relationship_reader_authority.sql`.

### P0-CM-04

```yaml
id: P0-CM-04
status: DECIDED
decided_at: 2026-09-05
choice: active Guest purchase is allowed and Commerce ownership remains anchored to the server-resolved canonical subjects.id
scope:
  decides:
    - active Guest and active Member are eligible Web one-off purchase owners
    - Guest purchase evidence/grants may be owned by the exact Guest subject
    - Guest may consume a server-verified paid capability before registration
    - Guest to new-Member promotion preserves the exact subject_id and requires no Commerce owner rewrite
    - after a verified existing-Member merge, current access may compose rights from the canonical Member plus direct merged-Guest lineage
    - historical Receipt/Event/Grant owner subject_id is never rewritten merely because of promotion/merge
    - Guest session expiry alone does not revoke a verified paid right
  does_not_decide:
    - exact Web PSP
    - concrete paid SKU/capability
    - generic cross-domain Guest to existing-Member merge algorithm
    - provider-specific transaction recovery identifier/canonicalization
    - legal/accounting retention duration
rationale:
  - MyeongHa already uses subjects.id as the canonical owner for Guest and Member resources.
  - production Guest to new-Member promotion preserves the exact subject row, so Guest purchases naturally remain attached to the same owner after registration.
  - historical immutable Guest lineage is already preserved for merged-Guest reads; Commerce should compose rights from verified lineage rather than reparent provenance.
  - allowing Guest purchase removes an unnecessary conversion barrier and no longer forces the product to keep a Member-only purchase rule solely for MVP simplification.
security_invariants:
  - client cannot choose or override Commerce subject owner
  - Guest purchase requires currently verified Guest authentication at Purchase Intent creation
  - payment/entitlement authority still begins only from server-verified provider evidence
  - unrelated subjects/accounts cannot claim Guest commerce evidence or rights
  - direct merged-Guest lineage must be server-authoritative; email/phone/client lineage hints are insufficient
  - one source grant revoke/refund never removes another independent active grant
  - Guest bearer expiration is authentication expiry, not payment-right expiry
implementation_impact:
  - keep historical cmd_create_purchase_intent_v1 Member-only and add a new command/version for Guest-or-Member ownership
  - add Guest-aware current entitlement access composition without rewriting historical Commerce rows
  - add negative/replay/concurrency/refund tests for Guest purchase and promotion/merge continuity
  - selected PSP must support server-side transaction recovery/correlation that does not rely on client redirect success
independent_gates_preserved:
  - P0-CM-02 exact Web PSP
  - P0-CM-03 concrete launch paid Product/Capability
  - P0-PR-01 parent legal/accounting/backup retention (now supplied by the 2026-09-19 DECIDED parent policy)
  - SRC-24 generic existing-Member Guest merge executor authority
production_gate:
  - Guest purchase runtime is not activated until Guest purchase intent, verified apply, and paid-right continuity paths are implemented and tested.
  - existing-Member paid-right continuity must be verified before Production Guest purchase activation; this decision does not pretend the generic merge executor already exists.
migration_impact:
  - no PostgreSQL migration is authorized by this decision record itself
  - implementation must be additive/versioned; do not rewrite historical migration 0660
rollback_or_change_policy: removing Guest purchase, allowing client-selected ownership, reparenting historical Commerce provenance, or changing inherited-lineage rules requires a new explicit Commerce decision
record: docs/COMMERCE_GUEST_PURCHASE_OWNERSHIP_DECISION_V1.md
```

### P0-AUTH-01

```yaml
id: P0-AUTH-01
status: DECIDED
decided_at: 2026-09-02
choice: non-BYPASSRLS API execution role + transaction-scoped trusted canonical subject context
canonical_owner: subjects.id
member_resolution:
  evidence: verified Supabase authentication identity
  mapping: auth.users.id -> subjects.auth_user_id -> canonical subjects.id
  eligible_subject: member with status active or deletion_pending
guest_resolution:
  evidence: API-verified guest credential
  mapping: guest verifier fingerprint -> guest_sessions -> canonical subjects.id
  eligible_subject: active guest with active unconsumed session
ordinary_user_execution:
  role: dedicated NOBYPASSRLS API execution role
  context: canonical subject_id scoped to the current PostgreSQL transaction
authorization:
  - RLS/default-deny on activated user-owned tables
  - existing qry_*/cmd_* object-level authorization
  - explicit subject-parameter/context parity checks on activated boundaries
system_execution:
  model: separate explicitly privileged execution identity for workers/admin/lifecycle operations
forbidden:
  - auth.uid() == subject_id assumption
  - client-supplied subject_id or userId as owner authority
  - service-role/BYPASSRLS-only ordinary user CRUD baseline
  - request subject context surviving the transaction or leaking through a pooled connection
rationale:
  - subjects.id is the canonical owner for both Guest and Member resources.
  - Guest identity has no auth.users identity and is already API-verified before canonical subject resolution.
  - A single server-trusted subject execution model keeps Member and Guest authorization on the same owner axis without making auth.uid() the product owner key.
  - Existing qry_*/cmd_* contracts already accept canonical subject_id and are compatible with an API-resolved execution context.
affected_specs:
  - docs/AUTH_RLS_PRIVACY_SPEC.md
  - docs/RUNTIME_STATUS.md
  - supabase/migrations/0010_auth_owner.sql
  - supabase/migrations/0510_subject_profile_current_query.sql
migration_impact:
  - introduce a dedicated non-login NOBYPASSRLS API execution role contract
  - introduce transaction-scoped canonical subject context and narrow Member/Guest resolver functions
  - activate RLS incrementally per user-owned vertical slice rather than enabling unverified broad access in one migration
  - grant only the table columns/functions required by each activated slice
rollback_or_change_policy: execution-model changes require a new explicit decision record and migration; never silently fall back to user-JWT delegation or privileged ordinary CRUD
```

### P0-PR-01

```yaml
id: P0-PR-01
status: DECIDED
decided_at: 2026-09-19
choice:
  service_personalization: DELETE
  structural_tombstones:
    disposition: ANONYMIZE
    tables:
      - subjects
      - data_deletion_jobs
      - subject_merge_jobs
      - subject_merge_actions
  commerce_evidence_history:
    disposition: RETAIN
    period: P5Y
    tables:
      - commerce_account_links
      - purchase_intents
      - purchase_intent_reader_selections
      - commerce_payment_attempts
      - commerce_receipts
      - commerce_provider_events
      - entitlement_grants
      - entitlement_events
      - entitlements
  auth_mapping: DELETE
  hosted_auth_user: DELETE
  backup:
    existing_encrypted_lifecycle: P30D
    per_account_historical_blob_rewrite: false
    restored_environment_serviceability: privacy deletion replay/reconciliation required first
  recovery_privacy_source:
    source: encrypted_off_primary_db_privacy_recovery_ledger
    authority_class: AUTHORITATIVE_CAPTURED_WINDOW_V1
    coverage: backup_completed_at < event <= captured_at
    serviceability_guard: incident_reference_utc <= authoritative_coverage_through
    snapshot_cadence_is_rpo: false
    record: docs/operations/POSTGRES_PRIVACY_RECOVERY_LEDGER_AUTHORITY_V1.md
authority:
  type: PRODUCT_OWNER_APPROVED
  record: https://github.com/gycha0109-beep/MyeongHa/issues/964#issuecomment-5737913582
scope:
  decides:
    - account-finalization disposition baseline for all 52 currently reachable Subject tables
    - calendar five-year retention for the nine approved Commerce evidence/history tables
    - Auth mapping/provider-user deletion
    - existing 30-day encrypted backup lifecycle handling
    - bounded captured-window post-backup privacy source authority
  does_not_decide:
    - incident coverage beyond the latest authoritative ledger captured_at
    - authoritative non-zero recovered-state finalization proof
    - numeric RPO or RTO
    - DR Ready
implementation_state:
  structured_disposition_plan: AUTHORIZED
  destructive_runtime_finalizer: IMPLEMENTED_AND_PROVIDER_PROVEN
  destructive_sql_generation: INTERNAL_GOVERNED_FINALIZER_ONLY
  authoritative_post_backup_source: BOUNDED_CAPTURED_WINDOW_AUTHORITY
  authoritative_privacy_reconciliation: PROVEN_BOUNDED_CAPTURED_WINDOW_RUN_35659483080
  future_safe_privacy_reconciliation: false
  provider_managed_full_restore_equivalence: NOT_PROVEN
  dr_ready: false
record: docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_V1.md
machine_policy: docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_V1.json
machine_dispositions: docs/operations/ACCOUNT_DELETION_DISPOSITION_POLICY_V1.json
```

### P0-PR-01A

```yaml
id: P0-PR-01A
parent: P0-PR-01
status: DECIDED
decided_at: 2026-09-03
choice: Guest bearer/session authentication TTL = 7 days = 604800 seconds
production_binding: MYEONGHA_GUEST_SESSION_TTL_SECONDS=604800
scope:
  decides:
    - authentication lifetime for newly issued unconsumed Guest bearer credentials
  does_not_decide:
    - expired Guest subject/product-data deletion timing
    - backup retention
    - AI trace retention
    - commerce/legal/accounting retention
    - anonymization/destructive cleanup cadence
rationale:
  - primary source requires a finite Guest Session TTL and forbids indefinite Guest retention but does not define the period.
  - seven days supports short-term D1/D7 continuation without carrying a browser/mobile bearer through a D30-style long-retention window.
  - a finite seven-day bearer lifetime limits credential exposure while preserving a practical no-login resume window.
  - authentication expiry remains separable from the parent product/privacy/legal retention policy; that parent was later DECIDED on 2026-09-19.
security_invariants:
  - server owns issued_at/expires_at and clients cannot request or extend TTL
  - raw Guest bearer is never stored in PostgreSQL
  - guest_sessions stores only the versioned keyed fingerprint
  - expired, consumed, or claimed sessions cannot authenticate
activation:
  - bind exactly 604800 through the dedicated production Guest TTL workflow
  - expose Guest bootstrap network route only after binding evidence
  - verify issuance -> Guest /api/me own-subject success
  - preserve parent P0-PR-01 as an independent decision; it was OPEN at this decision time and is now DECIDED as of 2026-09-19
change_policy: changing Guest authentication TTL requires a new explicit decision record; environment changes must not silently lengthen it
record: docs/GUEST_SESSION_SECURITY_TTL_DECISION_V1.md
```

### P0-PR-01B

```yaml
id: P0-PR-01B
parent: P0-PR-01
status: DECIDED
decided_at: 2026-09-05
choice: provider-neutral Commerce evidence data minimization baseline
scope:
  decides:
    - raw provider API secrets, Authorization/bearer credentials, raw receipt/purchase tokens, and raw PCI-sensitive payment material are never persisted/emitted by the ordinary Commerce path
    - opaque equality/dedupe evidence uses versioned keyed HMAC fingerprints when raw value is not required for provider lookup
    - verified_payload_jsonb is a positive-allowlist, bounded, schema-versioned normalized payload and never a raw provider response archive
    - provider transaction/event/product references may be stored first-class only when non-secret and required for idempotency/reconciliation/audit
    - raw provider account identity is fingerprinted rather than stored as ordinary Commerce account authority
    - provider requiring durable raw bearer-like receipt/token storage needs an explicit provider-specific security/retention decision before P0-CM-02 can close
  does_not_decide:
    - legal/accounting Commerce evidence retention duration (not decided by P0-PR-01B; later supplied by parent P0-PR-01 as P5Y)
    - backup retention duration (not decided by P0-PR-01B; later supplied by parent P0-PR-01 as existing P30D lifecycle)
    - account deletion commerce tombstone/pseudonymization/destructive schedule (not decided by P0-PR-01B; later supplied by parent P0-PR-01)
    - merchant tax/accounting record requirements
    - exact provider-specific canonical evidence bytes
fingerprint_binding:
  algorithm: HMAC-SHA-256
  stored_format: hmac-sha256:k1:<64 lowercase hex>
  secret_env: MYEONGHA_COMMERCE_EVIDENCE_HMAC_K1_SECRET
  minimum_secret: 32 UTF-8 bytes
  domains:
    - myeongha.commerce.receipt-evidence.v1
    - myeongha.commerce.provider-event-payload.v1
    - myeongha.commerce.provider-account.v1
rationale:
  - Commerce Architecture already requires minimized verified evidence, fingerprint/reference preference, and no raw PCI/credential persistence.
  - AUTH_RLS_PRIVACY_SPEC already forbids raw receipt/provider-account identifiers in ordinary logs and separates legal Commerce retention from product personalization deletion.
  - current schema has first-class transaction/event lineage plus fingerprint columns, so raw SDK object archival is unnecessary for rights correctness.
  - a positive allowlist prevents provider SDK/schema drift from silently widening stored personal/payment data.
implementation_effect:
  - provider-neutral fingerprint/serializer validators and leakage-negative tests may be implemented after this decision
  - no provider SDK, production credential, webhook, paid catalog, or production evidence persistence is authorized by this decision alone
  - parent P0-PR-01 remains independent of this minimization decision; it is now DECIDED as of 2026-09-19
record: docs/COMMERCE_EVIDENCE_DATA_MINIMIZATION_DECISION_V1.md
```

### P0-OPS-02

```yaml
id: P0-OPS-02
status: DECIDED
decided_at: 2026-09-21
choice:
  rpo: PT24H
  rto: PT6H
authority:
  type: PRODUCT_OWNER_APPROVED
  record: GitHub issue #389
scope:
  decides:
    - maximum acceptable persistent-data loss window is 24 hours
    - maximum acceptable qualifying service-recovery duration is 6 hours
  does_not_decide:
    - whether isolated/synthetic diagnostics alone satisfy the objectives
    - Production non-zero authoritative privacy reconciliation
    - full hosted provider-managed Auth/Storage recovery equivalence
    - DR Ready
validation_rule:
  - compare achieved data-loss window against PT24H only from the full authoritative recovery procedure
  - compare achieved recovery duration against PT6H only from the full authoritative recovery procedure
  - daily backup cadence does not redefine RPO authority
implementation_state:
  objective_authority: APPROVED
  authoritative_privacy_reconciliation: PROVEN_BOUNDED_CAPTURED_WINDOW_RUN_35659483080
  full_authoritative_rpo_comparison: PASS_RUN_35659483080_5536S
  full_authoritative_rto_comparison: PASS_RUN_35659483080_67S
  provider_managed_full_restore_equivalence: NOT_PROVEN
  dr_ready: false
record: docs/operations/POSTGRES_DR_READINESS_STATUS_V1.md
```

### Remaining open decisions

`P0-CM-02` exact Web PSP is now **DECIDED: PortOne V2**. This closes provider selection only; live merchant/PG/channel/credential readiness and Production activation remain independent gates.

`P0-CM-03` remains explicitly open for **individual Product sale activation**. The Product Owner's launch plan covers the entire Saju page, not only a first paid Product. The historical inactive Commerce v2 Product was `standard.love_relationship`; the current launch catalog is the 14 approved Offers in PR #3174, with exact Reader rights still separately verified. The former `saju.general_natal.deep.v1` / KRW 9,900 candidate is historical and forward-retired. The former **KRW 8,900** list price refers only to the historical inactive `standard.love_relationship` Product; current first-Web-launch Offer IDs and approved list prices are the **14-item catalog** recorded in the 2026-11-14 supersession table above. Approved list prices are not executable Charge Terms or evidence of a live saleable Offer; current operational activation remains HOLD. Current Saju relationship Product Reading authority remains blocked, so Product activation must stay fail-closed.

`P0-CM-04` closes the product/ownership question of whether Guest may purchase. Its historical `does_not_decide` list records the boundary at the time that decision was made; the later `P0-CM-02` record now supplies the PSP decision without rewriting `P0-CM-04` history.

`P0-PR-01` is now **DECIDED** by product-owner approval on 2026-09-19. The current schema baseline is DELETE for service/personalization data, ANONYMIZE for four structural tombstones, RETAIN `P5Y` for nine enumerated Commerce evidence/history tables (including `purchase_intent_reader_selections` added by migration 1130), and the existing encrypted backup lifecycle `P30D` with privacy reconciliation required before a restored environment is serviceable. RPO/RTO objective authority is separately decided by `P0-OPS-02` (`PT24H` / `PT6H`). Production non-zero bounded-window reconciliation and full-procedure RPO/RTO comparisons are runtime-proven by run `35659483080`; DR Ready remains independently gated by provider-managed full-restore equivalence. `P0-PR-01B` remains the independent Commerce evidence minimization/security boundary.

Use the following template when another P0 becomes authoritative:

```yaml
id: P0-...
status: DECIDED
decided_at: YYYY-MM-DD
choice: ...
rationale: ...
affected_specs:
  - ...
migration_impact: ...
rollback_or_change_policy: ...
```

## 5. 금지

- 각 spec에서 서로 다른 임시 결론을 확정하는 것
- provider 이름을 business/domain model key로 사용하는 것
- 미결정 retention을 전제로 destructive migration을 작성하는 것
- `P0-CM-01` Web-first 결정을 exact PSP 선택이나 concrete paid SKU 승인으로 확대 해석하는 것
- `P0-CM-02` PortOne V2 결정을 live merchant/PG contract/credential/Production activation 승인으로 확대 해석하는 것
- browser redirect/callback/Payment Attempt operational state를 verified payment success authority로 사용하는 것
- current Saju production interpretation authority가 BLOCKED인 상태에서 `P0-CM-03`을 Paid Deep/Detailed Reading production SKU로 임의 승격하는 것
- `P0-CM-04` Guest purchase 허용을 unrelated subject/account의 purchase claim 허용으로 확대 해석하는 것
- Guest→Member continuity를 이유로 historical receipt/event/grant `subject_id`를 rewrite하는 것
- Guest session TTL 만료를 verified paid-right 만료/취소로 재해석하는 것
- paid one-reading ownership을 기존 `global | fixed` Capability scope에 client resource ID로 몰래 삽입하는 것
- `P0-PR-01A` Guest authentication TTL을 expired Guest data deletion/backup/legal retention 기간으로 재해석하는 것
- `P0-PR-01B`를 legal/accounting/backup retention 기간 결정으로 재해석하는 것
- `verified_payload_jsonb`에 full raw provider request/response를 우회 저장하는 것
- 별도 provider-specific security decision 없이 raw receipt/purchase/bearer token durable storage를 허용하는 것
- `P0-SA-01` transport 결정을 `/api/readings`, ProductReadingResponse validation, Character grounding, compatibility authority로 확대 해석하는 것
