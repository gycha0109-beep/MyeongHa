# 명하 Spec Pack — Source Authority Validation Report v0.11

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.11 Source Alignment**  
> Date: **2026-08-30**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Saju Public Contract Audit Pin: `gycha0109-beep/Saju@7102dc8fe8483c0875f6a093a4fd585b0df51f8b`

---

## 1. Verdict

```text
PACK STRUCTURE                 = PASS
SOURCE-BOUND IMPLEMENTATION    = CONDITIONAL PASS
FINAL DDL / PRODUCTION         = BLOCKED BY OPEN SOURCE GAPS / P0s
```

Pack 문서가 source를 구체화할 수는 있지만 source에 없는 implementation-critical authority를 새 product rule로 만들 수 없다.

## 2. Authority Rule

```text
Saju semantics/methodology
→ Saju architecture + actual exported Product contract

Product journey / world behavior
→ Use Case

Relational persistence
→ ERD v0.6

Implementation contracts
→ Pack specs, bounded by the above source authorities
```

Source끼리 직접 충돌하거나 source가 구현 필수 authority를 제공하지 못하면 Pack이 임의 결정하지 않고 `SOURCE_AUTHORITY_GAPS.md` 또는 `docs/source-authority-gaps/`의 numbered gap 문서로 등록한다.

## 3. Current Structural Baseline

- ERD public base tables: **59**.
- DDL/catalog tests continue to assert the 59-table baseline.
- API/DB mutation surfaces remain command-oriented rather than raw CRUD wrappers.
- P0-AUTH-01 unresolved 동안 DB functions use `SECURITY INVOKER` and PUBLIC EXECUTE remains revoked for newly exposed command/query surfaces.
- Content/canon projections remain explicit bundle-pinned where source does not authorize hidden current selection.
- Existing source-safe Share public-read/revoke and Device Installation revoke boundaries remain valid even though their inverse create/register workflows are source-blocked.
- Existing `entitlements` projection/read schema remains valid as a storage/read envelope even though source does not yet define the complete event→grant→aggregate recompute algorithm.
- Existing relationship state/event schema remains valid as a current-projection/append-only-ledger envelope even though source does not yet define the executable score/stage policy evaluator.
- Existing `world_events` and `character_unlocks` schema remain valid as append-only world provenance/current unlock projection envelopes even though source does not yet define the executable Character Unlock condition/effect evaluator.
- Existing `subject_merge_jobs` / `subject_merge_actions`, merge-job current read, and direct merged guest lineage remain valid relational/read envelopes even though source does not yet define the executable conflict/resolution/domain-action merge policy.

Machine validation values recorded in older reports are historical snapshots; this report does not silently reuse stale counts as evidence for the current repository state. Current CI/action runs are the execution evidence.

## 4. Source-Alignment Corrections

### 4.1 Existing corrections retained

The Pack continues to preserve explicit blockers rather than converting ambiguity into invented behavior. Examples include:

- API/RLS database identity → `P0-AUTH-01`
- memory proposal staging/privacy → `SRC-05`
- Birth/Target deletion vs Reading provenance → `SRC-06`
- Saju target-birth adapter → `SRC-08`
- Saju grounding guard metadata → `SRC-09`
- record grant create/regrant → `SRC-10`
- Episode current progress bundle selection → `SRC-11`
- notification defaults/materialization → `SRC-12`
- notification inbox status → `SRC-13`
- conversation delete duplicate transcript authority → `SRC-14`
- subject-specific content rollout resolver → `SRC-16`
- Episode transition evaluator → `SRC-17`

### 4.2 Commerce product→grant mapping overreach removed — `SRC-18`

An earlier Pack revision introduced a `ProductFulfillmentDefinition` contract that does not exist in any of the three primary source-authority documents.

The invented layer included:

```text
ProductFulfillmentDefinition registry
fulfillmentDefinitionVersion
normalized grant definitions
GLOBAL | REQUEST_RESOURCE | FIXED scope resolver
one_off | subscription | promo_compatible grant class
required fulfillment version/hash in Purchase Intent evidence
```

Primary source instead defines:

```text
Product stable identity
Product Offer immutable provider/platform/external-product/product mapping
Purchase Intent immutable minimal mapping snapshot + digest
Receipt/provider-event provenance
Entitlement grant/event/projection structures
Entitlement transaction skeleton after a grant target is known
```

