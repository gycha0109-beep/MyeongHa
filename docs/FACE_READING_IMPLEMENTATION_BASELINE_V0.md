# Face Reading Engine FR-0 / FR-0.5 Implementation Baseline

Status: **IMPLEMENTED FOUNDATION CANDIDATE**  
Branch target: `feat/face-reading-fr0-foundation`

## Implemented

A separate package is introduced:

```text
packages/face-reading/
```

It owns no UI, character persona, product DB, or image model. It contains only Face Reading authority contracts and deterministic boundary helpers.

### Contracts

- F0~F8 taxonomy
- source work / witness / passage / lineage
- methodology pack
- region map
- metric / operationalization
- rule DSL
- claim type registry
- comparison policy
- shared observation bundle adapter contract
- semantic product reading
- character-safe Face Grounding

### Research seed registry

Research-only source metadata is registered for:

- 神相全編
- 人倫大統賦
- 麻衣相法
- 柳莊相法
- Kohn 1986 lineage article

No production rule is seeded.

### Executable invariants

The validator currently enforces:

1. source witness must belong to a known work;
2. passage must belong to a known witness;
3. source lineage cannot self-reference and must carry evidence refs;
4. rule output claim type must exist and allow the rule tier;
5. production-authorized rules require `scan_checked` or better source passages;
6. static v1 methodology packs must explicitly forbid `observations.colorAppearance`;
7. methodology-ordinal comparison requires an ordering rule;
8. claims cannot be ranked under an undeclared comparison group;
9. `strongest/weakest` wording is rejected for salience-only groups;
10. MyeongHa static observation adapter never exposes `colorAppearance`;
11. Face Grounding can only project existing semantic claims and preserves prohibited inferences;
12. semantic reading contract contains no consumer prose fields.

## What remains blocked

```text
FR-1 Shared Observation compatibility
FR-2 exact region maps / metrics
FR-3 first scan-checked F1/F2 rules
FR-4 configuration / tension
FR-5 domain synthesis
FR-7 decisive narrative profiles
```

This is intentional. The code foundation prevents source research from being bypassed by an attractive but invented rule corpus.
