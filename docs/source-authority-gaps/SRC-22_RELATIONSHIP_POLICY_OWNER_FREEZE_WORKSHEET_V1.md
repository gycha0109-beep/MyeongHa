# SRC-22 Relationship Policy — Source-owner Freeze Worksheet V1

> Track: character-memory  
> Status: **READY FOR SOURCE-OWNER INPUT / NO PRODUCTION DECISION RECORDED**  
> Evidence authority: `SRC-22_RELATIONSHIP_POLICY_DECISION_PACKAGE_V2.md`  
> Production mutation: **BLOCKED**  
> Rule: this worksheet organizes decisions; it does not create source authority by itself.

## 0. Purpose

This worksheet converts D08-D29 from the V2 evidence package into an explicit source-owner freeze sequence.

The evidence package remains the authoritative record of what V3 demonstrated. This worksheet is only the decision surface used to record:

~~~text
ACCEPT
ACCEPT_WITH_CHANGE
DEFER
REJECT
~~~

A blank field, a working candidate, calibration evidence, or an implementation prototype is **not** a Production decision.

## 1. Non-negotiable boundary

The following remain source-fixed and are not reopened by this worksheet:

- relationship state is multi-dimensional;
- server / Relationship Engine owns mutation;
- LLM output is not relationship truth authority;
- Event apply must be deterministic and idempotent;
- relationship history is append-only with a current projection;
- inactivity alone does not degrade relationship;
- message volume, calendar age, or repeated assertion do not create intimacy;
- Character interpretation remains distinct from objective Event facts;
- same logical Event retry applies once;
- explicit conflict/reconciliation may be relationship evidence, but inactivity cannot stand in for it.

Until the source-owner freeze is complete, the following remain forbidden:

~~~text
experimental Event
→ production relationship_events INSERT

Production score delta
Production stage mutation
user_character_states mutation
Production anti-farming numeric activation
Production Event registry finalization
Production payload schema finalization
DB migration
Manifest runtime binding
SRC-22 automatic closure
~~~

## 2. Freeze protocol

Decisions are recorded in dependency order:

~~~text
Block A — Relationship-state semantics
        ↓
Block B — Progression / anti-farming semantics
        ↓
Block C — Production Event contract
        ↓
Block D — Replay / persistence strategy
        ↓
Closure audit
~~~

For every owner-bound decision, record all of:

~~~text
Disposition:
Exact contract / value:
Reason:
Dependent decisions affected:
Migration / schema impact:
Reopen trigger:
~~~

If a Production-critical item is `DEFER` and no fail-closed Production contract remains possible, SRC-22 stays OPEN.

## 3. Block A — Relationship-state semantics

This block defines what "relationship depth" and "current relationship condition" mean before any Production threshold or database representation is frozen.

### A1 — D08 Five-stage internal progression

**Evidence status:** EVIDENCE-SUPPORTED CANDIDATE / OWNER DECISION REQUIRED

V3 shows the five-stage model remains operationally compatible with current calibration. V3 does not provide source authority for final stage keys or semantics.

Decision surface:

- retain a five-stage internal progression model and explicitly define stable internal keys/semantics;
- retain staged progression with a changed stage count/model;
- defer/reject staged progression and redesign the policy representation.

Owner freeze:

~~~yaml
decision_id: D08
disposition: PENDING
exact_contract: PENDING
reason: PENDING
reopen_trigger: PENDING
~~~

### A2 — D09 Score semantics

**Evidence status:** OWNER DECISION REQUIRED

The `0..100` candidate is operationally usable but long-horizon mixed calibration can saturate closeness/trust. V3 explicitly does not treat "increase the maximum" or automatic decay as a semantic fix.

Decision surface:

- retain bounded coarse scores and use the Causal Episode Profile to preserve qualitative history after score saturation;
- retain bounded scores with explicitly changed semantics/range;
- redesign score semantics before Production.

Owner freeze:

~~~yaml
decision_id: D09
disposition: PENDING
exact_contract: PENDING
reason: PENDING
reopen_trigger: PENDING
~~~

### A3 — D18 + D27 Attained depth versus current condition

**Evidence status:** EVIDENCE-SUPPORTED CANDIDATE / OWNER DECISION REQUIRED

V3 demonstrates a model that keeps historical depth separate from current conflict/repair state:

~~~text
attainedStage
currentCandidateStage
currentCondition
behaviorAccess
~~~

