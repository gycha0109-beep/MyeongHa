# Relationship Persistence Schema V1

> Track: character-memory  
> Phase: **L — ERD Extension / SQL Constraints / Append-only Guards**  
> Runtime Production mutation: **DISABLED**  
> Upstream policy: `relationship-policy-v1`

## 1. Purpose

PHASE K defined deterministic Production relationship semantics. PHASE L gives those semantics a persistence shape without activating any runtime write path.

The authority flow remains:

~~~text
candidate
→ Event authority
→ deterministic Production relationship policy
→ server commit authority
~~~

PHASE L implements only the database structures and constraints required by the final step. It does not implement that server commit command.

## 2. Legacy boundary

The pre-SRC-22 table:

~~~text
public.relationship_events
~~~

was created before Production relationship policy meaning was frozen.

It already used `relationship-policy-v1` in historical test fixtures while allowing legacy stage/event semantics that are not the finalized Production V1 contract.

PHASE L therefore does **not** reinterpret that table as the new Production ledger.

Migration preflight fails closed if:

- legacy `relationship_events` contains any row; or
- an existing `user_character_states` row has non-zero revision or non-zero relationship scores.

Zero-revision baseline projection rows may remain for read compatibility. Their new Production V1 columns stay NULL until a later governed initialization command.

The legacy table remains present for compatibility and existing structural tests, but it is **not** the Production V1 persistence surface.

The pre-SRC-22 chat mutation ingress is retired at the command boundary instead: `cmd_commit_chat_turn_v1` rejects any non-null caller-provided `relationshipEffect`. Its old implementation is retained as a non-public helper only to preserve chat/world/memory commit behavior when no relationship mutation is requested.

PHASE L still does not write the new Production V1 relationship history. That write path is introduced only by the governed Atomic Relationship Apply command in PHASE M.

## 3. Persistence layers

Production V1 uses four distinct roles:

~~~text
relationship_policy_artifacts / activations
→ immutable calculation authority and activation history

relationship_history_entries
→ serialized physical revision ledger

relationship_event_records / adjustments / links / provenance
→ immutable relationship occurrence and lineage history

user_character_states
→ mutable current projection

relationship_state_snapshots
→ disposable replay acceleration cache
~~~

History is authoritative evidence. Snapshots are not.

## 4. Policy persistence

### relationship_policy_artifacts

Stores immutable machine-readable policy artifacts:

- policy_version
- artifact_schema_version
- content_hash
- artifact_jsonb
- created_at
- retired_at

A policy version cannot silently change content.

### relationship_policy_activations

Stores prospective policy activation history:

- global or Character-specific scope;
- exact policy version + content hash;
- effective_from;
- activation provenance reference.

A new policy registration does not rewrite historical relationship history.

## 5. Current projection

`user_character_states` retains legacy compatibility fields and gains:

~~~text
attained_stage
current_candidate_stage
current_condition
policy_content_hash
policy_state_schema_version
policy_state_jsonb
~~~

Production-shaped rows require all fields together.

For such rows:

~~~text
relationship_stage = attained_stage
~~~

The legacy field is retained only for current read compatibility.

Database constraints enforce:

- closeness/trust/friction within 0..100;
- the five frozen internal stages;
- STABLE / OPEN_CONFLICT / RESOLVED_RECENTLY conditions;
- policy artifact identity;
- structured policy-state JSON.

`behaviorAccess` is not duplicated in persistence because it is deterministically derived from `current_condition`.

## 6. Physical relationship revision ledger

### relationship_history_entries

Every committed relationship-history operation consumes exactly one physical revision:

~~~text
event
correction
retraction
~~~

Invariant:

~~~text
state_revision_after = state_revision_before + 1
~~~

and:

~~~text
UNIQUE(subject_id, character_id, state_revision_after)
~~~

A zero-positive-effect Event still consumes a revision when it is durably appended.

Duplicate command retries are prevented by the history dedupe key.

