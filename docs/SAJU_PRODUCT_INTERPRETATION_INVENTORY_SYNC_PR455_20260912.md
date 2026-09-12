# 명하 Saju Product Interpretation Inventory — PR #455 Authority Sync

> Repository: `gycha0109-beep/MyeongHa`  
> Purpose: delta sync after `SAJU_PRODUCT_INTERPRETATION_INVENTORY_SYNC_PR451_20260912.md`  
> Status: **GENERAL NATAL GOVERNED SELECTION-SIGNAL OBSERVATION / RESEARCH-ONLY / P0-CM-03 OPEN / NO-BUILD**  
> MyeongHa base main: `b49cff644b0f6e987b4d88d886bfdcf30b6df814`  
> Saju merged main: `cd19cfaa4313bcd9fb5f1e6f0f0d0ed89605ca77`  
> Authority delta input: Saju PR `#455` — `research(general-natal): represent governed selection signals`

---

## 1. Verdict

Saju PR `#455` adds a research-only representation for the **currently governed source-evidence signals** and their cardinality.

The binding boundary is:

```text
selection signal observation != GEJU_CANDIDATE
```

The research layer may represent:

```text
zero governed source signals
one governed source signal
multiple governed source signals
```

but MyeongHa must not promote any of those states into candidate identity, candidate count, ranking, precedence, strength, deduplication, or establishment.

```text
GENERAL_NATAL_PRODUCTION_AUTHORITY = BLOCKED
P0-CM-03 = OPEN
GEJU_CANDIDATE = NOT_EMITTED
GEJU_ESTABLISHMENT_STATE = NOT_EMITTED
Commerce = HOLD
Decision = NO_BUILD
```

---

## 2. Upstream authority reused

PR `#455` does not invent a selector. It consumes only already governed research evidence.

### Transparency axis — PR #446

A transparency observation signal may be emitted only from upstream evidence where:

```text
positiveTransparencyExistenceOnObservedSlotsEstablished = true
```

The signal may retain the hidden stem and all exact observed positions already governed upstream. Multiple positions for the same hidden stem remain **one observation signal**.

```text
same hidden stem visible at year + hour
-> one transparency signal with two observed positions
!= two candidates
```

Position order is serialization-only and has no semantic priority.

### Branch-meeting axis — PR #447

A branch-meeting observation signal may be emitted only from an upstream exact source-aligned full-three meeting evidence item.

It may retain source/relation identity and observed participants, but does not establish transformation success, final selection effect, candidate identity, or Gyeokguk establishment.

### Co-use axis — PR #451

The selected source passage already bound in PR `#451` permits plural/coexisting use evidence:

```text
一透則一用，兼透則兼用，透而又會，則透與會並用
```

Therefore PR `#455` may preserve multiple governed signals without forcing one winner.

```text
plural source observations can coexist
!= plural canonical GEJU_CANDIDATE values are established
```

---

## 3. Zero / one / multiple is observation cardinality only

PR `#455` exposes research statuses:

```text
resolved_zero_governed_source_signals
resolved_one_governed_source_signal
resolved_multiple_governed_source_signals
outside_selected_mixed_qi_scope
canonical_substrate_unavailable
```

These statuses count only signals emitted by the currently governed research surface.

The contract explicitly keeps:

```text
signalSetExhaustiveAuthorized = false
zeroSignalMeansNoCandidateAuthorized = false
```

Therefore:

```text
resolved_zero_governed_source_signals
```

means only that this governed observation layer found no positive governed signal. It does **not** mean no Gyeokguk candidate exists.

Likewise, one signal does not mean one candidate, and multiple signals do not mean multiple canonical candidates.

---

## 4. Deterministic order has no semantic order

PR `#455` normalizes emitted signals only for stable hashing/replay.

The authority boundary remains:

```text
signalArrayOrderSemanticAuthorized = false
singleWinnerRequirementAuthorized = false
signalRankingAuthorized = false
signalPrecedenceAuthorized = false
signalStrengthAuthorized = false
candidateIdentityAuthorized = false
```

No ProductHost, Character, LLM, API/browser, or Commerce layer may treat array position as priority, main candidate, stronger candidate, preferred candidate, or final winner.

---

## 5. Fail-closed substrate boundary

If either required upstream evidence substrate is unavailable, PR `#455` does not emit a partial inventory.

```text
canonical_substrate_unavailable
-> signals = []
-> signalCount = 0
```

This empty list is fail-closed and must not be interpreted as a complete negative candidate judgment.