The demonstrated benefit is that one conflict does not silently rewrite accumulated shared history while current Character behavior can still become restricted or cautious.

Decision surface:

- adopt the attained-depth/current-condition split;
- adopt the split with changed field/transition semantics;
- allow actual stage regression and define the exact authority/rules;
- defer/reject the split and redesign conflict semantics.

Owner freeze:

~~~yaml
decision_ids:
  - D18
  - D27
disposition: PENDING
exact_contract: PENDING
stage_regression_rule: PENDING
reason: PENDING
reopen_trigger: PENDING
~~~

### Block A dependency gate

Block A is frozen only when:

- D08 has a stable Production progression representation;
- D09 has authoritative score semantics or an explicit replacement;
- D18/D27 define whether attained depth is distinct from current condition;
- any stage-regression rule is explicit rather than inferred from implementation.

## 4. Block B — Progression / anti-farming semantics

This block defines what accumulated evidence is allowed to advance a relationship and prevents message-volume or timing exploits from becoming intimacy authority.

### B1 — D10 Positive soft-cap

**Evidence status:** CALIBRATION-SUPPORTED / NOT SUFFICIENT TO PREVENT SATURATION

The current soft-cap may be retained only as one pacing mechanism. It cannot be treated as the answer to long-horizon saturation.

Owner record:

~~~yaml
decision_id: D10
disposition: PENDING
role_in_production_policy: PENDING
reason: PENDING
~~~

### B2 — D11 + D12 Stage gates and pacing

**Evidence status:** B2 EVIDENCE-SUPPORTED CANDIDATE / CALIBRATION EVIDENCE

Current tested alternate gates:

~~~text
S2 alternate: >= 8 positive weeks + >= 2 families
S3 alternate: >= 20 positive weeks + >= 2 families
S4 alternate: >= 40 positive weeks + >= 2 families
              + existing score/day/milestone requirements
~~~

Observed calibration behavior:

- visit-only farming stays shallow;
- 39-week narrow meaningful route remains below S4 in the tested matrix;
- 40-week sustained meaningful narrow route can qualify;
- mixed organic evidence retains a faster route;
- self-disclosure is not mandatory.

These numbers are calibration values only.

Owner freeze:

~~~yaml
decision_ids:
  - D11
  - D12
disposition: PENDING
stage_gate_contract: PENDING
pacing_contract: PENDING
numeric_values:
  s2_alternate_positive_weeks: PENDING
  s3_alternate_positive_weeks: PENDING
  s4_alternate_positive_weeks: PENDING
  minimum_positive_families: PENDING
reason: PENDING
reopen_trigger: PENDING
~~~

### B3 — D14 Exact logical dedupe

**Evidence status:** SOURCE-FIXED

~~~yaml
decision_id: D14
disposition: SOURCE_FIXED
contract: same logical Event retry applies once
owner_override_required: false
~~~

### B4 — D15 Rolling anti-farming window

**Evidence status:** MECHANISM EVIDENCE-SUPPORTED / NUMBERS OWNER-BOUND

The rolling-window mechanism removes the tested fixed-bucket Day-7/Day-8 amplification.

Production still requires explicit values for:

- exact horizon;
- exact credit cap;
- family taxonomy.

Owner freeze:

~~~yaml
decision_id: D15
disposition: PENDING
mechanism: PENDING
horizon: PENDING
credit_cap: PENDING
family_taxonomy_ref: PENDING
reason: PENDING
reopen_trigger: PENDING
~~~

### B5 — D16 Evidence diversity

**Evidence status:** MECHANISM EVIDENCE-SUPPORTED / TAXONOMY OWNER-BOUND

The source-aligned invariant is that deep relationship cannot be reduced to one repeated shallow action. V3 also shows that a sustained narrow but meaningful route can coexist with diversity requirements.

Owner freeze:

~~~yaml
decision_id: D16
disposition: PENDING
diversity_contract: PENDING
taxonomy_ref: PENDING
reason: PENDING
~~~

### B6 — D17 Conflict is relationship evidence

**Evidence status:** SOURCE-FIXED PRINCIPLE

~~~yaml
decision_id: D17
disposition: SOURCE_FIXED
contract:
  - explicit conflict/reconciliation may affect relationship behavior/state
  - inactivity alone may not substitute for conflict evidence
owner_override_required: false
~~~

### B7 — D28 Causal Episode anti-farming unit

**Evidence status:** EVIDENCE-SUPPORTED CANDIDATE

