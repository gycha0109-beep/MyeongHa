# 명하 Verification / E2E Test Plan v0.13 — Source Aligned

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.13**  
> Date: **2026-08-29**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: source가 결정하지 않은 implementation-critical 사항은 `OPEN-P0`, 비차단 선택은 `CANDIDATE`, source 간 충돌/공백은 `SOURCE_AUTHORITY_GAPS.md` 또는 numbered source-gap 문서에 기록한다.

---

## 1. 완료 Evidence Rule

```text
Implementation
+ Automated Tests
+ Contract/Schema Evidence
+ Security Negative Tests
+ Concurrency/Idempotency Tests
+ Failure Recovery
+ E2E Vertical Slice
+ Source/P0 Gate Evidence for enabled features
```

화면 노출 또는 LLM 한 번 성공은 완료 근거가 아니다.

## 2. Test Layers

```text
L0 Spec traceability / static registry
L1 Unit / policy
L2 DB schema / constraint / trigger / RLS
L3 API command contract
L4 Saju integration contract
L5 AI runtime / content contract
L6 Web/Mobile client integration
L7 E2E vertical slice
L8 failure/concurrency/security
L9 release/regression
```

## 3. Spec Traceability Gate

`SPEC_TRACEABILITY_MATRIX.md`의 모든 launch-relevant UC는 최소:

```text
behavior spec
+ API/command owner
+ persistence/state owner if applicable
+ test gate
```

를 가져야 한다. `UNMAPPED` 0.

## 4. DB Gate

- 59-table ERD catalog coverage
- actual catalog diff(table/column/FK/UNIQUE/CHECK/trigger) = 0
- phantom FK/column = 0
- same-owner composite FK deny
- append-only/immutable mutation deny
- partial unique behavior
- deferrable finalization
- allocator/concurrency
- migration replay/catalog hash
- `SRC-01`, `SRC-05`, `SRC-06` schema impacts resolved before relevant final migration baseline
- `SRC-14` resolved before conversation-delete mutation can be promoted: all durable transcript-bearing columns need governed redaction/tombstone semantics compatible with provenance/immutability constraints
- no invented commerce product→grant mapping schema/registry before `SRC-18` resolution
- no invented entitlement event transition/aggregation function before `SRC-21` resolution
- no invented Device Installation register/upsert lifecycle before `SRC-19` resolution
- no invented Share create positive snapshot/token replay schema before `SRC-20` resolution
- relationship ledger structural constraints remain testable, but no invented relationship policy registry/content-hash column/score-stage evaluator before `SRC-22` resolution
- World Event/Character Unlock structural constraints remain testable, but no invented unlock condition DSL, World Event→character evaluator, unlock-policy provenance field/table, or reward-effect function before `SRC-23` resolution
- merge-job/action relational constraints remain testable, but no invented merge conflict/resolution schema registry, merge policy artifact/table, domain action planner, projection merge formula, or retry/resume state machine before `SRC-24` resolution
- Life Fact/Memory relational storage, provenance, revoke/read and Life Fact lineage constraints remain testable, but no Pack-invented personal-record type/schema registry, schema artifact table, generic arbitrary-JSON validator, or example-key seed registry before `SRC-25` resolution

## 5. Auth / RLS / Privacy Gate

`P0-AUTH-01` DECIDED 이후 selected execution model로 실제 RLS test.

- A→B birth/thread/memory/reading/target/device deny
- A cannot mutate B's relationship/unlock state
- forged DB subject context/JWT claim deny
- guest direct DB deny
- merged history current endpoint deny
- dedicated merged history read-only allow
- merged history write deny
- other user's Guest Session/merge job cannot be claimed or observed
- revoked/future-character grant context exclusion
- public share → private reading deny
- deletion_pending subject → new AI/Saju/purchase deny

## 6. API Workflow Gate

기존 core 외 반드시:

- guest bootstrap
- new-signup promotion
- existing-member merge-job current read
- direct merged guest history authorization/read-only projection
- full existing-member merge conflict detection/resolution/domain action execution은 `SRC-24` 해결 전 production API PASS 대상에서 제외
- profile nickname update
- target-person CRUD/isolation
- chat retry + abandon
- reading clarification + transient retry
- conversation delete scope semantics (`SRC-14` resolution required before final write authority)
- Life Record current read / revoke / source-complete supersession lineage
- direct `POST /api/life-record` durable value create는 `SRC-25` 해결 전 production API PASS 대상에서 제외
- Life Fact supersede에서 새 value/type/schema의 positive validation은 `SRC-25` 해결 전 PASS로 주장하지 않음
- memory session-only / private / explicit grants / forget의 relational/privacy boundary
- Memory Proposal long-term accept가 새 Life Fact/Memory value를 만드는 positive schema validation은 `SRC-25` 해결 전 production PASS 대상에서 제외
- Device Installation standalone owner revoke
- Device Installation register/re-register/token rotation은 `SRC-19` 해결 전 production API PASS 대상에서 제외
- public Share active/unexpired read + owner revoke
- Share create는 `SRC-20` 해결 전 production API PASS 대상에서 제외
- Relationship current projection read
- authoritative Relationship Event score/stage apply는 `SRC-22` 해결 전 production API/command PASS 대상에서 제외
- Character Unlock current projection read
- authoritative Character Unlock eligibility/effect apply는 `SRC-23` 해결 전 production API/command PASS 대상에서 제외
- account deletion job
- admin content release authorization

## 7. Chat Gate

- same clientTurnId same request → same turn
- same ID different request → conflict
- one in-flight thread concurrency
- retryable → new attempt same turn
- abandon retryable → next turn possible
- committed response-loss retry → no duplicate user/assistant/events/memory
- participant/bundle mismatch deny
- output guard fail → no commit/reveal
- unresolved/unknown personal-record type proposed by planner/LLM → no durable Life Fact/Memory write before `SRC-25`
- Relationship Event proposal/candidate가 있더라도 `SRC-22` 해결 전 caller/LLM delta 또는 next-stage를 authoritative mutation으로 commit하지 않음
- Character Unlock candidate/condition가 있더라도 `SRC-23` 해결 전 caller/LLM target, unlock flag, arbitrary condition result 또는 unrelated same-owner World Event를 authoritative unlock proof로 commit하지 않음

## 8. Saju Gate

Saju repo semantic tests는 별도 authority. 명하에서는:

- immutable birth snapshots
- domain/character capability
- exact Saju public response contract state preservation
- clarification vs transport retry
- reading version/revision provenance
- stale detection
- grounding no semantic invention
- prohibited inference preservation
- current Saju exported `ProductReadingResponse` fixture exact-deserialize
- current public host input shape vs adapter contract checked (`SRC-08`)
- material public ambiguity reaches `CharacterSajuContextEnvelopeV2`
- public response에 없는 semanticClaims/prohibited metadata를 fabricate하지 않음
- protected-block 밖 free-form Saju generation denied in production baseline
- protected narrative block ref/hash integrity

A completed Reading may be represented as an authoritative source fact, but Reading completion → concrete Character Unlock mapping is not a PASS condition until `SRC-23` resolves that trigger/effect contract.

## 9. AI / Character Gate

Deterministic fixtures:

- unknown planner action/fact/event key → no execution authority
- planner-requested Life Fact type absent from approved source registry → no durable create/request authority before `SRC-25`
- renderer context excludes non-granted/private data
- unknown cue/action → reject/fallback
- absent canon relation → official-history assertion not accepted
- material ambiguity → no single-outcome certainty
- protected Saju semantic segment not paraphrased/mutated
- proposal alone → no authority mutation
- LLM-proposed personal-record type/schema/value → never treated as durable authority without `SRC-25` validator
- LLM-proposed relationship delta/stage → never treated as authority
- LLM-proposed Character Unlock target/result → never treated as authority

Provider model quality/eval matrix = `OPEN-P0: P0-AI-01`.

## 10. Relationship / Memory Gate

### Source-complete now

- proposal explicit approval principle
- session-only → no durable Life Fact/Memory row
- existing private durable record → no character context
- proposal dedupe/terminal-resolution relational envelope
- revoked grant/memory excluded from context
- Life Fact no branch/cycle/type mismatch structural invariant
- Life Fact double-supersede concurrency → one lineage branch
- already-valid Life Fact/Memory current read/revoke/provenance behavior
- relationship current projection ownership/read isolation
- `relationship_events` append-only
- same `(subject, character, event_dedupe_key)` cannot create multiple ledger effects
- one `state_revision_after` per user-character
- `state_revision_after = state_revision_before + 1`
- relationship state/event same-owner provenance integrity
- client/LLM direct score mutation authority denied
- inactivity-only automatic relationship degradation absent