Primary source does **not** define the mapping from a purchased product to the concrete entitlement key/scope/grant semantics. This is `SRC-18`.

Current baseline:

```text
Purchase Intent minimal offer mapping snapshot = IMPLEMENTABLE
verified provider provenance persistence        = schema/provenance boundary implementable
purchased product → concrete grant target       = BLOCKED by SRC-18
provider-specific commerce rail                 = additionally OPEN-P0 P0-CM-01
```

### 4.3 Device Installation register lifecycle separated — `SRC-19`

Primary source defines the `device_installations` persistence shape, active installation/token uniqueness, encrypted token/fingerprint boundary, revoked-delivery exclusion, and the rule that an old installation/token is revoked before cross-subject account-switch attachment.

It does **not** define the production registration state machine for:

```text
same-subject retry
push-token rotation
revoked-row re-registration
installation row identity/generation lineage
same-token/different-installation handling for one subject
app_version/client_capability/last_seen refresh authority
concurrent registration identity/idempotency
```

The Use Case official API list also does not name Device Installation register/revoke routes. The Pack may retain owner-scoped revoke as a source-safe supporting command, but cannot promote a specific production `POST /api/device-installations/register` contract until `SRC-19` is resolved.

Current baseline:

```text
Device Installation schema/uniqueness = SOURCE-COMPLETE
owner-scoped standalone revoke         = SOURCE-COMPLETE supporting behavior
register/re-register/token rotation    = BLOCKED by SRC-19
```

### 4.4 Share create overreach removed — `SRC-20`

UC-16A requires a revocable public-safe snapshot pinned to an exact Reading attempt and an opaque public token. ERD v0.6 defines the durable `share_artifacts` envelope, protected token hash, snapshot/version/hash, active/revoked/expired lifecycle, and owner/Reading relationships.

However source primarily defines **negative privacy exclusions**, not the complete positive public projection. It does not define:

```text
versioned allowlisted snapshot_jsonb schema
which Reading lifecycle states are shareable
whether one Reading may intentionally have multiple active shares
create logical identity / retry behavior
raw opaque token replay/recovery after commit + response loss
create-time expiry selection/default
explicit opt-in semantics for fields hidden by default
compatibility/Target Person public representation
```

Earlier Pack text added `share create → idempotencyKey` even though Use Case §21.1's explicit idempotency-required write list does not include Share create. Removing that invented requirement does **not** make Share create non-idempotent; the create/retry model itself is unresolved and is `SRC-20`.

Current baseline:

```text
share_artifacts relational envelope         = SOURCE-COMPLETE
stored snapshot/token identity immutability = SOURCE-COMPLETE
active+unexpired public stored read          = SOURCE-COMPLETE
owner-scoped revoke                          = SOURCE-COMPLETE
POST /api/share-artifacts create workflow    = BLOCKED by SRC-20
```

### 4.5 Entitlement event-apply / aggregate recompute overreach separated — `SRC-21`

A follow-up audit found a second commerce source gap independent of `SRC-18`.

ERD v0.6 defines:

```text
entitlement_grants
- status
- valid_from / valid_until
- revision
- last_effective_at
- last_provider_ordering_key

entitlement_events
- event_type = granted | renewed | expired | revoked | restored | adjusted
- effective_at
- provider_ordering_key
- payload_jsonb

entitlements
- status
- active_grant_count
- effective_valid_until
- revision
```

It also defines the transaction skeleton:

```text
verified source
→ resolve subject + grant_key
→ lock/upsert grant
→ reject stale provider order
→ append entitlement_event
→ update grant projection
→ recompute logical entitlement from ALL valid grants
→ outbox
```

But source does **not** define the executable semantics required to implement that skeleton:

```text
event_type → exact grant status/validity transition
payload_jsonb schema per event type
provider_ordering_key comparison semantics
exact definition of a currently valid grant
future valid_from behavior
effective_valid_until aggregation across multiple finite grants
finite + unbounded grant aggregation
recompute evaluation timestamp/no-op policy
logical entitlement create/update/revision rules
outbox event contract for the recompute
```

The existing commerce negative test does not prove these semantics. It directly updates `entitlement_grants` and `entitlements` to simulate one overlapping-grant outcome, so it verifies relational representability rather than a source-authoritative recompute command.

Therefore:

```text
SRC-18 = purchased Product → entitlement/grant target mapping
SRC-21 = already-targeted event → grant transition → logical entitlement aggregation
```

