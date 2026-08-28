# SRC-21 — Entitlement Grant Event Apply / Aggregate Projection Authority

> Status: **OPEN / BLOCKING for authoritative grant-event apply and logical entitlement recompute**  
> Domain: Commerce / Entitlement  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`

---

## 1. Gap

ERD v0.6 defines the Entitlement ledger/projection schema and an atomic transaction **skeleton**:

```text
verified receipt/provider event
→ resolve subject + grant_key
→ lock/upsert grant
→ reject stale provider order
→ append entitlement_event
→ update grant projection
→ recompute logical entitlement from ALL valid grants
→ outbox
```

It does not define enough deterministic transition/aggregation semantics to implement that skeleton as a production-authoritative command.

This gap is independent of `SRC-18`.

```text
SRC-18
→ purchased product → entitlement_key / scope / grant_key mapping

SRC-21
→ given an already-authoritative grant target/event, how the event mutates the grant and how all grants aggregate into `entitlements`
```

Resolving one does not resolve the other.

## 2. What source authority already fixes

### 2.1 Grant projection shape

`entitlement_grants` is the current projection of one independent source instance:

```text
subject_id
entitlement_key
scope_key / scope_key_norm
grant_key
grant_source_type
status                  # active | expired | revoked
valid_from
valid_until
revision
last_effective_at
last_provider_ordering_key
created_at / updated_at
```

Source explicitly states:

- multiple independent active grants may contribute to one logical entitlement;
- revoking one grant must not remove access while another valid grant remains;
- time-based authorization must evaluate expiry so stale sweeper state cannot extend access.

### 2.2 Event ledger shape

`entitlement_events` is append-only and defines:

```text
event_type
  granted | renewed | expired | revoked | restored | adjusted

source_type
  receipt | provider_event | system | admin

