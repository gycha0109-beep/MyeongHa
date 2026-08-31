# 명하 Server Command / Transaction Specification v0.9

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.9**  
> Date: **2026-08-29**  
> Persistence Authority: `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`  
> API Authority: `API_CONTRACT.md`

---

## 1. 목적

API command가 여러 table/ledger/projection을 갱신할 때 atomicity, lock order, external-call boundary를 통일한다.

## 2. 기본 원칙

```text
validate identity/capability
→ lock aggregate root/current projection
→ validate expected revision/idempotency
→ DB mutations + outbox when source/domain requires downstream publication
→ commit
```

외부 AI/Saju/payment/push API를 DB transaction 안에서 호출하지 않는다.

## 3. Global Lock Ordering

여러 aggregate를 동시에 lock해야 하면 다음 순서를 기본으로 한다.

```text
1. canonical subject / merge job when lifecycle command
2. parent aggregate root
   - conversation_thread
   - reading_session
   - user_character_state
   - character_unlock
   - user_episode_progress
   - entitlement_grant
   - notification_delivery
3. logical attempt/current pointer row
4. child ledger/provenance rows
5. outbox rows
```

같은 class 여러 row는 stable primary key 정렬 순으로 lock한다.

문서별 command가 이 순서를 뒤집어 deadlock을 만들면 안 된다. 예외 lock order가 필요하면 command별로 명시하고 concurrency test를 추가한다.

`character_unlock` lock class는 relational projection write가 source-resolved 된 이후의 ordering placeholder다. `SRC-23` 해결 전 실제 unlock eligibility/effect command가 source-complete하다는 뜻이 아니다.

## 4. External Call Pattern

AI/Saju/provider 호출:

```text
Tx A: logical command/attempt state prepare
COMMIT

external call

Tx B: lock same logical command
→ verify attempt still current/eligible
→ persist validated response/provenance
→ finalize projection/message/outbox
COMMIT
```

External timeout 후 재시도는 새 logical authority를 만들지 않고 attempt ledger를 사용한다.

## 5. Guest Promotion

```text
verify auth identity + guest token
→ lock guest subject + guest_session
→ ensure active/unconsumed
→ attach auth_user_id + kind=member
→ mark guest_session consumed/claimed
→ outbox optional account event
→ commit
```

owner FK bulk move 없음.

## 6. Existing-Member Guest Merge — relational skeleton only; executable workflow blocked by `SRC-24`

UC-32/ERD가 고정한 구조적 순서는 다음과 같다.

```text
verify Guest ownership/session proof + Member identity
→ serialize one Guest Session → one canonical merge job/destination
→ inspect source-approved conflict set
→ if source-approved resolution is required: await explicit user resolution
→ plan/apply only source-approved domain merge actions
→ keep immutable historical ledgers guest-owned
→ on approved completion consume Guest Session
→ guest subject status=merged, merged_into_subject_id=Member
→ future normal writes use canonical Member
```

이 순서는 **merge envelope와 safety invariant**를 고정할 뿐, conflict detector나 domain merge algorithm을 정의하지 않는다.

`SRC-24` remains OPEN because primary source does not define:

```text
participating domain/resource inventory
duplicate/conflict classification algorithm
conflicts_jsonb / resolution_jsonb positive schemas
legal resolution choices per domain
merge policy_version artifact/selection/retention
resource → retain_readonly|import_new|merge_projection|discard planning
per-domain import_new / merge_projection transformation
stale resolution handling
failed action retry/resume/status transition semantics
same idempotency key + different request/resolution behavior
completed response-loss replay reconstruction
member deletion_pending start/resume eligibility
```

ERD는 merge target relational validation을 `active/deletion_pending` member로 기술하지만, Pack이 `active` only로 좁혀 production rule로 확정할 source authority는 없다. `SRC-24` 해결 전 `deletion_pending` 대상에 대해 start/resume/finish 중 무엇을 허용하는지 임의 확정하지 않는다. 안전상 production mutation을 fail-close하는 것은 가능하지만 그것을 source-defined semantics라고 기록하지 않는다.

Historical immutable ledger `subject_id` UPDATE는 금지다. Existing `qry_subject_merge_job_v1` current read와 direct merged guest lineage history projection은 stored authority를 읽기만 하므로 `SRC-24`와 독립적으로 유지할 수 있다.

Relationship score/stage merge semantics require the source-approved relationship policy. `SRC-22` 해결 전 merge command가 relationship scores/stage를 임의 합산/재계산하지 않는다.

