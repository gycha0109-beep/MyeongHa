# SRC-22 Relationship Policy Decision Package V2

> Track: character-memory  
> Status: **READY FOR SOURCE-OWNER DECISION / SRC-22 REMAINS OPEN**  
> Evidence: Event Authority V1 + Governed Authority Dogfood V3 + Relationship Policy Convergence V3  
> Production mutation: **BLOCKED**

## 0. Decision boundary

This package updates the V1 decision package with evidence produced after Event Authority and causal relationship semantics were integrated.

It does not self-approve Production policy.

The source owner must explicitly ACCEPT, ACCEPT_WITH_CHANGE, DEFER, or REJECT production-critical decisions before SRC-22 can close.

## 1. Source-fixed invariants

The following remain fixed and are not reopened by calibration:

- relationship state is multi-dimensional;
- server / Relationship Engine owns mutation;
- LLM output is not relationship truth authority;
- Event apply must be deterministic and idempotent;
- relationship history is append-only with a current projection;
- inactivity alone does not degrade relationship;
- message volume, calendar age, or repeated assertion do not create intimacy;
- Character interpretation remains distinct from objective Event facts.

## 2. V3 evidence summary

| Finding | V3 disposition | Production effect |
|---|---|---|
| F01 narrow meaningful route dead-end | MITIGATED IN SHADOW | none until owner approval |
| F02 fixed-bucket boundary exploit | MITIGATED IN SHADOW | none until owner approval |
| F03 stage regression conflation | MITIGATED IN SHADOW | none until owner approval |
| F04 repair as positive progression family | OWNER DECISION REQUIRED | blocked |
| F05 repair milestone inflation | MITIGATED IN SHADOW | none until owner approval |
| F06 score saturation | OWNER DECISION REQUIRED | blocked |

## 3. Decision table

### D08 — Five-stage internal progression

**V2 disposition: EVIDENCE-SUPPORTED CANDIDATE / OWNER DECISION REQUIRED**

The five-stage model remains compatible with source drafts and current calibration.

V3 adds evidence that historical depth should be represented separately from current conflict condition.

Owner must approve final internal keys and stage semantics.

### D09 — Score range

**V2 disposition: OWNER DECISION REQUIRED**

The 0..100 candidate remains operationally usable but one-year mixed calibration can saturate closeness/trust at 100.

V3 does not recommend increasing the maximum as a substitute for semantic differentiation.

Owner choice:

- accept bounded coarse scores plus causal Episode profile;
- or request score-semantic redesign.

### D10 — Positive soft-cap

**V2 disposition: CALIBRATION-SUPPORTED / NOT SUFFICIENT TO PREVENT SATURATION**

The existing soft-cap slows but does not prevent long-horizon saturation.

No Production promotion is implied.

### D11 — Stage gates

**V2 disposition: B2 EVIDENCE-SUPPORTED CANDIDATE / OWNER DECISION REQUIRED**

B2-B preserves the mixed route and opens a slower sustained narrow route.

Current calibration alternate gates remain:

~~~text
S2 alternate: >= 8 positive weeks + >= 2 families
S3 alternate: >= 20 positive weeks + >= 2 families
S4 alternate: >= 40 positive weeks + >= 2 families
              + existing score/day/milestone requirements
~~~

These are calibration values, not source authority.

### D12 — Pacing evidence

**V2 disposition: CALIBRATION EVIDENCE**

V3 preserves:

- visit-only farming stays shallow;
- 39-week narrow-route candidate remains below S4 in the tested matrix;
- 40-week sustained meaningful narrow routes can qualify;
- mixed organic route retains its existing faster evidence path;
- self-disclosure is not mandatory.

### D13 — Production Event allowlist

**V2 disposition: UNRESOLVED**

Event Authority validates experimental Event occurrence. It does not promote the experimental vocabulary to the Production registry.

### D14 — Exact logical dedupe

**V2 disposition: SOURCE-FIXED**

Same logical Event retry applies once.

### D15 — Event-family credit window

**V2 disposition: ROLLING-WINDOW MECHANISM EVIDENCE-SUPPORTED / NUMBERS OWNER-BOUND**

The rolling window removes the tested fixed-bucket Day-7/Day-8 amplification.

Still unresolved for Production:

- exact horizon;
- exact credit cap;
- family taxonomy.

### D16 — Evidence diversity

**V2 disposition: B2 MECHANISM EVIDENCE-SUPPORTED / TAXONOMY OWNER-BOUND**

Deep relationship must not be reducible to one repeated shallow action.

B2-B shows that sustained narrow meaningful routes can coexist with this invariant.

### D17 — Conflict is relationship evidence

**V2 disposition: SOURCE-FIXED PRINCIPLE**

Explicit conflict/reconciliation may affect relationship behavior/state. Inactivity alone may not substitute for conflict evidence.

### D18 — Conflict / stage semantics

**V2 disposition: ATTAINED-STAGE + CURRENT-CONDITION CANDIDATE / OWNER DECISION REQUIRED**

V3 supports separating:

~~~text
attainedStage
currentCandidateStage
currentCondition
behaviorAccess
~~~

