# 명하 Verification / E2E Test Plan v0.7 — Source Aligned

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.7**  
> Date: **2026-08-28**  
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

## 5. Auth / RLS / Privacy Gate

`P0-AUTH-01` DECIDED 이후 selected execution model로 실제 RLS test.

- A→B birth/thread/memory/reading/target/device deny
- forged DB subject context/JWT claim deny
- guest direct DB deny
- merged history current endpoint deny
- dedicated merged history read-only allow
- merged history write deny
- revoked/future-character grant context exclusion
- public share → private reading deny
- deletion_pending subject → new AI/Saju/purchase deny

## 6. API Workflow Gate

기존 core 외 반드시:

- guest bootstrap
- new-signup promotion
- existing-member merge/conflict resolution
- profile nickname update
- target-person CRUD/isolation
- chat retry + abandon
- reading clarification + transient retry
- conversation delete scope semantics (`SRC-14` resolution required before final write authority)
- memory session-only / private / explicit grants / forget
- Device Installation standalone owner revoke
- Device Installation register/re-register/token rotation은 `SRC-19` 해결 전 production API PASS 대상에서 제외
- public Share active/unexpired read + owner revoke
- Share create는 `SRC-20` 해결 전 production API PASS 대상에서 제외
- Relationship current projection read
- authoritative Relationship Event score/stage apply는 `SRC-22` 해결 전 production API/command PASS 대상에서 제외
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
- Relationship Event proposal/candidate가 있더라도 `SRC-22` 해결 전 caller/LLM delta 또는 next-stage를 authoritative mutation으로 commit하지 않음

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

## 9. AI / Character Gate

Deterministic fixtures:

- unknown planner action/fact/event key → no execution authority
- renderer context excludes non-granted/private data
- unknown cue/action → reject/fallback
- absent canon relation → official-history assertion not accepted
- material ambiguity → no single-outcome certainty
- protected Saju semantic segment not paraphrased/mutated
- proposal alone → no authority mutation
- LLM-proposed relationship delta/stage → never treated as authority

Provider model quality/eval matrix = `OPEN-P0: P0-AI-01`.

## 10. Relationship / Memory Gate

### Source-complete now

- proposal explicit approval only
- session-only → no durable record
- private durable record → no character context
- duplicate proposal once
- revoked grant/memory excluded from context
- Life Fact no branch/cycle/type mismatch
- relationship current projection ownership/read isolation
- `relationship_events` append-only
- same `(subject, character, event_dedupe_key)` cannot create multiple ledger effects
- one `state_revision_after` per user-character
- `state_revision_after = state_revision_before + 1`
- relationship state/event same-owner provenance integrity
- client/LLM direct score mutation authority denied
- inactivity-only automatic relationship degradation absent

These prove the relational envelope, not the missing score/stage policy.

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

## 11. Episode / Content Gate

- bundle pin exact
- content hash/artifact integrity
- invalid episode graph/node/choice deny after `SRC-17` evaluator contract resolution
- episode advance retry once after `SRC-17` resolution
- world/unlock side effects atomic after applicable source authorities are resolved
- episode-derived relationship score/stage side effects additionally require `SRC-22`
- relationship-stage-driven unlock evaluation requires `SRC-22` plus any independently missing World/Content unlock-condition authority
- client capability incompatible content graceful handling
- existing thread not silently moved by default release change
- `SRC-01` resolved behavior test: chosen per-character/per-episode operational disable policy or explicit non-requirement

## 12. Commerce Gate

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

## 13. Notification Gate

### Source-complete now

- device cross-user deny
- active installation identity/token uniqueness constraints
- owner-scoped revoke
- revoked installation no new send
- logical delivery dedupe
- retry allocator
- quiet hours/opt-out/frequency cap where stored policy authority exists
- default privacy preview no sensitive content only after `SRC-12` default authority is resolved; stored explicit preview mode remains testable
- deep link unauthorized private resource deny

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

## 13A. Share Gate

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

