# Production Relationship Policy V1

> Track: character-memory  
> Status: **PHASE K PRODUCTION POLICY ARTIFACT / DB MUTATION DISABLED**  
> Policy version: `relationship-policy-v1`  
> Source authority: SRC-22 source-owner freeze (CLOSED 2026-09-27)

## 1. Authority boundary

This document describes the deterministic Production relationship policy artifact.

It does not authorize a direct LLM-to-database path.

~~~text
candidate
→ authority
→ deterministic relationship policy
→ server commit authority
~~~

PHASE K explicitly does **not** implement:

- Production `relationship_events` INSERT;
- `user_character_states` UPDATE;
- DB migrations;
- PostgreSQL adapters;
- Manifest/runtime binding.

Those belong to PHASE L/M/N.

## 2. Relationship state

Scores are bounded coarse signals:

~~~text
closeness 0..100
trust     0..100
friction  0..100
~~~

Positive soft-cap is disabled in V1. There is no inactivity decay. Score saturation is allowed; qualitative history remains represented by the Causal Episode Profile.

Internal relationship stages:

~~~text
S0_FIRST_MEETING
S1_FAMILIAR
S2_REGULAR
S3_OPENED
S4_SPECIAL
~~~

`S4_SPECIAL` means special relational importance. It is not automatic romance/confession authority.

Long-term attained depth is separated from current relationship condition:

~~~text
attainedStage
currentCandidateStage
currentCondition
behaviorAccess
~~~

Conditions:

~~~text
STABLE
OPEN_CONFLICT
RESOLVED_RECENTLY
~~~

Behavior access:

~~~text
STABLE              → STAGE_ALIGNED
OPEN_CONFLICT       → RESTRICTED_BY_CONFLICT
RESOLVED_RECENTLY   → CAUTIOUS_AFTER_REPAIR
~~~

Ordinary conflict does not regress `attainedStage`. Correction/retraction replay may produce a lower attained stage when the historical evidence that justified the higher stage is removed.

## 3. Production Event registry V1

The Production registry uses generic relationship semantics rather than Se-yeon-specific global Event names.

| Event kind | Family | Polarity | Delta C/T/F | Positive progression | Milestone |
|---|---|---|---:|---|---|
| COMMITMENT_MADE | commitment | neutral | 0 / 0 / 0 | no | - |
| COMMITMENT_KEPT | commitment | positive | +4 / +5 / 0 | yes | commitment_follow_through |
| COMMITMENT_BROKEN | commitment | negative | 0 / -8 / +6 | no | - |
| CHARACTER_DETAIL_REMEMBERED | recognition | positive | +3 / +4 / 0 | yes | recognition |
| CARE_ACCEPTED_BY_CHARACTER | care | positive | +3 / +4 / 0 | yes | care |
| CARE_REQUESTED_BY_CHARACTER | care | positive | +3 / +5 / 0 | yes | care |
| CHARACTER_SELF_DISCLOSURE | disclosure | positive | +2 / +2 / 0 | yes | - |
| CHARACTER_VULNERABILITY_REVEALED | vulnerability | positive | +4 / +4 / 0 | yes | vulnerability |
| RELATIONAL_EXPECTATION_INVALIDATED | conflict_repair | negative | 0 / -10 / +10 | no | - |
| CONFLICT_OPENED | conflict_repair | negative | 0 / -6 / +8 | no | - |
| RECONCILIATION | conflict_repair | repair | 0 / 0 / -6 | no | - |
| RETURN_AFTER_ABSENCE | return | neutral | 0 / 0 / 0 | no | - |

Unknown Event kinds and unknown Event schema versions fail closed.

Per-Event payload schemas are positive allowlists. Arbitrary caller fields do not become relationship authority.

Objective Event facts and Character interpretation remain structurally separate.

## 4. Se-yeon binding boundary

Se-yeon-specific behavior keys map into generic Production semantics without changing the global registry.

Examples:

~~~text
SEYEON_ADMITTED_WAITING
→ CHARACTER_VULNERABILITY_REVEALED
→ seyeon.admitted_waiting

SEYEON_ACCEPTED_HELP
→ CARE_ACCEPTED_BY_CHARACTER
→ seyeon.accepted_help
~~~

PHASE K records these bindings only. It does not automatically promote the experimental Event ledger into Production writes.

## 5. Causal Episode rules

Progression credit is issued per Causal Episode, not raw Event row.

Commitment:

~~~text
COMMITMENT_MADE
→ COMMITMENT_KEPT

= one commitment Episode
~~~

Broken commitment and repair:

~~~text
COMMITMENT_MADE
→ COMMITMENT_BROKEN
→ RECONCILIATION

= one commitment Episode
~~~

Conflict:

~~~text
CONFLICT_OPENED
→ RECONCILIATION
→ repeated reconciliation callbacks