One does not close the other.

Current baseline:

```text
entitlement grant/event/projection relational envelope = SOURCE-COMPLETE
verified-source relational provenance constraints       = SOURCE-COMPLETE
current stored entitlement read                         = SOURCE-COMPLETE
production event-apply/recompute mutation               = BLOCKED by SRC-21
purchase-derived event-apply additionally               = BLOCKED by SRC-18
```

The Pack must not infer `max(valid_until)`, treat NULL expiry as unbounded without source approval, ignore future `valid_from`, compare opaque provider ordering keys lexically, or invent event payload transition semantics.

### 4.6 Relationship policy/evaluator overreach removed — `SRC-22`

Primary source defines a strong Relationship **envelope**:

```text
User Character State
- closeness / trust / friction
- relationship_stage
- policy_version
- revision
- last_interaction_at

Relationship Event
- event_type / event_schema_version / event_dedupe_key
- source provenance
- delta_closeness / delta_trust / delta_friction
- policy_version
- state_revision_before / state_revision_after
- validated payload
```

It also requires:

```text
LLM/client cannot directly choose relationship scores
Relationship Engine applies events deterministically
same event/action retry must not repeatedly increase state
message spam cannot farm stage indefinitely
transition rule is versioned
historical event provenance is preserved
inactivity alone does not automatically degrade baseline relationship state
state row is locked and event + projection revision update atomically
```

However source does **not** define the executable policy content needed to calculate the projection:

```text
final normative Relationship Event allowlist
event payload schemas
score bounds
event → delta mapping
internal stage keys / thresholds / transition graph
anti-farming windows/caps/cooldowns
last_interaction_at mutation rule
active policy-version selection/migration
no-op/blocked-event ledger semantics
```

The previous Pack went beyond source by introducing a concrete `RelationshipPolicyDefinitionV1` with:

```text
policyVersion
contentHash
scoreBounds
stages[].entryConditions
events[].delta
antiFarmingRuleKey
```

That artifact is not present in the three primary source documents. The persistence mismatch is material: ERD v0.6 stores `policy_version` on relationship state/event rows but defines **no relationship-policy content-hash column and no relationship-policy artifact table**.

Therefore the Pack cannot require `policy_version + contentHash` as current durable relationship provenance without an explicit source/ERD decision.

Current baseline:

```text
relationship state/event relational envelope = SOURCE-COMPLETE
append-only + dedupe + applied-revision chain = SOURCE-COMPLETE
current relationship projection read          = SOURCE-COMPLETE
LLM/client direct score authority deny        = SOURCE-COMPLETE
atomic apply order                            = SOURCE-COMPLETE skeleton
production event→score/stage policy mutation  = BLOCKED by SRC-22
relationship anti-farming evaluator           = BLOCKED by SRC-22
```

A DB command that accepts caller-calculated `delta_*`/next stage is not a valid workaround; it would move rather than resolve the missing authority.

### 4.7 Character Unlock condition/effect overreach separated — `SRC-23`

UC-14 defines the product flow:

```text
Unlock condition satisfied
→ World Event
→ Hall silhouette state change
→ first appearance scene
→ CHARACTER_UNLOCKED event
```

The listed triggers are explicitly **examples**:

```text
specific relationship stage
first Reading in a domain
episode completion
season event
operator reveal
```

UC-24 requires character content to contain an `unlock condition`; UC-25 says an episode may contain an `unlock reward`. ERD v0.6 defines `world_events` and the current `character_unlocks` projection with same-subject causal World Event FK.

But source does **not** define the executable bridge between those concepts:

```text
positive versioned unlock condition schema/DSL
World Event registry/payload schemas used for unlock causality
condition/content bundle → target character mapping
condition composition/comparison operators
first-appearance/reward effect mapping
already-unlocked/replay/concurrency behavior
condition migration across content releases
season/operator reveal authority/scope
unlock-specific downstream event/outbox contract
```

The previous `CHARACTER_WORLD_CONTENT_SPEC.md` overreached by listing `unlock condition schema 적합` as if a source-backed executable schema already existed. Primary source requires the authoring concept but does not supply that schema.

A second ambiguity is that UC-14 says both `World Event 생성` and later ``CHARACTER_UNLOCKED` 이벤트 기록`; source does not explicitly establish that `CHARACTER_UNLOCKED` is the exact `world_events.event_type` rather than another domain/analytics event. Pack must not collapse those event families by naming assumption.

