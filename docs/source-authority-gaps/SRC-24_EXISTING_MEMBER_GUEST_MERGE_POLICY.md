# SRC-24 — Existing-Member Guest Merge Conflict / Resolution / Domain Action Authority

> Status: **OPEN / BLOCKING for production-authoritative Guest → existing Member merge execution**  
> Domain: Auth / Owner / Merge lifecycle  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`

---

## 1. Gap

UC-32 and ERD v0.6 define the **merge envelope and safety invariants** for claiming a Guest Session into an existing Member account:

```text
verify guest ownership proof/session
→ exactly one subject_merge_job for the guest session
→ detect duplicate/conflict resources
→ auto-merge only resources that are mergeable
→ require explicit resolution for conflicts such as Birth Profile
→ record subject_merge_actions
→ keep historical guest ledgers owned by the guest subject
→ import/merge only canonical-member current state that source policy authorizes
→ consume Guest Session
→ guest subject status=merged, merged_into_subject_id=member
```

However primary source does not define the executable domain policy that decides **what is a conflict, what is mergeable, which resolution choices are valid, and which merge action must be applied to each resource**.

Therefore the relational state machine is source-backed, but a full production-authoritative merge command cannot be implemented deterministically without inventing product semantics. This is `SRC-24`.

## 2. Source-complete boundary

Primary source already fixes:

- Guest ownership/session proof is required;
- one Guest Session can resolve to exactly one canonical Member destination;
- another user's Guest Session cannot be claimed;
- claim is one-time/idempotent at the product level;
- existing Member Birth Profile must not be silently overwritten by Guest data;
- immutable/history ledgers are never raw-reparented;
- merged guest history remains guest-owned and read-only through dedicated direct-lineage authorization;
- new writes after merge use the canonical Member subject;
- a guest Birth Profile used for future canonical-member Reading must be explicitly imported as a new member-owned Birth profile/revision rather than reused across ownership;
- `subject_merge_jobs` stores `policy_version`, status, minimized conflicts/resolution, and idempotency key;
- `subject_merge_actions` records `retain_readonly | import_new | merge_projection | discard` plus planned/applied/skipped/failed audit state;
- completing a merge sets guest subject to direct `merged → canonical member` lineage and consumes the Guest Session.

The existing `qry_subject_merge_job_v1` and direct merged guest lineage projection are compatible with this safe boundary because they only read stored authority; they do not decide merge semantics.

## 3. Missing executable conflict authority

Source says duplicate/conflict items are detected but does not define a versioned conflict registry or algorithm.

Missing decisions include:

```text
which resource/domain families participate in merge detection
what constitutes exact duplicate vs compatible import vs conflict
Birth Profile equality/near-duplicate/conflict rules
Profile nickname/locale/timezone conflict rules
Life Fact / Memory duplicate semantics
relationship projection conflict semantics
Character Unlock / Episode progress conflict semantics
Reading/Conversation handling beyond read-only history
notification/device/current-setting handling, if any
```

A service cannot infer these rules from table shape alone.

## 4. Missing conflicts/resolution JSON contracts

ERD labels:

```text
conflicts_jsonb   = validated/minimized
resolution_jsonb  = nullable validated decisions
```

but source does not define their versioned schemas.

It does not define:

- conflict item discriminator/IDs exposed to the client;
- allowed resolution options per domain;
- whether the client chooses source/target/import/discard or another semantic action;
- how stale UI resolution is detected if member/guest current state changes;
- whether resolution can be partially submitted or amended;
- privacy minimization rules for each conflict payload.

The Pack must not invent a `MERGE_CONFLICT` detail schema and then treat it as primary authority.

## 5. Missing policy_version semantics

`subject_merge_jobs.policy_version` proves that merge policy meaning is versioned, but primary source does not define:

```text
policy artifact/schema
active policy selection
historical policy retention/replay
whether policy_version changes on resume
how a policy upgrade affects awaiting_resolution jobs
```

No merge-policy content hash/table/DSL should be invented without source authority.

## 6. Missing domain action planning/apply rules

The allowed `subject_merge_actions.action_type` enum is source-defined, but mapping resources to those actions is not.

Source does not define deterministic rules such as:

```text
resource/domain + conflict + user resolution
→ retain_readonly | import_new | merge_projection | discard
```

Nor does it define each domain transformation, for example:

- how imported Birth IDs/revisions are allocated and linked to the action;
- whether Life Facts/Memory Items are imported, deduped, or history-only;
- whether current projections may be merged and by what algorithm;
- whether Relationship score/stage can be merged at all (`SRC-22` also applies if attempted);
- whether Character Unlock state can be OR'ed/re-evaluated/imported (`SRC-23` also applies if attempted);
- whether Episode progress can be combined (`SRC-17` may apply to resulting state/effects).

The presence of `merge_projection` does not define a projection merge formula.

## 7. Retry / resume / failure semantics missing

UC-32 requires one-time/idempotent claim and ERD provides dedupe uniqueness, but full command replay semantics remain incomplete.

Source does not define:

```text
same idempotency key + changed resolution/request behavior
request hash/canonicalization for merge requests
failed action retry/resume semantics
partial action failure rollback vs resumable running job
status transitions among detected/awaiting_resolution/running/failed/completed
whether completed response-loss retry returns the prior result and how it is reconstructed
```

A generic same-key/different-request conflict rule cannot be assumed for merge unless the source defines how request identity is persisted/compared.

## 8. Member lifecycle eligibility ambiguity

ERD v0.6 says the merge command verifies the member subject is `active/deletion_pending`, while the current Pack narrows execution to `active` only.

Fail-closing new merge work during deletion may be operationally sensible, but that narrower rule is not explicitly established by UC-32. The source must resolve whether:

```text
deletion_pending member
→ may start/resume no merge
→ may only finish an already-running merge
→ may satisfy relational target validity but remain command-ineligible
```

Until resolved, production command behavior must not present the Pack's active-only choice as primary-source authority.

## 9. Implementation must NOT invent

Until `SRC-24` is resolved, do not promote a production-authoritative merge command that silently chooses:

- conflict detection rules or domain inventory;
- conflict/resolution JSON schemas;
- per-domain resolution choices;
- `policy_version` artifact semantics;
- action planning from resource→action_type;
- import/merge transformation algorithms;
- partial-failure/resume behavior;
- same-key/different-shape request conflict semantics not representable from source;
- deletion_pending target eligibility behavior;
- Relationship/Unlock/Episode merge formulas that are independently blocked by `SRC-22`/`SRC-23`/`SRC-17`.

## 10. Current safe boundary

Source-complete and testable now:

```text
subject_merge_jobs / subject_merge_actions relational envelope
one guest session → one canonical merge destination
same guest/member/idempotency uniqueness
owner/source FK integrity
no guest/member self-merge
direct canonical member lineage only
historical ledger raw-reparent forbidden
merged guest generic writes denied
member-owned current merge-job status read
canonical member → direct merged guest history projection
member Birth cannot be silently overwritten
future canonical Reading cannot directly use guest-owned Birth
```

Blocked until `SRC-24`:

```text
POST /api/auth/merge-guest as a production-authoritative full execution workflow
MERGE_CONFLICT payload/resolution contract
conflict detector
merge action planner
per-domain import/merge/discard executor
merge failure/resume state machine
```

## 11. Required source resolution

At minimum source authority should define:

1. participating domain/resource inventory;
2. deterministic duplicate/conflict classification rules;
3. versioned `conflicts_jsonb` schema;
4. versioned `resolution_jsonb` schema and legal user choices;
5. merge policy version selection/retention semantics;
6. deterministic resource→action planning rules;
7. per-domain `import_new` / `merge_projection` transformation semantics;
8. stale-resolution/concurrency behavior;
9. failure/retry/resume/status-transition semantics;
10. idempotent replay/request-shape conflict behavior;
11. member `deletion_pending` start/resume eligibility;
12. interaction with independently blocked Relationship/Unlock/Episode policies.

## 12. Verification after resolution

At minimum:

- other user's guest proof/session cannot be claimed;
- same guest session cannot target two Members under race;
- exact retry converges to one logical merge;
- conflicting retry shape follows the approved contract;
- member Birth is never silently overwritten;
- conflict payload is minimized/versioned;
- stale resolution cannot apply to changed state;
- every planned action follows the approved domain policy;
- partial failure/retry cannot duplicate imported resources or projection effects;
- immutable guest history is never reparented;
- imported resources become canonical-member-owned new resources where required;
- completed merge consumes guest session and creates direct merged lineage exactly once;
- merged guest remains read-only for normal product writes;
- applicable `SRC-22`/`SRC-23`/`SRC-17` policies are independently resolved before those domain projections are transformed.