These prove relational/privacy/history envelopes. They do not prove either the missing personal-record positive schemas (`SRC-25`) or the missing relationship score/stage policy (`SRC-22`).

### Blocked by `SRC-25`

Do not promote new durable Life Fact/Memory value creation until source resolves:

- final normative LifeFactType allowlist
- positive value schema per LifeFactType/schemaVersion
- final normative MemoryType allowlist
- positive content schema per MemoryType/schemaVersion
- schema canonicalization/normalization rules
- writable-current vs legacy-read version policy
- schema evolution/backward compatibility
- requestable Life Fact type exposure to Planner/Capability Gate
- type-specific source constraints if required

After resolution, required tests include:

- known writable type/version + valid value → accepted
- known type/version + invalid value → no durable record
- unknown type → no durable record
- unknown schema version → no durable record
- legacy read-only schema → readable but new write denied according to approved policy
- unknown/extra fields follow approved strictness contract
- planner cannot request an unregistered Life Fact type
- LLM proposal cannot create an unregistered type/schema
- accepted memory remains distinct from Life Fact/Birth/episode authority
- historical stored schema identity remains deterministically interpretable

A Pack-invented `VersionedRecordTypeDefinition`, example-key allowlist, or arbitrary JSON with a `schema_version` string is not a PASS condition.

### Blocked by `SRC-22`

Do not promote authoritative Relationship Event apply until source resolves:

- final normative Relationship Event allowlist
- event payload schema per event type/schema version
- closeness/trust/friction numeric bounds
- deterministic event→delta mapping
- internal stage keys / entry/exit thresholds / transition graph
- anti-farming windows/caps/cooldowns and repeatability rules
- `last_interaction_at` update semantics
- policy-version selection/change/migration semantics
- no-op/blocked-event ledger semantics
- historical relationship-policy provenance beyond existing `policy_version`, if required

After resolution, required tests include:

- same event retry → one policy application
- conflicting same-key shape → source-approved conflict/no-op behavior
- unknown event/schema → no mutation
- each event computes exact approved deltas
- score boundary behavior exact
- concurrent web/mobile events serialize to one linear revision chain
- stage transitions deterministic and reproducible
- message/action spam cannot farm beyond policy
- explicit conflict/reconciliation degradation/recovery follows approved rules
- event ledger + current projection mutation commit atomically
- historical policy provenance remains resolvable under the approved model

A Pack-invented `RelationshipPolicyDefinitionV1`, caller-supplied delta, or intuitive stage threshold is not a PASS condition.

## 11. Character Unlock / World Event Gate

### Source-complete now

- `world_events` subject ownership and append-only envelope
- `world_events(subject_id,event_dedupe_key)` uniqueness
- optional source-turn/content-bundle relational provenance
- one `character_unlocks` current row per subject-character
- `status IN ('locked','unlocked')`
- unlocked → `unlocked_at` present
- locked → `unlocked_at` absent
- `revision >= 0`
- `source_world_event_id` same-subject FK integrity
- current Character Unlock projection owner-isolated read
- client direct unlock-state authority denied
- stored locked/unlocked state can drive Hall silhouette/presentation without re-evaluating an invented condition

These prove representability/current state, not unlock eligibility.

### Blocked by `SRC-23`

Do not promote authoritative Character Unlock mutation until source resolves:

- positive versioned unlock-condition schema/DSL or deterministic equivalent
- World Event registry/payload schemas used for unlock causality
- condition/content-bundle → target character mapping
- condition composition/comparison semantics
- first-appearance/reward effect mapping
- already-unlocked/replay behavior
- concurrent multiple valid trigger behavior and projection revision semantics
- content-release/bundle migration semantics for locked/unlocked subjects
- season/operator reveal authority and scope
- unlock-specific downstream/outbox event contract where required

After resolution, required tests include:

- unknown condition operator/schema → no unlock
- unknown World Event/schema → no unlock
- forged same-owner but unrelated World Event → no unlock
- wrong target character → deny
- unsatisfied condition → projection unchanged
- satisfied condition → exactly one logical unlock
- duplicate trigger → approved replay/no-op result
- concurrent valid triggers → deterministic one-way projection/revision result
- relationship-stage trigger uses authoritative `SRC-22` stage rather than caller supplied stage
- episode-completion trigger uses authoritative episode result and applicable `SRC-17` evaluator
- Reading trigger validates authoritative completion provenance
- season/operator trigger validates approved authority/scope
- unlock projection + required causal/domain/outbox effects commit atomically

The existence of `source_world_event_id` or a content authoring `unlock 조건` field is not by itself a PASS for eligibility/effect evaluation.

## 12. Episode / Content Gate

- bundle pin exact
- content hash/artifact integrity
- invalid episode graph/node/choice deny after `SRC-17` evaluator contract resolution
- episode advance retry once after `SRC-17` resolution
- world/unlock side effects atomic after applicable source authorities are resolved
- episode-derived relationship score/stage side effects additionally require `SRC-22`
- concrete Character Unlock reward/effect additionally requires `SRC-23`
- relationship-stage-driven Character Unlock requires `SRC-22 + SRC-23`
- client capability incompatible content graceful handling
- existing thread not silently moved by default release change
- existing `character_unlocks` projection not silently re-evaluated/re-written merely because default content release changes before `SRC-23` defines migration semantics
- `SRC-01` resolved behavior test: chosen per-character/per-episode operational disable policy or explicit non-requirement

## 13. Commerce Gate

### Source-complete now

- guest purchase deny
- active member Purchase Intent create only
- same idempotency key + same canonical request → one logical intent / replay
- same key + different request → conflict
- concurrent Purchase Intent retries converge
- immutable minimal offer mapping snapshot exact
- product/offer current availability checked only for new intent, not historical replay
- provider account link owner/provider/status validation
- Purchase Intent create produces no receipt/provider-event/entitlement side effects
- receipt/provider-event relational dedupe and owner/source constraints
- unresolved provider event → entitlement event source deny
- forged/unverified receipt → entitlement event source deny
- entitlement event append-only
- entitlement event grant owner/key/scope FK integrity
- multiple independent grant rows can coexist structurally
- one logical entitlement projection row per subject/key/scope
- logical projection active/inactive ↔ active_grant_count shape constraints
- current entitlement projection read
- expired `effective_valid_until` cannot authorize access even if sweeper is delayed

The current commerce negative test manually changes a grant and then manually writes the logical projection to demonstrate that overlapping grants are representable. It is **not** evidence of an executable recompute algorithm.

### Blocked by `SRC-18`

- verified purchased product → exact `entitlement_key` / scope / grant-key target
- resource-scoped product target resolution
- historical product→grant mapping version replay
- restore source → concrete grant target reconstruction

### Blocked by `SRC-21`

Do not promote grant-event apply or aggregate recompute until source resolves:

- versioned payload schema for `granted|renewed|expired|revoked|restored|adjusted`
- event type → grant status/validity/revision transition
- stale provider-order comparator/precedence
- exact contributing-grant predicate including `valid_from`/`valid_until`
- future `valid_from` behavior
- exact `active_grant_count` formula
- exact `effective_valid_until` aggregation including finite + unbounded grants
- recompute as-of time authority
- first projection row/id behavior
- projection revision/no-op update semantics
- entitlement-change outbox schema/dedupe

A lexical provider-order comparator or intuitive `MAX(valid_until)`/NULL-wins aggregation is not a source-backed PASS condition.

### Additionally gated by `P0-CM-01`

- provider-specific Web / Apple / Google payment, receipt, restore, refund/revoke rail behavior.

## 14. Notification Gate

### Source-complete now

- device cross-user deny
- active installation identity/token uniqueness structural constraints
- owner-scoped installation revoke
- revoked installation excluded from new delivery/attempt targets
- `(notification_id, installation_id)` logical delivery dedupe
- row-locked `next_attempt_no` allocation and unique provider-attempt provenance
- stored logical notification ledger owner-isolated read
- explicit owned notification `read` state command; push delivered/open remains a different state
- stored notification preference rows can be read exactly as persisted
- explicitly stored preview mode can be enforced without inventing a missing-row default
- provider attempt persistence/finalization remains testable after an already-authoritative provider identity is supplied; this does not prove provider routing
- private deep link resource authorization deny