This prevents one conflict from silently rewriting shared relationship history while still restricting current Character behavior.

Production non-regression semantics still require owner approval.

### D19 — last_interaction_at

**V2 disposition: UNRESOLVED**

Do not use this field as an implicit decay trigger.

Production must decide which authoritative action writes it.

### D20 — occurred_at

**V2 disposition: ERD EXTENSION PROPOSAL**

Keep separate occurrence time and apply/commit time.

### D21 — source-message provenance

**V2 disposition: ERD EXTENSION PROPOSAL**

Production relationship Events need referentially constrained message provenance rather than caller-defined arbitrary JSON only.

### D22 — causal / correction links

**V2 disposition: ERD EXTENSION PROPOSAL**

Causal predecessor, correction, and retraction links remain required candidates for referential persistence.

### D23 — fact versus Character interpretation

**V2 disposition: ARCHITECTURE REQUIREMENT / PAYLOAD SCHEMA UNRESOLVED**

Event Authority V1 now demonstrates the boundary in executable form.

Character interpretation cannot grant Event fact authority.

### D24 — replay / rebuild

**V2 disposition: DETERMINISTIC SHADOW REBUILD DEMONSTRATED / PRODUCTION PERSISTENCE STRATEGY UNRESOLVED**

V3 rebuilds Episode/profile/state from active experimental history after correction/retraction.

Production must still choose snapshot-assisted history versus a fully replayable historical-policy contract.

### D25 — payload schema

**V2 disposition: UNRESOLVED**

No arbitrary caller JSON becomes relationship authority.

Production per-Event payload schemas remain an owner decision.

### D26 — blocked / suppressed Event semantics

**V2 disposition: PARTIALLY CONVERGED / OWNER DECISION REQUIRED**

Event Authority REJECT produces zero relationship-policy input in V3.

For already-authorized Events later suppressed by anti-farming, Production must still choose whether suppression is:

- no relationship ledger append;
- separate operational/audit observation;
- another explicitly approved non-mutating representation.

### D27 — attained depth versus current condition

**V2 disposition: EVIDENCE-SUPPORTED CANDIDATE / OWNER DECISION REQUIRED**

The shadow preserves attained depth and separately constrains current behavior under conflict/repair.

### D28 — Causal Episode anti-farming unit

**V2 disposition: EVIDENCE-SUPPORTED CANDIDATE**

Promise outcome chains and conflict/repair callbacks fold into causal Episodes before rolling positive credit.

A single conflict with repeated repair callbacks therefore remains one Episode.

Production schema/persistence remains subject to D20-D22 approval.

### D29 — Repair milestone semantics

**V2 disposition: DEFAULT EXCLUSION MITIGATES MILESTONE FARMING / OWNER DECISION REQUIRED**

The default shadow excludes repair-resolution from progression milestone credit.

Distinct conflict/repair Episodes remain visible history.

Whether repair should contribute to progression diversity at all is deliberately not decided by V3.

## 4. Promotion checklist

| Production-critical decision | V2 status |
|---|---|
| multi-dimensional relationship | SOURCE-FIXED |
| server/Relationship Engine authority | SOURCE-FIXED |
| idempotent Event apply | SOURCE-FIXED |
| append-only history + projection | SOURCE-FIXED |
| no inactivity-only degradation | SOURCE-FIXED |
| five-stage internal model/keys | OWNER DECISION REQUIRED |
| 0..100 score semantics | OWNER DECISION REQUIRED |
| positive soft-cap | CALIBRATION CANDIDATE |
| B2 stage thresholds | OWNER DECISION REQUIRED |
| final Production Event registry | UNRESOLVED |
| rolling anti-farming mechanism | EVIDENCE-SUPPORTED CANDIDATE |
| anti-farming numeric horizon/cap | OWNER DECISION REQUIRED |
| causal Episode unit | EVIDENCE-SUPPORTED CANDIDATE |
| attainedStage/currentCondition split | OWNER DECISION REQUIRED |
| repair progression semantics | OWNER DECISION REQUIRED |
| last_interaction_at writes | UNRESOLVED |
| active policy selection/migration | UNRESOLVED |
| Production replay/baseline strategy | UNRESOLVED |
| occurred_at extension | ERD PROPOSAL |
| source-message provenance | ERD PROPOSAL |
| causal/correction links | ERD PROPOSAL |
| payload schemas | UNRESOLVED |
| blocked/suppressed Event persistence | OWNER DECISION REQUIRED |
| score saturation semantics | OWNER DECISION REQUIRED |

## 5. Production hold

Until explicit source-owner promotion, this remains forbidden:

~~~text
experimental Event
→ production relationship_events INSERT
→ Production score/stage delta
→ user_character_states mutation
~~~

Allowed:

~~~text
Event Authority
→ authority-bound experimental Event
→ causal Episode
→ shadow credit/profile/state
→ deterministic dogfood/calibration
~~~

## 6. Owner decision request

For D08-D29, respond with:

~~~text
ACCEPT
ACCEPT_WITH_CHANGE
DEFER
REJECT
~~~

and exact replacement contracts/values where required.

Until that decision is recorded, SRC-22 remains OPEN.
