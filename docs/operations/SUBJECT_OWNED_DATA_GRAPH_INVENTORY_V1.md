# Subject-Owned Data Graph Inventory v1

> Tracking: #1063 / parent #964 / DR parent #389  
> Historical schema-discovery state: `P0-PR-01 = OPEN-P0` / dispositions `UNDECIDED`  
> Current decision authority: `P0-PR-01 = DECIDED` via `ACCOUNT_DELETION_FINALIZATION_POLICY_V1.json` and `ACCOUNT_DELETION_DISPOSITION_POLICY_V1.json`  
> Status: **SCHEMA-DISCOVERED COVERAGE / POLICY NEUTRAL / EXECUTION NOT AUTHORIZED**

## Purpose

This inventory makes the current direct PostgreSQL references to `public.subjects(id)` explicit before account-deletion finalization policy is approved.

It answers:

> Which current rows have a direct foreign-key edge to a Subject, and what domain/relationship role does each edge belong to?

It does **not** answer whether those rows must be erased, retained, pseudonymized, detached, or preserved. Every disposition remains `UNDECIDED`.

Canonical inventory:

```text
docs/operations/SUBJECT_OWNED_DATA_GRAPH_INVENTORY_V1.json
```

## Discovery evidence

The initial #1064 exact-head discovery run intentionally used an empty inventory. The fully migrated PostgreSQL catalog returned exactly:

```text
30 direct FK mappings
28 distinct referencing tables
26 owner-role mappings
4 lineage/claim mappings
```

The four non-owner relationship edges are:

```text
guest_sessions.claimed_by_subject_id       = claim_target
subject_merge_jobs.guest_subject_id        = merge_source
subject_merge_jobs.member_subject_id       = merge_target
subjects.merged_into_subject_id            = merge_target_pointer
```

All other discovered mappings are classified as direct `owner` relationships for deletion-coverage review.

## Domain classification

The 30 direct mappings are classified into these policy-neutral domains:

- `identity_and_merge`
- `birth_and_target`
- `conversation`
- `personal_record`
- `character_world`
- `readings`
- `notification_and_device`
- `sharing`
- `ai_execution`
- `privacy_operations`
- `commerce`

Domain classification is routing metadata for future policy review. It is **not** a retention decision.

## Important boundary: direct FK graph only

This inventory covers direct PostgreSQL foreign-key edges whose referenced target is exactly:

```text
public.subjects(id)
```

It intentionally does not claim to enumerate all transitive dependencies.

For example, some Commerce tables may carry `subject_id` but derive authority through another composite/parent relationship rather than a direct FK to `subjects(id)`. The separate P0-PR-01 Commerce retention inventory remains the authority for Commerce policy-class coverage.

Therefore both guards are required:

```text
account_deletion_policy_catalog_guard.sh
subject_owned_data_graph_catalog_guard.sh
```

The first guards the current subject-linked Commerce policy classes.  
The second guards the direct Subject FK graph across the whole schema.

## Fail-closed catalog rule

`test/db/subject_owned_data_graph_catalog_guard.sh` queries the fully migrated PostgreSQL catalog using `pg_constraint`, `conkey`, and `confkey`.

The live set of:

```text
referencing_table | referencing_column
```

must exactly match the JSON inventory.

A migration that adds or removes a direct FK to `public.subjects(id)` therefore breaks CI until the inventory is reviewed and updated.

## Current authority

```text
decisionId                         = P0-PR-01
decisionStatus                     = OPEN-P0
inventoryAuthority                 = SCHEMA_DISCOVERED_POLICY_NEUTRAL
executionAuthorized                = false
all dispositions                   = UNDECIDED
authoritativePostBackupSource      = false
authoritativePrivacyReconciliation = false
futureSafePrivacyReconciliation    = false
drReady                            = false
```

## Explicitly absent

This inventory adds no:

- account finalization command;
- destructive SQL;
- hosted Auth deletion;
- retention duration;
- legal/accounting authority;
- pseudonymization rule;
- backup deletion timing;
- authoritative privacy-source promotion;
- RPO/RTO approval.

## Next authority step

The owner-approved P0-PR-01 decision is now supplied by the separately versioned approved policy/disposition artifacts. This inventory intentionally remains schema-discovered and `UNDECIDED`; it must not be rewritten into policy authority. Runtime destructive finalization remains separately unimplemented.

Until that decision exists, this inventory is coverage evidence only.