Character Unlock merge/import semantics are not defined by UC-32 or ERD beyond historical ownership boundaries. `SRC-23` 해결 전 guest/member unlock projections를 임의 OR/overwrite/re-evaluate하지 않는다.

Episode progress/state transformation이 필요한 merge action은 적용 범위에서 `SRC-17`의 transition/effect authority를 우회하지 않는다.

따라서 다음은 `SRC-24` 해결 전 production-authoritative command로 승격하지 않는다.

```text
cmd_merge_guest_into_existing_member...
merge conflict detector
merge resolution validator
merge action planner
per-domain merge executor
```

## 7. Birth Revision Append

```text
lock birth_profile
→ verify expected current revision
→ allocate revision_no from current state under lock
→ insert immutable revision
→ update current_revision_id
→ mark dependent UI stale by derived query, not historical Reading rewrite
→ commit
```

Standalone privacy delete는 `SRC-06` 해결 전 별도 command를 확정하지 않는다.

## 8. Thread Content Transition

```text
lock thread
→ verify no in-flight turn
→ verify revision_before + from binding
→ validate target release/bundle/client compatibility
→ close active participants
→ open equivalent target-bundle participants
→ append transition ledger
→ update active binding/revision
→ outbox
→ commit
```

## 9. Chat Receive

```text
resolve subject/thread
→ lock thread
→ existing clientTurnId?
   yes: compare request_hash, return existing or conflict
→ ensure no in-flight turn
→ allocate user message sequence
→ insert turn(RECEIVED)
→ insert exactly one authoritative user message
→ commit
```

## 10. Chat Attempt / Commit

Prepare attempt:

```text
lock turn
→ state retry eligibility
→ allocate attempt_no
→ insert running attempt
→ commit
```

AI calls outside DB tx.

Finalize:

```text
lock thread → turn → attempt
→ verify attempt current/nonterminal
→ validate Output Guard result
→ allocate assistant/system message sequence(s)
→ insert committed message(s)
→ apply only source-approved governed side effects in deterministic order
→ set attempt committed + turn committed pointer/state
→ outbox when applicable
→ commit
```

Relationship Event candidate가 존재하더라도 authoritative score/stage mutation은 `SRC-22` 해결 전 이 transaction 안에서 임의 실행하지 않는다.

Character Unlock candidate/condition이 존재하더라도 authoritative unlock mutation은 `SRC-23` 해결 전 임의 실행하지 않는다. LLM/caller가 `character_id`, `unlock=true`, arbitrary condition result 또는 same-owner `source_world_event_id`를 보냈다는 사실은 eligibility proof가 아니다.

안전하게 compose할 수 없는 domain side effect는 validated proposal/outbox command candidate로 분리할 수 있으나, 그 candidate가 source-gap을 우회해 authority mutation을 수행해서는 안 된다.

## 11. Chat Retry / Abandon

Retry = same turn, new attempt. Abandon:

```text
lock turn
→ only failed_retryable/in-flight eligible state
→ ensure no running attempt
→ state=abandoned
→ release thread one-in-flight condition
→ commit
```

Committed turn abandon 금지.

## 12. Memory Proposal Resolution

```text
lock proposal
→ verify pending + owner + idempotency
→ accept:
   validate type schema
   create exactly one Life Fact OR Memory
   resolve grant snapshot
   set accepted pointer/status
→ session-only:
   no durable Life Fact/Memory
   `SRC-05` resolution policy for proposal payload
→ reject:
   no durable Life Fact/Memory
   `SRC-05` resolution policy for proposal payload
→ commit
```

## 13. Relationship Event Apply — skeleton only; executable command blocked by `SRC-22`

ERD/Use Case fixes this structural order:

```text
lock user_character_state
→ dedupe event
→ calculate source-approved versioned policy
→ append relationship_event(before=r, after=r+1)
→ update projection r+1
→ commit
```

This fixes **atomic ordering and revision lineage**, not the missing policy function.

`SRC-22` remains OPEN because source does not define:

```text
final Relationship Event allowlist
event payload schemas
score bounds
event → closeness/trust/friction delta mapping
internal stage keys / thresholds / transition graph
anti-farming windows/caps/cooldowns
last_interaction_at mutation semantics
active policy-version selection/migration
no-op/blocked-event ledger behavior
relationship policy content-hash/artifact persistence
```

Therefore neither:

```text
cmd_apply_relationship_event...
relationship policy transition evaluator
relationship anti-farming evaluator
```