## 7. Semantic Production Events

### relationship_event_records

Stores only the twelve frozen generic Production V1 Event kinds.

It persists:

- exact Event kind/schema;
- optional namespaced Character behavior key;
- occurred_at;
- source authority shape;
- objective facts;
- Character interpretation separately;
- exact event payload;
- registry-derived relationship family;
- historical applied effect disposition;
- historical score deltas;
- historical milestone;
- policy version/hash used at application.

The database independently constrains the frozen V1 allowlist, family mapping, disposition class, delta table, milestone rules and one-key payload schema.

Historical effect rows are never rewritten merely because a later replay derives a different current effective result.

## 8. Corrections and retractions

### relationship_event_adjustments

Correction:

~~~text
old Event remains immutable
+ correction history entry
+ new replacement Event
+ adjustment links target → replacement
~~~

Retraction:

~~~text
target Event remains immutable
+ retraction history entry
+ adjustment marks it inactive for semantic replay
~~~

No historical Event UPDATE is used to express changed truth authority.

The adjustment and Event rows must remain within the same Subject + Character relationship boundary.

## 9. Causal links

### relationship_event_links

V1 stores semantic causal lineage only as:

~~~text
CAUSAL_PREDECESSOR
~~~

Examples:

~~~text
COMMITMENT_KEPT
→ COMMITMENT_MADE

RECONCILIATION
→ CONFLICT_OPENED
~~~

Cross-Subject / cross-Character linkage and self-linkage are structurally forbidden.

Deferred constraint triggers enforce V1 causal cardinality, predecessor type, temporal order and commitment-key equivalence.

## 10. Provenance

### relationship_event_provenance_refs

Every Production relationship Event requires at least one authority provenance reference.

Conversation-turn events additionally require message provenance bound to the same source turn.

Non-conversation events cannot smuggle conversation message provenance.

Objective Event facts remain separate from Character interpretation.

## 11. Replay snapshots

### relationship_state_snapshots

Snapshots contain derived replay continuation state only.

They are:

- immutable once created;
- disposable;
- rebuildable;
- bounded to a committed physical relationship revision;
- forbidden from advancing beyond the current projection revision.

Deleting a stale/corrupt snapshot does not delete relationship truth.

## 12. Append-only enforcement

The following Production history surfaces reject ordinary UPDATE/DELETE:

~~~text
relationship_history_entries
relationship_event_records
relationship_event_adjustments
relationship_event_links
relationship_event_provenance_refs
relationship_state_snapshots
relationship_policy_artifacts
relationship_policy_activations
~~~

The existing account-deletion SECURITY DEFINER finalizer is the only Subject-scoped DELETE exception for subject-owned immutable relationship rows.

That exception requires both:

- execution as the exact finalizer function owner; and
- the transaction-local finalizer Subject context.

A caller-controlled GUC alone cannot bypass immutability.

Global policy artifact/activation rows are not deleted with one user's account.

## 13. Privacy graph

The six new Subject-owned relationship tables are classified as account-deletion `DELETE` data.

They are reachable transitively through the current relationship projection / relationship history graph and are pinned in the repository's transitive Subject dependency inventory.

## 14. Runtime authority remains closed

PHASE L intentionally does **not** provide:

- an INSERT-capable API command;
- an Atomic Relationship Apply transaction;
- an API-role write grant;
- a PostgreSQL adapter;
- concurrency/retry behavior;
- correction/replay workers;
- Se-yeon runtime binding.

The new tables have RLS enabled and receive no user-facing write policy in PHASE L.

## 15. Next phase

PHASE M will implement the only normal Production mutation path:

~~~text
lock user_character_states
→ verify expected revision
→ resolve immutable policy artifact
→ deterministic policy evaluation
→ append relationship_history_entries
→ append Event/lineage/provenance rows
→ update current projection
→ commit atomically
~~~

PHASE N then pressure-tests concurrency, retry, idempotency and persisted replay/correction behavior.
