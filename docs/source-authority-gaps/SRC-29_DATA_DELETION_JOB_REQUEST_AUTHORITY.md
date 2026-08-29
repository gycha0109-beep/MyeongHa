# SRC-29 — Data Deletion Job Request Authority

> Status: **OPEN / BLOCKING for a generic non-account `POST /api/data-deletion-jobs` mutation**  
> Domain: Privacy / Deletion / Personal Records  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`
> - repository `API_CONTRACT.md`
> - repository `SERVER_COMMAND_TRANSACTION_SPEC.md`
> - existing account-deletion, record-revoke, and deletion-job read DB contracts

---

## 1. Gap

ERD v0.6 defines `data_deletion_jobs` as a persistence envelope with:

```text
scope = account | conversation | memory | life_fact | target_person
status = requested | running | completed | failed
target_resource_type / target_resource_id for non-account scopes
request_dedupe_key
```

This proves that the relational model can represent deletion jobs for those scope values.

It does **not** define a complete generic command that may accept any scope/resource pair and create the correct deletion workflow.

Primary Use Case authority is asymmetric:

- UC-34 explicitly defines account deletion as `request -> server creates deletion job -> capability/session blocking -> deletion graph -> completion`;
- UC-31 explicitly distinguishes conversation deletion, character forget, Life Fact revoke/supersede, and account deletion instead of treating them as one generic mutation;
- UC-16 requires Target Person records to be separately deletable but does not resolve target Birth/Reading provenance;
- UC-19 gives users general control over personal records but does not define one universal deletion-job command contract.

Therefore repository `API_CONTRACT.md` currently listing:

```text
POST /api/data-deletion-jobs
```

cannot be promoted as a production-authoritative generic mutation merely because `data_deletion_jobs.scope` contains several values.

This missing cross-scope request/workflow authority is `SRC-29`.

## 2. Source-complete boundaries remain available

`SRC-29` does not invalidate narrower commands whose semantics are independently source-backed.

### Account deletion start

Existing:

```text
cmd_start_account_deletion_v1
```

may remain production-candidate at its current authority boundary because UC-34 explicitly defines the account deletion request and the first transaction is already source-bounded:

```text
active member
→ deletion_pending
→ account-scope deletion job
→ revoke shares/devices
→ cancel scheduled notifications
→ block new capability work
→ outbox
```

Destructive erase/finalization and retention remain separately constrained by `P0-PR-01` and other domain gaps.

### Deletion-job status read

Existing:

```text
qry_data_deletion_job_v1
```

may continue to expose an owner-visible stored job status for a job that already exists. Reading stored scope/status does not authorize creation of a new job for that scope.

### Life Fact revoke / supersede

Existing owner-scoped Life Fact revoke and source-safe supersession-lineage commands remain available. UC-31 directly describes:

```text
현세록에서 삭제
→ life fact revoke/supersede
```

`SRC-29` does not require these immediate authority boundaries to be replaced by a generic asynchronous deletion job.

### Memory revoke / character forget

Existing Memory revoke and per-character grant-forget boundaries remain source-safe where already defined. UC-31 explicitly distinguishes character forget from broader deletion.

`SRC-29` does not authorize a generic `scope='memory'` job to silently replace those semantics.

## 3. Conversation scope is not source-complete

For `scope='conversation'`, the positive destructive/redaction workflow is already blocked by `SRC-14`.

Conversation text-equivalent payload exists in multiple durable locations:

```text
conversation_messages.body_text / message_payload_jsonb
chat_turns.request_snapshot_jsonb
chat_turn_attempts.generated_body_text / generated_message_payload_jsonb
```

Source does not yet define the complete redaction/tombstone mutation across those copies or in-flight attempt handling.

Therefore a generic deletion-job creator cannot safely do:

```text
scope='conversation'
+ target_resource_type='conversation_thread'
+ target_resource_id=<id>
```

and claim that it has created an executable privacy-complete workflow.

At most a future command could persist a request envelope after source explicitly defines what execution/finalization means. The current source does not define whether such a blocked request should be accepted, rejected, queued indefinitely, or represented by another state.

## 4. Target Person scope is not source-complete

For `scope='target_person'`, `SRC-06` remains blocking.

Target Person deletion can conflict with immutable historical Reading provenance that pins target Birth revisions.

Primary source has not selected whether deletion:

- cascades dependent Reading/Share artifacts;
- uses privacy tombstones/projections;
- preserves some provenance while removing raw Birth input;
- or follows another explicit dependency graph.

Therefore the existence of `scope='target_person'` does not authorize job creation plus an invented destructive executor.

`SRC-28` is separate: it governs ordinary Target Person metadata edits, not deletion.

## 5. Memory scope lacks generic job semantics

ERD includes `scope='memory'`, but Primary Use Case does not define a positive generic Memory deletion-job workflow.

UC-31 distinguishes:

```text
이 캐릭터가 잊기
→ 해당 캐릭터용 memory revoke
```

and the broader personal-record model distinguishes:

- a shared durable Memory item;
- character-specific `record_access_grants`;
- Memory proposal staging;
- source-message provenance.

Missing authority for a generic `scope='memory'` deletion job includes:

```text
whether target is memory_items.id or another logical resource
whether deletion means revoke item, revoke all grants, physical erase, redact payload, or tombstone
whether other characters' grants survive
whether source-message/provenance references survive
whether proposal/source derivatives are included
whether already-revoked Memory creates a no-op, completed job, or conflict
whether the job is synchronous authority wrapped in a job row or genuinely asynchronous
```

Do not infer these rules from the fact that standalone Memory revoke already exists.

## 6. Life Fact scope lacks generic job semantics

ERD also includes `scope='life_fact'`, while UC-31 explicitly gives the user-facing semantic:

```text
현세록에서 삭제
→ life fact revoke/supersede
```

Existing Life Fact commands already implement source-safe revocation/lineage boundaries.

Source does not define whether `POST /api/data-deletion-jobs` with `scope='life_fact'` should:

```text
call/duplicate the direct revoke command
create a separate asynchronous job
physically erase the fact after revoke
revoke all character grants atomically
redact historical superseded facts
preserve or redact source-message provenance
return an already-completed job when the fact is already revoked
```

A generic job must not create a second conflicting deletion authority alongside the existing direct revoke semantics.

## 7. Missing target-resource type authority

`data_deletion_jobs.target_resource_type` is free text in the ERD.

Primary source does not define the normative mapping:

```text
scope='conversation'  -> target_resource_type = ?
scope='memory'        -> target_resource_type = ?
scope='life_fact'     -> target_resource_type = ?
scope='target_person' -> target_resource_type = ?
```

Nor does it define whether the client supplies this value or the server derives it from the route/scope.

Therefore do not create an arbitrary string registry or trust client-supplied `targetResourceType` as authority.

## 8. Missing generic request identity / dedupe contract

The table has:

```text
UNIQUE(subject_id, request_dedupe_key)
```

but a storage uniqueness key is not, by itself, the positive API idempotency contract for every scope.

Missing authority includes:

```text
client-generated vs server-generated dedupe key
same key + different scope behavior
same key + different target behavior
same target + different key behavior
retry after requested/running/completed/failed
whether failed jobs may be resumed or must create a new logical job
whether resource lifecycle changes after the first request invalidate replay
```

The existing account deletion command deliberately fixes scope=`account`, so it can interpret its request key within one endpoint-specific semantic shape. That does not generalize automatically to all deletion scopes.

## 9. Missing initial status and execution handoff

ERD allows:

```text
requested | running | completed | failed
```

but source does not define a generic cross-scope rule for the status created by `POST /api/data-deletion-jobs`.

Account deletion currently begins `running` because its first blocking transaction executes immediately.

For other scopes source does not define whether create should:

- persist `requested` and wait for a worker;
- execute the immediate revoke/redaction boundary and persist `running`;
- finish synchronously and persist `completed`;
- reject creation when downstream destructive authority is unresolved.

Do not invent one status policy for all scopes.

## 10. Missing immediate authorization boundary per scope

Privacy deletion often requires an immediate effect before physical retention work finishes.

Account deletion has a defined immediate boundary: capability/session/share/device/scheduled-notification blocking.

Source does not define the equivalent generic boundary for every non-account scope.

Examples that must not be guessed:

```text
conversation request -> when does GET/chat context stop showing the thread?
memory request       -> when do all/some characters lose context access?
life_fact request    -> when do grants and context exclude the fact?
target_person request-> when do compatibility/new Reading requests stop using the target?
```

Existing direct revoke commands may provide some narrow immediate effects, but a generic deletion job cannot silently compose them without an approved scope workflow.

## 11. Missing ownership/resource-resolution contract

A generic endpoint would also need deterministic resource resolution for each scope.

Source does not define one shared algorithm for:

```text
resource existence vs no-probe not-found response
cross-owner target denial
merged/deletion_pending subject behavior
already-deleted/revoked target behavior
resource id textual encoding in target_resource_id
scope/resource-type consistency
linked aggregate resolution, e.g. Target Person -> Birth Profile
```

Each existing narrow command can enforce its own source-backed aggregate ownership. A generic command must not bypass those boundaries by inserting a job row first.

## 12. Relationship to other authority gaps

### SRC-06 — standalone Birth / Target deletion

Blocks positive Target/Birth destructive dependency semantics. `SRC-29` does not duplicate that decision; it prevents a generic job request API from pretending the scope is executable before `SRC-06` is resolved.

### SRC-14 — conversation redaction

Blocks privacy-complete conversation deletion mutation. `SRC-29` does not define redaction; it only records that generic job creation cannot manufacture that missing executor semantics.

### SRC-25 — Personal Record positive schema authority

`SRC-25` governs creation/validation of new Life Fact/Memory values. Existing stored-record revoke semantics remain independently available. `SRC-29` governs whether those records participate in a generic deletion-job workflow.

### P0-PR-01 — retention

Retention duration/legal erasure policy remains independent. Even after a request/job contract is defined, destructive finalization may still require the retention decision.

## 13. Affected surfaces

Blocked by `SRC-29` as a generic production-authoritative mutation:

```text
POST /api/data-deletion-jobs   # arbitrary scope/resource body
cmd_create_data_deletion_job(scope, target_type, target_id, ...)
generic deletion-job worker dispatch based only on scope strings
generic scope -> resource table mapping invented in implementation
```

Not blocked:

```text
POST /api/account/delete -> existing account-specific start command
GET /api/data-deletion-jobs/:id -> owner-scoped stored status read
existing Life Fact revoke/supersede commands
existing Memory revoke / character-forget grant revocation commands
fail-closed conversation/target deletion handling under SRC-14/SRC-06
```

## 14. Pack / implementation must NOT invent

Until `SRC-29` is resolved, do not:

- accept arbitrary client `scope`, `targetResourceType`, and `targetResourceId` and insert a job row;
- treat the ERD scope enum as a complete executable workflow registry;
- map every non-account deletion request to `status='requested'` or `status='running'` by convention;
- reinterpret direct Life Fact/Memory revoke commands as asynchronous deletion jobs without source approval;
- accept conversation/Target Person jobs while claiming the unresolved destructive workflow is complete;
- use `target_resource_type` free text as a trusted dispatch key;
- invent generic replay semantics solely from the table UNIQUE constraint;
- let a generic worker switch on scope and perform domain mutations that are individually blocked by source gaps;
- call a stored job `completed` merely because an immediate revoke happened when physical/redaction requirements remain unresolved.

Where a caller needs a deletion action today, route only to the narrower source-backed command whose semantics are already defined, or fail closed for unresolved scopes.

## 15. Required source resolution

At minimum source authority should define:

1. whether `POST /api/data-deletion-jobs` is truly a generic public mutation or only an internal/common storage abstraction;
2. the allowed user-facing scopes for that endpoint;
3. normative `scope -> target resource type/aggregate` mapping;
4. whether resource type is client-supplied or server-derived;
5. request schema and idempotency/replay/conflict contract per scope;
6. initial job status and synchronous-vs-worker handoff per scope;
7. immediate authorization/context-removal boundary per scope;
8. relationship between `memory` / `life_fact` jobs and existing direct revoke commands;
9. conversation execution semantics after `SRC-14` resolution;
10. Target Person/Birth dependency semantics after `SRC-06` resolution;
11. ownership/no-probe behavior and already-deleted/revoked target behavior;
12. failed-job retry/resume/new-job semantics;
13. completion criteria distinct from retention/destructive finalization;
14. outbox/event requirements, if any, for each scope.

## 16. Verification after resolution

At minimum:

- only source-approved scopes may create jobs;
- scope/resource-type/id combinations are deterministic and server-authorized;
- cross-owner targets cannot be probed or queued;
- same logical request replay follows the approved idempotency contract;
- same key with conflicting scope/target follows the approved conflict contract;
- initial status matches the approved scope lifecycle;
- immediate context/authorization effects occur exactly at the approved boundary;
- Life Fact and Memory requests do not duplicate or contradict direct revoke semantics;
- conversation deletion cannot complete while SRC-14-required redaction remains unfinished;
- Target Person deletion cannot complete while SRC-06-required dependent provenance handling remains unresolved;
- account deletion behavior remains compatible with `cmd_start_account_deletion_v1`;
- deletion-job status read remains owner-scoped for active/deletion-pending canonical subjects;
- retention/finalization behavior follows `P0-PR-01` rather than being inferred from job status.