V3 folds causal chains before positive credit. Examples demonstrated by V3 include promise outcome chains and repeated conflict/repair callbacks. One conflict followed by repeated repair callbacks remains one Episode rather than many independent progression opportunities.

Owner freeze:

~~~yaml
decision_id: D28
disposition: PENDING
anti_farming_unit: PENDING
episode_boundary_contract: PENDING
reason: PENDING
schema_dependency:
  - D20
  - D21
  - D22
~~~

### B8 — D29 Repair progression / milestone semantics

**Evidence status:** DEFAULT EXCLUSION MITIGATES FARMING / OWNER DECISION REQUIRED

The current shadow keeps distinct conflict/repair history but excludes repair-resolution from progression milestone credit by default.

Owner must separately decide:

- whether repair contributes to progression diversity;
- whether repair can ever create milestone credit;
- whether repair only restores current behavior/condition without advancing attained depth.

Owner freeze:

~~~yaml
decision_id: D29
disposition: PENDING
repair_progression_family: PENDING
repair_milestone_credit: PENDING
repair_effect_on_attained_depth: PENDING
reason: PENDING
~~~

### Block B dependency gate

Block B is frozen only when:

- stage-gate/pacing values are explicit;
- rolling anti-farming mechanism and numbers are explicit;
- family taxonomy/diversity semantics are explicit;
- Causal Episode adoption/rejection is explicit;
- repair semantics cannot be used to farm progression;
- no selected rule contradicts D14 or D17.

## 5. Block C — Production Event contract

This block defines which authoritative occurrences are eligible to enter the Production relationship ledger and what provenance/schema they must carry.

### C1 — D13 Production Event allowlist

**Evidence status:** UNRESOLVED

Event Authority V1 validates experimental Event occurrence. That does not promote the experimental vocabulary into a Production registry.

Owner freeze must define:

- Production Event allowlist;
- generic relationship Event boundary;
- Character-specific Event boundary;
- versioning/change rule for the registry.

~~~yaml
decision_id: D13
disposition: PENDING
production_event_registry_ref: PENDING
generic_event_boundary: PENDING
character_specific_event_boundary: PENDING
versioning_rule: PENDING
~~~

### C2 — D19 last_interaction_at authority

**Evidence status:** UNRESOLVED

The field must not become an implicit inactivity-decay trigger.

Owner freeze:

~~~yaml
decision_id: D19
disposition: PENDING
write_authority: PENDING
write_triggers: PENDING
non_triggers: PENDING
reason: PENDING
~~~

### C3 — D20 occurred_at

**Evidence status:** ERD EXTENSION PROPOSAL

The proposal keeps Event occurrence time separate from apply/commit time.

Owner freeze:

~~~yaml
decision_id: D20
disposition: PENDING
occurred_at_contract: PENDING
clock_authority: PENDING
schema_impact: PENDING
~~~

### C4 — D21 Source-message provenance

**Evidence status:** ERD EXTENSION PROPOSAL

Production relationship Events need referentially constrained message provenance rather than caller-defined arbitrary JSON only.

Owner freeze:

~~~yaml
decision_id: D21
disposition: PENDING
provenance_contract: PENDING
allowed_source_reference_types: PENDING
referential_constraints: PENDING
schema_impact: PENDING
~~~

### C5 — D22 Causal / correction / retraction links

**Evidence status:** ERD EXTENSION PROPOSAL

Owner freeze:

~~~yaml
decision_id: D22
disposition: PENDING
causal_predecessor_contract: PENDING
correction_contract: PENDING
retraction_contract: PENDING
referential_constraints: PENDING
schema_impact: PENDING
~~~

### C6 — D23 Fact versus Character interpretation

**Evidence status:** ARCHITECTURE REQUIREMENT / PAYLOAD SCHEMA UNRESOLVED

Event Authority V1 demonstrates this boundary in executable form:

~~~text
objective Event facts
!=
Character interpretation
~~~

Character interpretation may affect Character behavior/expression but cannot grant Event fact authority.

Owner freeze must preserve that boundary in the Production payload contract.

~~~yaml
decision_id: D23
disposition: PENDING
fact_payload_contract: PENDING
character_interpretation_contract: PENDING
authority_separation_rule: PENDING
~~~

### C7 — D25 Production payload schema

**Evidence status:** UNRESOLVED

No arbitrary caller JSON becomes relationship authority.

Owner freeze:

~~~yaml
decision_id: D25
disposition: PENDING
payload_registry_ref: PENDING
validation_rule: PENDING
unknown_type_behavior: PENDING
schema_versioning_rule: PENDING
~~~

### C8 — D26 Blocked / suppressed Event semantics

**Evidence status:** PARTIALLY CONVERGED / OWNER DECISION REQUIRED

Event Authority `REJECT` already produces zero relationship-policy input.

For an already-authorized Event later suppressed by anti-farming, the owner must choose an explicit representation:

- no relationship-ledger append;
- separate operational/audit observation;
- explicitly approved non-mutating relationship record;
- another source-approved contract.

Owner freeze:

~~~yaml
decision_id: D26
disposition: PENDING
suppressed_event_representation: PENDING
relationship_mutation_allowed: false
audit_visibility: PENDING
reason: PENDING
~~~

### Block C dependency gate

Block C is frozen only when:

- the Production Event registry exists as an explicit allowlist/versioned contract;
- message/provenance/time authority is explicit;
- correction/retraction linkage is explicit or deliberately rejected with an alternative;
- Event facts and Character interpretation remain separated;
- payload schemas reject unknown/unapproved authority;
- suppressed Event handling cannot accidentally mutate relationship state.

## 6. Block D — Replay / persistence strategy

### D1 — D24 Replay / rebuild

**Evidence status:** DETERMINISTIC SHADOW REBUILD DEMONSTRATED / PRODUCTION PERSISTENCE STRATEGY UNRESOLVED

V3 demonstrates deterministic rebuild from active experimental history after correction/retraction. Production still needs a persistence/replay contract.

Decision surface:

- snapshot-assisted append-only Event history with defined rebuild boundaries;
- fully replayable historical-policy contract;
- another explicit strategy that preserves history, corrections, policy provenance, and deterministic current projection.

Owner freeze:

~~~yaml
decision_id: D24
disposition: PENDING
persistence_strategy: PENDING
snapshot_contract: PENDING
historical_policy_requirement: PENDING
rebuild_trigger: PENDING
reason: PENDING
reopen_trigger: PENDING
~~~

### D2 — Cross-cutting active-policy selection / migration blocker

The V2 promotion checklist separately records active policy selection/migration as unresolved. This is not silently assigned a new D-number here.

Before SRC-22 closure, the Production policy artifact must explicitly define:

~~~yaml
active_policy_selection:
  status: PENDING
  selection_authority: PENDING
  version_change_rule: PENDING
  current_projection_migration_rule: PENDING
  historical_event_rewrite_allowed: false
~~~

## 7. Closure audit

SRC-22 may move from OPEN only when all of the following are true:

- every owner-bound D08-D29 item has an explicit disposition;
- every `ACCEPT_WITH_CHANGE` includes an exact replacement contract/value;
- every Production-critical `DEFER` has either been resolved or proven non-blocking under a fail-closed Production contract;
- D14 and D17 source-fixed principles remain intact;
- the chosen D08/D09/D18/D27 semantics are mutually consistent;
- D11/D15/D16/D28/D29 cannot turn raw message volume into progression authority;
- D13/D20/D21/D22/D23/D25 define a governable Event contract;
- D24 and active-policy selection define deterministic current projection behavior;
- no decision grants the LLM, client, or caller direct relationship mutation authority;
- no Production DB migration or runtime binding happened before this freeze.

Final owner sign-off record:

~~~yaml
src_gap: SRC-22
status: OPEN
source_owner_freeze:
  completed: false
  completed_at: null
  reviewed_evidence:
    - SRC-22_RELATIONSHIP_POLICY_DECISION_PACKAGE_V2.md
    - SEYEON_RELATIONSHIP_POLICY_CONVERGENCE_V3.md
  unresolved_decisions: D08-D29 owner-bound items
  production_mutation_authorized: false
~~~

## 8. What happens after freeze

Only after explicit source-owner sign-off:

~~~text
PHASE K
Production Relationship Policy Artifact
        ↓
PHASE L
ERD Extension + SQL constraints + append-only guards
        ↓
PHASE M
Atomic Relationship Event Apply Command + PostgreSQL Adapter
        ↓
PHASE N
Concurrency + Retry + Idempotency + Anti-farming + Replay/Correction
        ↓
PHASE O
Se-yeon Production Vertical Slice
~~~

The Production path must remain:

~~~text
candidate
→ authority
→ deterministic policy
→ server commit authority
~~~

Never:

~~~text
LLM
→ direct relationship DB mutation
~~~