Outside the selected mixed-qi source scope:

```text
outside_selected_mixed_qi_scope
-> signals = []
```

This is only a source-scope boundary, not a universal negative Gyeokguk rule.

---

## 6. Narrow authority gained

Saju PR `#455` authorizes only:

```text
GOVERNED_SOURCE_SIGNAL_OBSERVATION = AUTHORIZED
ZERO_ONE_MULTIPLE_SIGNAL_CARDINALITY_OBSERVATION = AUTHORIZED
SOURCE_SIGNAL_COEXISTENCE = AUTHORIZED
```

This is research/data-shape authority, not product-facing Gyeokguk authority.

---

## 7. Authority not gained

Still unauthorized:

```text
signal-set exhaustiveness
zero-signal -> no-candidate inference
exhaustive transparency slot predicate
month-order hidden-stem final selection predicate
transparency selection effect
branch-meeting selection effect
post-interaction effective bureau
general 清 / 濁 predicate
general 有情 / 無情 predicate
candidate semantic identity
candidate ranking
candidate precedence
candidate strength
candidate deduplication policy
multiple canonical candidate representation
GEJU_CANDIDATE producer
establishment success/failure predicate
GEJU_ESTABLISHMENT_STATE=true/false
General Natal production authority
Commerce
```

The critical invariant remains:

```text
selection signal observation != GEJU_CANDIDATE
```

---

## 8. Five coarse Gyeokguk authority gaps remain OPEN

PR `#455` closes none of the coarse gaps:

```text
MONTH_ORDER_HIDDEN_STEM_SELECTION_PREDICATE_AUTHORITY_MISSING
VISIBLE_STEM_TRANSPARENCY_SELECTION_PREDICATE_AUTHORITY_MISSING
BRANCH_MEETING_SELECTION_EFFECT_AUTHORITY_MISSING
MULTIPLE_GEJU_CANDIDATE_REPRESENTATION_AUTHORITY_MISSING
GEJU_ESTABLISHMENT_SUCCESS_FAILURE_PREDICATE_AUTHORITY_MISSING
```

The fourth gap is narrowed only at the representation substrate level: plural source observations can now coexist without destructive single-winner collapse. Candidate identity, semantic sameness/difference, deduplication, ranking/precedence, and post-interaction effectiveness remain unresolved.

---

## 9. Saju verification evidence

Final exact head after latest-main rebase:

```text
14e83e9f9b5746850e6f80e2246462673767db3b
```

Exact-head gates:

```text
CI #2654                               = SUCCESS
Production Calculation Container #709 = SUCCESS
PIE Prospective Shadow #1002           = SUCCESS
```

Saju squash-merged main:

```text
cd19cfaa4313bcd9fb5f1e6f0f0d0ed89605ca77
```

Merged-main gates:

```text
CI #2656                               = SUCCESS
Production Calculation Container #711 = SUCCESS
```

Merged Saju change surface:

```text
docs/research/general-natal-geju-selection-signal-observation-20260912.md
src/research/general-natal-geju-selection-signal-observation.ts
test/general-natal-geju-selection-signal-observation.test.ts
```

No production runtime or Commerce code was changed.

---

## 10. Product / Commerce invariant

MyeongHa continues to consume Saju as the sole semantic authority. No downstream layer may convert observation signals into missing candidate or establishment semantics.

```text
GENERAL_NATAL_PRODUCTION_AUTHORITY = BLOCKED
P0-CM-03 = OPEN
GEJU_CANDIDATE = NOT_EMITTED
GEJU_ESTABLISHMENT_STATE = NOT_EMITTED
Commerce = HOLD
Decision = NO_BUILD
```

---

## 11. Next semantic frontier

The next honest Saju frontier is a **source-backed candidate identity contract** only if source evidence can answer, without invention:

```text
what makes two governed source signals the same or different semantic use?
can transparency and branch meeting refer to one semantic use or multiple uses?
when, if ever, may signal identities be semantically deduplicated?
how can coexisting uses be represented without forced ranking or precedence?
```

Until that authority exists:

```text
MULTIPLE_GEJU_CANDIDATE_REPRESENTATION_AUTHORITY_MISSING = OPEN
GEJU_CANDIDATE = NOT_EMITTED
GEJU_ESTABLISHMENT_STATE = NOT_EMITTED
GENERAL_NATAL_PRODUCTION_AUTHORITY = BLOCKED
Commerce = HOLD
```
