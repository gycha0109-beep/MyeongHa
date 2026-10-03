# Se-yeon Production Chat Execution Core V1

> Status: IMPLEMENTATION / INTERNAL DARK RUNTIME  
> Watchtower-Track: character-memory  
> Public HTTP activation: HOLD — SRC-15 remains unresolved

## 1. Purpose

This slice connects the already-governed Se-yeon Production relationship and
context authorities to the existing Chat turn persistence state machine.

It does not create a new Chat state machine and does not make a new truth
authority.

The executable path is:

```text
server-minted existing-thread Chat receive plan
→ cmd_receive_seyeon_chat_turn_runtime_v1
→ authoritative current user message
→ cmd_allocate_seyeon_chat_attempt_runtime_v1
→ pre-turn Production relationship revision R
→ PHASE P historical Production context
→ append the current authoritative user message exactly once
→ cmd_mark_seyeon_chat_context_ready_runtime_v1
→ runSeyeonCharacterTurnV2
→ renderer provenance + generated staging
→ Output Guard provenance + validated staging
→ cmd_commit_seyeon_chat_turn_runtime_v1
→ authoritative committed assistant message
→ post-turn extractor candidate
→ Event Authority
→ PHASE O Production admission / relationship sync
→ R+n
→ next turn reads R+n
```

## 2. Absolute execution invariants

```text
USER CLAIM
!= CHARACTER FACT
!= RELATIONSHIP EVENT
!= RELATIONSHIP STATE
```

```text
LLM output != durable memory
LLM candidate != truth authority
stored != retrieved != mentioned
```

The following turn-order rule is mandatory:

```text
Turn A generates from relationship revision R.
Turn A may cause a post-commit relationship event.
That event may advance the relationship to R+n.
Turn A is never regenerated or reinterpreted from R+n.
Turn B may read R+n.
```

A generated answer that has not committed is not relationship provenance.

## 3. Current-user-message boundary

PHASE P intentionally returns historical recent dialogue and excludes the current
user message.

The governed Se-yeon runtime requires the current user message to be the final
recent message and to match `userMessageRef/userText` exactly.

Therefore this execution layer performs exactly one append:

```text
PHASE P historical recentMessages
+ exact persisted current user message
= Se-yeon Working Context recentMessages
```

If the current message id already appears in historical context, execution fails
closed instead of duplicating it.

## 4. Chat persistence authority

The implementation reuses the existing Chat core commands:

- `cmd_receive_chat_turn_v1`
- `cmd_allocate_chat_turn_attempt_v1`
- `cmd_mark_chat_turn_context_ready_v1`
- `cmd_mark_chat_turn_generated_v1`
- `cmd_validate_chat_turn_attempt_v1`
- `cmd_commit_chat_turn_v1`

Migration
`1460_seyeon_production_chat_execution_runtime_v1.sql`
adds only narrow Production wrappers for the Se-yeon single-character path.

Ordinary API execution receives EXECUTE on those wrappers only. It does not gain
direct Chat table DML through this slice.

The wrapper owner is:

```text
myeongha_seyeon_chat_runtime_owner
NOLOGIN
NOBYPASSRLS
```

Every wrapper re-enters the canonical transaction-local Subject authority and the
thread helper requires:

```text
owned thread
active
single_character
exactly one active participant
primary Character = seyeon
participant bundle = pinned thread bundle
exact pinned release/bundle
```

## 5. AI execution provenance

The existing generated and validated Chat commands require exact AI provenance.

The Production wrappers append narrow redacted execution rows for:

```text
renderer
output_guard
```

and bind them to the exact:

```text
subject
turn
attempt
content release
content bundle
character = seyeon
generated content hash
```

No raw secrets or full prompt payloads are persisted by this slice.

The plain Character-chat execution V1 has no Reading grounding rows, so its
grounding set is exactly `[]`. This does not alter the separate Reading/Saju
grounding contracts.

## 6. Commit boundary

`cmd_commit_seyeon_chat_turn_runtime_v1` always delegates with:

```text
relationship effect = NULL
world event = NULL
memory accept = NULL
```

The retired legacy caller-provided relationship mutation path remains retired.

Relationship mutation is separate:

```text
assistant commit succeeds
→ exact committed message id exists
→ post-turn extraction
→ Event Authority
→ Production relationship admission
→ governed relationship apply/sync
```

If assistant commit does not succeed, this execution does not emit a
post-commit relationship signal.

Before assistant commit, any execution error closes the active attempt through the
narrow failure wrapper as:

```text
turn/attempt → failed_retryable
error_code = SEYEON_PRODUCTION_EXECUTION_FAILED
assistant message = none
relationship signal = none
```

This is an operational retry disposition for the internal execution slice. It does
not grant the model authority to choose retry/final state or error codes.

## 7. Transaction boundary

Provider execution must not occur while a PostgreSQL transaction is kept open.

The application persistence port is intentionally command-scoped so Production
callers can execute short subject transactions around each persistence step:

```text
Tx A receive
Tx B allocate
Tx C relationship/context reads
Tx D context-ready
--- no DB transaction while model execution is awaited ---
Tx E generated provenance/staging
Tx F validated provenance/staging
Tx G assistant commit
Tx H relationship sync
```

A caller must not wrap the complete model execution in one
`executePostgresSubjectTransactionV1` callback.

## 8. Public activation boundary

This slice is not a browser-facing Chat send activation.

SRC-15 still does not define the full authoritative client capability / asset /
cue compatibility verdict and fallback algorithm.

Therefore:

```text
internal Production-quality execution core = allowed
browser/public Chat send activation = HOLD
```

No endpoint is added by this slice.

## 9. Non-goals

This slice does not implement:

- Guest thread creation/open policy
- multi-character Chat execution
- first-meeting automatic World/Relationship side effects
- Memory or Life Fact auto-save
- SRC-25 personal-record type/schema registry
- vector retrieval
- provider/vendor/model selection policy
- new retry/backoff/dead-letter policy
- S4_SPECIAL romance/confession semantics
- public Web Chat transport

## 10. Verification

Required regressions include:

- current user message appended exactly once;
- current message already present in historical context fails closed;
- another Character or multi-participant thread fails closed;
- forged release/bundle fails closed;
- renderer and Output Guard provenance bind to the exact turn/attempt;
- only validated output can commit;
- one user + one assistant message after commit;
- same receive idempotency key does not duplicate committed messages;
- direct authenticated runtime wrapper calls fail;
- the narrow runtime owner stays NOLOGIN/NOBYPASSRLS;
- legacy relationship/world/memory commit payloads remain NULL;
- all existing Watchtower/DB/Web/Governance gates remain green.

## 11. Rollback

Rollback is caller-level and additive:

```text
stop calling the new Se-yeon Production Chat execution core
→ PHASE O relationship authority remains intact
→ PHASE P context authority remains intact
→ existing Chat read/open surfaces remain intact
```

No durable relationship or Chat history needs to be rewritten.
