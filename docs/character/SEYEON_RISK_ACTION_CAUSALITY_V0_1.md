# Se-yeon Risk-bearing Action Causality v0.1

> Track: character-memory
> Runtime contract: `seyeon-risk-action-causality-v1`
> Production Event Authority: NOT INTRODUCED
> Relationship mutation: BLOCKED
> Durable Memory mutation: BLOCKED
> SRC-22: OPEN

## 1. Purpose

Risk-bearing Character behavior is not globally prohibited. It is admitted only when the current turn contains a causal chain grounded in authored Character behavior, an existing relationship context, the current behavioral overlay, the current user turn, and explicitly authorized shared-history evidence.

The gate sits after interpretation and before rendering:

```text
Integrity
→ Disclosure V2
→ Allowed Private Retrieval
→ Experimental Relationship Behavior Overlay
→ Working Context
→ Interpret
→ Risk-bearing Action Causality
→ Render
→ Semantic Review
→ Guard
```

This phase does not create events, mutate relationship state, or write Memory.

## 2. Source-grounded risk signatures

The v1 gate covers only signatures already representable by the current Se-yeon action/expression vocabulary and grounded by Runtime R5.5 / R14.5.

### JEALOUS_PROBE

Detected when:

- `expressionState = jealous`

The existing interpreter already requires attached/deep-trust reveal plus supporting history for jealous expression.

### VULNERABLE_SELF_DISCLOSURE

Detected when:

- `chosenAction = self_disclose`
- `expressionState = vulnerable`

The causal gate additionally preserves the authored deep-trust boundary:

- relationship trust band must be high;
- reveal level must be `deep_trust`.

Causal history never lowers Disclosure Authority or Fact Authority.

### OVER_CARE

Detected only for the authored overstep tension:

- action is `narrow_choices` or `care_practically`; and
- tension is `help_vs_user_agency` or `solve_vs_overstep`.

Ordinary practical care is not automatically classified as risky.

### DELAYED_HURT_RESPONSE

Detected only when:

- action is `give_space` or `admit_boundary`;
- expression is `hurt`, `sulking`, or `angry`; and
- tension is `felt_okay_vs_delayed_hurt`.

Ordinary boundaries are not automatically classified as risky.

## 3. Required causal evidence

Every detected risk-bearing signature requires all of:

1. an existing relationship context;
2. the current experimental relationship behavior overlay;
3. the current user message as cited situation evidence;
4. the current interpreted user move / immediate want / tension;
5. at least one retrieved factual `relationship_event` explicitly marked
   `causalAuthority = authorized_shared_history`;
6. the interpretation must actually reference that authorized history.

High trust, high closeness, relationship stage, or the overlay alone is insufficient.

The current user claim is never accepted as shared-history evidence merely because it is repeated or cited.

## 4. Explicit causal-authority marker

`SeyeonRetrievedMemoryV2` now permits the optional marker:

```text
causalAuthority = authorized_shared_history
```

It is valid only when:

- `kind = relationship_event`
- `claimKind = fact`

Ordinary Memory, Character interpretation, raw user claims, assistant output, private Character source retrieval, and experimental shadow Event IDs cannot receive this causal role through this gate.

The marker is an input-side authority assertion for causal use only. It does not create Event Authority, relationship authority, or durable truth.

## 5. Deliberately unsupported risk forms

The current authored action enum does not contain canonical action keys for:

- grabbing / physically holding on;
- possessive claims;
- relationship testing;
- coercive retention behavior.

This PR does not invent new action keys for them.

If the renderer escalates a bounded interpretation into these behaviors, Semantic Review may reject it as `RISK_ACTION_CAUSALITY_VIOLATION` and/or the existing ownership/agency violations.

## 6. Relationship overlay boundary

`currentCondition` and `behaviorAccess` are recorded as causal context, but this PR does not invent exact policy mappings such as:

- `OPEN_CONFLICT → vulnerability forbidden`;
- `STABLE → jealousy allowed`;
- `CAUTIOUS_AFTER_REPAIR → disclosure ceiling`;
- `S4_SPECIAL → possessiveness allowed`.

The overlay remains:

```text
experimental_behavior_overlay_not_relationship_authority
```

## 7. Mutation boundary

A successful causal decision has:

```text
mayCreateRelationshipEvent = false
mayMutateRelationshipState = false
mayAppendDurableMemory = false
```

The result only authorizes the interpreted risk-bearing behavior to proceed to rendering for the current turn.

## 8. Next phase

The next authority slice is Event Candidate Extraction / Event Authority Validation.

That later phase must decide whether an observed interaction is eligible to become a durable relationship Event. This PR intentionally does not infer that authority from a successful risk-action decision.