= one conflict-repair Episode
~~~

A repeated repair callback does not create another progression credit, milestone, or repeated repair score benefit.

## 6. Anti-farming

Positive progression uses a rolling family window:

~~~text
window = 7 days
maximum credited positive Episodes per family/window = 2
~~~

The window is:

~~~text
(credit_at - 7 days, credit_at]
~~~

A suppressed occurrence remains a true Event occurrence but receives:

~~~text
positive progression credit = 0
positive score gain         = 0
stage advancement           = false
effect disposition          = SUPPRESSED_POSITIVE_CREDIT
~~~

The Event itself remains eligible for append-only history in later persistence phases.

Raw message count, calendar age, repeated assertion, and visit-only activity do not create relationship progression.

## 7. Positive weeks

A positive week is a seven-day bucket anchored to the earliest active credited positive Episode.

A bucket qualifies only when it contains at least one credited positive Causal Episode.

Therefore:

~~~text
many messages + zero credited Episodes
→ zero positive weeks
~~~

## 8. Stage gates

### S1_FAMILIAR

Required:

~~~text
closeness >= 10
trust >= 5
credited positive Episodes >= 2
distinct positive days >= 2
~~~

### S2_REGULAR

Score floor:

~~~text
closeness >= 25
trust >= 20
~~~

Diverse route:

~~~text
positive weeks >= 4
positive families >= 3
credited positive Episodes >= 6
~~~

Sustained narrow route:

~~~text
positive weeks >= 8
positive families >= 2
~~~

### S3_OPENED

Score floor:

~~~text
closeness >= 55
trust >= 50
~~~

Diverse route:

~~~text
positive weeks >= 10
positive families >= 4
credited positive Episodes >= 16
milestones >= 1
~~~

Sustained narrow route:

~~~text
positive weeks >= 20
positive families >= 2
milestones >= 1
~~~

### S4_SPECIAL

Score floor:

~~~text
closeness >= 80
trust >= 75
~~~

Diverse route:

~~~text
positive weeks >= 20
positive families >= 4
credited positive Episodes >= 32
milestones >= 3
~~~

Sustained narrow route:

~~~text
positive weeks >= 40
positive families >= 2
milestones >= 3
~~~

Self-disclosure is not a mandatory price of intimacy.

## 9. Conflict and repair

A conflict:

- may reduce trust;
- may increase friction;
- changes `currentCondition` to `OPEN_CONFLICT`;
- restricts Character behavior;
- blocks new stage promotion;
- does not normally reduce attained historical depth.

First valid reconciliation for an open conflict:

- reduces friction;
- changes the condition to `RESOLVED_RECENTLY` when no other conflict remains;
- gives no positive progression credit;
- gives no milestone;
- does not directly advance attained depth.

A later non-repair credited positive Causal Episode changes `RESOLVED_RECENTLY` back to `STABLE`.

## 10. Idempotency

Same logical Event retry applies once.

A duplicate retry:

~~~text
does not append a second semantic Event
does not consume another relationship revision
does not gain score or progression
~~~

A unique authorized Event that is appended to Production history consumes one physical revision even if its positive relationship effect is zero.

## 11. Replay

Policy replay is deterministic and contains no LLM call.

Production history uses:

~~~text
append-only Event / correction / retraction history
+ immutable historical policy artifacts
+ policy activation timeline
+ disposable snapshots
→ deterministic current projection
~~~

Policy updates are prospective by default. Deploying a new policy version does not automatically reinterpret old history.

A retroactive migration requires separate explicit migration authority.

Correction/retraction replay may change later anti-farming outcomes. For example, retracting an earlier credited care Episode may cause a later previously suppressed care Episode to become effectively credited.

Original historical rows are not rewritten to match replay.

## 12. Policy artifact identity

The machine-readable artifact is exported as:

~~~text
PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1
~~~

It is built through the repository immutable artifact registry, which canonicalizes the payload and generates a SHA-256 content hash.

The same policy version must not be silently reused for materially different semantics. A semantic change requires a new policy version.

## 13. PHASE K completion boundary

PHASE K is complete only when:

- the immutable artifact is exported;
- the Production Event registry and validators are exported;
- the deterministic evaluator passes;
- correction/retraction reference replay passes;
- anti-farming/stage/conflict tests pass;
- Se-yeon binding remains non-runtime;
- repository CI/Governance passes;
- no Production DB mutation or migration is introduced.

After PHASE K:

~~~text
PHASE L
ERD Extension + SQL constraints + append-only guards
↓
PHASE M
Atomic Relationship Event Apply + PostgreSQL adapter
↓
PHASE N
Concurrency / retry / idempotency / replay persistence
↓
PHASE O
Se-yeon Production vertical slice
~~~