may be promoted as production-authoritative merely because `relationship_events.delta_*` and `user_character_states` can represent the outputs.

Caller/LLM-supplied `delta_*` or next-stage values are not an acceptable replacement for the missing Relationship Engine policy authority.

Relationship-specific outbox publication is also not automatically inserted by this skeleton; where downstream publication is required, its event schema/dedupe contract must come from an independently source-approved outbox/domain contract.

## 14. Character Unlock Apply — relational projection exists; evaluator blocked by `SRC-23`

UC-14 gives a high-level product flow:

```text
Unlock condition satisfied
→ World Event
→ Hall silhouette state change
→ first appearance scene
→ CHARACTER_UNLOCKED event
```

ERD gives `world_events` and `character_unlocks` storage envelopes, but source does not provide the condition/effect function connecting them.

Therefore the following is only a **future transaction skeleton**, not a currently source-complete command:

```text
validate authoritative trigger/condition against pinned content semantics
→ lock character_unlocks(subject, character)
→ resolve duplicate/already-unlocked state under source-approved rule
→ validate/create causal World Event under source-approved event schema
→ update locked→unlocked projection + revision + unlocked_at + source_world_event_id
→ emit required first-appearance/reward/outbox effects under source-approved contract
→ commit
```

`SRC-23` must resolve at least:

```text
unlock condition positive schema/DSL
World Event registry/payload schema for unlock causality
condition → target character mapping
bundle/version pinning and migration
already-unlocked/replay/concurrency semantics
projection revision/no-op behavior
first-appearance/reward effect mapping
season/operator reveal authority
unlock-specific outbox/domain event contract
```

Until then:

- `cmd_unlock_character...` is not production-authoritative;
- same-subject `source_world_event_id` FK validity is insufficient eligibility proof;
- caller/LLM-supplied target/effect is not authority;
- stored current unlock projection may be read/rendered without enabling mutation.

Composition:

```text
relationship-stage trigger → SRC-22 + SRC-23
episode completion trigger → SRC-17 where completion evaluator is needed + SRC-23
Reading completion trigger  → authoritative Reading completion provenance + SRC-23
season/operator trigger     → source-approved operational authority + SRC-23
```

## 15. Episode Advance

```text
lock user_episode_progress
→ expected revision + dedupe
→ validate pinned bundle/node/choice
→ append progress event
→ update current projection
→ governed world/unlock side effects only when their independent source authorities are resolved
→ governed relationship side effects only when `SRC-22` relationship evaluator is resolved
→ outbox when applicable
→ commit
```

`SRC-17` 해결 전 scene graph/condition/choice evaluator가 필요한 실제 start/advance write authority는 final production command로 승격하지 않는다. Episode가 relationship state를 바꾸는 경우 그 side effect는 추가로 `SRC-22`가 필요하다. Episode reward가 concrete Character Unlock을 발생시키는 경우 추가로 `SRC-23`이 필요하다.

## 16. Reading Session / Clarification — persistence skeleton; public input blocked by `SRC-33`

Create session:

```text
lock/resolve immutable current source/target Birth revisions
→ capability/domain check
→ insert reading_session fixed revisions/domain
→ allocate reading attempt 1
→ insert pending reading request snapshot
→ commit
```

Clarification has an application-layer prerequisite **before** the DB transaction:

```text
exact prior ProductReadingResponse
+ incoming clarification body
→ validate under source-approved versioned Product/Clarification contract
→ prove question/answer correlation
→ canonicalize the accepted continuation
→ derive authoritative request snapshot/hash
```

That prerequisite is currently **`SRC-33 BLOCKED`**. Source does not yet define the complete positive `ProductReadingResponse` schema, `ClarificationAnswerV1` schema, correlation rules, canonicalization/hash semantics, contract-version compatibility, or validator failure contract.

Therefore the following transaction is a lower-level persistence/concurrency boundary only. It is executable only when a trusted application boundary has already supplied an authoritative validated canonical continuation:

```text
validated canonical clarification request snapshot/hash
→ lock reading_session
→ expectedCurrentReadingId
→ verify prior validated ProductResponse requires clarification
→ allocate next attempt_no
→ append new reading with parent=current
→ update current pointer as command policy defines
→ commit
```

`public.cmd_append_reading_clarification_v1(...)` does not validate arbitrary public answer JSON and must not be called directly from a merely syntactically valid client request. DB persistence skeleton ≠ public input validation authority.

