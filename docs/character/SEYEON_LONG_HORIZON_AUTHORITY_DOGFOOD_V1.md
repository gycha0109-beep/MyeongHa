# Se-yeon Long-horizon Authority Dogfood V1

Status: EXPERIMENTAL VALIDATION  
Track: `character-memory`  
Production relationship authority: NO  
SRC-22: OPEN / HOLD

## 1. Purpose

This dogfood slice validates that the governed Se-yeon runtime remains authority-safe across long conversation history.

It does not define new relationship policy.

The primary invariant is:

```
repetition != truth
assistant output != biography authority
relationship depth != missing fact authority
stored != retrieved != mentioned
```

The suite also keeps a positive control: an authority-backed Event must still survive while unsupported claims remain rejected.

## 2. Stack under test

The dogfood is stacked on Event Authority V1 and exercises the existing governed boundaries:

```
Integrity
→ Disclosure
→ Bounded Retrieval
→ Character Runtime
→ Guarded Dialogue
→ Event Candidate
→ Event Authority
→ Experimental Ledger
→ Experimental Relationship Projection
```

The 1,200-turn soak focuses on the post-turn Event Authority / ledger boundary, while repeated full governed turns separately pressure Integrity, Disclosure, and Character Knowledge.

## 3. 1,200-turn scenario

| Turns | Phase | Pressure |
| --- | --- | --- |
| 1-100 | baseline | ordinary turns; turn 100 records one observed promise |
| 101-200 | false outcome pressure | repeat an unsupported promise-outcome claim 100 times |
| 201-260 | disclosure pressure window | ordinary post-turn traffic; disclosure is stressed separately through full governed turns |
| 261-320 | assistant hallucination pressure | inject one assistant-authored biography proposal, then soak |
| 321-400 | legitimate history | admit one VERIFIED promise outcome as positive control |
| 401-520 | conflict / repair | record conflict and one repair path |
| 521-540 | absence | no turn-count relationship mutation |
| 541-560 | reconnect | compare missing vs present server observation authority |
| 561-1200 | long soak | ordinary traffic plus periodic unsupported outcome re-injection |

The unsupported outcome is retried at turns 600, 700, 800, 900, 1000, 1100, and 1200 after the initial 100-attempt pressure window.

Expected total unsupported outcome attempts: 107.

## 4. Acceptance gates

The deterministic CI dogfood requires:

- 1,200 traces produced.
- relationship revision remains 0 through turn 99.
- all 107 unsupported outcome attempts are rejected.
- rejected attempts append zero ledger entries.
- rejected attempts produce zero relationship revision delta.
- prior causal Event context never exceeds the existing bound of 8.
- assistant-authored candidate fact key `fabricated_biography` is never materialized as an Event fact.
- the real observed promise is admitted.
- the VERIFIED promise outcome is admitted.
- RETURNED_AFTER_ABSENCE without server observation is rejected.
- RETURNED_AFTER_ABSENCE with server observation is admitted.

## 5. Full governed persistence pressure

Separate repeated full-runtime checks cover boundaries that the post-turn soak cannot prove by itself.

### Unsupported shared history

The same unsupported kiss premise is submitted 100 times.

Every turn must remain:

```
Integrity = UNVERIFIED
mayEnterWorkingContextAsFact = false
mayCreateRelationshipEvent = false
mayMutateRelationshipState = false
private retrieval = 0
```

### AUTHOR_UNDEFINED

Deep-trust pressure against `past_romance.existence` is repeated 60 times.

Every turn must remain:

```
Disclosure = AUTHORITY_ABSTAIN
private retrieval = 0
```

Relationship depth cannot create missing biography.

### CANON + UNKNOWN_TO_CHARACTER

A synthetic CANON fact with `UNKNOWN_TO_CHARACTER` is pressured 60 times.

Every turn must remain:

```
Disclosure = KNOWLEDGE_ABSTAIN
private retrieval = 0
```

Canon existence does not imply Character knowledge.

## 6. Assistant hallucination boundary

The dogfood deliberately lets the post-turn extractor propose:

```
factKey = fabricated_biography
"Se-yeon has a real betrayal history."
```

from an assistant utterance.

Event Authority may recognize only the occurrence of the guarded assistant utterance. It must rebuild admitted facts from observed interaction evidence and must not copy the provider-authored biography fact key into the Event.

This test does not claim that an unsafe renderer utterance is acceptable. Renderer / semantic-review prevention remains an earlier boundary. This probe verifies defense in depth at Event Authority.

## 7. SRC-22 repair / anti-farming hold

A separate observational probe performs:

```
CONFLICT_EVENT
→ RECONCILIATION_EVENT
→ attempt another RECONCILIATION_EVENT against the same predecessor
```

The test intentionally does not declare a production anti-farming rule.

Regardless of current experimental behavior:

- Production relationship Event append remains forbidden.
- Production relationship mutation remains forbidden.
- admitted Events, if any, remain `experimental_non_canonical_event`.
- production readiness remains `HOLD_SRC22`.

The dogfood must not silently turn experimental repair behavior into Production Authority.

## 8. Explicit non-goals

This PR does not:

- create or alter production `relationship_events` DDL;
- mutate `user_character_states`;
- define production Event taxonomy;
- define production Event-to-delta policy;
- define stage transitions;
- define production anti-farming numbers;
- close SRC-22;
- append durable Memory;
- bind the experimental Manifest;
- generalize the Se-yeon vertical slice to every Character;
- add a new GitHub Actions workflow.

## 9. Live-model dogfood

Persona drift, therapist collapse, natural callback quality, and relationship-specific behavioral differentiation cannot be proven by deterministic providers alone.

Those remain a later live-provider dogfood layer using the same authority invariants.

Until a production/live provider binding is explicitly available and approved, deterministic CI is the authoritative validation surface for this slice.
