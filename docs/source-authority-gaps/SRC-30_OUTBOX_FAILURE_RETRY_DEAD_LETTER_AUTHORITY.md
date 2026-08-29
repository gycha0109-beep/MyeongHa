# SRC-30 — Outbox Failure / Retry / Dead-Letter Authority

> Status: **OPEN / BLOCKING for production-authoritative outbox failure, retry scheduling, and dead-letter transitions**  
> Domain: Transactional Outbox / Async Side Effects / Recovery  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`
> - repository `SERVER_COMMAND_TRANSACTION_SPEC.md`
> - repository `RELEASE_OBSERVABILITY_SPEC.md`
> - existing `0670_outbox_claim_command.sql`
> - existing `0700_outbox_success_completion_command.sql`
>
> This gap does **not** block source-backed enqueue, claim/reclaim, or successful-publication completion boundaries that are already implemented and tested.

---

## 1. Gap

Primary Source defines a transactional outbox persistence model and requires recovery testing, but it does not define the executable policy that converts a publisher failure into retry scheduling or a terminal dead-letter state.

ERD v0.6 defines `outbox_events` with:

```text
status = pending | processing | processed | failed | dead_lettered
attempt_count >= 0
available_at
last_error_code
dead_lettered_at
lock_owner / lease_expires_at
processed_at
```

and requires:

```text
status='processing'   -> lease_expires_at IS NOT NULL AND lock_owner IS NOT NULL
status='processed'    -> processed_at IS NOT NULL
status='dead_lettered'-> dead_lettered_at IS NOT NULL
expired processing lease -> reclaim
same aggregate/event/dedupe retry -> one row
```

Use Case §21.6 requires:

```text
Domain Transaction
→ state commit + outbox_event
→ async publisher
→ Push / Analytics / downstream event
```

and §22.7 explicitly requires an `outbox retry` failure/recovery test with no duplicate user-visible/domain side effects.

Those statements prove that failure recovery must exist. They do **not** choose the concrete failure-transition algorithm.

Missing executable authority is therefore recorded as `SRC-30`.

## 2. Source-complete boundaries remain available

`SRC-30` does not invalidate the outbox boundaries already supported by Primary Source.

### Domain transaction enqueue

A source-backed domain command may continue to insert exactly one outbox row inside the same transaction when that command's event semantics are otherwise defined.

The existing uniqueness boundary:

```text
UNIQUE(aggregate_type, aggregate_id, event_type, dedupe_key)
```

continues to prevent duplicate logical outbox rows for the same aggregate-local event identity.

`SRC-30` concerns what happens **after a claimed publisher attempt fails**, not whether the domain transaction may enqueue its source-backed event.

### Claim / expired-lease reclaim

Existing:

```text
cmd_claim_outbox_event_v1
```

may remain at its current source-backed boundary:

```text
pending + available_at <= now
→ processing + worker lease