These prove persistence, ownership, privacy and retry-allocation mechanics. They do **not** prove final notification inbox composition, missing preference defaults, autonomous scheduling policy, provider routing, or automatic retry timing policy.

### Blocked by `SRC-12`

Do not promote effective notification preference defaults or preference mutation until source resolves:

- missing `notification_settings` effective `global_enabled`
- missing category preference effective `enabled`
- bootstrap/materialization of settings/category rows
- PATCH existing-row-only vs insert/update semantics and idempotency
- category-registry expansion defaults/migration for existing users
- exact default preview mode

Stored rows remain testable; absence must not be silently synthesized into a production default.

### Blocked by `SRC-13`

Do not promote final `GET /api/notifications` inbox projection until source resolves:

- visible notification status membership
- whether `read` history remains visible
- whether `cancelled` / `expired` history is exposed
- whether future `queued` rows are visible before ready
- final public inbox ordering and cursor semantics

Raw stored-ledger reads are evidence of persisted authority, not evidence of final user-visible inbox composition/order.

### Blocked by `SRC-19`

Do not promote a Device Installation register endpoint until source resolves:

- same-subject exact retry behavior
- token rotation behavior
- revoked-row re-registration/reactivation vs new generation
- installation row identity/lineage
- same-token/different-installation same-subject conflict behavior
- `app_version` / `client_capability` / `last_seen_at` refresh authority
- concurrent register logical identity/idempotency

Database uniqueness violations alone are not a registration lifecycle PASS.

### Blocked by `SRC-31`

Do not promote production provider routing until source resolves:

- canonical resolver input
- installation/platform/provider mapping or registry
- provider aliases and supported provider set
- routing mismatch behavior
- provider selection provenance requirements
- retry-time re-resolution vs same-provider behavior
- provider failover authority

Persisting `attempt.provider` and provider-message provenance proves audit mechanics only. It does not authorize caller-supplied provider strings as routing decisions.

### Blocked by `SRC-32`

Do not promote autonomous notification scheduler decisions/materialization until source resolves:

- trigger positive schema / final trigger registry
- category-specific threshold/cadence
- frequency-cap window/count/scope and exact enforcement
- candidate replay/concurrency behavior
- logical notification dedupe identity / `dedupe_key` construction
- template/locale/preview selection mapping
- initial logical status / `scheduled_at` / expiry materialization rules
- stale candidate cancel/defer/expire semantics
- scheduler policy change/provenance semantics

Primary Source requirements such as “respect quiet hours/opt-out” and “server manages frequency cap” remain mandatory constraints, but they do not supply the missing production evaluator or numeric policy.

### Additional retry-policy boundary

The stored delivery/attempt allocator supports a failed attempt followed by a later attempt. It does not define production automatic retry delay/backoff, max attempts, provider error retryability taxonomy, or failover. Do not turn allocator capability into a scheduler PASS condition without source authority.

## 14A. Share Gate

### Source-complete now

- `share_artifacts` relational envelope and immutable stored identity
- public raw token is converted at API boundary to protected keyed fingerprint/hash representation
- public lookup returns only stored public snapshot projection fields, not owner/Reading/hash provenance
- inactive/revoked/clock-expired artifact public lookup deny
- public share capability cannot authorize private Reading API
- owner-scoped active Share revoke
- revoked Share cannot be reactivated through normal lifecycle
- account deletion revokes active Share artifacts before later destructive phases

### Blocked by `SRC-20`

Do not promote `POST /api/share-artifacts` until source resolves:

- positive versioned allowlist for `snapshot_jsonb`
- exact source Reading lifecycle state(s) eligible for share
- whether one Reading may intentionally have multiple active artifacts
- create logical identity and retry/idempotency behavior
- raw opaque public-token generation + replay/recovery behavior after commit/response loss
- create-time expiry policy and allowed caller control
- explicit user-controlled inclusion of fields described only as hidden **by default**
- compatibility/Target Person public representation without internal identifiers

A blacklist-only serializer, Pack-invented `ShareArtifactV1`, or plaintext raw-token storage is not a PASS condition.

## 14B. Cost / Quota / Abuse Gate

