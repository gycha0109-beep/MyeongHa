# Se-yeon Event Authority V1

Status: EXPERIMENTAL RUNTIME GATE / NOT PRODUCTION RELATIONSHIP AUTHORITY

Track: `character-memory`

## Purpose

The Se-yeon event extractor proposes semantic candidates. It does not decide truth,
persistence, relationship mutation, or production Event Authority.

Required order:

```text
Guarded Dialogue
→ Event Candidate Extraction
→ Structural Candidate Guard
→ Event Authority V1
→ REJECT | ADMIT_EXPERIMENTAL
→ Experimental Event Materialization
→ Experimental Ledger
→ Experimental Relationship Projection
```

Production `relationship_events`, production relationship state mutation, durable
Memory mutation, stage transitions, score policy, and SRC-22 closure are outside
this contract.

## Core invariants

```text
SOURCE PROVENANCE ≠ TRUTH AUTHORITY
USER CLAIM ≠ ACTUAL SHARED EVENT
ASSISTANT OUTPUT ≠ CHARACTER BIOGRAPHY AUTHORITY
CHARACTER INTERPRETATION ≠ EVENT FACT
LLM CONFIDENCE ≠ AUTHORITY
REPETITION ≠ VERIFICATION
```

A candidate fact is a proposal. Event Authority rebuilds admitted facts from
authority-bearing evidence instead of copying candidate fact statements into the
ledger.

## Evidence classes

| Evidence | What it can authorize |
| --- | --- |
| current-turn observed message | occurrence of that message/interaction only |
| Integrity `VERIFIED` shared-event claim | verified shared-event fact |
| Integrity `VERIFIED` Character fact | remembered-detail truth when applicable |
| guarded assistant utterance | occurrence of the Character utterance only |
| server observation ref | server-observed conditions such as return after absence |
| Character interpretation | interpretation only; never factual truth |

## Event-specific minimum authority

- `PROMISE_MADE`: may be admitted as a current speech-act interaction.
- `PROMISE_KEPT` / `PROMISE_BROKEN`: require a prior `PROMISE_MADE` and a
  `VERIFIED` shared-event claim.
- `USER_REMEMBERED_SEYEON_DETAIL`: requires a `VERIFIED` Character fact.
- `SEYEON_ACCEPTED_HELP`, `SEYEON_REQUESTED_HELP`,
  `SEYEON_SELF_DISCLOSED`, `SEYEON_ADMITTED_WAITING`: must bind to the exact
  guarded assistant utterance. The utterance occurrence is admitted; any
  biography implied by its text is not thereby authorized.
- `RETURNED_AFTER_ABSENCE`: requires server observation authority.
- causal outcome/repair candidates must reference only prior events actually
  present in the bounded causal context.

## Admission result

`ADMIT_EXPERIMENTAL` means only that the candidate may enter the existing
experimental Se-yeon ledger.

It does not mean:

- canonical Event;
- production relationship Event;
- production relationship mutation;
- durable Memory;
- fact-authority override;
- disclosure override.

The admission contract therefore carries immutable constraints with all of
those capabilities set to false.

## Materialization boundary

Raw `SeyeonEventExtractionCandidateV2` cannot be materialized directly.

Only `materializeSeyeonAuthorizedExperimentalEventV1()` accepts an admitted
`SeyeonEventAuthorityDecisionV1`.

Server-owned identity remains outside the provider:

- `eventId`
- `dedupeKey`
- `occurredAt`

Provider-authored `dedupeBasis` is not used as the ledger dedupe key.

## SRC-22 boundary

SRC-22 remains OPEN.

This slice does not define or change:

- production Event registry;
- production payload schema;
- event → closeness/trust/friction delta;
- stage transition;
- score bounds;
- anti-farming numeric policy;
- production Episode persistence;
- last-interaction semantics;
- production policy migration;
- production DDL.