Current baseline:

```text
world_events relational append-only envelope       = SOURCE-COMPLETE
character_unlocks current projection/shape/read     = SOURCE-COMPLETE
same-subject causal World Event FK                   = SOURCE-COMPLETE structural provenance
client direct unlock authority deny                 = SOURCE-COMPLETE
content has an unlock-condition concept              = SOURCE-COMPLETE authoring requirement
condition/event → concrete character unlock mutation = BLOCKED by SRC-23
```

A command that accepts `character_id` + arbitrary same-owner `source_world_event_id` or caller-computed condition result is not a valid workaround; the FK proves ownership/provenance shape, not eligibility.

Blocker composition matters:

```text
relationship-stage-driven character unlock
→ SRC-22 + SRC-23

episode-completion-driven character unlock
→ applicable SRC-17 + SRC-23
```

### 4.8 Existing-Member Guest merge execution overreach removed — `SRC-24`

UC-32 and ERD v0.6 define a strong **merge envelope**:

```text
Guest ownership/session proof
→ one Guest Session → one canonical Member destination
→ duplicate/conflict detection principle
→ automatic merge only where mergeable
→ explicit resolution for conflicts such as Birth Profile
→ subject_merge_jobs / subject_merge_actions audit envelope
→ immutable guest ledgers remain guest-owned
→ completed merge creates direct guest→Member lineage
→ future writes use canonical Member
```

They do not define the executable policy that fills that envelope:

```text
participating domain/resource inventory
duplicate/conflict classification rules
conflicts_jsonb / resolution_jsonb positive schemas
legal user choices per domain
merge policy_version artifact/selection/retention
resource → action_type planning
per-domain import_new / merge_projection transformations
stale resolution behavior
partial action failure/retry/resume semantics
same idempotency key + changed request/resolution behavior
completed response-loss replay reconstruction
deletion_pending Member start/resume eligibility
```

The Pack previously presented `detect conflicts → apply domain merge actions deterministically` and a generic `MERGE_CONFLICT` detail schema/replay model as if those executable semantics already existed. They do not.

The lifecycle mismatch is also explicit: ERD relational command notes accept an `active/deletion_pending` Member target, while Pack text narrowed merge execution to active-only. The stricter choice may be a safe operational fail-close, but it is not source-authoritative until `SRC-24` resolves start/resume/finish behavior for deletion-pending targets.

Current baseline:

```text
subject_merge_jobs/actions relational envelope       = SOURCE-COMPLETE
guest-session one-destination uniqueness              = SOURCE-COMPLETE
no raw immutable-ledger reparent                      = SOURCE-COMPLETE
direct merged guest read-only history lineage         = SOURCE-COMPLETE
member-owned current merge-job read                   = SOURCE-COMPLETE
full conflict/resolution/domain-action merge execution = BLOCKED by SRC-24
```

A command that invents conflict schemas, request hashes, action planning, or domain projection merge formulas is not a valid workaround. Relationship/Unlock/Episode transformations remain independently gated by `SRC-22`/`SRC-23`/`SRC-17` where applicable.

### 4.9 Transactional outbox failure/retry/dead-letter authority separated — `SRC-30`

Primary source requires domain-state/downstream-event atomicity where applicable, failure/recovery verification, and zero product-visible duplicate side effects. Those requirements do not by themselves define one executable publisher retry state machine.

Current source-backed transactional outbox boundary is:

```text
transactional enqueue + logical dedupe/uniqueness
pending claim
expired `processing` lease reclaim
successful completion
stored-state/error telemetry
```

Primary source does **not** define:

```text
publisher failure finalization/classification
retry eligibility
retry scheduling/timing/backoff/jitter
attempt_count mutation/increment lifecycle
max attempts
dead-letter threshold/transition
manual replay/requeue
error taxonomy
generic downstream consumer dedupe key/store/protocol
```

Expired `processing` lease reclaim is a source-backed crash-recovery mechanism. It is **not** failed-event retry scheduling authority. Notification Delivery provider-attempt retry is also a separate domain boundary and does not resolve transactional outbox retry policy.

Current baseline:

```text
transactional enqueue/dedupe                     = SOURCE-COMPLETE
pending claim + expired processing lease reclaim = SOURCE-COMPLETE
successful completion / stored telemetry         = SOURCE-COMPLETE
publisher failure/retry/dead-letter policy        = BLOCKED by SRC-30
```

