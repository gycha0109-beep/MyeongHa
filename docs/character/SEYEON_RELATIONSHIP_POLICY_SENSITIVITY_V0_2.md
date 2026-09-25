# Se-yeon Relationship Policy Sensitivity v0.2

> Track: character-memory
> Status: **CALIBRATION EVIDENCE ONLY / NOT PRODUCTION AUTHORITY**
> Candidate under test: `seyeon-relationship-candidate-b1-v0.1`
> Parent decision package: `SRC-22_RELATIONSHIP_POLICY_DECISION_PACKAGE_V1.md`
> Production mutation: **BLOCKED**

## 0. Purpose

Pressure-test Candidate B1 before any SRC-22 production promotion.

This report records deterministic simulation findings. It does not approve score ranges, deltas, stage thresholds, anti-farming windows, stage regression, or Event registry semantics.

## 1. Harness

The reusable harness records:

- closeness / trust / friction;
- relationship stage;
- positive day/week/family evidence;
- milestone count;
- conflict-open state;
- credited / suppressed / duplicate Event counts;
- stage-transition provenance;
- first reached day per stage;
- per-Event credit/suppression decisions.

Candidate B1 remains immutable during the matrix.

## 2. Pacing findings

### Mixed organic route

The existing B1 pacing target remains intact:

| Pattern | Finding |
|---|---|
| first 4 weeks, including high frequency | S4 blocked |
| 5 meaningful Events/week, 8 weeks | S4 blocked |
| 5 meaningful Events/week, 10 weeks | S4 reachable |
| 2 meaningful Events/week, 17 weeks | S4 blocked |
| 2 meaningful Events/week, 20 weeks | S4 reachable |
| 1 meaningful Event/week, 52 weeks | S4 reachable |
| ~1 meaningful Event/month, 1 year | below S4 |
| ~2 meaningful Events/month, 1 year | below S4 |

A one-week forty-Event binge remains below S4 because the temporal-evidence gates are not satisfied.

## 3. Route findings

The matrix exposes a B1 route-diversity problem.

After one year at two meaningful Events/week:

| Route | Positive families | Result |
|---|---:|---|
| shallow RETURN_VISIT | 1 | S0 |
| shared activity | 2 | S1 |
| reliability / promise follow-through | 2 | S1 |
| reciprocity / remembering + help | 3 | S2 |
| disclosure-heavy | 3 | S2 |
| mixed organic | >=5 | S4 |

### Finding F01 — ROUTE_DEAD_END

Severity: **MAJOR**

The five-family S4 gate does prevent one-action farming, but it also means narrow, sustained, meaningful relationship routes cannot reach deep stages even after a year.

This is not fixed in B1.

It must be resolved without making personal disclosure mandatory and without reopening single-family farming.

## 4. Anti-farming findings

### Passed

- exact retry x1000 is credited once;
- RETURN_VISIT x1000 cannot create trust or deep stage;
- PROMISE_MADE x1000 cannot create deep stage;
- a one-week forty-Event binge cannot reach S4;
- ten-thousand RETURN_VISIT Events remain S0.

### Finding F02 — FIXED_BUCKET_BOUNDARY_EXPLOIT

Severity: **MAJOR**

Candidate B1 uses two positive credits per family per fixed seven-day bucket.

Boundary scenario:

~~~text
Day 7:  PROMISE_KEPT x2
Day 8:  PROMISE_KEPT x2
~~~

B1 fixed buckets credit all four Events.

The rolling-seven-day shadow credits only two.

Normal Events spaced eight days apart produce equivalent credit under both policies.

This makes the rolling-window mechanism a strong B2 anti-farming candidate, but it is still not production authority.

## 5. Conflict and stage findings

### Finding F03 — STAGE_REGRESSION_SEMANTICS

Severity: **MAJOR / AUTHORITY GAP**

Under B1's current recompute behavior:

~~~text
established S4
+ SPECIALNESS_INVALIDATED
→ conflictOpen = true
→ stage recomputes to S2
~~~

The source does not currently authorize that regression behavior.

Two shadow models were therefore added:

1. `lock_progress_block_on_conflict`
   - keep established stage;
   - block progression while conflict is open.

2. `behavior_overlay`
   - keep established stage;
   - use conflict/friction as behavioral relationship state.

Both preserve conflict evidence without automatically rewriting the historical stage.

No shadow model is promoted here.

## 6. Repair findings

### Finding F04 — REPAIR_AS_FIFTH_FAMILY

Severity: **WARNING / POLICY REVIEW**

A long-lived four-family route can remain at S3, then:

~~~text
CONFLICT_EVENT
→ RECONCILIATION_EVENT
~~~

adds `repair` as the fifth positive family and can qualify for S4.

That may represent meaningful repair, or it may create a progression exploit depending on final product semantics.

It requires an explicit SRC-22 decision.

### Finding F05 — REPAIR_MILESTONE_INFLATION

Severity: **WARNING**

Fifty conflict/repair cycles do not monotonically farm trust:

- trust remains low;
- friction saturates near its upper bound;
- stage remains shallow when repair is the only positive family.

However, each credited reconciliation currently increments milestone count.

Therefore milestone count itself is farmable even though the other gates prevent immediate deep-stage farming.

