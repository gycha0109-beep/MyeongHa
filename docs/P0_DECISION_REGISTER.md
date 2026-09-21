# 명하 Production P0 Decision Register — Full Audit v0.9

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
| `P0-CM-01` | Commerce launch rail | **DECIDED** | Web + one-off only for launch MVP; no subscription/bundle/native-store billing |
| `P0-CM-02` | Web payment provider / PSP | **DECIDED** | PortOne V2; canonical provider key `portone_v2`; server lookup authority at `api.portone.io`; live merchant/credential/Production activation remains separately gated |
| `P0-CM-03` | Launch paid Product / Capability catalog | **OPEN-P0** | Commerce v2 first inactive Product authority = `standard.love_relationship`; Reader is selected separately and pinned sparsely per Purchase Intent; Product Owner list price = KRW 8,900; Offer/Charge Terms and sale activation remain unresolved/disabled; stale `saju.general_natal.deep.v1` candidate is retired |
| `P0-CM-04` | Guest purchase ownership / continuity | **DECIDED** | active Guest 구매 허용; canonical `subjects.id` 소유; 새 Member promotion은 same-subject; 기존 Member merge 후 direct merged-Guest lineage로 권리 조합; historical Commerce owner rewrite 금지 |
| `P0-AI-01` | AI provider/model/fallback | **OPEN-P0** | provider, model family, fallback, grounded-response validation implementation |
| `P0-AGE-01` | Minimum age / character content policy | **OPEN-P0** | 최소 이용 연령, 미성년 허용 여부, 표현 강도/제한; content bundle policy-tag slot은 미리 두되 threshold/matrix는 미확정 |
| `P0-PR-01` | Retention / backup / legal retention | **DECIDED** | service/personalization DELETE; 4 structural tombstones ANONYMIZE; 9 Commerce evidence/history tables RETAIN `P5Y`; existing encrypted backup lifecycle `P30D` + restore reconciliation before serviceability |
| `P0-PR-01A` | Guest bearer/session authentication TTL | **DECIDED** | 7 days / 604800 seconds for newly issued Guest credentials; does not decide expired-Guest data deletion or parent retention policy |
| `P0-PR-01B` | Commerce provider-evidence data minimization | **DECIDED** | no raw secret/bearer/receipt/PCI storage; versioned keyed fingerprints + allowlisted bounded verified payload; parent `P0-PR-01` now supplies the separate `P5Y` retention baseline |
| `P0-AUTH-01` | API→PostgreSQL execution identity / RLS enforcement model | **DECIDED** | non-BYPASSRLS API execution role + transaction-scoped trusted canonical `subject_id` context |

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
    - bundle billing is not launch MVP
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
  - no current product authority authorizes subscription or bundle billing for MVP.
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
  - subscription or bundle billing becomes MVP scope
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

### P0-CM-03 — Commerce v2 first Standard Product / activation HOLD

```yaml
id: P0-CM-03
status: OPEN-P0
candidate_updated_at: 2026-09-19
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

This record supersedes the previous inactive General Natal candidate as the current Product direction. It still deliberately leaves **sale activation, exact price authority, Offer creation, and Product Reading runtime blocked**. Migration `1120_paid_general_natal_product_candidate.sql` remains immutable history; the supersession is forward-only in migration `1130_standard_love_relationship_reader_authority.sql`.

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
  authoritative_privacy_reconciliation: false
  future_safe_privacy_reconciliation: false
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

`P0-CM-03` remains explicitly open for **sale activation**. The current Commerce v2 first Product authority is `standard.love_relationship`, with Reader identity selected separately and stored as sparse Purchase Intent provenance. The former `saju.general_natal.deep.v1` / KRW 9,900 candidate is historical and forward-retired. Product Owner list price is now **DECIDED: KRW 8,900**. No current saleable Offer or immutable Charge Terms exists, so the decided list price is not executable charge authority. Current Saju relationship Product Reading authority remains blocked, so Product activation must stay fail-closed.

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