The Pack therefore does not require a generic `at-least-once + consumer dedupe` protocol, fixed retry/backoff model, or dead-letter state machine as current source evidence. Product-visible duplicate prevention remains a required outcome without inventing the missing execution authority.

### 4.10 Source authority and implementation reproducibility artifacts separated

A follow-up cross-cutting audit found that some Pack wording treated concrete registry/policy artifact names as if Primary Source had defined those artifacts, when source actually defined only the bounded/versioned behavior that implementations must preserve.

Primary Source currently fixes requirements such as:

```text
Analytics event names + payload schemas are version-managed
Relationship transition rules are versioned
Life Fact / Character Memory use type/schema-version validation
server manages rate limits, repeated-request controls, free/paid quota boundaries,
scene/context budgets, and notification frequency caps
experiments must not alter Saju semantic authority
age/content policy must be decided before launch
```

Those requirements do **not** by themselves define the following artifact identities/interfaces/storage/hash contracts:

```text
UsagePolicyDefinition / UsagePolicyV1
AnalyticsEventSchemaRegistry artifact shape/storage/hash
ExperimentAssignmentPolicy
ContentPolicyTagRegistry
```

Implementation may still use versioned config, immutable artifacts, content hashes, registries, or policy objects for deterministic selection, reproducibility, rollout safety, and auditability. When source has not defined the artifact identity/schema/hash itself, those mechanisms are **implementation contracts**, not evidence that Primary Source supplied the product semantics represented inside them.

This distinction does not create a new source gap and does not close an existing one. Missing semantic authority remains governed by the existing decisions, including `SRC-18` commerce mapping, `SRC-22` relationship evaluator/policy content, `SRC-25` personal-record positive registry/schema content, `SRC-32` notification scheduler policy, and `P0-AGE-01` age/content policy.

Current baseline:

```text
source-defined bounded/versioned behavior requirement = AUTHORITATIVE
implementation registry/config/hash mechanism          = ALLOWED IMPLEMENTATION DETAIL
artifact/interface identity as Primary Source contract = NOT CLAIMED unless source defines it
existing semantic gaps / P0                            = remain independently OPEN
```

## 5. Current Saju Public Contract Boundary

Pinned public contract:

```text
gycha0109-beep/Saju
@ 7102dc8fe8483c0875f6a093a4fd585b0df51f8b
```

Current public boundary supports one Birth input plus reading text/optional target person reference and returns `ProductReadingResponse`.

The Pack does not fabricate second-Birth compatibility input or semantic guard fields absent from the exported public contract. `SRC-08` and `SRC-09` remain the applicable blockers.

## 6. Source-Complete Validation Boundaries

### Existing-Member Guest merge with `SRC-24` open

Source-complete verification may assert:

- Guest Session/member ownership and relational FK integrity;
- one Guest Session cannot resolve to two canonical Members;
- guest/member self-merge and merge-chain/cycle constraints deny invalid lineage;
- historical immutable ledger ownership is not rewritten;
- canonical Member can read direct merged guest history only through dedicated history authority;
- generic product writes to merged guest are denied;
- guest-owned Birth cannot be used directly for a new canonical-Member Reading;
- stored member-owned merge-job current projection can be read;
- stored merge action envelope/action enum is representable.

It must **not** claim the following as source-complete:

- domain conflict detector;
- `MERGE_CONFLICT` positive detail schema;
- resolution schema/allowed choices;
- active merge-policy artifact semantics;
- domain action planner;
- per-domain import/merge transformations;
- failed-action retry/resume workflow;
- same-key/different-request conflict semantics absent a source request-hash contract;
- deletion-pending target start/resume policy.

### Character Unlock with `SRC-23` open

Source-complete verification may assert:

- `world_events` owner/dedupe/append-only relational behavior;
- same-owner source-turn/content-bundle provenance where populated;
- one current `character_unlocks` row per user-character;
- locked/unlocked timestamp shape;
- nonnegative unlock revision;
- same-subject `source_world_event_id` FK;
- current unlock projection read/isolation;
- client direct unlock-state authority denied;
- UI can render stored locked/unlocked state.

It must **not** claim the following as source-complete:

- final unlock condition schema/DSL;
- World Event unlock registry/payload schema;
- event/condition→character target correctness;
- replay/already-unlocked/concurrency result semantics;
- cross-release condition migration;
- first-appearance/reward effect transaction;
- season/operator reveal execution policy;
- `CHARACTER_UNLOCKED` exact domain/outbox event identity.

