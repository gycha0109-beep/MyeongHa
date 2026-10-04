import type { SeyeonExperimentalEventKindV2 } from './seyeon-event-ledger-v2.js';
import type { ProductionRelationshipEventKindV1 } from './relationship-event-registry-v1.js';

export const SEYEON_PRODUCTION_RELATIONSHIP_EVENT_BINDING_VERSION_V1 =
  'seyeon-production-relationship-event-binding-v1' as const;

export interface SeyeonProductionRelationshipEventBindingV1 {
  readonly experimentalEvidenceKind: SeyeonExperimentalEventKindV2;
  readonly productionEventKind: ProductionRelationshipEventKindV1;
  readonly characterBehaviorKey: string | null;
}

export const SEYEON_PRODUCTION_RELATIONSHIP_EVENT_BINDINGS_V1: readonly SeyeonProductionRelationshipEventBindingV1[] =
  Object.freeze([
    Object.freeze({
      experimentalEvidenceKind: 'PROMISE_MADE',
      productionEventKind: 'COMMITMENT_MADE',
      characterBehaviorKey: null,
    }),
    Object.freeze({
      experimentalEvidenceKind: 'PROMISE_KEPT',
      productionEventKind: 'COMMITMENT_KEPT',
      characterBehaviorKey: null,
    }),
    Object.freeze({
      experimentalEvidenceKind: 'PROMISE_BROKEN',
      productionEventKind: 'COMMITMENT_BROKEN',
      characterBehaviorKey: null,
    }),
    Object.freeze({
      experimentalEvidenceKind: 'USER_REMEMBERED_SEYEON_DETAIL',
      productionEventKind: 'CHARACTER_DETAIL_REMEMBERED',
      characterBehaviorKey: 'seyeon.detail_remembered',
    }),
    Object.freeze({
      experimentalEvidenceKind: 'SEYEON_ACCEPTED_HELP',
      productionEventKind: 'CARE_ACCEPTED_BY_CHARACTER',
      characterBehaviorKey: 'seyeon.accepted_help',
    }),
    Object.freeze({
      experimentalEvidenceKind: 'SEYEON_REQUESTED_HELP',
      productionEventKind: 'CARE_REQUESTED_BY_CHARACTER',
      characterBehaviorKey: 'seyeon.requested_help',
    }),
    Object.freeze({
      experimentalEvidenceKind: 'SEYEON_SELF_DISCLOSED',
      productionEventKind: 'CHARACTER_SELF_DISCLOSURE',
      characterBehaviorKey: 'seyeon.self_disclosed',
    }),
    Object.freeze({
      experimentalEvidenceKind: 'SEYEON_ADMITTED_WAITING',
      productionEventKind: 'CHARACTER_VULNERABILITY_REVEALED',
      characterBehaviorKey: 'seyeon.admitted_waiting',
    }),
    Object.freeze({
      experimentalEvidenceKind: 'SPECIALNESS_INVALIDATED',
      productionEventKind: 'RELATIONAL_EXPECTATION_INVALIDATED',
      characterBehaviorKey: 'seyeon.specialness_invalidated',
    }),
    Object.freeze({
      experimentalEvidenceKind: 'CONFLICT_EVENT',
      productionEventKind: 'CONFLICT_OPENED',
      characterBehaviorKey: 'seyeon.conflict_opened',
    }),
    Object.freeze({
      experimentalEvidenceKind: 'RECONCILIATION_EVENT',
      productionEventKind: 'RECONCILIATION',
      characterBehaviorKey: 'seyeon.reconciliation',
    }),
    Object.freeze({
      experimentalEvidenceKind: 'RETURNED_AFTER_ABSENCE',
      productionEventKind: 'RETURN_AFTER_ABSENCE',
      characterBehaviorKey: null,
    }),
  ]);

export function resolveSeyeonExperimentalEvidenceKindForProductionEventV1(
  productionEventKind: ProductionRelationshipEventKindV1,
): SeyeonExperimentalEventKindV2 {
  const matches = SEYEON_PRODUCTION_RELATIONSHIP_EVENT_BINDINGS_V1.filter(
    (candidate) =>
      candidate.productionEventKind === productionEventKind,
  );
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new TypeError(
      'Production relationship Event is not uniquely bound to Se-yeon experimental evidence V1.',
    );
  }
  return matches[0].experimentalEvidenceKind;
}

export function resolveSeyeonProductionRelationshipEventBindingV1(
  experimentalEvidenceKind: SeyeonExperimentalEventKindV2,
): SeyeonProductionRelationshipEventBindingV1 {
  const binding = SEYEON_PRODUCTION_RELATIONSHIP_EVENT_BINDINGS_V1.find(
    (candidate) =>
      candidate.experimentalEvidenceKind === experimentalEvidenceKind,
  );
  if (binding === undefined) {
    throw new TypeError(
      'Experimental Se-yeon Event is not bound to Production relationship policy V1.',
    );
  }
  return binding;
}

export const SEYEON_PRODUCTION_RELATIONSHIP_RUNTIME_BINDING_AUTHORIZED_V1 =
  false as const;
