# Standard Reading Character Chat Persistence Grounding HOLD V1

Status: **IMPLEMENTATION HOLD**

Scope: Official Standard Reading -> Character Chat generated / validated / commit persistence

## 1. What is already safe

The pre-generation lifecycle can be prepared without changing semantic authority:

```text
server-minted Standard Reading preflight
-> exact subject / thread / clientTurn / release / bundle
-> authoritative attempt acquisition
-> context-ready
-> failure finalization
```

The HOLD lifecycle wrappers remain inaccessible to `myeongha_api_executor` until an explicit Production promotion.

## 2. Why generated / validated / commit is still blocked

The existing generic Chat persistence commands require exact AI execution provenance:

- renderer execution log must match the exact turn / attempt / Character / release / bundle
- every staged `grounding_ref` must be linked to that exact renderer execution
- output-guard execution must validate the exact generated content hash
- output-guard grounding links must exactly match the staged grounding set

This contract is correct and must not be weakened.

## 3. Missing authority

Current persisted Reading provenance does not identify the exact `reading_groundings.id` set used by the completed Official Reading.

Current schema facts:

- `reading_groundings` permits multiple rows for one Reading by `grounding_adapter_key + grounding_version`
- `reading_refs` pins the successful Reading execution attempt and Saju engine version
- `reading_execution_attempts` does not pin a grounding adapter/version or grounding row id
- current Standard Reading artifact/read authority exposes the delivered response provenance, not the exact grounding row identity set

Therefore none of the following is authoritative:

- choose the newest grounding
- choose every grounding for the Reading
- choose one adapter by convention
- infer the grounding from protected response text
- let the provider or API caller submit grounding ids

## 4. Required promotion condition

Generated / validated / commit persistence may proceed only after source authority provides an exact persisted binding from the completed Official Reading to its authoritative grounding identity set.

The binding must be re-readable server-side and must support deterministic verification of:

```text
Official Reading
-> exact grounding id set
-> renderer AI execution grounding links
-> staged generated grounding refs
-> output-guard grounding links
```

No Character Runtime or Chat layer may invent that binding.

## 5. Unrelated open authority

This HOLD does not resolve or modify:

- SRC-22 Relationship event/stage authority
- memory acceptance policy
- Principle / Calling / oath
- Saju semantic authority

Those remain separate authority boundaries.