## 13B. Cost / Quota / Abuse Gate

- subject/guest rate limit owner resolved server-side
- client supplied rate-limit owner ignored
- AI context/token budget bounded
- budget reduction never drops mandatory qualifier/prohibited inference/material ambiguity
- Saju transport retry bounded
- multi-character maxTurns/call cap enforced
- entitlement-required quota deny without effective entitlement
- relationship/episode farming cannot bypass source-approved domain idempotency/policy; exact relationship anti-farming expectations remain `SRC-22`

## 13C. Analytics / Experiment Gate

- analytics schema registry/version required
- raw Birth/chat/Memory/receipt detector PASS
- client optimistic success not counted as authoritative conversion
- outbox retry dedupes server conversion event
- stable experiment assignment for same identity/version
- experiment cannot mutate Saju semantic authority or privacy/entitlement gates

## 14. Deletion / Lifecycle Gate

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

## 15. Engineering Vertical Slice

Source-complete vertical slice may include the current relationship projection read and a non-authoritative Relationship Event proposal/candidate, but must not claim real score/stage progression until `SRC-22` resolves.

```text
Guest bootstrap
→ character choose
→ nickname
→ birth revision
→ Mock Saju governed narrative
→ protected grounded response + character framing
→ current-life question
→ memory proposal
→ session-only/private/character grant branch test
→ relationship candidate / current-state read (`SRC-22` blocks authoritative score-stage apply)
→ Hall state change only from source-approved state
→ signup promotion
→ Web/Mobile continuation
```

## 16. Real Saju Slice

```text
real Saju adapter
→ versioned ProductResponse
→ ambiguity preserved
→ grounding/context envelope
→ protected semantic segment
→ controlled reveal
```

## 17. Failure Injection

- Saju timeout/invalid contract
- planner timeout/invalid schema
- renderer invalid schema
- output guard block
- DB commit then client response loss
- outbox worker crash/lease expiry
- push provider failure
- duplicate/out-of-order commerce webhook
- content artifact hash mismatch
- deletion worker partial failure

중복 charge/event/message/memory 또는 cross-user leakage 0.

Share create response-loss retry는 `SRC-20` 해결 전 기대 결과를 임의 정의하지 않는다. Device register transport/retry도 `SRC-19` 해결 전 기대 lineage를 임의 정의하지 않는다. Commerce out-of-order source application과 aggregate recompute의 exact result는 `SRC-21` 해결 전 임의 정의하지 않는다. Relationship apply retry/concurrent result 중 policy output(delta/stage/anti-farming)은 `SRC-22` 해결 전 임의 정의하지 않으며, 현재는 relational dedupe/revision invariants만 검증한다.

## 18. Evidence Artifact

CI/release evidence:

- commit SHA
- migration version/catalog hash
- API contract version
- content release/bundle/hash
- Saju engine/reading contract/grounding versions
- AI runtime/prompt versions
- relationship `policy_version` provenance available in current ERD
- `SRC-22` status for any authoritative relationship score/stage mutation evidence
- commerce product/offer/Purchase Intent snapshot provenance for implemented commerce slices
- `SRC-18` status for product→grant-target evidence
- `SRC-21` status for grant-event apply/aggregate recompute evidence
- `SRC-19` status for any Device Installation register/re-register evidence
- `SRC-20` status for any Share Artifact create evidence
- test matrix summary + failed invariant IDs
- source gap/P0 status snapshot

Do not require a relationship policy `contentHash` as current source evidence: ERD v0.6 does not define that persistence field/table. If source later requires stronger policy artifact provenance, `SRC-22` resolution must define it explicitly.

## 19. Promotion Criteria

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
Device Installation register enabled → SRC-19 source-resolved
Share Artifact create enabled → SRC-20 source-resolved
Relationship Event score/stage apply enabled → SRC-22 source-resolved
relationship-stage-driven unlock enabled → SRC-22 + applicable World/Content unlock-condition authority
```
