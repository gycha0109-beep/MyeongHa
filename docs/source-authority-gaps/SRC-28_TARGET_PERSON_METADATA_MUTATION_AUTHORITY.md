# SRC-28 — Target Person Metadata Mutation Authority

> Status: **OPEN / BLOCKING for production-authoritative Target Person metadata mutation**  
> Domain: Birth / Target Person / Compatibility  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`
> - repository `API_CONTRACT.md`
> - existing Target Person create/read and Birth revision append DB contracts

---

## 1. Gap

Primary source defines the Target Person concept sufficiently to establish:

- an owner-scoped Target Person record;
- a distinct `profile_kind='target'` Birth Profile and immutable Birth revisions;
- no reverse lookup, invite, or social-graph authority;
- separate Target Person deletion as a user capability, subject to the existing `SRC-06` Reading-provenance deletion gap.

ERD v0.6 also gives `target_person_profiles` two nullable metadata fields:

```text
display_label
relationship_label
```

and the repository can source-safely persist those fields at Target Person creation.

However, the primary source does **not** define a production-authoritative mutation contract for changing those metadata fields after creation.

The repository API pack currently names:

```text
PATCH /api/target-persons/:id
→ label metadata 또는 새 birth revision command를 구분한 versioned action
```

but this is implementation-pack structure, not sufficient source authority for the metadata mutation itself.

This missing authority is `SRC-28`.

## 2. Source-complete boundary

`SRC-28` does not block the already source-backed parts of Target Person handling.

### Create

`cmd_create_target_person_v1` may continue to create, atomically:

```text
target_person_profiles metadata
+ target birth_profiles row
+ first immutable birth_profile_revisions row
+ current revision pointer
```

for an active canonical owner.

The create command may accept the two nullable metadata values because the ERD explicitly defines them as Target Person metadata and creation is required by UC-16.

### Read

Existing owner-scoped Target Person list/detail projections may continue to expose the stored metadata and current target Birth revision.

### Target Birth correction

A Target Person Birth correction is independently source-safe at the Birth Profile aggregate boundary.

Existing:

```text
cmd_append_birth_profile_revision_v1
```

already implements the source-backed append-only Birth correction contract:

```text
lock birth profile
→ verify expected current revision
→ append immutable revision
→ advance current pointer
```

The command is owner-scoped and is not restricted to `profile_kind='self'`; therefore a caller that has already resolved an owned Target Person to its owned target Birth Profile may use this existing Birth-revision authority without inventing Target Person metadata semantics.

This does **not** authorize changing Target Person labels in the same command.

### Delete

Target Person deletion remains governed by `SRC-06`; `SRC-28` neither resolves nor enlarges that deletion authority.

## 3. Missing metadata field semantics

Primary source does not define the post-create mutation meaning of:

```text
display_label
relationship_label
```

Missing authority includes at least:

```text
whether either field is mutable after create
whether one or both may be patched independently
whether null means clear, unchanged, or invalid
whether empty string is legal, normalized to null, or preserved
whitespace trimming / Unicode normalization rules
maximum length or other validation policy
whether relationship_label is free-form text or a governed vocabulary
whether display_label and relationship_label have different validation rules
whether birth_profiles.label must remain null or ever mirror display_label
```

ERD column existence and nullability prove representability, not mutation semantics.

## 4. Missing concurrency authority

`target_person_profiles` has:

```text
created_at
deleted_at
```

but no source-defined:

```text
updated_at
revision
etag/version token
metadata mutation ledger
```

Therefore source does not establish a deterministic optimistic-concurrency precondition for metadata patch.

Do not silently invent any of the following as the production contract:

```text
last-write-wins
created_at as a CAS token
row xmin as a public version token
blind UPDATE with no precondition
new updated_at column solely because PATCH needs one
metadata revision integer copied from another aggregate
```

If concurrent label edits occur, the source currently does not state which request wins or how a stale writer is detected.

## 5. Missing retry / idempotency authority

Primary source does not define a Target Person metadata edit request identity.

Missing authority includes:

```text
idempotency key or deterministic request id
same request replay behavior
same key + different metadata behavior
response-loss reconstruction
whether setting the already-stored value is a replay/no-op or a fresh mutation
whether no-op writes alter any future metadata revision/timestamp
```

The API contract's global idempotency rules must not be applied to this command merely by analogy with Reading, chat, Birth revision, or purchase commands.

## 6. Missing action schema for PATCH

The API pack says Target Person PATCH distinguishes:

```text
label metadata
vs
new Birth revision
```

but primary source does not define the positive discriminated request schema.

It therefore does not establish:

```text
action kind names
field allowlist per action
whether one request may contain both metadata and Birth changes
unknown-field behavior specific to this action
expected revision/precondition shape for metadata
whether Target Person id plus linked Birth Profile id must both be supplied or server-resolved
stable response schema after metadata mutation
```

The existing Birth revision command remains usable as an independent aggregate command. The missing metadata arm must not be reverse-engineered from the API pack wording.

## 7. Deleted / lifecycle-state behavior

Primary source requires separate Target Person deletion but does not define metadata-edit interaction with deletion lifecycle.

Before a metadata mutation command is authoritative, source must define at least:

```text
whether deleted_at IS NOT NULL is always immutable/gone for metadata edit
whether an in-flight metadata edit racing deletion loses, retries, or fails
whether metadata history must remain for deletion/audit provenance
whether metadata edit is allowed while an account-level deletion job is pending
```

Safe implementations may fail closed around unresolved destructive lifecycle states, but must not claim that the chosen behavior is source-defined.

## 8. Historical / audit authority

Unlike Birth input, Target Person label metadata has no source-defined history model.

Primary source does not state whether post-create label changes should:

```text
overwrite the current row
append immutable metadata revisions
append an audit event while updating current state
preserve only security/operator audit metadata
have no history at all
```

This is product/privacy authority, not a storage convenience decision.

Do not create a shadow metadata history table or destroy prior values as a supposedly final policy without source approval.

## 9. Affected surfaces

Blocked by `SRC-28`:

```text
production-authoritative metadata arm of PATCH /api/target-persons/:id
cmd_patch_target_person_metadata...
cmd_update_target_person_labels...
blind UPDATE of target_person_profiles.display_label / relationship_label
new Target Person metadata revision/ledger schema advertised as source-backed
combined metadata + Birth revision transaction advertised as the required product semantics
```

Not blocked by `SRC-28`:

```text
POST /api/target-persons creation boundary
GET /api/target-persons
GET /api/target-persons/:id
stored metadata projection
owned Target Birth revision append through the existing Birth aggregate command
Reading provenance reads
Target Person deletion analysis under SRC-06
```

## 10. Relationship to SRC-06 and SRC-08

### SRC-06 — Target deletion vs Reading provenance

`SRC-06` governs destructive Target/Birth deletion where immutable historical Readings pin target Birth revisions.

It does not define ordinary metadata-label mutation.

### SRC-08 — compatibility adapter

`SRC-08` governs whether the real Saju adapter can consume the source/target Birth contract needed for compatibility.

It does not define Target Person metadata mutation.

A Target Person may therefore have source-safe stored metadata/current Birth state even while real compatibility execution remains unavailable.

## 11. Pack / implementation must NOT invent

Until `SRC-28` is resolved, do not:

- use `created_at`, PostgreSQL `xmin`, or an invented `updated_at` as the official metadata CAS contract;
- define relationship labels as a closed enum from UI examples;
- trim/null-normalize labels and call that source authority;
- make metadata writes last-write-wins by default;
- treat caller-provided Target Person metadata as a generic arbitrary JSON patch;
- let PATCH update `birth_profiles.label` in addition to `target_person_profiles.display_label` without explicit authority;
- merge label changes and Birth revision append into one atomic product action solely because the API route is shared;
- create a metadata history ledger merely to manufacture versioning;
- infer metadata mutation permission from the fact that metadata can be supplied at creation.

Where a client currently exposes metadata editing, the server must keep that write disabled/fail-closed until the authority is resolved, while Birth corrections may continue through the existing Birth revision append command.

## 12. Required source resolution

At minimum source authority should define:

1. whether `display_label` and `relationship_label` are mutable after creation;
2. the positive metadata patch request schema and allowed field combinations;
3. null / empty / whitespace / normalization behavior;
4. length and value constraints, including whether `relationship_label` is free-form or governed;
5. the authoritative concurrency token and stale-write behavior;
6. retry/idempotency/no-op semantics;
7. deleted/deletion-pending Target Person edit behavior;
8. whether metadata changes overwrite or preserve history/audit lineage;
9. whether metadata and Birth revision changes can coexist in one logical action;
10. the stable response/version contract for successful metadata edits.

## 13. Verification after resolution

At minimum:

- owner may mutate only source-approved Target Person metadata fields;
- cross-owner mutation is denied without resource probing leakage;
- deleted Target Person behavior follows the approved lifecycle rule;
- null/empty/normalization follows the approved contract exactly;
- stale concurrent metadata writer is resolved according to the approved concurrency rule;
- response-loss retry does not create ambiguous additional mutations;
- same metadata request with conflicting payload follows the approved conflict rule;
- metadata edit does not mutate target Birth input or revision pointer;
- Birth revision append does not mutate Target Person metadata;
- combined metadata/Birth request, if allowed, follows explicitly approved atomicity semantics;
- metadata edit cannot revive a deleted Target Person;
- existing create/read/current-Birth projections remain compatible;
- `SRC-06` deletion and `SRC-08` compatibility boundaries remain independently enforced.