- subject/guest rate limit owner resolved server-side
- client supplied rate-limit owner ignored
- AI context/token budget bounded
- budget reduction never drops mandatory qualifier/prohibited inference/material ambiguity
- Saju transport retry bounded
- multi-character maxTurns/call cap enforced
- entitlement-required quota deny without effective entitlement
- relationship/episode farming cannot bypass source-approved domain idempotency/policy; exact relationship anti-farming expectations remain `SRC-22`
- Character Unlock cannot be farmed or forged through arbitrary World Event/condition input; exact trigger replay/concurrency semantics remain `SRC-23`

## 14C. Analytics / Experiment Gate

- analytics schema registry/version required
- raw Birth/chat/Memory/receipt detector PASS
- client optimistic success not counted as authoritative conversion
- outbox retry dedupes server conversion event
- stable experiment assignment for same identity/version
- experiment cannot mutate Saju semantic authority or privacy/entitlement gates
- `CHARACTER_UNLOCKED` analytics naming must not be silently treated as the authoritative World Event/command contract before `SRC-23` resolves domain event semantics

## 15. Deletion / Lifecycle Gate

- conversation delete does not silently delete confirmed Life Fact
- character forget does not delete unrelated Life Fact
- target-person delete scope exact
- account delete revokes shares/devices/scheduled notifications before erase
- direct merged guest lineage included
- legal commerce retention remains separated
- backup/raw AI trace behavior follows `P0-PR-01` when DECIDED
- conversation delete preserves provenance identity but removes/redacts raw transcript from **every durable duplicate**: `conversation_messages.body_text/message_payload_jsonb`, `chat_turns.request_snapshot_jsonb`, and transcript-bearing `chat_turn_attempts.generated_*`
- message-row redaction alone is not a conversation-delete PASS
- deletion must not make terminal attempt provenance mutable in an ad-hoc way; source-approved tombstone/redaction semantics must define the exception boundary first
- delete/commit race must serialize so either commit precedes deletion and is redacted, or deletion wins and later assistant commit is denied
- merged Guest historical ledgers remain guest-owned/read-only; full existing-Member merge domain transformation remains `SRC-24`
- `SRC-05`: session-only/reject proposal staging payload no shadow durable record
- `SRC-06`: target/self Birth standalone privacy deletion dependency policy verified
- `SRC-07`: manual commerce resolution disabled unless audited source resolution exists
- `SRC-08`: real compatibility/domain adapter only enabled against an actual consumable Saju public contract
- `SRC-09`: explicit guard-metadata invariant not marked CLOSED until source public export exists or source requirement changes
- `SRC-14`: conversation-delete write remains blocked until duplicate transcript retention/redaction and terminal-attempt immutability semantics are source-resolved
- `SRC-18`: purchase-derived grant-target resolution remains blocked until product→grant mapping authority is source-resolved
- `SRC-19`: Device Installation register/re-register remains blocked; standalone revoke remains valid
- `SRC-20`: Share Artifact create remains blocked; existing public read/revoke remains valid
- `SRC-21`: Entitlement grant-event transition/aggregate recompute remains blocked; current stored projection read remains valid
- `SRC-22`: Relationship Event score/stage policy apply remains blocked; relationship relational ledger/current-read envelope remains valid
- `SRC-23`: Character Unlock condition/effect apply remains blocked; World Event/Character Unlock relational envelope and stored current read remain valid
- `SRC-24`: existing-Member Guest merge conflict/resolution/domain-action execution remains blocked; merge-job current read + direct merged guest history remain valid
- `SRC-25`: new durable Life Fact/Character Memory positive type-schema validation remains blocked; already-valid stored record read/revoke and Life Fact lineage constraints remain valid

## 16. Engineering Vertical Slice

Source-complete vertical slice may include current relationship/unlock projections and non-authoritative candidates, but must not claim real score/stage progression, Character Unlock eligibility/effect evaluation, or new durable personal-record schema validation until the relevant gaps resolve.