processing + expired lease
→ processing + new worker lease
```

The ERD explicitly requires expired processing leases to be reclaimable. No failure/backoff policy is needed to implement that narrow lease boundary.

### Successful publication completion

Existing:

```text
cmd_complete_outbox_event_v1
```

may remain at its current source-backed boundary:

```text
processing
+ matching lock owner
+ unexpired lease
→ processed + processed_at
```

The ERD explicitly defines the processed-state timestamp invariant. A successful completion command does not need to infer failure taxonomy or retry policy.

## 3. `failed` is a stored state, not a complete retry contract

The ERD includes `status='failed'`, but Primary Source does not define what the state means operationally.

Missing authority includes:

```text
whether every publisher failure first enters failed
whether retryable failures return directly to pending instead
whether failed rows are themselves claimable
whether failed is transient, observational, or terminal-but-not-dead-letter
whether failed rows retain the processing lease fields
whether failed rows clear lock_owner / lease_expires_at
whether failed rows require last_error_code
whether failed_at timestamp is required even though no column currently exists
```

Therefore implementation must not infer a state machine such as:

```text
processing -> failed -> pending -> processing
```

or:

```text
processing -> pending(with backoff)
```

solely from the list of allowed stored statuses.

## 4. Retryable vs final failure classification is missing

Primary Source does not define which publisher errors are retryable.

The following classifications must not be invented in Pack/code:

```text
network timeout -> retry
HTTP 429 -> retry
HTTP 5xx -> retry
HTTP 4xx -> final
provider invalid token -> final
schema rejection -> dead letter
unknown error -> retry N times
```

Some downstream domains may eventually have their own provider-specific semantics, but `outbox_events.last_error_code` alone does not define a generic cross-domain classification registry.

The outbox may carry Push, Analytics, or other downstream event types. A single generic classifier cannot be assumed source-authoritative without an explicit policy.

## 5. `attempt_count` increment semantics are missing

ERD requires only:

```text
attempt_count integer NOT NULL default 0
attempt_count >= 0
```

It does not define when an attempt is counted.

Unresolved choices include:

```text
increment when a row is claimed
increment immediately before external I/O
increment only after an external call was actually made
increment when failure is persisted
increment on expired-lease reclaim
increment on successful publication
whether the initial claim is attempt 0 or attempt 1
```

This matters for concurrency and dead-letter thresholds. A stale worker crash between claim and external I/O can produce a different count depending on the chosen boundary.

Do not add `attempt_count = attempt_count + 1` to claim, success, or failure commands until source defines the counting point.

## 6. Retry delay / backoff authority is missing

ERD provides `available_at`, and the claim command correctly respects it for `pending` rows.

However Source does not define how a failed attempt computes the next `available_at`.

Missing policy includes:

```text
fixed delay vs exponential backoff
base delay
multiplier
maximum delay
jitter
provider Retry-After precedence
per-event-type overrides
per-error-code overrides
clock source / rounding
whether retry scheduling is persisted as pending or failed
```

`available_at` is a storage capability. It is not a source-defined backoff formula.

## 7. Dead-letter threshold and transition authority are missing

ERD defines:

```text
status='dead_lettered' -> dead_lettered_at IS NOT NULL
```

but does not define when a row becomes dead-lettered.

Missing authority includes:

```text
maximum attempt count
whether some errors dead-letter immediately
whether threshold is global or event-type specific
whether age/TTL can dead-letter independently of attempts
whether repeated lease expiry counts toward the threshold
whether last_error_code is mandatory on dead-letter
whether dead-letter transition clears lease fields
whether processed_at must remain null
whether a failed row may be manually dead-lettered by operations
```

Therefore a command such as:

```text
if attempt_count >= 5 then dead_lettered else pending
```

would be invented authority.

## 8. Failure finalization ownership / lease semantics are missing

A publisher failure command would need a concurrency contract comparable to successful completion.

Source does not yet specify:

```text
must failure finalization match lock_owner?
must the lease still be unexpired?
may a worker persist a failure after its lease expired?
what if another worker already reclaimed the row?
can response-loss replay of failure finalization be read-only/idempotent?
what identity proves that the same external attempt is being replayed?
```

Allowing an expired/stale worker to mutate retry state can race with a valid reclaimer. Rejecting it may lose provider failure provenance. The correct boundary must be source-selected.

Existing `cmd_complete_outbox_event_v1` resolves this only for successful publication and must not be generalized automatically to failures.

## 9. Error provenance is incomplete

ERD includes one mutable field:

```text
last_error_code
```

It does not define a separate immutable outbox-attempt ledger.

Missing authority includes:

```text
canonical error-code namespace
provider/raw error retention policy
whether only the latest error is retained
whether every retry attempt requires immutable provenance
whether sensitive provider payloads are forbidden from storage
whether error detail belongs in telemetry only
whether last_error_code is cleared after success
```

Until source resolves this, do not invent an `outbox_attempts` table or encode raw provider error blobs into `payload_jsonb`/`last_error_code`.

## 10. Manual replay / dead-letter recovery is missing

Primary Source does not define an operator command for:

```text
dead_lettered -> pending
failed -> pending
reset attempt_count
replace available_at
replace payload
change event schema version
```

It also does not define whether dead-letter rows are immutable historical evidence or resumable work items.

Operational convenience is not sufficient authority for a replay endpoint or SQL command.

Do not implement a manual retry/requeue command until source defines:

- allowed source states;
- whether logical event identity/dedupe remains the same;
- whether payload/version may change;
- audit actor/reason requirements;
- concurrency/CAS semantics;
- attempt-count treatment;
- relationship to downstream duplicate prevention.

## 11. Batch discovery / ordering remains intentionally separate

Existing claim is ID-directed. Primary Source does not define authoritative batch polling/discovery order.

Missing policy includes:

```text
ORDER BY available_at, created_at, id ?
priority classes?
aggregate serialization?
per-event-type concurrency limits?
SKIP LOCKED batch size?
fairness between old retries and new events?
```

`SRC-30` records this only where it affects retry/failure execution. It does not imply that a batch worker query must be added now.

## 12. Relationship to downstream exactly-once behavior

Transactional outbox reduces DB-commit/external-side-effect gaps, but Primary Source does not grant generic exactly-once delivery semantics for every downstream provider.

A crash can occur after the external side effect succeeds but before `cmd_complete_outbox_event_v1` commits. The expired lease may then be reclaimed and publication retried.

Source requires duplicate prevention at the product behavior level, but it does not define one generic downstream dedupe protocol for all event types.

Therefore `SRC-30` must not be resolved merely by choosing a backoff formula. Resolution also needs the retry/duplicate boundary for each enabled downstream class, or an explicitly source-authorized generic contract.

## 13. Existing implementation already fails closed correctly

`0670_outbox_claim_command.sql` explicitly excludes:

```text
failed-event retry/backoff
attempt_count increment point
processed/failure finalization
dead-letter threshold/policy
batch discovery/ordering
```

`0700_outbox_success_completion_command.sql` explicitly covers only successful publication and excludes:

```text
failed-event retry/backoff
attempt_count increment
failure transition
dead-letter threshold/policy
```

Those exclusions are not implementation debt to fill by convention. They are the correct fail-closed boundary until Primary Source resolves `SRC-30`.

## 14. Affected surfaces

Blocked as production-authoritative behavior by `SRC-30`:

```text
cmd_fail_outbox_event(...)
cmd_retry_outbox_event(...)
cmd_dead_letter_outbox_event(...)
cmd_requeue_dead_letter_outbox_event(...)
generic retry/backoff worker policy
generic retryable/final error classifier
automatic attempt_count increment semantics
automatic dead-letter threshold
manual dead-letter replay endpoint/runbook that mutates rows
```

Not blocked:

```text
source-backed domain transaction -> insert outbox event
outbox logical dedupe uniqueness
cmd_claim_outbox_event_v1 for pending / expired processing lease
cmd_complete_outbox_event_v1 for successful publication
read-only operational observation of stored outbox state
telemetry that reports backlog/lease/retry signals without pretending a missing policy is defined
```

## 15. Pack / implementation must NOT invent

Until `SRC-30` is resolved, do not:

- classify generic HTTP/provider error codes into retry/final buckets by convention;
- increment `attempt_count` at an arbitrary lifecycle point;
- choose exponential/fixed backoff constants;
- apply jitter by convention;
- infer a dead-letter threshold from common practice;
- make `failed` rows claimable without an approved transition contract;
- silently convert all failures back to `pending`;
- allow stale workers to persist failure after lease loss without source authority;
- clear or preserve lock fields on failure by convention;
- add an immutable attempt ledger because `last_error_code` appears insufficient;
- create a manual replay/requeue path for dead-lettered events;
- claim exactly-once downstream delivery where only outbox dedupe is guaranteed;
- treat the presence of `failed`, `dead_lettered`, `attempt_count`, and `available_at` columns as proof that their mutation algorithm is already defined.

## 16. Required source resolution

At minimum Primary Source should define:

1. canonical outbox lifecycle transitions after an external publication failure;
2. the exact meaning of `failed` versus `pending` and `dead_lettered`;
3. retryable/final classification authority, including whether it is generic or event-type/provider specific;
4. the precise `attempt_count` increment boundary;
5. retry schedule/backoff calculation and any jitter/Retry-After precedence;
6. dead-letter threshold/TTL/immediate-final rules;
7. failure-finalization lock-owner and lease requirements;
8. stale-worker and concurrent-reclaim behavior;
9. replay/idempotency semantics for failure-finalization response loss;
10. required error provenance and `last_error_code` normalization;
11. whether an immutable attempt ledger is required or forbidden;
12. manual replay/requeue semantics, if supported;
13. payload/version immutability during replay;
14. downstream duplicate-prevention requirements for enabled event classes;
15. batch discovery/ordering authority if a generic worker query is required.

## 17. Verification after resolution

At minimum tests should prove:

- a successful claim can be failed only by the approved worker/lease boundary;
- stale or superseded workers cannot overwrite a reclaimed row;
- `attempt_count` increments exactly once at the approved point;
- retryable failures compute exactly the approved next `available_at`;
- final failures become dead-lettered exactly at the approved threshold/rule;
- dead-letter invariant always sets `dead_lettered_at`;
- retry/failure replay cannot double-increment attempts or reschedule twice;
- concurrent failure/reclaim/complete races have one authoritative outcome;
- processed events cannot re-enter retry through the failure command;
- dead-letter replay, if allowed, follows an explicit audit/concurrency contract;
- provider/downstream retries do not create duplicate product-visible side effects under the approved dedupe contract;
- existing claim/reclaim and successful-completion tests remain green;
- deterministic DB catalog changes, if new DB objects are introduced, are explicitly pinned and reviewed.
