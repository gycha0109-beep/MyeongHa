# SRC-34 — Chat Thread Creation Authority

> Status: **OPEN / BLOCKING for production-authoritative Character Chat thread creation**  
> Domain: Conversation / Character / Content / World  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `MyeongHa_Integration_Spine_v1_FINAL_REVIEWED_v1.2(1).md`
> - current repository source-gap contracts `SRC-15`, `SRC-16`, `SRC-23`, `SRC-27`

---

## 1. Gap

Primary source fixes the product flow at a high level:

```text
Character selected
→ first meeting
→ conversation continues
```

and the ERD fixes the durable conversation aggregate:

```text
conversation_threads
conversation_thread_characters
conversation_thread_content_transitions
```

For a Character thread, source also fixes that the thread pins one content release/bundle at creation, and that each active Character participation row pins the exact Character/content-bundle version.

However, source does **not** define the executable authority that turns a subject selecting a Character into one concrete, owner-scoped, bundle-pinned Chat thread. In particular, it does not define the complete eligibility, release-resolution, reuse/idempotency, and atomic creation contract.

Therefore the relational model can represent a valid created thread, but a production-authoritative `create/open Character conversation` command cannot safely manufacture that thread yet. This is `SRC-34`.

This gap is now directly observable in Production: the governed read-only Member Chat smoke can verify an existing owned thread, but current Production authority contains no owned thread to verify. That absence is not authorization to seed one by direct INSERT.

## 2. What source authority already fixes

### 2.1 Thread ownership and lifecycle envelope

`conversation_threads` fixes:

```text
id
subject_id
thread_type = single_character | multi_character | system
status = active | archived | deleted
active_content_release_id
active_content_bundle_id
content_revision
next_sequence_no
created_at / updated_at / deleted_at
```

Source fixes at least:

- `subject_id` owns the thread;
- Character threads pin one release/bundle when created;
- later default-release changes do not silently rewrite existing thread canon;
- release/bundle identity is relationally coupled;
- message sequencing belongs to the thread aggregate rather than `MAX(sequence_no)+1` reconstruction;
- content transitions are explicit, revisioned history rather than silent rebinding.

### 2.2 Character participation envelope

`conversation_thread_characters` fixes:

```text
thread_id
character_id
content_bundle_id
role = primary | participant
joined_at
left_at
```

Source fixes:

- active Character participation is bundle-pinned;
- one active primary exists for a Character thread;
- a `single_character` thread has exactly one active participant;
- Character messages refer to authoritative participation provenance rather than an arbitrary caller-supplied Character/bundle pair.

### 2.3 User-facing product shape

Use Case source fixes that:

- a user can select a Character and enter a first-meeting/conversation flow;
- the Launch MVP contains actual Characters as well as locked/future Characters;
- unlock state is authoritative server-side state rather than a client direct-write decision;
- remote content must satisfy client compatibility requirements before activation;
- content/canon and operational state are separate authorities.

These facts constrain a future creation command, but they do not specify the missing executable decision.

## 3. Missing creation authority

### 3.1 Character selection eligibility

Source does not define the complete predicate for whether a selected Character may open a new Character thread for a subject.

Missing decisions include the required interaction among:

```text
Character runtime availability
enabled state
release / retirement window
subject Character unlock state
locked/future Character presentation
client/content compatibility
rollout/cohort resolution
entitlement or product-policy gate, if applicable
```

A caller-supplied `character_id` that exists in `character_runtime_catalog` is not by itself proof that the subject is authorized to create a conversation with that Character.

### 3.2 Release / bundle selection at creation

The ERD requires a Character thread to pin one release/bundle at creation, but source does not define which authoritative resolver supplies that pair.

Missing authority includes:

```text
whether creation always uses the active default release
whether subject-specific rollout may select another release
how client/content compatibility participates
what happens when no compatible eligible release exists
whether Character runtime availability is evaluated before or after rollout resolution
which release/bundle evidence is returned or persisted as the creation decision provenance
```

Do not infer the pair from a lexical `release_key`, latest timestamp, highest version, or arbitrary active row. This composes directly with `SRC-15` and `SRC-16`.

### 3.3 Existing-thread reuse vs new-thread semantics

Source does not define whether selecting the same Character should:

```text
return an existing active single-character thread
create a new thread every time
reuse only the newest active thread
reuse a thread only when its pinned bundle/release remains eligible
archive/supersede an older thread
allow multiple simultaneous active threads with the same Character
```

The current relational uniqueness constraints do not establish a unique `(subject, character)` conversation aggregate, so repository code must not invent such a product rule.

### 3.4 Create request identity / idempotency

Source defines strong retry/idempotency principles for durable user actions elsewhere, but does not define a positive Chat-thread creation request contract such as:

```text
client creation id / dedupe key
request hash inputs
same-key same-request replay result
same-key changed-request conflict result
concurrent duplicate selection behavior
whether a retry returns the same thread id or only an equivalent thread
```

Without this authority, a network retry around first meeting can create duplicate conversations if a command invents its own semantics.

### 3.5 Initial thread state

Source does not fully define creation-time values/effects for:

```text
status/title policy
content_revision initial provenance beyond structural default
initial primary participation timestamp/evidence
whether relationship/user-character state must already exist or is initialized atomically
whether a first-meeting World Event is required
whether first-meeting dialogue/message rows are created in the same transaction or by a later turn command
whether thread creation emits an outbox/domain event
```

The absence of a required side effect in the relational schema is not authority to omit or invent one.

### 3.6 Locked / newly unlocked Character composition

Launch source distinguishes available Characters from locked/future Characters, and UC-14 defines a Character Unlock flow at a product level. But `SRC-23` documents that executable unlock-condition/effect authority remains unresolved.

Until the relevant source is resolved, thread creation must not silently equate any of these with authorization:

```text
Character row exists
runtime row is enabled
Character appears in Hall presentation
character_unlocks row is absent
character_unlocks row says unlocked without a resolved creation policy
client sends an unlocked flag
```

The future command needs an explicit source-approved composition rule.

## 4. Current safe boundary

Source-complete and enforceable now:

```text
owned thread relational envelope
thread_type/status/content-binding integrity
bundle-pinned Character participation integrity
single-character active-primary structural invariant
existing owned active thread read
existing thread sequence stream read
existing relationship projection read for its authoritative primary Character
existing thread canon is not silently changed by a new default release
```

Blocked until `SRC-34` is resolved:

```text
production-authoritative create/open Character conversation command
server claim that a selected Character is eligible for a new thread
automatic active/default release → subject thread binding
same-Character existing-thread reuse policy
creation idempotency/dedupe semantics
first-meeting side-effect transaction
Production fixture creation solely to make Chat smoke pass
```

## 5. Dependencies and separation

`SRC-34` is distinct from, but composes with, existing gaps:

```text
SRC-15
→ is the resolved content compatible with the current client?

SRC-16
→ which release applies to this subject under rollout policy?

SRC-23
→ when/how does authoritative world state unlock a Character?

SRC-27
→ how are content bundles/releases registered, activated, retired, and audited?

SRC-34
→ given authoritative content/world state, how is one concrete Character Chat thread created or reused for this subject?
```

Closing content publication alone does not define thread creation. Closing thread creation does not authorize unresolved content publication, rollout, compatibility, or unlock mutation.

## 6. What implementation must NOT invent

Until source resolution, do not promote a Production command or operational script that silently chooses:

- Character eligibility from row existence alone;
- `enabled=true` as sufficient per-subject Chat authorization;
- absent unlock row as either locked or unlocked;
- active-default release as the universal subject resolver;
- newest/highest release as a fallback;
- one-thread-per-Character or unlimited-thread semantics;
- create-vs-reuse behavior;
- caller-supplied release/bundle authority;
- arbitrary creation dedupe keys or retry behavior;
- direct Production fixture INSERT as a substitute for product creation authority;
- first-meeting World/relationship/outbox effects.

## 7. Required source resolution

Source authority should define at minimum:

1. versioned Character-thread create/open request contract;
2. authoritative per-subject Character eligibility predicate;
3. exact composition with Character unlock/current world state;
4. exact release/bundle resolver used at creation and its failure behavior;
5. client/content compatibility requirement at creation;
6. existing active thread reuse vs new-thread policy;
7. create request dedupe/idempotency and concurrency semantics;
8. initial thread status/title/content revision rules;
9. atomic primary participation creation rules;
10. required first-meeting, relationship, World Event, message, or outbox side effects, if any;
11. server response contract and minimum provenance needed for audit/retry;
12. authorization/ACL boundary for Member and Guest callers.

## 8. Verification gate after resolution

At minimum:

- caller cannot create a thread for another subject;
- unknown Character → deny;
- disabled/unavailable/out-of-window Character → source-approved deny result;
- locked Character → source-approved deny result;
- forged client unlock/availability/release inputs cannot override server authority;
- incompatible client/content pair → deterministic source-approved result;
- rollout resolution pins the approved release/bundle exactly;
- no eligible compatible release → fail closed;
- thread and active primary participation commit atomically;
- participation Character/bundle matches the pinned runtime catalog;
- duplicate same create request → source-approved idempotent result;
- changed payload under the same dedupe identity → conflict/deny according to approved contract;
- concurrent duplicate requests cannot create an unintended number of logical conversations;
- existing same-Character thread behavior matches the approved reuse/new policy;
- no silent rebinding when the global default release later changes;
- required first-meeting/world/relationship/outbox effects commit atomically if the resolved contract requires them;
- Guest/Member ownership and later guest-merge behavior preserve the approved thread ownership semantics.

## 9. Promotion boundary

```text
existing owned Chat thread read
→ production-capable

Character thread relational integrity
→ production-capable

Character Chat thread create/open mutation
→ BLOCKED by SRC-34

release-dependent creation
→ SRC-15 + SRC-16 + SRC-27 + SRC-34

unlock-dependent creation
→ SRC-23 + SRC-34
```

A valid schema for `conversation_threads` proves how an already-created thread is stored. It does not prove the missing authority that decides whether, which, and how a new Character conversation is created for a subject.