```text
Guest bootstrap
→ character choose
→ nickname
→ birth revision
→ Mock Saju governed narrative
→ protected grounded response + character framing
→ current-life question
→ memory proposal
→ session-only branch test
→ stored already-valid personal-record read/privacy branch
→ long-term Life Fact/Memory accept remains disabled until `SRC-25` (+ grant/proposal blockers as applicable)
→ relationship candidate / current-state read (`SRC-22` blocks authoritative score-stage apply)
→ stored Character Unlock state read/render (`SRC-23` blocks eligibility/effect mutation)
→ Hall state from stored/source-approved state only
→ signup promotion
→ Web/Mobile continuation
```

Existing-Member Guest merge may contribute only its source-complete stored job/history-read envelope to this baseline until `SRC-24` resolves the actual conflict/action workflow. Any merge-import of new Life Fact/Memory values additionally requires `SRC-25`.

## 17. Real Saju Slice

```text
real Saju adapter
→ versioned ProductResponse
→ ambiguity preserved
→ grounding/context envelope
→ protected semantic segment
→ controlled reveal
```

## 18. Failure Injection

- Saju timeout/invalid contract
- planner timeout/invalid schema
- renderer invalid schema
- output guard block
- DB commit then client response loss
- outbox worker crash / expired `processing` lease
- push provider failure
- duplicate/out-of-order commerce webhook
- content artifact hash mismatch
- deletion worker partial failure

중복 charge/event/message/memory 또는 cross-user leakage 0.

Transactional outbox failure injection은 authority를 분리해서 판정한다. Worker crash / lease expiry는 pending claim 및 expired `processing` lease reclaim의 exact 결과까지 검증할 수 있다. Publisher failure 시나리오에서는 source-backed stored-state/error telemetry를 관찰할 수 있지만, failed-state finalization/classification, retry eligibility/timing/backoff/jitter, `attempt_count` mutation lifecycle, max attempts, dead-letter threshold/transition, manual replay/requeue, error taxonomy의 exact 결과를 `SRC-30` 해결 전에 PASS로 정의하지 않는다. Notification Delivery attempt retry policy와 transactional outbox retry policy는 서로 다른 domain boundary이며 서로의 evidence를 대체하지 않는다.

Personal-record unknown/invalid type-schema writes fail closed with no durable value before `SRC-25`; exact valid/legacy schema acceptance behavior is not invented until source resolution. Share create response-loss retry는 `SRC-20` 해결 전 기대 결과를 임의 정의하지 않는다. Device register transport/retry도 `SRC-19` 해결 전 기대 lineage를 임의 정의하지 않는다. Commerce out-of-order source application과 aggregate recompute의 exact result는 `SRC-21` 해결 전 임의 정의하지 않는다. Relationship apply retry/concurrent result 중 policy output(delta/stage/anti-farming)은 `SRC-22` 해결 전 임의 정의하지 않으며, 현재는 relational dedupe/revision invariants만 검증한다. Character Unlock response-loss/replay/concurrent trigger의 exact projection/effect result는 `SRC-23` 해결 전 임의 정의하지 않으며, 현재는 stored projection/relational invariants만 검증한다. Existing-Member merge response-loss/stale-resolution/partial-action-failure의 exact resume/result semantics는 `SRC-24` 해결 전 임의 정의하지 않으며, 현재는 relational uniqueness, ownership, direct-lineage history, no-raw-reparent invariants만 검증한다.

## 19. Evidence Artifact

CI/release evidence:

- commit SHA
- migration version/catalog hash
- API contract version
- content release/bundle/hash
- Saju engine/reading contract/grounding versions
- AI runtime/prompt versions
- transactional outbox source-backed enqueue/dedupe, pending claim, expired-processing lease reclaim, successful-completion, and stored-state/error telemetry evidence
- `SRC-30` status for publisher failure finalization/classification, retry eligibility/scheduling/backoff/jitter, `attempt_count` lifecycle, max attempts, dead-letter threshold/transition, manual replay/requeue, and error-taxonomy evidence
- notification stored logical-ledger/delivery/provider-attempt persistence provenance for implemented notification slices
- `SRC-12` status for effective notification preference defaults/materialization/mutation evidence
- `SRC-13` status for final user-visible notification inbox membership/history/order/cursor evidence
- `SRC-31` status for production notification provider-routing evidence
- `SRC-32` status for autonomous notification trigger/cadence/frequency-cap/dedupe/template/materialization evidence
- personal-record type/schema registry/version evidence only after `SRC-25` source resolution
- `SRC-25` status for any new durable Life Fact/Memory value evidence
- relationship `policy_version` provenance available in current ERD
- `SRC-22` status for any authoritative relationship score/stage mutation evidence
- Character Unlock stored projection/source-world-event provenance available in current ERD
- `SRC-23` status for any authoritative Character Unlock eligibility/effect mutation evidence
- merge-job/action relational provenance + direct merged guest lineage for implemented read/safety slices
- `SRC-24` status for any full existing-Member Guest merge conflict/resolution/domain-action evidence
- commerce product/offer/Purchase Intent snapshot provenance for implemented commerce slices
- `SRC-18` status for product→grant-target evidence
- `SRC-21` status for grant-event apply/aggregate recompute evidence
- `SRC-19` status for any Device Installation register/re-register evidence
- `SRC-20` status for any Share Artifact create evidence
- test matrix summary + failed invariant IDs
- source gap/P0 status snapshot

