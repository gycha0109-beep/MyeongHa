# SRC-27 — Content Release Lifecycle Mutation Authority

> Status: **OPEN / BLOCKING for production-authoritative content bundle register, release create, activation, and retirement commands**  
> Domain: Content / World Canon / Admin Operations  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`
>
> Related open authority:
> - `SRC-15` Client Capability / Asset Manifest Compatibility Decision Authority
> - `SRC-16` Subject-Specific Content Rollout Resolver Authority
> - `P0-AUTH-01` API / PostgreSQL execution identity

---

## 1. Gap

Primary source clearly separates immutable canon bundles from mutable operational release state:

```text
Git/versioned source
→ immutable content bundle
→ content hash/version
→ runtime catalog
→ operational release
```

ERD v0.6 defines `content_bundles` and `content_releases`, including the persisted lifecycle states and important invariants. The Use Case also requires operators to publish content and activate release/runtime state rather than editing canon directly in the database.

However, those storage invariants do **not** define a complete executable mutation protocol for:

```text
register immutable content bundle metadata
create content release
draft → active activation
active/draft → retired retirement
switch active/default release for rollback
retire content bundle operational marker
```

The repository therefore must not infer a production command merely from the fact that the tables can represent the resulting rows.

This missing mutation authority is `SRC-27`.

## 2. Source-complete storage boundary

The following relational facts are source-backed.

### `content_bundles`

```text
id
content_version UNIQUE
content_hash UNIQUE
artifact_ref private immutable resolver key
artifact_schema_version
min_client_capability
asset_manifest_hash
cue_schema_version
manifest_jsonb
published_at
retired_at nullable operational retention marker
```

After publication, canon projection rows that reference the bundle are immutable. Actual artifact bytes/canonical payload must match the declared `content_hash` before publication.

### `content_releases`

```text
id
release_key UNIQUE
content_bundle_id
status = draft | active | retired
is_default
rollout_jsonb
rollout_policy_version
rollout_seed
activated_at
retired_at
created_at
```

Source-backed invariants include:

```text
at most one active default release
active → activated_at IS NOT NULL
retired → retired_at IS NOT NULL AND is_default = false
content_bundle_id / rollout policy / rollout seed immutable after activation
changing rollout requires a new release row
activation verifies the referenced bundle is not retired
activation maintains at least one valid active default release
rollback changes operational release/default selection rather than mutating an old immutable bundle
```

These facts describe valid stored state. They do not by themselves define every legal command transition or retry protocol.

## 3. Activation is additionally blocked by SRC-15

Use Case requires remote content to activate only after client/content compatibility succeeds.

`SRC-15` establishes that source does not yet define the executable compatibility evaluator for:

```text
min_client_capability comparison
client capability evidence
asset manifest compatibility
cue schema compatibility
fallback/update precedence
final evaluator ownership and persisted evidence
```

Therefore a command such as:

```text
cmd_activate_content_release_v1(...)
```

cannot be production-authoritative before `SRC-15` is resolved. Checking only `content_bundle.retired_at IS NULL` and setting `status='active'` would omit a source-required activation gate.

A caller-supplied `compatible=true` flag is not authority.

## 4. Missing release-create authority

The ERD defines the row shape, but primary source does not define the positive validation contract for a new operational release.

Missing authority includes at least:

```text
release_key creation/normalization rules
allowed rollout_policy_version registry
rollout_jsonb positive schema and validation
rollout_seed generation / caller authority
whether a draft may initially be is_default=true
same release_key retry/idempotency semantics
same logical request with different rollout payload conflict semantics
admin actor/audit provenance persistence
whether release creation requires current bundle/client compatibility evidence
```

`SRC-16` separately blocks interpreting `rollout_jsonb` as a subject-specific resolver policy. A database row accepting arbitrary JSON is not proof that the JSON is a valid operational rollout definition.

## 5. Missing activation transition protocol

Even after compatibility is eventually resolvable, source must still define the exact activation mutation semantics.

At minimum the following are not determined:

```text
legal source state: draft only, or another state as well
whether activation and default promotion are one atomic command
whether an active non-default release is allowed when one default exists
how a new default replaces the prior active default atomically
whether replacement retires the old release or only clears is_default
whether an old active non-default release remains active after default switch
activation timestamp authority
same-request replay semantics
response-loss replay reconstruction
concurrent activation/default-switch conflict behavior
expected revision / CAS / idempotency contract
admin actor/audit provenance record
```

The invariant “maintains at least one valid active default release” constrains the result but does not choose one of these transition protocols.

## 6. Missing retirement transition protocol

The stored invariant:

```text
status = retired
→ retired_at IS NOT NULL
→ is_default = false
```

is source-backed. The command that reaches that state is not fully defined.

Missing authority includes:

```text
whether draft → retired is legal
whether active non-default → retired is legal without replacement
whether active default may ever be retired directly
if default retirement is requested, whether replacement activation/default switch must occur in the same transaction
how replacement is selected — caller explicit ID vs governed resolver/policy
retired_at timestamp authority and monotonic/replay semantics
second retirement request idempotency
same request with an earlier/later timestamp behavior
concurrent retire/activate race behavior
whether retired releases can ever return to active
admin actor/audit provenance record
```

Do not copy timestamp/replay semantics from unrelated revoke commands. Their product authorities are independent.

## 7. Bundle registration / retirement is not a pure row insert/update

Bundle registration is downstream of the source-required publish flow:

```text
Content PR
→ source-complete schema validation
→ canon/reference validation
→ asset validation
→ human review
→ immutable bundle build
→ hash/version
→ DB runtime catalog publish
→ release activation
```

The ERD explicitly requires actual artifact bytes/canonical payload to hash to `content_hash` before publication.

A database function that receives caller-supplied `content_hash`, `artifact_ref`, and manifest metadata and inserts them without authoritative artifact verification cannot claim to implement the full bundle registration authority.

Likewise, `content_bundles.retired_at` is an operational retention marker, but source does not define the complete command protocol for retiring a bundle while historical threads/episode progress remain pinned to it. Artifact retention must remain sufficient for historical reproduction; retirement must not be interpreted as artifact deletion.

## 8. Admin authorization / audit boundary

The API/implementation pack requires Admin Content operations to use `ADMIN_CONTENT` authorization and actor/audit provenance.

Primary source establishes operator-driven operational publishing, but the current database authority does not define a complete persisted audit envelope for content lifecycle commands, including:

```text
admin actor identity representation
reason / change-ticket / evidence fields, if required
immutable audit event/ledger destination
actor authentication-to-database trust boundary
dedupe linkage between admin request and lifecycle mutation
```

`P0-AUTH-01` also remains open for API-to-PostgreSQL execution identity. A privileged database caller by itself is not sufficient evidence that `ADMIN_CONTENT` authorization and audit provenance were fulfilled.

## 9. Source-safe boundaries that remain available

`SRC-27` does **not** invalidate existing read-only/provenance behavior.

The repository may continue to:

```text
read immutable bundle metadata by explicit bundle id
read bundle-pinned character/episode/capability/relation projections
read the recorded active-default release binding
read explicitly pinned release/bundle pairs on existing runtime objects
retain retired bundle artifacts needed by historical pinned objects
verify relational CHECK/UNIQUE/FK/immutability constraints
```

Existing source-safe projections remain valid, including:

```text
qry_character_bundle_catalog_v1
qry_character_bundle_capabilities_v1
qry_character_bundle_relations_v1
qry_content_bundle_manifest_v1
qry_episode_bundle_catalog_v1
qry_episode_bundle_participants_v1
qry_active_default_content_release_v1
```

`qry_active_default_content_release_v1` reads recorded authority only. It does not prove that the mutation which created that authority has been source-completely implemented.

## 10. Forbidden implementation before resolution

Until the required source authority is resolved, do not:

- implement bundle register as “trust caller metadata then INSERT” and call it authoritative publish;
- parse or validate `rollout_jsonb` using invented keys/schema;
- activate a release using only DB row validity while skipping SRC-15 compatibility;
- accept a caller-supplied compatibility verdict as activation authority;
- choose a previous/new default by lexical key, creation time, activation time, or arbitrary row order;
- infer that activating a default automatically retires the old default;
- infer that retiring a default automatically promotes any other active release;
- invent draft→retired or retired→active transition rules;
- borrow revoke/replay timestamp rules from unrelated domains;
- claim a plain service-role call satisfies `ADMIN_CONTENT` authorization/audit provenance;
- delete retired bundle artifacts while historical pinned runtime objects still require them;
- claim SRC-16 rollout resolution is solved by release lifecycle mutation.

Where an operational path requires one of these unresolved mutations, keep it disabled/fail-closed rather than fabricating policy.

## 11. Relationship to SRC-15 and SRC-16

The gaps are distinct and compositional.

### SRC-15 — compatibility decision

Answers whether the current client/content combination is compatible enough for remote activation/use. It is a required activation input but does not define release state transition mechanics.

### SRC-16 — rollout resolver

Answers which active release a subject deterministically resolves to. It does not define how release rows are created, activated, retired, or default-switched.

### SRC-27 — lifecycle mutation

Defines the missing operational write protocol itself: create/activate/retire/default switch/bundle registration boundary, retry/concurrency behavior, and audited admin mutation provenance.

Resolving one does not automatically resolve the others.

## 12. Required source resolution

At minimum source authority must define:

1. bundle registration verification boundary, including artifact/hash/manifest evidence;
2. release create positive schema, including governed rollout policy validation;
3. legal release lifecycle transition graph;
4. activation/default-switch atomic semantics;
5. retirement/default-replacement atomic semantics;
6. whether active non-default releases remain active across default switches;
7. retired release reactivation rule, if any;
8. timestamp authority for activated_at / retired_at;
9. request idempotency, response-loss replay, and same-key-different-payload behavior;
10. concurrent activation/retirement conflict and serialization contract;
11. admin actor identity, authorization proof, and immutable audit provenance contract;
12. bundle retirement vs historical pinned-artifact retention rules;
13. explicit composition with SRC-15 compatibility before activation;
14. explicit separation from SRC-16 subject rollout resolution.

## 13. Verification after resolution

At minimum the future command gates must prove:

- invalid/unverified bundle artifact cannot be registered;
- declared content hash matches authoritative artifact bytes/canonical payload;
- immutable bundle metadata cannot be modified after publication;
- invalid rollout policy is rejected under the approved schema/version;
- activation of a retired bundle is rejected;
- incompatible remote content cannot be activated under the resolved SRC-15 protocol;
- activation preserves exactly the source-approved active-default invariant;
- default replacement follows the approved atomic state transition;
- retirement follows the approved source-state transition graph;
- retiring/default switching never leaves an invalid active-default state if source prohibits it;
- retries/replays return the approved deterministic outcome;
- same logical key with conflicting payload is rejected according to approved semantics;
- concurrent activate/retire/default-switch operations serialize to a permitted state;
- every production admin mutation proves `ADMIN_CONTENT` authorization and required audit actor provenance;
- retired release/bundle does not mutate existing pinned thread/progress provenance;
- historical artifact retention remains sufficient for pinned runtime reproduction;
- rollout resolution is still delegated to the separately resolved SRC-16 contract.
