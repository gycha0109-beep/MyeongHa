# Transitive Subject Dependency Graph v1

> Tracking: #1065 / schema sync #1068 / parent #964 / DR parent #389  
> Historical schema-discovery state: `P0-PR-01 = OPEN-P0` / edge dispositions `UNDECIDED`  
> Current decision authority: `P0-PR-01 = DECIDED` via the separately versioned approved policy/disposition artifacts  
> Status: **SCHEMA-DISCOVERED TRANSITIVE COVERAGE / POLICY NEUTRAL / EXECUTION NOT AUTHORIZED**

## Purpose

This artifact extends the direct Subject ownership/lineage inventory from #1063 into the full public PostgreSQL foreign-key graph transitively reachable from `public.subjects`.

It exists to prevent future account-deletion finalization from reasoning only about rows with a direct `subject_id` while overlooking dependent rows connected through parent records.

It does **not** decide whether any reachable row is deleted, retained, detached, pseudonymized, archived, or legally preserved.

Canonical graph:

```text
docs/operations/TRANSITIVE_SUBJECT_DEPENDENCY_GRAPH_V1.json
```

## Discovery method

The graph is derived from the fully migrated PostgreSQL catalog, not migration-source text.

The catalog traversal:

1. enumerates every public-schema foreign-key constraint;
2. starts from edges whose parent table is `subjects`;
3. recursively follows child tables as the next parent;
4. preserves exact constraint identity and ordered child/parent column tuples;
5. records the minimum reachable depth for each FK constraint;
6. tracks visited tables per path so cycles are represented but cannot recurse forever;
7. hard-bounds recursive traversal at depth 20 and fails if the live graph reaches that safety bound.

The initial #1066 discovery run intentionally used an empty inventory and emitted the canonical reachable graph from the migrated schema.

## Current graph

```text
reachable FK edges         = 113
distinct reachable tables  = 49
maximum minimum depth      = 4

depth 1 = 30
depth 2 = 38
depth 3 = 42
depth 4 = 3
```

Depth 1 is required to exactly match #1063's direct `subjects(id)` FK inventory.

Depth greater than 1 represents relational dependencies reachable through direct Subject-linked rows. These are dependency edges, not declarations of ownership or deletion policy.

## Examples of transitive dependency surfaces

The discovered graph includes, among others:

- `subjects → conversation_threads → chat_turns / conversation_messages`;
- `subjects → purchase_intents → commerce_payment_attempts / purchase_intent_reader_selections`;
- `subjects → commerce_receipts → commerce_provider_events / entitlement_events / entitlement_grants`;
- `subjects → reading_sessions → readings → reading_execution_attempts / reading_groundings / reading_refs`;
- `subjects → notifications / device_installations → notification_deliveries → notification_delivery_attempts`;
- `subjects → subject_merge_jobs → subject_merge_actions → life_facts / memory_items / relationship_events`;
- `subjects → user_episode_progress → episode_progress_events`;
- cyclic/provenance relationships such as Birth current revision, Chat attempt/turn, and Reading committed-attempt pointers.

These examples are descriptive only. The JSON inventory is the complete canonical set.

## Graph drift guard

```text
test/db/transitive_subject_dependency_graph_catalog_guard.sh
```

The guard reconstructs the same recursive graph against the fully migrated CI database and requires an exact match with the JSON inventory.

It also requires:

```text
edge count       = 113
depth-1 count    = 30
max depth        = 4
recursion bound  = 20 (must never be reached)
```

Any migration that adds, removes, or rewires a reachable FK constraint therefore breaks CI until the dependency graph is reviewed.

## Direct-inventory consistency

The repository verifier cross-checks the 30 depth-1 graph edges against:

```text
docs/operations/SUBJECT_OWNED_DATA_GRAPH_INVENTORY_V1.json
```

so the direct and transitive authorities cannot silently diverge.

## Current authority

Every edge has:

```text
disposition = UNDECIDED
```

and the graph-level authority remains:

```text
decisionId                         = P0-PR-01
decisionStatus                     = OPEN-P0
graphAuthority                     = SCHEMA_DISCOVERED_POLICY_NEUTRAL
executionAuthorized                = false
authoritativePostBackupSource      = false
authoritativePrivacyReconciliation = false
futureSafePrivacyReconciliation    = false
drReady                            = false
```

## Explicitly absent

This graph adds no:

- destructive account-finalization SQL;
- CASCADE/SET NULL policy change;
- Auth-user deletion;
- pseudonymization rule;
- legal/accounting retention decision;
- backup purge timing;
- authoritative privacy-recovery promotion;
- RPO/RTO approval.

It is schema coverage evidence only.

## Remaining authority work

P0-PR-01 now has owner-approved dispositions and retention authority in `ACCOUNT_DELETION_DISPOSITION_POLICY_V1.json`. This schema graph remains policy-neutral discovery evidence. A future destructive finalization implementation must map the approved decisions across both:

1. direct Subject relationships from #1063; and
2. all transitive dependency edges in this graph.

Until then, execution stays fail-closed.
