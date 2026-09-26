# Se-yeon Relationship Policy Convergence V3

> Track: character-memory  
> Status: **CALIBRATION / SHADOW EVIDENCE ONLY**  
> Parent gap: `SRC-22_RELATIONSHIP_POLICY_DECISION_PACKAGE_V2.md`  
> Production relationship mutation: **BLOCKED**

## 1. Purpose

V3 converges the existing B2-A/B2-B calibration, Event Authority V1, causal Episode semantics, attained-stage/current-condition shadow, and long-horizon dogfood into one authority-bound relationship-policy evidence path.

It does not promote any score, threshold, Event registry, anti-farming number, stage key, or database mutation contract to Production Authority.

## 2. Pipeline

~~~text
Event Candidate
→ Event Authority V1
→ ADMIT_EXPERIMENTAL
→ authority-bound experimental Event
→ Relationship Evidence V3 binding
→ Causal Episode folding V2
→ rolling family credit V2
→ Episode profile
→ candidate-stage calibration evidence
→ attainedStage / currentCondition shadow
→ convergence report
~~~

A rejected Event Authority decision produces no relationship-policy evidence.

## 3. Authority binding

`bindSeyeonAuthorizedRelationshipEvidenceV3()` requires an admitted Event Authority V1 decision and verifies that the materialized Event still matches:

- character;
- Event kind;
- source turn;
- source message refs;
- causal predecessor refs;
- admitted facts;
- Character interpretation;
- salience/confidence signal.

Server-owned Event ID and dedupe key are deliberately not reconstructed from provider output.

The binding retains these hard constraints:

~~~text
mayMutateProductionRelationshipState = false
mayAppendProductionRelationshipEvent = false
mayCreateDurableMemory = false
~~~

## 4. Episode-before-credit rule

V3 does not treat every Event row as an independent progression opportunity.

Examples:

~~~text
PROMISE_MADE
→ PROMISE_KEPT
= one commitment Episode
~~~

and:

~~~text
CONFLICT
→ RECONCILIATION
→ RECONCILIATION callback xN
= one conflict_repair Episode
~~~

Positive family-window credit is evaluated after Episode folding.

## 5. Anti-farming convergence

### F02 fixed-bucket boundary

The existing fixed seven-day bucket can credit four same-family Events across the Day-7/Day-8 boundary.

The rolling-window shadow credits two in the same tested boundary burst.

Disposition: **MITIGATED IN SHADOW**.

The exact seven-day horizon and two-credit cap remain calibration values, not Production Authority.

### F05 repair milestone farming

The causal Episode shadow folds repeated callbacks for one conflict into one Episode.

Repair milestones are excluded by default from progression milestone credit.

Disposition: **MITIGATED IN SHADOW**.

### F04 repair as progression diversity

Distinct conflict/repair Episodes remain visible relationship history. V3 intentionally does not decide whether repeatedly creating distinct conflict/repair Episodes should count toward positive progression diversity.

Disposition: **OWNER DECISION REQUIRED**.

## 6. Route convergence

B2-B keeps visit-only interaction shallow while allowing slow sustained narrow meaningful routes to qualify under the existing calibration candidate.

The tested alternate S4 horizon remains forty positive weeks plus existing score/day/milestone requirements and at least two evidence families.

This resolves the observed B1 route dead-end in the shadow without making self-disclosure mandatory.

Disposition F01: **MITIGATED IN SHADOW**.

The numeric 8/20/40-week gates remain owner-controlled calibration values.

## 7. Stage versus condition

The convergence keeps these concepts separate:

~~~text
attainedStage
= deepest evidence-backed relationship depth reached

currentCandidateStage
= current calibration candidate

currentCondition
= STABLE | OPEN_CONFLICT | RESOLVED_RECENTLY

behaviorAccess
= stage-aligned or conflict/repair-constrained behavior
~~~

An established S4 can remain historically attained while current conflict restricts behavior.

Disposition F03: **MITIGATED IN SHADOW**.

Permanent non-regression is not promoted to Production Authority by this result.

## 8. Correction / retraction replay

The experimental append-only ledger already exposes active history after corrections/retractions.

V3 rebuilds:

~~~text
active Events
→ authority-bound evidence
→ Episodes
→ credits/profile/state
~~~

from the active history.

The convergence suite verifies deterministic rebuild after correction and retraction.

This is evidence for D24 but does not choose the Production replay/baseline persistence strategy.

## 9. Saturation

The long-lived mixed B2 calibration still reaches:

~~~text
closeness = 100
trust = 100
~~~

V3 does not hide this by changing the score maximum or inventing decay.

Causal Episode profiles remain available to differentiate relationships whose coarse numeric scores are identical.

Disposition F06: **OWNER DECISION REQUIRED**.

## 10. Finding registry

| ID | V3 disposition |
|---|---|
| F01 narrow meaningful route dead-end | MITIGATED IN SHADOW |
| F02 fixed-bucket boundary exploit | MITIGATED IN SHADOW |
| F03 stage regression conflation | MITIGATED IN SHADOW |
| F04 repair as positive progression family | OWNER DECISION REQUIRED |
| F05 repair milestone inflation | MITIGATED IN SHADOW |
| F06 score saturation | OWNER DECISION REQUIRED |

## 11. Production boundary

V3 does not:

- INSERT Production `relationship_events`;
- UPDATE `user_character_states`;
- finalize Production Event registry;
- finalize score/delta tables;
- approve stage thresholds;
- approve anti-farming numeric values;
- define `last_interaction_at` writes;
- choose Production replay persistence;
- bind a Manifest;
- close SRC-22.

The next gate is source-owner review of the SRC-22 V2 decision package.