event_dedupe_key
effective_at
provider_ordering_key
validated/minimized payload
```

The event must match the target grant owner/key/scope, and verified receipt/provider-event provenance is enforced relationally.

### 2.3 Logical entitlement projection shape

`entitlements` defines:

```text
subject_id
entitlement_key
scope_key / scope_key_norm
status                  # active | inactive
active_grant_count
effective_valid_until
revision
created_at / updated_at
```

with shape invariants:

```text
status='active'   → active_grant_count > 0
status='inactive' → active_grant_count = 0
```

Source also fixes the access fail-closed rule:

```text
status='active'
AND (effective_valid_until IS NULL OR effective_valid_until > now())
```

### 2.4 Atomicity/order skeleton

Source fixes the order at a structural level:

```text
lock grant
→ stale-order rejection
→ append event
→ update grant projection
→ recompute logical entitlement from all valid grants
→ outbox
→ commit
```

This is sufficient to constrain future implementation, but not to determine all resulting values.

## 3. Missing grant-event transition authority

The source enumerates event types but does not define the exact transition function from each event to grant projection fields.

Missing decisions include:

### 3.1 Event type → status/validity transition

For each of:

```text
granted
renewed
expired
revoked
restored
adjusted
```

source does not define the complete deterministic mutation of:

```text
status
valid_from
valid_until
revision
last_effective_at
last_provider_ordering_key
```

Examples that cannot be safely inferred:

- whether `renewed` replaces or extends `valid_until`;
- whether `restored` may move `revoked`/`expired` back to `active` and under which provenance;
- which fields `adjusted` may change;
- whether an `expired` event may be applied before wall-clock `valid_until`;
- whether `revoked` preserves or rewrites `valid_until`;
- whether a no-op duplicate semantic transition increments revision.

### 3.2 Event payload schemas

`payload_jsonb` is described only as validated/minimized. Source does not define versioned payload schemas for event types, including which values are authoritative inputs versus derived projection outputs.

Without this, an apply command cannot validate `renewed`/`adjusted`/`restored` semantics deterministically.

### 3.3 Stale provider ordering comparator

Source says out-of-order provider events are ordered by a provider-specific effective/order policy at grant apply time.

It does not define:

```text
ordering-key grammar/comparator
whether effective_at participates before/after provider_ordering_key
behavior when provider_ordering_key is NULL
same-order-key tie handling
cross-source receipt vs provider-event precedence
```

Provider-specific rail policy is also related to `P0-CM-01`; the database must not guess lexical or timestamp ordering.

## 4. Missing logical entitlement aggregation authority

The phrase `ALL valid grants` is not reduced to an executable formula.

### 4.1 Definition of a valid contributing grant

`entitlement_grants` includes both `status` and time bounds, including `valid_from`, but source does not explicitly define the aggregation predicate.

A production recompute needs a rule equivalent to one of the possible forms, for example:

```text
status='active'
AND valid_from <= as_of
AND (valid_until IS NULL OR valid_until > as_of)
```

or a different source-approved rule.

The source cannot be silently interpreted as `status='active'` only, because that could count a future `valid_from` grant or a stale active row whose `valid_until` already passed.

### 4.2 `effective_valid_until` aggregation

When multiple contributing grants exist, source does not define how `effective_valid_until` is calculated.

Examples requiring explicit authority:

```text
finite 7d + finite 30d
finite grant + unbounded grant(valid_until NULL)
multiple future/overlapping intervals
stale active grant whose valid_until already passed
```

The intuitive union rule (`MAX(finite valid_until)`, or NULL if any unbounded grant contributes) is not stated and must not be promoted merely because it seems natural.

### 4.3 `active_grant_count`

Source does not explicitly state whether this counts:

```text
all rows with status='active'
all wall-clock-valid active rows
all source-valid rows before time-window evaluation
```

The distinction is material because access authority depends on this projection.

### 4.4 Future `valid_from`

The logical projection has no `effective_valid_from` field. Therefore a future-dated active grant cannot be handled safely unless source defines whether it is excluded until start time, materialized as another status, or handled by another scheduler/projection mechanism.

### 4.5 Recompute timestamp authority

Source does not define whether aggregation is evaluated at:

```text
DB transaction wall clock
entitlement event effective_at
provider occurred time
explicit command as_of
```

This affects deterministic replay and historical event application.

## 5. Missing projection mutation details

Even after the aggregate values are known, source does not fully define:

- how the first `entitlements.id` is allocated;
- whether recompute creates an inactive row when no valid grants exist versus requiring an existing projection;
- whether revision increments on every recompute invocation or only on material state change;
- whether an exact no-op recompute updates `updated_at`;
- the outbox event key/type/payload/dedupe contract for entitlement projection changes.

These are observable concurrency/replay semantics and should not be invented inside a supposedly authoritative command.

## 6. What the implementation must NOT invent

Until SRC-21 is resolved, do not implement a production-authoritative command that silently chooses:

- event payload schemas for `renewed` / `adjusted` / `restored`;
- event-type-to-grant transition rules;
- lexical comparison of `provider_ordering_key`;
- a wall-clock validity predicate not stated by source;
- `MAX(valid_until)` / NULL-wins aggregation as an unstated product rule;
- future `valid_from` behavior;
- entitlement projection revision/no-op semantics;
- outbox semantics for entitlement recompute.

Database constraints may enforce structural integrity, but they do not define these transition functions.

## 7. Current safe boundary

Source-complete and already enforceable:

```text
entitlement_grants relational identity and shape
entitlement_events append-only provenance and source ownership constraints
entitlements one-row-per-logical-key shape
verified receipt/provider-event source prerequisites
multiple independent grants can coexist
one grant revoke must not structurally delete another grant
current entitlement read projection
access check must fail closed when effective_valid_until <= now()
```

Source-complete as a **skeleton only**, not executable semantics:

```text
lock grant → append event → update grant → aggregate → outbox
```

Blocked until SRC-21:

```text
cmd_apply_entitlement_event...
cmd_recompute_entitlement_projection...
```

for production authority.

## 8. Relationship to existing tests

The existing commerce negative suite validates relational constraints and manually simulates a two-grant projection update after revoking one grant. It does not execute an authoritative recompute command.

That test demonstrates that the schema can represent overlapping-grant behavior; it does not resolve the missing aggregation formula or event transition semantics.

## 9. Required source resolution

Source authority should define at minimum:

1. versioned payload schema for each entitlement event type;
2. deterministic transition table from event type/payload to grant projection fields;
3. provider-order stale comparison contract or provider-specific adapter output contract;
4. exact contributing-grant predicate, including `valid_from` and `valid_until` handling;
5. exact `active_grant_count` formula;
6. exact `effective_valid_until` aggregation, including unbounded grants;
7. recompute time/as-of authority;
8. first projection row identity/create behavior;
9. revision and no-op update semantics;
10. entitlement-change outbox contract.

## 10. Verification gate after resolution

At minimum:

- duplicate event dedupe produces one ledger effect;
- stale provider order cannot roll grant backward;
- every event type follows its versioned transition schema;
- future-dated grant cannot activate access before source-approved start semantics;
- expired wall-clock grant cannot extend access even if sweeper lags;
- overlapping finite grants aggregate according to the approved union rule;
- finite + unbounded grant produces the approved effective expiry;
- revoke one of multiple valid grants preserves access through remaining grant(s);
- all non-contributing grants produce inactive logical entitlement;
- concurrent events/recompute serialize without lost updates;
- projection revision/no-op behavior is deterministic;
- event + grant + logical entitlement + outbox commit atomically.

## 11. Blocker composition

For a full purchase-derived entitlement path:

```text
P0-CM-01
→ provider/store rail semantics

SRC-18
→ purchased product → grant target mapping

SRC-21
→ grant event transition + logical entitlement aggregation
```

All applicable authorities must be resolved before the end-to-end purchase→access mutation path is production-complete.