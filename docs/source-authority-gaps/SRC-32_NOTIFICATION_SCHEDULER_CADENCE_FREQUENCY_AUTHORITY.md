# SRC-32 — Notification Scheduler Cadence / Frequency / Eligibility Authority

> Status: **OPEN / BLOCKING for autonomous production notification creation/scheduling policy**  
> Domain: Notification / Return Loop / Scheduler  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`
> - `MyeongHa_Character_System_Architecture_C1_v0.1_SELF_REVIEWED(1).md`
>
> Related gaps:
> - `SRC-12` Notification preference missing-row/default/materialization authority
> - `SRC-13` Notification inbox status membership authority
> - `SRC-19` Device installation registration/re-registration lifecycle authority
> - `SRC-31` Notification delivery provider resolution authority

---

## 1. Gap

Primary Source requires a server-side notification scheduler/return loop that does **not** spam, respects user notification controls, and only emits notifications backed by real character/content/reading state.

It also provides examples of conditions that may justify a notification and states that notification frequency caps are server-managed.

Primary Source does **not**, however, define the executable production policy needed to decide deterministically:

```text
whether a candidate trigger is eligible now
which exact cadence/threshold applies
which frequency-cap window/count applies
which template is selected
which logical notification instance/dedupe identity is produced
what happens under concurrent or repeated scheduler evaluation
what happens when eligibility changes before send
how policy changes are versioned/provenanced, if at all
```

Therefore the repository must not promote a Pack-authored cadence/frequency schema or example threshold into production notification authority.

---

## 2. What Primary Source already fixes

### 2.1 Return-loop purpose and anti-spam boundary

The Use Case authority requires return-loop notifications to connect to actual product/world/reading state rather than act as generic spam or fabricated urgency.

A notification must not invent an event merely to bring the user back.

### 2.2 Scheduler checks conditions before emitting

Primary Source describes a notification scheduler that checks conditions before producing a push/return-loop notification.

Relevant source-level inputs include, depending on the flow:

```text
relationship state
recent interaction state
actual world/content/reading events
user notification preference
user timezone / quiet hours
opt-in / opt-out
server-managed frequency cap
```

### 2.3 Bounded notification categories

Primary Source defines the bounded initial notification categories:

```text
character_return
new_monthly_reading
episode_unlock
new_character
service_notice
```

This category inventory does not itself define the scheduler algorithm for each category.

### 2.4 Example candidate conditions

Primary Source gives examples such as:

```text
last character conversation was some period ago (example: 3 days)
a new monthly reading actually became available
a user-saved important date is approaching
an episode became unlocked
```

These examples establish intended product scenarios. They do **not** provide a closed executable trigger registry or state machine.

In particular, an example such as “3 days since last conversation” must not be converted into a universal production threshold merely because it appears in the Use Case text.

### 2.5 Persistence envelope

ERD v0.6 provides stored notification state including, among other fields:

```text
notifications.category
notifications.character_id
notifications.content_bundle_id
notifications.source_world_event_id
notifications.template_key
notifications.payload_jsonb
notifications.dedupe_key
notifications.status
notifications.scheduled_at
notifications.created_at
```

It also provides user notification settings/preferences, logical installation deliveries, and append-only provider-attempt provenance.

Those rows support persistence and later delivery. They do not define the missing scheduler decision policy.

---

## 3. Missing authority

### 3.1 Normative trigger registry

Primary Source does not define the closed production set of scheduler trigger kinds or their positive input schemas.

It does not decide, for example, whether every source-level example becomes a first-class trigger type, whether multiple source signals compose into one trigger, or whether a trigger can be suppressed by another domain state beyond the stated high-level constraints.

### 3.2 Exact cadence and thresholds

Primary Source does not define final numeric thresholds such as:

```text
character-return inactivity duration
monthly/yearly re-notification interval
important-date lead time
new-content reminder delay
minimum interval between same-category notifications
```

The source-level examples are not sufficient authority for these numbers.

### 3.3 Frequency-cap semantics

Primary Source requires the server to manage notification frequency caps, but does not define:

```text
window duration
maximum count
per-subject vs per-category vs per-character scope
rolling vs fixed window
priority/override behavior
what counts toward the cap
whether cancelled/expired/failed notifications count
how concurrent scheduler runs consume the cap
```

### 3.4 Template-selection authority

Primary Source requires notifications to be grounded and privacy-safe, but does not define a complete deterministic mapping from scheduler candidate state to `template_key`.

The scheduler must not choose arbitrary template strings or infer a production mapping from examples.

### 3.5 Logical notification identity / dedupe-key construction

The ERD requires persisted `dedupe_key` uniqueness for logical notifications, but Primary Source does not define the canonical construction of that key for autonomous scheduler events.

The existence of a unique constraint is not equivalent to an authority contract for:

```text
same source event replay
same candidate evaluated by two workers
same category on consecutive days
same source event rendered by different characters/templates
policy change followed by reevaluation
```

### 3.6 Scheduler replay and concurrency

Primary Source does not define the scheduler command/state machine needed to distinguish:

```text
exact evaluation replay
a new notification opportunity
a stale candidate
an already-materialized logical notification
a candidate concurrently materialized by another scheduler worker
```

A production scheduler needs deterministic convergence here; DB uniqueness errors alone are not the complete lifecycle contract.

### 3.7 Eligibility changes before delivery

Source authority does not fully define what happens if a candidate was valid when materialized but before provider delivery:

```text
user disables the category
global notifications become disabled
quiet hours begin
source content/reading state changes
source event becomes obsolete
the installation is revoked
subject enters deletion_pending
```

Some individual constraints are independently source-backed — for example revoked installations/deletion lifecycle boundaries — but the scheduler-level re-evaluation/cancel/defer policy is not fully specified.

### 3.8 Policy provenance / evolution

Primary Source does not define a normative `NotificationPolicyDefinition`, `policyVersion`, policy `contentHash`, registry table, or immutable artifact schema for scheduler cadence/frequency rules.

Therefore a Pack-authored object such as:

```ts
interface NotificationPolicyDefinitionV1 {
  policyVersion: string;
  contentHash: string;
  category: NotificationCategory;
  eligibilityRuleKey: string;
  minimumIntervalSeconds?: number;
  maxPerWindow?: { seconds: number; count: number };
}
```

must **not** be treated as Primary Source authority.

A future source resolution may choose versioned immutable policy artifacts, DB-backed configuration, deploy-time code configuration, or another mechanism. The current sources do not choose among them.

### 3.9 Experiment / policy-change behavior

Primary Source does not define whether cadence/frequency experiments are permitted, how subjects are assigned, or how historical scheduler decisions preserve policy provenance when a rule changes.

Do not infer experiment authority from generic release/analytics infrastructure.

---

## 4. What the implementation must NOT invent

Until SRC-32 is resolved, do not claim production-authoritative autonomous scheduling by silently choosing any of the following:

- hard-code “3 days since last conversation” as the universal `character_return` threshold;
- invent category-specific intervals or maximum counts;
- invent rolling/fixed frequency-cap windows;
- invent a final trigger registry from Use Case examples;
- invent `NotificationPolicyDefinitionV1` as a Primary Source contract;
- invent policy `contentHash`/`policyVersion` persistence;
- infer scheduler dedupe-key composition solely from the `notifications.dedupe_key` column;
- use arbitrary template selection logic as authority;
- treat a unique-constraint collision as the complete replay/concurrency protocol;
- silently decide whether policy changes create a new logical notification opportunity;
- silently decide whether an already-materialized notification is cancelled, deferred, expired, or retained after later eligibility changes.

These may eventually be reasonable engineering choices, but they are not source-authorized today.

---

## 5. Current source-safe boundary

SRC-32 does **not** invalidate the following independently source-backed or already-implemented boundaries:

```text
notification category relational constraints
stored notification ledger read
notification read-state command
notification preference/settings persistence envelope
standalone device revoke
logical delivery ownership/provenance reads
provider-attempt allocation/finalization persistence mechanics
revoked installation blocking new delivery attempts
cancelled notification blocking new delivery attempts
account-deletion notification/device cleanup boundaries
```

The following remain governed by their own gaps:

```text
preference missing-row/default/materialization → SRC-12
final inbox membership/status semantics       → SRC-13
device registration/re-registration           → SRC-19
provider routing resolution                   → SRC-31
```

SRC-32 is specifically about **autonomous scheduler decision authority**: candidate → eligible now/not now → logical notification materialization/scheduling under cadence/frequency policy.

A service/admin path that explicitly creates a notification is not automatically source-complete merely because SRC-32 is scoped to autonomous scheduling; that write path still needs its own applicable source authority and authorization/audit boundary.

---

## 6. Required source resolution

Primary Source should define enough of the following to make scheduler execution deterministic:

### 6.1 Trigger contract

```text
final scheduler trigger kinds
positive input schema per trigger
which source state/event proves each trigger
category mapping
whether multiple source signals compose
```

### 6.2 Eligibility contract

```text
required subject/source state
preference / opt-out interaction
timezone selection authority
quiet-hours evaluation semantics
content/reading/episode availability requirements
stale/obsolete candidate handling
```

### 6.3 Cadence/frequency contract

```text
exact thresholds or an authoritative resolver for them
frequency-cap scope
frequency-cap window model
counting semantics
priority/exception semantics, if any
```

### 6.4 Materialization identity

```text
canonical logical notification identity
dedupe-key inputs/canonicalization
same-event replay semantics
policy-change reevaluation semantics
concurrent scheduler convergence
```

### 6.5 Template/payload authority

```text
candidate/category → allowed template selection
payload schema/projection
privacy-safe preview relationship
content-bundle/version relationship where applicable
```

### 6.6 Policy provenance

Source must explicitly decide whether scheduler policy is versioned/provenanced and, if so:

```text
policy identity
policy schema/storage location
historical decision provenance
migration/change semantics
```

Do not assume `policyVersion + contentHash` unless Source actually adopts it.

---

## 7. Verification gate after resolution

At minimum, production scheduler verification should cover:

- a source-approved positive trigger creates exactly one logical notification;
- an unsupported/unknown trigger creates none;
- an example condition does not execute unless adopted by the resolved policy;
- exact scheduler replay converges to the same logical notification;
- concurrent scheduler evaluation converges deterministically without duplicate logical notifications;
- category/global opt-out prevents newly unauthorized scheduling;
- quiet-hours behavior matches the resolved timezone and boundary semantics;
- frequency caps are enforced at the resolved scope/window;
- cap accounting under concurrency is deterministic;
- stale/obsolete candidate behavior matches the resolved contract;
- template selection is from the resolved positive mapping only;
- dedupe identity is canonical and tested across retries/re-evaluation;
- scheduler policy changes preserve the resolved provenance/evolution semantics;
- scheduler materialization does not bypass `SRC-19`/`SRC-31` delivery boundaries;
- no notification fabricates a character/world/reading event merely to satisfy a return-loop goal.

---

## 8. Relationship to existing notification authority

The notification pipeline must be treated as multiple distinct authority layers:

```text
user preference/default materialization
→ SRC-12

inbox membership/status projection
→ SRC-13

autonomous scheduler candidate/cadence/frequency decision
→ SRC-32

device registration/re-registration
→ SRC-19

logical delivery + provider-attempt persistence mechanics
→ source-backed baseline

provider routing resolution
→ SRC-31
```

Resolving one layer does not implicitly resolve the others.

---

## 9. Immediate repository consequence

Until SRC-32 is resolved:

```text
Primary Source examples
≠ final NotificationPolicyDefinition
≠ final numeric cadence/cap configuration
≠ production-authoritative autonomous scheduler algorithm
```

Lower implementation specs must describe the source-backed notification goals/constraints and mark the executable cadence/frequency/eligibility policy as source-gated rather than manufacturing a policy schema.