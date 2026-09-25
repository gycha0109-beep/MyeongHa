# Se-yeon Relationship Policy Calibration v0.1

> Track: character-memory
> Status: **CALIBRATION EVIDENCE ONLY / NOT PRODUCTION AUTHORITY**
> Test: `test/seyeon-relationship-policy-calibration-v2.test.ts`
> Blocker: SRC-22 remains OPEN

## 0. Purpose

This document records a concrete simulation candidate so relationship-policy decisions can be tested instead of guessed.

It does not close SRC-22 and does not authorize PostgreSQL relationship mutation.

The calibration target is the previously selected Candidate-B pacing basis:

- ordinary diverse use should approach the highest tested stage over several months, not a few weeks;
- high-frequency but diverse use may progress faster, roughly around the ten-week order of magnitude;
- low-frequency use should remain below the highest stage after roughly six months;
- S3 -> S4 requires meaningful milestone evidence;
- positive scores use a soft-cap rather than racing to 100;
- long absence alone does not degrade the relationship;
- personal self-disclosure is not a mandatory progression gate.

## 1. Test-only score space

The harness uses:

| Dimension | Test range | Initial |
|---|---:|---:|
| closeness | 0..100 | 0 |
| trust | 0..100 | 0 |
| friction | 0..100 | 0 |

These ranges are simulation parameters only.

Positive delta soft-cap:

| Current score | Positive credit |
|---|---|
| 0..59 | 100% |
| 60..79 | 50%, rounded up |
| 80..99 | 25%, rounded up |
| 100 | 0 |

Negative trust and friction changes are not converted into automatic relationship-stage degradation rules by the LLM.

## 2. Test-only event effects

| Event | C | T | F | Family | Milestone |
|---|---:|---:|---:|---|---|
| RETURN_VISIT | +1 | 0 | 0 | visit | no |
| CHOSE_CHARACTER | +2 | +1 | 0 | choice | no |
| SHARED_PERSONAL_FACT | +2 | +2 | 0 | disclosure | no |
| COMPLETED_READING | +2 | +2 | 0 | shared_activity | no |
| FINISHED_EPISODE | +3 | +2 | 0 | shared_activity | yes |
| PROMISE_MADE | +1 | +1 | 0 | commitment | no |
| PROMISE_KEPT | +4 | +5 | 0 | commitment | yes |
| USER_REMEMBERED_SEYEON_DETAIL | +3 | +4 | 0 | recognition | yes |
| SEYEON_ACCEPTED_HELP | +3 | +4 | 0 | care | yes |
| SEYEON_REQUESTED_HELP | +3 | +5 | 0 | care | yes |
| SEYEON_SELF_DISCLOSED | +2 | +2 | 0 | disclosure | no |
| SEYEON_ADMITTED_WAITING | +4 | +4 | 0 | vulnerability | yes |
| CONFLICT_EVENT | 0 | -6 | +8 | conflict | no |
| PROMISE_BROKEN | 0 | -8 | +6 | conflict | no |
| SPECIALNESS_INVALIDATED | 0 | -10 | +10 | conflict | no |
| RECONCILIATION_EVENT | +3 | +5 | -6 | repair | yes |
| RETURNED_AFTER_ABSENCE | +1 | +1 | 0 | return | no |

These are candidate values for simulation, not approved production deltas.

## 3. Test-only stage gates

| Stage | Candidate gate |
|---|---|
| S0_FIRST_MEETING | default |
| S1_FAMILIAR | closeness >= 8, trust >= 4, 2 positive days, 2 families |
| S2_REGULAR | closeness >= 20, trust >= 12, 5 positive days, 3 families |
| S3_OPENED | closeness >= 42, trust >= 30, 12 positive days, 4 families, no unresolved conflict |
| S4_SPECIAL | closeness >= 75, trust >= 65, 40 positive days, 5 families, 3 milestones, no unresolved conflict |

A score threshold alone can never advance S3/S4.

## 4. Anti-farming candidate

The harness applies:

- exact source identity dedupe before any credit;
- at most two positive credits per event family per seven-day bucket;
- stage gates require multiple distinct event families;
- S4 requires multiple milestone events;
- repeated RETURN_VISIT alone cannot raise trust or relationship stage.

This is intentionally stronger than simple turn-count or message-count gating.

## 5. Alternate progression path

The primary calibration route deliberately excludes:

- SHARED_PERSONAL_FACT;
- SEYEON_SELF_DISCLOSED.

It still reaches S4 through a mix of:

- return/continued interaction;
- reading/episode completion;
- promises and follow-through;
- remembering Se-yeon-specific detail;
- accepting help / reciprocity.

Therefore the candidate does not force personal disclosure as the price of relationship progression.

## 6. Current simulation assertions

The automated dogfood requires:

1. ordinary diverse route at 17 weeks is not S4;
2. ordinary diverse route at 20 weeks reaches S4;
3. high-frequency diverse route at 4 weeks is not S4;
4. high-frequency diverse route at 10 weeks reaches S4;
5. low-frequency route after 26 weeks is still below S4;
6. 100 RETURN_VISIT events alone remain S0 and trust 0;
7. unresolved conflict blocks S3/S4;
8. explicit reconciliation can clear that block;
9. absence alone causes no score degradation;
10. identical source identity is credited once.

## 7. Promotion gate

None of the numbers in this file may enter:

- relationship_events.delta_closeness;
- relationship_events.delta_trust;
- relationship_events.delta_friction;
- user_character_states relationship_stage transition logic;
- production anti-farming;
- production last_interaction_at policy;

until they are reviewed as an SRC-22 source decision.

The value of this candidate is empirical comparison, not authority.