### Relationship with `SRC-22` open

Source-complete verification may assert:

- one current relationship state per user-character;
- relationship event append-only behavior;
- same-owner source provenance constraints;
- same event dedupe key does not create multiple ledger effects;
- one event per applied revision;
- `state_revision_after = state_revision_before + 1`;
- current relationship projection read/isolation;
- client/LLM direct score mutation denied;
- inactivity-only automatic degradation absent.

It must **not** claim the following as source-complete:

- final event allowlist/schema;
- event→delta correctness;
- score bound behavior;
- stage threshold/transition correctness;
- anti-farming window/cap behavior;
- policy version selection/migration;
- relationship policy content-hash provenance;
- authoritative concurrent score/stage apply.

### Commerce with `SRC-18` and `SRC-21` open

Source-complete verification may assert:

- guest/deletion-pending purchase deny;
- active-member Purchase Intent creation;
- same-key/same-request replay;
- same-key/different-request conflict;
- concurrent retry convergence;
- immutable minimal offer mapping snapshot;
- provider account link owner/provider/status checks;
- no receipt/provider-event/entitlement side effects from Purchase Intent create;
- receipt/provider event relational provenance/dedupe constraints;
- grant/event/projection relational ownership and immutability constraints;
- current stored entitlement projection read;
- overlapping-grant relational shape can be represented.

It must **not** claim the following as source-complete:

- purchased product → entitlement key/scope/grant mapping before `SRC-18`;
- event type → exact grant mutation before `SRC-21`;
- provider-order stale comparison before `SRC-21`;
- `active_grant_count` / `effective_valid_until` recompute before `SRC-21`;
- restore → concrete missing grant reconstruction before both applicable gaps are resolved.

### Device with `SRC-19` open

Current verification may assert schema uniqueness, ownership denial, standalone revoke idempotency, and revoked-delivery exclusion. It must not claim registration retry/token-rotation/re-registration lineage is source-complete before `SRC-19` resolution.

### Share with `SRC-20` open

Current verification may assert public token fingerprint lookup, active/unexpired stored-snapshot read, private Reading denial, owner revoke, immutable stored snapshot/token identity, and account-deletion revocation. It must not claim Share create serialization/retry/token-response/expiry semantics are source-complete before `SRC-20` resolution.

### Transactional outbox with `SRC-30` open

Current verification may assert transactional enqueue/dedupe, pending claim, expired `processing` lease reclaim, successful completion, and stored-state/error telemetry. Failure/recovery scenarios must still prove no duplicate domain mutation or product-visible duplicate side effect where the source requires that outcome.

It must **not** claim publisher failure finalization/classification, failed-event retry eligibility/timing/backoff/jitter, `attempt_count` lifecycle, max attempts, dead-letter threshold/transition, manual replay/requeue, error taxonomy, or a generic downstream analytics/consumer dedupe protocol as source-complete before `SRC-30` resolution.

### Cross-cutting implementation artifact validation

If an implementation uses versioned config, immutable artifacts, registries, or content hashes, tests may prove deterministic selection, immutability, version/hash integrity, rollout compatibility, and reproducible readback for those implementation mechanisms.

Those tests must **not** be cited as evidence that Primary Source defines the artifact/interface/storage/hash contract or that the underlying semantic blocker has been resolved. In particular, implementation-artifact tests do not close `SRC-18`, `SRC-22`, `SRC-25`, `SRC-32`, or `P0-AGE-01` by themselves.

## 7. OPEN-P0 Register

Current production decisions include:

| ID | Decision |
|---|---|
| `P0-SA-01` | Saju transport |
| `P0-CM-01` | Web / Apple / Google commerce rail matrix |
| `P0-AI-01` | AI provider/model/fallback/validation implementation |
| `P0-AGE-01` | minimum age / character content policy |
| `P0-PR-01` | retention / backup / legal retention |
| `P0-AUTH-01` | API→PostgreSQL execution identity / RLS enforcement model |

Commerce blockers are independent layers:

```text
P0-CM-01 = which provider/platform rail is used
SRC-18    = what entitlement/grant target a purchased product maps to
SRC-21    = how an authoritative event mutates a grant and recomputes logical entitlement
```

World/relationship blockers compose independently:

```text
SRC-17 = how Episode graph/condition/choice progression is evaluated
SRC-22 = how Relationship Event computes authoritative score/stage
SRC-23 = how authoritative conditions/events map to concrete Character Unlock effects
```

Merge blocker composition:

```text
SRC-24 = how existing-Member Guest conflicts/resolutions/domain actions are decided/applied
SRC-22 = additionally required if relationship projection is transformed
SRC-23 = additionally required if Character Unlock projection is transformed
SRC-17 = additionally required where Episode transition/effect semantics are transformed
```

Source-gap decisions `SRC-19`, `SRC-20`, `SRC-22`, `SRC-23`, `SRC-24`, and `SRC-30` are independent of infrastructure/provider P0 choices.

## 8. Promotion Gate

No feature is called `production-ready`, `migration-complete`, or `final authority` solely because tables/functions exist.

```text
relevant source gap closed or affected behavior explicitly disabled
+ relevant P0 decided
+ clean migration/catalog evidence
+ positive/negative authorization/integrity tests
+ concurrency/idempotency evidence where source defines that behavior
+ command atomicity/failure recovery
+ public dependency contract evidence
+ client/E2E evidence where applicable
= promotion candidate
```

Specific promotion boundaries:

```text
provider-independent entitlement event apply/recompute
→ SRC-21 resolution + transition/aggregation/concurrency evidence

full purchase→entitlement path
→ P0-CM-01 + SRC-18 + SRC-21 resolution + provider/restore evidence

Device Installation register/re-register
→ SRC-19 resolution + concurrency/rotation evidence

Share Artifact create
→ SRC-20 resolution + positive snapshot/privacy + retry/token evidence

Relationship Event score/stage apply
→ SRC-22 resolution + event-schema/delta/stage/anti-farming/concurrency evidence

Character Unlock condition/effect apply
→ SRC-23 resolution + condition/event/target/replay/concurrency evidence

relationship-stage-driven Character Unlock
→ SRC-22 + SRC-23

episode-driven Character Unlock
→ applicable SRC-17 + SRC-23

Existing-Member Guest full merge execution
→ SRC-24 resolution + conflict/resolution/domain-action/retry-resume evidence
→ plus applicable SRC-22/SRC-23/SRC-17 authority for transformed projections

Transactional outbox publisher failure/retry/dead-letter execution
→ SRC-30 resolution + failure-classification/retry/dead-letter/replay evidence
→ expired-processing lease reclaim remains independently source-backed
```

## 9. Final Classification

```text
SPEC PACK STRUCTURE       = PASS
SOURCE TRACEABILITY       = PASS WITH EXPLICIT BLOCKERS
ERD → DDL BASELINE        = ACTIVE / 59 TABLES
IMPLEMENTATION START      = ALLOWED FOR SOURCE-COMPLETE SLICES
FINAL PRODUCTION BASELINE = BLOCKED WHERE SOURCE/P0 REMAINS OPEN
```

### Final statement

> Pack은 source authority를 구현 가능하게 구체화하는 문서이지 source에 없는 product semantics를 발명하는 authority가 아니다. 현재 commerce는 `SRC-18` Product→grant mapping과 `SRC-21` event→grant→logical-entitlement aggregation을 독립적으로 fail-closed 처리한다. `SRC-19`는 Device Installation registration lifecycle, `SRC-20`은 Share Artifact create/public projection lifecycle, `SRC-22`는 Relationship Event의 event→score/stage/anti-farming policy evaluator, `SRC-23`은 Character Unlock의 condition/World Event→target/effect evaluator, `SRC-24`는 existing-Member Guest merge의 conflict/resolution/domain-action/retry-resume policy, `SRC-30`은 transactional outbox publisher failure/retry/dead-letter/replay policy를 각각 차단한다. 이미 source-complete한 Purchase Intent, current stored Entitlement read, Device revoke, Share public-read/revoke, Relationship ledger/current-read, World Event/Character Unlock relational current-read, merge-job current read, direct merged guest history, 그리고 outbox enqueue/dedupe·pending claim·expired-processing lease reclaim·successful completion 경계는 이 blocker들과 독립적으로 유지한다. `UsagePolicyV1`, analytics registry storage/hash, experiment-assignment registry, content-policy-tag registry 같은 구현 artifact는 source가 그 artifact identity/schema/hash를 직접 정의하지 않은 경우 implementation reproducibility mechanism으로만 취급하며 source authority의 증거로 승격하지 않는다.
