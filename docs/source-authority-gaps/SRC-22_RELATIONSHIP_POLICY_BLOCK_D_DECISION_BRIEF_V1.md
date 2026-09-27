# SRC-22 Relationship Policy — Block D Replay / Persistence Decision Brief V1

> Track: character-memory  
> Status: **DECISION BRIEF ONLY / BLOCK D REMAINS PENDING**  
> Parent worksheet: SRC-22_RELATIONSHIP_POLICY_OWNER_FREEZE_WORKSHEET_V1.md  
> Production mutation: **BLOCKED**

## 0. Purpose

Blocks A, B, and C are owner-frozen. Block D decides how the append-only relationship history, current projection, corrections/retractions, snapshots, and policy versions cooperate in Production.

The key source boundary is already fixed:

~~~text
relationship_events = append-only history
user_character_states = current projection
~~~

The ERD already requires one event per applied revision, state_revision_after = state_revision_before + 1, and atomic event append + projection revision update.

V3 additionally demonstrated deterministic rebuild from active experimental history after correction/retraction. That demonstration does not itself choose the Production persistence strategy.

## 1. Why stored deltas alone are not enough

Consider:

~~~text
Episode A credited
Episode B credited
Episode C same-family → suppressed by rolling limit

later:
Episode A is retracted as invalid evidence
~~~

If Production simply subtracts A's old stored delta, C remains suppressed forever even though the active history now has room for C.

Therefore correction/retraction replay must be able to recompute:

~~~text
active authoritative Event history
→ Causal Episodes
→ rolling credit decisions
→ Episode Profile
→ scores
→ candidate stage
→ attained/current condition
~~~

using the policy version that governed each historical point.

## 2. Recommended strategy — snapshot-assisted deterministic replay

Recommendation:

~~~text
immutable append-only Event history
+ immutable historical policy artifacts
+ disposable derived snapshots
+ current projection
~~~

Do not choose either extreme:

- replay from genesis on every request;
- trust current projection/stored deltas so much that corrections cannot rebuild semantics.

Normal operation is incremental. Replay is exceptional.

## 3. Authority hierarchy

Recommended authority order:

~~~text
1. authoritative Event / correction / retraction ledger
2. immutable relationship policy artifacts + activation timeline
3. deterministic replay result
4. user_character_states current projection
5. snapshots / caches
~~~

Consequences:

- user_character_states is authoritative for fast serving only while it is consistent with ledger+policy history;
- a snapshot is never truth authority;
- a corrupted/stale snapshot may be deleted and rebuilt;
- a projection mismatch is repaired from ledger+policy evidence, not by editing historical Events.

## 4. D24 — replay / rebuild recommendation

Recommended owner decision:

~~~yaml
decision_id: D24
disposition: ACCEPT_WITH_CHANGE
persistence_strategy: SNAPSHOT_ASSISTED_APPEND_ONLY_REPLAY
normal_write_path: incremental_atomic_apply
normal_read_path: current_projection
full_history_replay_on_normal_read: false
~~~

### Replay triggers

Replay is allowed/required for:

- correction of an authoritative historical Event;
- retraction of an authoritative historical Event;
- Integrity/authority invalidation that explicitly produces a correction/retraction;
- projection/snapshot integrity recovery;
- explicit operator repair command;
- an explicitly authorized future policy migration.

Replay is **not** triggered by:

- ordinary reads;
- calendar passage;
- inactivity;
- model output;
- deployment alone;
- merely registering a newer policy version.

## 5. Canonical history versus physical append order

Production needs two notions of order.

### Physical ledger order

~~~text
state_revision_after
~~~

This is the immutable commit/application sequence.

### Logical relationship-history order

For an ordinary Event, logical slot = its own original applied revision.

For a correction replacement:

~~~text
new replacement Event is physically appended later
but semantically occupies the corrected target's logical history slot
~~~

The original target remains in audit history but is inactive for current semantic replay.

For a retraction:

~~~text
target remains in audit history
but is absent from active semantic history
~~~