Do not require a relationship policy `contentHash` as current source evidence: ERD v0.6 does not define that persistence field/table. If source later requires stronger policy artifact provenance, `SRC-22` resolution must define it explicitly.

Do not invent Character Unlock condition hash/version/bundle provenance fields as current source evidence: ERD v0.6 does not define them. If they are required for deterministic unlock replay/migration, `SRC-23` resolution must define an ERD-compatible contract or explicit ERD revision.

Do not invent merge policy hash/artifact, conflict schema version, request hash, or domain-action transformation evidence absent from ERD. If required, `SRC-24` resolution must define an ERD-compatible contract or explicit ERD revision.

Do not treat the Pack's previous `VersionedRecordTypeDefinition` shape as source evidence. `SRC-25` must define the actual positive personal-record type/schema registry and any required artifact identity/provenance.

Do not treat notification stored-ledger, delivery, or attempt provenance as evidence that missing effective defaults, final inbox composition, provider routing, scheduler decisions, or automatic retry policy have been source-resolved.

Do not treat expired-processing lease reclaim as failed-event retry/dead-letter evidence, and do not use Notification Delivery attempt retry evidence as transactional outbox retry evidence.

## 20. Promotion Criteria

### Engineering baseline

```text
relevant source blockers closed or feature explicitly disabled
+ DB schema gate PASS
+ API contract PASS
+ security/RLS model testable and PASS for selected environment
+ AI/Saju protected semantic boundary PASS
+ E2E slice PASS
+ failure recovery PASS
```

### Production

추가로 enabled feature가 참조하는 P0 decision이 DECIDED이고 store/privacy/age/release runbook이 준비되어야 한다.

```text
Commerce purchase→access enabled → SRC-18 + SRC-21 source-resolved + P0-CM-01 decided
Notification effective preference defaults/materialization/mutation enabled → SRC-12 source-resolved
Final user-visible Notification Inbox projection enabled → SRC-13 source-resolved
Device Installation register enabled → SRC-19 source-resolved
Production notification provider routing enabled → SRC-31 source-resolved
Autonomous notification scheduler decision/materialization enabled → SRC-32 source-resolved
Automatic notification delivery retry timing/backoff/max-attempt/error-taxonomy/failover enabled → explicit source authority required; attempt allocator mechanics alone are insufficient
Transactional outbox publisher-failure finalization/classification, failed-event retry scheduling/backoff/jitter, `attempt_count` lifecycle/max-attempts, dead-letter transition/threshold, manual replay/requeue, or error taxonomy enabled → SRC-30 source-resolved; expired-processing lease reclaim remains independently source-backed and is not failed-event retry authority
Share Artifact create enabled → SRC-20 source-resolved
Relationship Event score/stage apply enabled → SRC-22 source-resolved
Character Unlock eligibility/effect apply enabled → SRC-23 source-resolved
relationship-stage-driven Character Unlock enabled → SRC-22 + SRC-23
episode-driven Character Unlock enabled → applicable SRC-17 + SRC-23
Existing-Member Guest full merge execution enabled → SRC-24 source-resolved + applicable domain gaps (`SRC-22`/`SRC-23`/`SRC-17`/`SRC-25`) resolved for transformed projections/records
new durable Life Fact/Character Memory creation enabled → SRC-25 source-resolved + applicable proposal/grant authority resolved
```
