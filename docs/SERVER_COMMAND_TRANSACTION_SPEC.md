# 명하 Server Command / Transaction Specification v0.5

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.5**  
> Date: **2026-08-28**  
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
→ DB mutations + outbox
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
   - user_episode_progress
   - entitlement_grant
   - notification_delivery
3. logical attempt/current pointer row
4. child ledger/provenance rows
5. outbox rows
```

같은 class 여러 row는 stable primary key 정렬 순으로 lock한다.

문서별 command가 이 순서를 뒤집어 deadlock을 만들면 안 된다. 예외 lock order가 필요하면 command별로 명시하고 concurrency test를 추가한다.

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

## 6. Existing-Member Guest Merge

```text
verify both identities
→ require canonical member target status=active (deletion_pending target deny)
→ lock guest_session
→ get/create one merge_job by idempotency
→ detect conflicts
→ if resolution required: stop awaiting_resolution
→ for resolved command, apply domain merge actions deterministically
→ mark guest subject merged→direct member
→ consume session
→ commit
```

Historical immutable ledger `subject_id` UPDATE 금지.

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
→ apply approved relationship/world/memory side effects through their governed command semantics in deterministic order
→ set attempt committed + turn committed pointer/state
→ outbox
→ commit
```

If domain side effect cannot be safely composed in one transaction, store a validated proposal/outbox command rather than partially commit hidden state.

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

## 13. Relationship Event Apply

```text
lock user_character_state
→ dedupe existing event
→ validate event registry/source/policy
→ deterministic delta/stage
→ append event(before r, after r+1)
→ update projection revision
→ outbox
→ commit
```

## 14. Episode Advance

```text
lock user_episode_progress
→ expected revision + dedupe
→ validate pinned bundle/node/choice
→ append progress event
→ update current projection
→ governed relationship/world/unlock side effects
→ outbox
→ commit
```

`SRC-17` 해결 전 scene graph/condition/choice evaluator가 필요한 실제 start/advance write authority는 final production command로 승격하지 않는다.

## 15. Reading Session / Clarification

Create session:

```text
lock/resolve immutable current source/target Birth revisions
→ capability/domain check
→ insert reading_session fixed revisions/domain
→ allocate reading attempt 1
→ insert pending reading request snapshot
→ commit
```

Clarification:

```text
lock reading_session
→ expectedCurrentReadingId
→ validate prior ProductResponse requires clarification
→ allocate next attempt_no
→ append new reading with parent=current
→ update current pointer as command policy defines
→ commit
```

## 16. Saju Transport Retry / Finalize

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

Clarification response가 transport success라도 consumer semantic completion과 동일하지 않다.

## 17. Grounding Finalize

```text
lock/read succeeded reading_ref
→ deterministic projection validation
→ preserve qualifiers/prohibited inference/ambiguity path
→ insert immutable grounding
→ commit
```

LLM semantic creation 없음.

## 18. Commerce Commands

### 18.1 Purchase Intent Create — source-complete baseline

```text
resolve active member subject
→ replay existing subject + idempotency key before current availability checks
→ validate selected product + offer availability for new intent
→ validate optional provider account link owner/provider/status
→ validate exact immutable minimal offer mapping snapshot
→ insert purchase_intent
→ commit
```

Purchase Intent create does **not** call a provider and does not create receipt/provider event/entitlement rows.

### 18.2 Provider Source Provenance

Provider verification happens outside the DB transaction or at a dedicated provider boundary. Verified results may be persisted as source-defined receipt/provider-event provenance with dedupe and ownership constraints.

### 18.3 Purchase Source → Grant Target — blocked by `SRC-18`

Primary source does not define purchased `product_id` → `entitlement_key` / scope / grant-key semantics.

```text
verified purchase provenance
→ concrete purchase-derived grant target resolution = SRC-18
```

Pack must not insert an invented `ProductFulfillmentDefinition` or client-supplied scope authority.

### 18.4 Entitlement Event Apply / Aggregate Recompute — skeleton only; executable command blocked by `SRC-21`

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

### 18.5 Blocker composition

Full purchase→access mutation requires all applicable layers:

```text
P0-CM-01 → provider/store rail semantics
SRC-18    → product → grant target mapping
SRC-21    → event → grant transition + grant aggregate projection
```

`SRC-07` 해결 전 manual provider-event resolution도 production deny다.

## 19. Notification Delivery Attempt

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

## 20. Deletion Workflow

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

## 21. Outbox Rule

Domain state와 downstream event 생성이 둘 다 필요한 command는 **같은 DB transaction에서 outbox row를 insert**한다.

Publisher는 at-least-once로 동작할 수 있으므로 consumer가 event dedupe를 구현한다.

## 22. Verification

- reverse lock-order concurrency stress → no deadlock regression
- same idempotency key concurrency → one logical command
- external timeout → no transaction held open
- DB commit after external response loss → retry returns existing state
- chat commit with relationship event → both or neither
- episode advance with unlock → both or neither after `SRC-17` resolution
- Purchase Intent same-key concurrency → one logical intent
- Purchase Intent replay does not depend on later offer availability
- purchase provenance → grant target remains blocked until `SRC-18`
- grant event apply / logical entitlement recompute remains blocked until `SRC-21`
- expired `effective_valid_until` current projection cannot authorize access after wall-clock expiry
- outbox publisher retry → domain state not duplicated