This preserves append-only audit while allowing deterministic corrected history.

## 6. Revision semantics

The existing ERD invariant should be retained:

~~~text
every Production relationship Event append
→ consumes exactly one relationship revision
~~~

Recommended interpretation:

> revision is the serialized relationship-ledger application sequence, not a count of score changes.

Therefore a valid authorized Event with:

~~~text
effect_disposition = SUPPRESSED_POSITIVE_CREDIT
score delta = 0
stage change = none
~~~

still advances revision by one when it is appended.

This resolves the Block C D26 ambiguity without pretending that the relationship score changed.

Correction/retraction commands that append relationship-history records also advance the physical revision.

Replay may change derived scores/stage/profile but must never decrement or reuse the latest physical revision number.

## 7. Snapshot contract

Snapshots are derived acceleration artifacts.

Recommended logical contents:

~~~yaml
relationship_snapshot:
  subject_id: canonical
  character_id: canonical
  through_revision: physical ledger revision
  projection:
    closeness: derived
    trust: derived
    friction: derived
    attained_stage: derived
    current_condition: derived
    episode_profile: derived
  anti_farming_state: derived bounded state needed for continuation
  policy_cursor: policy timeline position
  source_fingerprint: integrity metadata
  created_at: server time
~~~

Rules:

- snapshots never replace Event history;
- snapshots can be deleted/rebuilt;
- snapshots at or after an affected historical logical slot become invalid after correction/retraction;
- replay starts from the nearest valid snapshot strictly before the earliest affected logical slot;
- if no valid snapshot exists, replay starts from the relationship genesis baseline;
- exact snapshot cadence is an operational tuning parameter, not Product Authority.

## 8. Historical policy artifacts are required

Every policy version used by a committed relationship Event must remain reconstructable.

Recommended immutable policy registry:

~~~yaml
relationship_policy_artifact:
  policy_version: stable unique key
  artifact_schema_version: version
  canonical_policy_definition: deterministic machine-readable artifact
  content_hash: immutable integrity fingerprint
  created_at: server time
  retired_at: optional
~~~

Rules:

- policy_version meaning never changes in place;
- same policy_version cannot point to different content;
- retired policy artifacts remain available for historical replay;
- client/LLM cannot choose policy_version;
- Production event row records the server-selected policy_version used for that historical evaluation.

## 9. Active policy selection

Recommended authority:

~~~text
server-owned relationship policy activation
→ selects policy for new Event evaluations
~~~

user_character_states.policy_version should mean:

> the policy version that produced the latest committed relationship projection transition.

It should **not** be the authority that selects the next policy version.

Next-policy selection belongs to the server policy registry/manifest boundary.

## 10. Policy change semantics — prospective by default

Recommended V1 rule:

~~~text
new policy activation
→ applies prospectively to newly committed relationship evaluations
→ does not rewrite historical Event rows
→ does not automatically replay all users
→ does not reinterpret old Events under the new policy
~~~

Historical replay after a correction/retraction uses the policy timeline:

~~~text
event E at historical point P
→ evaluate E with the exact policy_version active for P
~~~

This is required because anti-farming/stage semantics can differ by policy version.

### Why not automatically replay everyone under the newest policy?

It could retroactively change months of relationship history merely because code was deployed.

That conflicts with the frozen meaning that ordinary policy/runtime change is not itself a relationship event.

## 11. Policy migration requiring reinterpretation

V1 recommendation:

~~~text
retroactive semantic migration = NOT AUTHORIZED BY ORDINARY POLICY ACTIVATION
~~~

If a future change genuinely requires old history to be reinterpreted under a new policy, it requires a separate explicit migration decision containing:

- migration reason;
- affected policy versions;
- affected population;
- attainedStage preservation/regression rule;
- replay algorithm;
- rollback plan;
- dry-run evidence;
- audit record.

No background deploy is allowed to silently perform such migration.

## 12. Correction / retraction replay algorithm

Recommended deterministic flow:

~~~text
1. append correction/retraction command under server authority
2. resolve target lineage
3. identify earliest affected logical history slot
4. invalidate derived snapshots at/after that slot
5. load nearest prior valid snapshot or genesis
6. resolve active logical Event history after the snapshot
7. for each logical Event in deterministic order:
     bind historical authority/provenance
     select historical policy version
     rebuild Causal Episode membership
     recompute rolling anti-farming credit
     recompute Episode Profile
     recompute score effects/current candidate stage/condition
8. preserve attainedStage rules from Block A
9. atomically replace current derived projection
10. retain latest physical ledger revision
11. emit replay audit evidence
~~~

## 13. Important Block A interaction

Ordinary conflict cannot regress attainedStage.

Correction/retraction replay is different:

~~~text
if the evidence that justified an attained stage is removed or corrected
→ rebuilt attainedStage may be lower
~~~

This is not relationship decay. It means the old stage was based on invalid historical evidence.

A policy-version change alone does not get this exception.

## 14. Important Block C interaction — applied vs effective disposition

Block C approved durable recording of anti-farming-suppressed occurrences.

Replay creates a subtle requirement:

~~~text
historically applied disposition
may differ from
current effective disposition after correction/retraction replay
~~~

Example:

~~~text
A credited
B credited
C suppressed

A later retracted

replay:
C may now become effective credit
~~~

Therefore the Production artifact should distinguish:

~~~text
applied_effect_disposition
= what happened when the Event was originally committed

effective replay result
= derived current semantic effect after active-history reconstruction
~~~

The immutable Event row keeps the former. Current projection/replay output owns the latter.

Do not mutate an old Event row from SUPPRESSED to APPLIED.

## 15. Determinism requirements

Given the same:

- append-only physical ledger;
- active correction/retraction lineage;
- immutable policy artifacts;
- policy activation timeline;
- registry/payload validators;

the replay result must be byte-for-byte semantically equivalent for:

~~~text
scores
attainedStage
currentCandidateStage
currentCondition
Episode Profile
anti-farming credit decisions
~~~

Any non-deterministic model call is outside replay.

## 16. Failure handling

If a required historical policy artifact is missing:

~~~text
FAIL CLOSED
→ do not guess with the latest policy
→ do not mutate current projection
→ raise integrity/operations incident
~~~

If an Event schema validator for a historical version is missing:

same rule.

If a snapshot is corrupt:

discard snapshot and replay from earlier valid snapshot/genesis.

## 17. Recommended current-projection repair semantics

If replay output differs from user_character_states:

~~~text
ledger + policy replay wins
~~~

Repair should:

- lock the current projection row;
- verify no newer relationship revision appeared during replay;
- replace derived projection values atomically;
- preserve latest physical revision;
- record repair/replay audit metadata;
- retry from a newer baseline if concurrency invalidated the replay.

Exact PostgreSQL implementation belongs to PHASE N.

## 18. Block D owner decision set

For source-owner review, the entire block can be reduced to five choices.

### D-A — Replay architecture

Recommended:

~~~text
snapshot-assisted append-only deterministic replay
normal reads do not replay history
~~~

### D-B — Historical policy retention

Recommended:

~~~text
immutable machine-readable artifact per policy_version
+ content hash
+ old versions retained for replay
~~~

### D-C — Policy upgrades

Recommended:

~~~text
prospective by default
no automatic retroactive reinterpretation
~~~

### D-D — Correction/retraction

Recommended:

~~~text
replacement/retraction append-only
rebuild from nearest snapshot before earliest affected logical slot
historical policy timeline used during replay
~~~

### D-E — Revision / suppressed Event semantics

Recommended:

~~~text
every appended Production relationship Event consumes one revision
even when positive effect is zero

stored applied_effect_disposition remains immutable
current effective effect is derived by replay
~~~

All remain PENDING until explicit source-owner approval.

## 19. Production hold

Even after this brief:

~~~text
SRC-22 remains OPEN
no Production relationship DB mutation
no migration
no runtime policy binding
~~~

until Block D is explicitly frozen and the final closure audit passes.