Until `SRC-33` is resolved, `POST /api/reading-sessions/:sessionId/clarifications` remains fail-closed as a production public mutation surface. The relational clarification-chain, stale-current, idempotency, attempt allocation, parent linkage, and pointer invariants remain independently testable using an explicitly prevalidated canonical fixture.

A completed Reading may become a future Character Unlock trigger according to UC-14 examples, but Reading completion provenance alone does not authorize a specific character unlock before `SRC-23` defines the mapping/condition.

## 17. Saju Transport Retry / Finalize

Prepare transport attempt under `readings` lock. External Saju call outside transaction.

Finalize success:

```text
lock reading + execution attempt
→ validate public Product contract
→ verify engine/version/input hashes
→ insert immutable reading_ref
→ set committed execution pointer + succeeded lifecycle
→ optional grounding generation/finalization in governed follow-up
→ outbox
→ commit
```

The `validate public Product contract` step above is an application-layer semantic prerequisite, not a property implied by transport success or JSON persistence. Its complete positive contract is also `SRC-33 BLOCKED`.

Until `SRC-33` is resolved, transport execution-attempt lifecycle/provenance may be persisted and tested independently, but a provider/raw-engine response must not be promoted to a product-semantically validated `ProductReadingResponse` merely because the external call succeeded.

Clarification response가 transport success라도 consumer semantic completion과 동일하지 않다.

## 18. Grounding Finalize

```text
lock/read succeeded reading_ref
→ deterministic projection validation
→ preserve qualifiers/prohibited inference/ambiguity path
→ insert immutable grounding
→ commit
```

LLM semantic creation 없음.

## 19. Commerce Commands

### 19.1 Purchase Intent Create — source-complete baseline

```text
resolve active member subject
→ replay existing subject + idempotency key before current availability checks
→ validate selected product + offer availability for new intent
→ validate optional provider account link owner/provider/status
→ validate exact immutable minimal offer mapping snapshot
→ insert purchase_intent
→ commit
```

Purchase Intent create does **not** call a provider and does not create receipt/provider-event/entitlement rows.

### 19.2 Provider Source Provenance

Provider verification happens outside the DB transaction or at a dedicated provider boundary. Verified results may be persisted as source-defined receipt/provider-event provenance with dedupe and ownership constraints.

### 19.3 Purchase Source → Grant Target — blocked by `SRC-18`

Primary source does not define purchased `product_id` → `entitlement_key` / scope / grant-key semantics.

```text
verified purchase provenance
→ concrete purchase-derived grant target resolution = SRC-18
```

Pack must not insert an invented `ProductFulfillmentDefinition` or client-supplied scope authority.

### 19.4 Entitlement Event Apply / Aggregate Recompute — skeleton only; executable command blocked by `SRC-21`

ERD fixes this transaction skeleton:

```text
already-authoritative subject + grant target + source event
→ lock/upsert grant
→ reject stale provider order
→ append entitlement_event
→ update grant projection
→ recompute logical entitlement from ALL valid grants
→ outbox
→ commit
```

This fixes **atomic ordering**, not every field transition.

`SRC-21` remains open because source does not define:

```text
versioned payload schema per entitlement event type
granted/renewed/expired/revoked/restored/adjusted → grant field transition
provider_ordering_key/effective_at stale comparator
exact "valid grant" predicate using status/valid_from/valid_until
active_grant_count formula
effective_valid_until aggregation including unbounded grants
future valid_from behavior
aggregation as_of time
projection create/id/revision/no-op semantics
entitlement outbox event/dedupe contract
```

Therefore neither:

```text
cmd_apply_entitlement_event...
cmd_recompute_entitlement_projection...
```

may be promoted as production-authoritative merely because the relational schema can represent their outputs.

The existing commerce negative test that manually changes a grant and then manually writes `active_grant_count/effective_valid_until` is a schema representability test, not executable transition authority.

### 19.5 Blocker composition

Full purchase→access mutation requires all applicable layers:

```text
P0-CM-01 → provider/store rail semantics
SRC-18    → product → grant target mapping
SRC-21    → event → grant transition + grant aggregate projection
```

`SRC-07` 해결 전 manual provider-event resolution도 production deny다.

## 20. Notification Delivery Attempt

```text
lock delivery
→ verify notification/device eligible
→ allocate attempt_no
→ insert running attempt
→ status sending
→ commit

provider call

lock delivery + attempt
→ sent/failed terminal update
→ delivery projection update
→ commit
```

