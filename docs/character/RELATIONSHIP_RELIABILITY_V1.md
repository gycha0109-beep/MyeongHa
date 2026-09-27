# Relationship Reliability V1

> Track: character-memory  
> Phase: **N — Concurrency / Retry / Correction / Replay / Snapshot / Recovery**  
> Runtime Se-yeon binding: **DISABLED**  
> Upstream: Production Relationship Policy V1 + PHASE L persistence + PHASE M atomic Event apply

## 1. Purpose

PHASE N hardens the PHASE M Production write path against the failure modes that appear after a single atomic Event apply exists:

- concurrent writes against one Subject-Character relationship;
- response-loss retry and stale revision retry;
- append-only correction/retraction;
- deterministic replay after historical authority changes;
- projection/history drift;
- immutable snapshot creation and semantic invalidation.

The authority hierarchy remains:

~~~text
append-only persisted relationship history
> deterministic Production V1 replay
> mutable current projection
> immutable snapshot cache
~~~

Snapshots and projections never become truth authority.

## 2. Concurrency and retry

The serialization key remains one Subject-Character relationship.

PHASE M row locks serialize physical writes. PHASE N adds a bounded application retry wrapper:

~~~text
attempt 1
  caller expectedRevision

STALE / serialization conflict only
→ new PostgreSQL Subject transaction
→ reload locked current revision
→ replay + reevaluate same authorized Event
→ retry

max attempts = 3
~~~

Automatic retry is forbidden for:

- idempotency conflict;
- invalid source authority;
- invalid Event;
- policy mismatch;
- causal-history failure.

The Event semantic material and dedupe key do not change across stale retry. Only the relationship context and therefore the deterministic policy result may change.

## 3. Adjustment batch

Corrections and retractions are modeled as new physical history entries.

~~~text
record Event A
record Event B
correct A -> A2
retract B
~~~

No historical Event row is UPDATEd or DELETEd.

A governed adjustment batch is simulated in memory first:

~~~text
current persisted history
→ append requested correction/retraction records in order
→ replay after each operation
→ reject causal orphan / invalid replacement before DB persistence
→ derive final canonical projection
~~~

Only after the entire batch is valid are adjustment rows appended inside the same outer PostgreSQL transaction.

### Physical revision

Every correction/retraction consumes exactly one physical revision.

The current projection revision is intentionally left at the batch base revision while the batch history rows are appended. The final replay projection is committed once, after all operations succeed. No intermediate state is visible outside the transaction.

### Active-target rule

The DB independently requires an adjustment target to be an Event that has not already been the target of a prior correction/retraction.

A corrected/retracted historical Event cannot be adjusted again. A correction replacement Event may itself become the target of a later governed adjustment.

## 4. Correction replacement Event

A correction replacement is still a normal authorized Production Relationship Event.

It must pass:

- Production Event schema/registry;
- same Subject + Character boundary;
- canonical source/provenance validation;
- causal predecessor validation;
- frozen Production V1 policy binding.

The replacement Event's historical effect row is derived from deterministic replay at the correction point.

## 5. Causal batch ordering

A retraction that would orphan an active causal descendant fails before persistence.

For a causal pair:

~~~text
COMMITMENT_MADE A
COMMITMENT_KEPT B -> A
~~~

this is invalid:

~~~text
retract A
~~~

while B remains active.

A single atomic batch can remove the dependency safely by ordering dependents first:

~~~text
retract B
retract A
~~~

The full transaction either commits all adjustment history + the final projection or rolls everything back.

## 6. Adjustment idempotency

Each adjustment operation has a unique history dedupe key.

On retry:

~~~text
all requested dedupe keys exist
+ target/reason/authority/replacement semantic material matches
→ replayed=true
→ no new history revision

some exist / some missing
or same dedupe differs semantically
→ IDEMPOTENCY_CONFLICT
~~~

This prevents partial-batch ambiguity from being silently repaired.

## 7. Projection verification and recovery

Normal runtime continues to fail closed when the stored projection differs from deterministic replay.

PHASE N adds an explicit recovery flow:

~~~text
VERIFY
→ lock existing Production relationship
→ replay persisted history
→ compare scores/stage/condition/policy-state/revision
→ no DB mutation

REBUILD
→ explicit authorityRef + reason
→ same physical history revision required
→ replace only derived current projection
→ no new relationship history entry
~~~

A rebuild is an operational recovery action, not a relationship occurrence.

It may reduce attainedStage when deterministic replay after correction/retraction supports a lower depth. Ordinary Event apply still cannot regress attained depth.

## 8. Snapshots

Snapshot rows remain immutable.

A snapshot contains:

- through revision;
- policy version/hash;
- deterministic projection;
- compact policy state;
- snapshot hash;
- authoritative source-history fingerprint.

The application verifies:

~~~text
snapshot hash
AND history-prefix fingerprint
AND deterministic prefix replay
AND stored snapshot projection/policy-state
~~~

before accepting a snapshot as valid derived material.

### Semantic invalidation

A snapshot is not UPDATEd to stale.

The latest-snapshot selector excludes a snapshot when a later correction/retraction targets an Event whose original physical revision is at or before the snapshot's through revision.

Thus:

~~~text
snapshot rev 100
later correction at rev 120 targets Event recorded at rev 40
→ snapshot rev 100 is no longer eligible
~~~

The snapshot row remains immutable for forensic/replay evidence.

### Runtime replay use

PHASE N establishes snapshot creation, selection, cryptographic verification and invalidation. Full persisted-history replay remains the current truth path. Snapshot-based replay acceleration must not replace full replay until an independently verified continuation evaluator is introduced.

## 9. PostgreSQL authority

The existing NOLOGIN/NOBYPASSRLS role remains the narrow DB owner:

~~~text
myeongha_relationship_apply_owner
~~~

PHASE N grants it only the additional privileges required for:

- append-only adjustment INSERT;
- immutable snapshot INSERT/select;
- current projection rebuild/update.

The ordinary API executor still has no direct relationship-table DML.

All exposed PHASE N SQL surfaces are SECURITY DEFINER and require the transaction-local canonical Subject context.

## 10. Reliability tests

PHASE N adds coverage for:

- correction replay changing anti-farming credit allocation;
- causal-orphan retraction rejection;
- multi-retraction dependency-safe batch;
- adjustment retry replay;
- projection drift detection and rebuild;
- snapshot hash/fingerprint/prefix replay verification;
- immutable snapshot semantic invalidation after later historical adjustment;
- stale concurrent Event serialization;
- active-adjustment-target DB enforcement;
- no physical revision consumption during projection rebuild.

## 11. Explicit non-goals

PHASE N does not add:

- HTTP relationship mutation endpoints;
- LLM-selected relationship deltas/stages;
- Se-yeon experimental Event -> Production DB binding;
- runtime manifest activation;
- snapshot-as-truth behavior;
- automatic correction/retraction generation;
- silent projection auto-repair.

## 12. Next phase

After all PHASE N gates are green, PHASE O may connect the governed Se-yeon runtime:

~~~text
Se-yeon governed dialogue/runtime
→ authorized generic Production Relationship Event
→ PHASE M/N apply + reliability path
→ committed relationship projection
→ next-turn relationship behavior overlay
~~~

The Production relationship writer remains generic; Se-yeon-specific semantics stay outside the persistence authority.
