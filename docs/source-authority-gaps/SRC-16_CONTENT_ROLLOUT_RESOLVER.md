# SRC-16 — Subject-Specific Content Rollout Resolver Authority

**Status: BLOCKING BEFORE SUBJECT-SPECIFIC CONTENT RELEASE RESOLUTION**

## Source-backed requirement

ERD v0.6 defines `content_releases` as operational rollout authority for immutable content bundles and records:

```text
release_key
content_bundle_id
status = draft | active | retired
is_default
rollout_jsonb
rollout_policy_version
rollout_seed
activated_at
retired_at
```

It also fixes these invariants:

```text
- at most one active default release
- content_bundle_id / rollout policy / rollout seed are immutable after activation
- changing rollout creates a new release row
- resolver is deterministic for a stable subject identity and active release set
- activation maintains at least one valid active default release
```

The current bounded query:

```text
qry_active_default_content_release_v1()
```

is therefore allowed to expose the recorded active-default binding only.

## Missing authority

The source requires deterministic subject-specific rollout resolution, but it does not define the resolver protocol. In particular it does not specify:

```text
1. rollout_jsonb schema
   - cohort predicates, percentages, allowlists, experiments, geographic/platform filters, or another structure

2. stable subject identity input
   - canonical subject UUID, member auth identity, guest identity, merged identity, or another stable key

3. rollout hash / bucket algorithm
   - hash function, normalization, seed concatenation, bucket range, and boundary semantics

4. active release selection precedence
   - behavior when multiple active non-default releases match the same subject
   - tie-breaking order and whether release activation time or another priority participates

5. fallback behavior
   - whether a subject that matches no non-default release always receives the active default
   - behavior when the active set is temporarily malformed

6. merge / identity continuity semantics
   - whether guest-to-member promotion must preserve an existing cohort assignment
   - how previously pinned threads/turns relate to a newly resolved release

7. persisted decision evidence
   - whether a resolved rollout decision must record policy version, seed/bucket evidence, or only the final release/bundle pin
```

The statement “deterministic for a stable subject identity and active release set” is not sufficient authority to invent a hash function, parse arbitrary `rollout_jsonb`, or choose precedence among multiple matching releases.

## Allowed implementation before resolution

Source-backed behavior may include:

```text
- reading the single recorded active-default release binding
- reading an explicitly pinned release/bundle pair already stored on a thread, turn, reading, or episode progress row
- reproducing immutable bundle content by explicit content_bundle_id
```

These operations do not claim to resolve a subject into a rollout cohort.

## Forbidden claims before resolution

Until source authority defines the resolver contract, implementation must not claim authoritative completion of:

```text
resolveContentRelease(subject)
subject cohort membership
percentage rollout bucketing
experiment assignment
non-default release precedence
identity-stable rollout assignment across guest/member merge
```

Hard-coded JSON keys, lexical release-key ordering, modulo bucketing, database row order, `activated_at` sorting, or an implementation-chosen hash function would be invented semantics and are prohibited.

## Source decision required

Source authority must define a governed resolver contract covering at minimum:

```text
rollout policy schema + validation
stable identity input
hash/bucket algorithm and seed use
matching and precedence rules
active-default fallback rule
merge/identity continuity rule
required persisted decision evidence
```

Only after that decision may subject-specific rollout resolution become production authority.