Ambiguous provider-send crash/retry semantics는 `NOTIFICATION_RETURN_LOOP_SPEC.md`의 transport rule을 따른다. Provider send는 DB exactly-once라고 주장하지 않는다.

## 21. Deletion Workflow

Account deletion first transaction:

```text
lock subject
→ status deletion_pending
→ revoke shares/devices
→ cancel scheduled notifications
→ block new AI/Saju/purchase capability
→ job running/outbox
→ commit
```

Destructive phases는 idempotent하고 dependency order를 따른다. Direct merged guest lineage를 canonical subject보다 먼저 또는 같은 governed deletion graph에서 처리한다. Finalization은 member subject를 `deleted`로 전환한 뒤 auth mapping 제거/`auth.users` deletion이 일어나도록 하여 `deletion_pending -> auth_user_id NULL` CHECK 위반을 만들지 않는다. Conversation-only deletion은 provenance tombstone/redaction baseline. Birth/Target standalone delete는 `SRC-06` resolution 필요.

## 22. Outbox Rule

Domain state와 downstream event 생성이 둘 다 필요한 source-approved command는 **같은 DB transaction에서 outbox row를 insert**한다.

현재 source-complete한 publisher-side boundary는 logical outbox dedupe, pending claim, expired `processing` lease reclaim, 그리고 successful completion까지다. Primary Source는 outbox failure/recovery test와 product-visible duplicate prevention을 요구하지만, publisher failure를 `failed`/`pending`/`dead_lettered` 중 어디로 어떻게 전이할지, retry eligibility/timing/backoff, `attempt_count` lifecycle, dead-letter threshold, manual replay/requeue, 또는 모든 downstream class에 공통인 dedupe protocol은 정의하지 않는다. 이 영역은 `SRC-30` 해결 전 production-authoritative policy로 승격하지 않는다.

Expired `processing` lease reclaim은 source-backed crash recovery boundary이지만, failed-event retry scheduling과 동일한 authority가 아니다. 또한 Notification Delivery attempt retry policy는 transactional outbox retry policy와 별도 domain boundary다.

Source가 Character Unlock 관련 downstream event/outbox schema를 아직 정의하지 않았으므로 `SRC-23` 해결 전 `CHARACTER_UNLOCKED` 명칭을 특정 outbox event contract로 임의 고정하지 않는다.

## 23. Verification

- reverse lock-order concurrency stress → no deadlock regression
- same idempotency key concurrency → one logical command where source defines command identity
- external timeout → no transaction held open
- DB commit after external response loss → retry returns existing state where retry contract is source-defined
- existing-Member Guest merge relational uniqueness/lineage/history-read invariants → testable now
- existing-Member merge conflict classification/resolution/domain action/retry-resume semantics → blocked until `SRC-24`
- chat commit + relationship score/stage mutation → blocked until `SRC-22`; after resolution both-or-neither atomicity required
- relationship event ledger/revision structural invariants → testable now
- relationship event→delta/stage/anti-farming correctness → blocked until `SRC-22`
- `character_unlocks` relational status/timestamp/owner/source-FK/current-read invariants → testable now
- Character Unlock condition→target/effect/replay/concurrency correctness → blocked until `SRC-23`
- episode advance with unlock → requires `SRC-17` + `SRC-23` and any other applicable authority before both-or-neither atomicity can be asserted
- Reading clarification lower-level append/current-pointer/idempotency/parent-link invariants → testable now with an explicitly prevalidated canonical fixture
- public clarification answer schema/correlation/canonicalization/application validation → blocked until `SRC-33`
- transport attempt persistence/provenance → independently testable; transport success alone cannot satisfy `ProductReadingResponse` semantic validation while `SRC-33` is open
- Purchase Intent same-key concurrency → one logical intent
- Purchase Intent replay does not depend on later offer availability
- purchase provenance → grant target remains blocked until `SRC-18`
- grant event apply / logical entitlement recompute remains blocked until `SRC-21`
- expired `effective_valid_until` current projection cannot authorize access after wall-clock expiry
- outbox logical enqueue/dedupe, pending claim, expired-processing lease reclaim, and successful completion → testable now
- publisher failure finalization/classification, retry scheduling/backoff/jitter, `attempt_count` mutation lifecycle, max attempts, dead-letter threshold/transition, manual replay/requeue, and error taxonomy → blocked until `SRC-30`
- downstream duplicate prevention remains a required outcome, but generic failed-event retry/dedupe execution semantics are not a PASS condition until `SRC-30` resolves the applicable authority