A production milestone policy should not treat every repeated repair as an independent unlimited milestone.

## 7. Absence findings

The matrix confirms the intended invariant for 1, 30, 180, and 365-day gaps:

- no automatic closeness decay;
- no automatic trust decay;
- no automatic friction increase;
- no inactivity-only stage degradation.

`RETURNED_AFTER_ABSENCE` may add explicit relationship evidence, but elapsed time itself is not a punishment.

## 8. Long-horizon findings

### Passed

- 10,000 repeated visits do not create a deep relationship;
- 10,000 diverse Events remain numerically bounded to 0..100;
- simulation remains deterministic.

### Finding F06 — SCORE_SATURATION

Severity: **WARNING**

A mixed organic route at two meaningful Events/week for one year reaches:

~~~text
closeness = 100
trust = 100
~~~

The soft-cap slows saturation but does not prevent it.

This does not invalidate the 0..100 candidate by itself, but it means long-lived users can lose differentiation on these dimensions.

The production decision should decide whether:

- saturation is acceptable because Event history remains the causal authority;
- projection dimensions need additional evidence/recency semantics;
- or score semantics need redesign.

Increasing the numeric maximum alone is not considered a solution.

## 9. Seeded distribution

One hundred deterministic seeds are used for each one-year density.

Observed B1 shape:

- 12 meaningful Events/year: no S4;
- 40 meaningful Events/year: some but not all seeds reach S4;
- 100 meaningful Events/year: all seeds reach S4.

This is useful because progression remains sensitive to Event timing/composition near the middle density instead of being only a raw count threshold.

## 10. Failure registry

| ID | Severity | Finding | B1 status |
|---|---|---|---|
| F01 | MAJOR | narrow meaningful routes dead-end below deep stages | OPEN |
| F02 | MAJOR | fixed seven-day bucket boundary amplification | OPEN |
| F03 | MAJOR / authority gap | one conflict can recompute S4 down to S2 | OPEN |
| F04 | WARNING | repair can become fifth family and unlock S4 | REVIEW |
| F05 | WARNING | repeated reconciliation inflates milestone count | OPEN |
| F06 | WARNING | long-horizon closeness/trust saturate at 100 | OPEN |

## 11. B2 decision

A B2 shadow is warranted because:

- at least one normal meaningful route is structurally dead-ended;
- the fixed-bucket anti-farming mechanism has a reproducible boundary exploit;
- stage regression behavior is not source-authorized.

B2 must not silently combine unrelated fixes.

The next comparison should split candidate changes by mechanism:

~~~text
B2-A
= B1 + rolling seven-day family-credit window

B2-B
= B1 + route-qualification alternative
  without reducing the system to one-family farming

Stage regression A/B/C remains a separate authority comparison,
not bundled into numeric B2.
~~~

## 12. Promotion boundary

Nothing in this report may write production:

- relationship_events deltas;
- user_character_states scores/stage;
- production anti-farming;
- production stage regression;
- production milestone semantics.

SRC-22 remains OPEN.

The next evidence gate is B1 vs B2-A/B2-B shadow comparison.

## 13. B2 shadow comparison

Two independent changes are now executable shadows.

### B2-A — rolling family-credit window

Change only:

~~~text
fixed 7-day bucket
→ rolling 7-day window
~~~

Observed comparison:

- Day-7/Day-8 boundary burst: B1 credits 4, B2-A credits 2;
- normal Events spaced eight days apart: same score/milestone result as B1;
- no production authority is implied.

This is a materially better anti-boundary mechanism in the tested cases.

### B2-B — sustained narrow-route qualification

B2-B does not simply lower the five-family gate.

It keeps the normal B1 mixed route and adds a slower alternate route:

~~~text
S2 alternate
>= 8 positive weeks
>= 2 positive families

S3 alternate
>= 20 positive weeks
>= 2 positive families

S4 alternate
>= 40 positive weeks
>= 2 positive families
+ existing score/day/milestone requirements
~~~

Observed comparison after one year at two meaningful Events/week:

| Route | B1 | B2-B |
|---|---|---|
| shallow visit-only | S0 | S0 |
| shared activity | S1 | S4 |
| reliability | S1 | S4 |
| reciprocity | S2 | S4 |
| disclosure-heavy | S2 | S4 |
| mixed organic | S4 | S4 |

A reliability route at 39 positive weeks is still below S4; at 40 positive weeks it can qualify.

This makes the alternate path slow rather than reducing the relationship to one repeated action.

### Combined shadow

`CANDIDATE_B2_COMBINED_SHADOW` combines B2-A and B2-B only for comparison.

It still uses B1's `recompute` stage behavior.

Therefore it intentionally **does not resolve F03 stage-regression semantics**. An established S4 plus `SPECIALNESS_INVALIDATED` still recomputes downward in this shadow.

### Current technical disposition

- B2-A: **preferred experimental anti-farming mechanism** over fixed buckets in the tested boundary cases.
- B2-B: **promising route-diversity candidate**, but its 8/20/40-week alternate gates are calibration values and require further owner/product review.
- Combined B2: useful for shadow comparison only; not production policy.
- F03/F04/F05/F06 remain open.

SRC-22 therefore remains OPEN.
