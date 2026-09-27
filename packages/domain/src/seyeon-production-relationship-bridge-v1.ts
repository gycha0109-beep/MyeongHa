import {
  createImmutableArtifact,
} from './registry.js';
import {
  validateProductionRelationshipEventV1,
  type ProductionRelationshipEventKindV1,
  type ProductionRelationshipEventV1,
} from './relationship-event-registry-v1.js';
import {
  resolveSeyeonProductionRelationshipEventBindingV1,
} from './seyeon-relationship-event-bindings-v1.js';
import type {
  SeyeonEventAuthorityDecisionV1,
} from './seyeon-event-authority-v1.js';
import type {
  SeyeonExperimentalEventKindV2,
  SeyeonRelationshipEventV2,
} from './seyeon-event-ledger-v2.js';

export const SEYEON_PRODUCTION_RELATIONSHIP_ADMISSION_VERSION_V1 =
  'seyeon-production-relationship-admission-v1' as const;

export const SEYEON_PRODUCTION_RELATIONSHIP_MAX_EVENTS_PER_TURN_V1 =
  4 as const;

export interface SeyeonProductionRelationshipCausalBindingV1 {
  readonly experimentalEventId: string;
  readonly productionEvent: ProductionRelationshipEventV1;
}

export interface AdmitSeyeonProductionRelationshipEventV1Input {
  readonly subjectId: string;
  readonly productionEventId: string;
  readonly productionAuthorityRef: string;
  readonly committedTurnId: string;
  readonly committedAssistantMessageRef: string;
  readonly authoritativeOccurredAt: string;
  readonly experimentalEvent: SeyeonRelationshipEventV2;
  readonly authorityDecision: SeyeonEventAuthorityDecisionV1;
  readonly causalBindings: readonly SeyeonProductionRelationshipCausalBindingV1[];
}

export interface SeyeonProductionRelationshipAdmissionV1 {
  readonly schemaVersion:
    typeof SEYEON_PRODUCTION_RELATIONSHIP_ADMISSION_VERSION_V1;
  readonly decision: 'ADMIT_PRODUCTION';
  readonly sourceExperimentalEventId: string;
  readonly sourceExperimentalDedupeKey: string;
  readonly event: ProductionRelationshipEventV1;
  readonly constraints: Readonly<{
    readonly mayAppendProductionRelationshipEvent: true;
    readonly mayMutateProductionRelationshipStateViaPolicyOnly: true;
    readonly mayCreateGeneralDurableMemory: false;
    readonly mayGrantFactAuthority: false;
    readonly mayOverrideIntegrity: false;
    readonly mayOverrideDisclosure: false;
  }>;
}

export class SeyeonProductionRelationshipAdmissionErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonProductionRelationshipAdmissionErrorV1';
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CHARACTER_OUTPUT_EVENTS = new Set<SeyeonExperimentalEventKindV2>([
  'SEYEON_ACCEPTED_HELP',
  'SEYEON_REQUESTED_HELP',
  'SEYEON_SELF_DISCLOSED',
  'SEYEON_ADMITTED_WAITING',
]);

function text(value: unknown, path: string, max = 512): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > max
  ) {
    throw new SeyeonProductionRelationshipAdmissionErrorV1(
      path + ' must be bounded non-empty text.',
    );
  }
  return value.trim();
}

function uuid(value: unknown, path: string): string {
  const normalized = text(value, path, 64);
  if (!UUID.test(normalized)) {
    throw new SeyeonProductionRelationshipAdmissionErrorV1(
      path + ' must be a canonical UUID.',
    );
  }
  return normalized.toLowerCase();
}

function instant(value: unknown, path: string): string {
  const normalized = text(value, path, 64);
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    throw new SeyeonProductionRelationshipAdmissionErrorV1(
      path + ' must be an ISO-compatible instant.',
    );
  }
  return new Date(parsed).toISOString();
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function stableKey(
  label: string,
  material: Readonly<Record<string, unknown>>,
): string {
  return (
    label +
    ':' +
    createImmutableArtifact(
      'seyeon-production-relationship-key',
      '1',
      material,
    ).contentHash
  );
}

export function deriveSeyeonProductionRelationshipDedupeKeyV1(input: {
  readonly subjectId: string;
  readonly experimentalEvent: Pick<
    SeyeonRelationshipEventV2,
    'dedupeKey' | 'eventKind'
  >;
}): string {
  return stableKey('seyeon-prod', {
    subjectId: text(input.subjectId, 'subjectId', 256),
    characterId: 'seyeon',
    experimentalEventKind: input.experimentalEvent.eventKind,
    experimentalDedupeKey: text(
      input.experimentalEvent.dedupeKey,
      'experimentalEvent.dedupeKey',
      256,
    ),
  });
}

function causalProductionEvents(input: {
  readonly experimentalEvent: SeyeonRelationshipEventV2;
  readonly bindings: readonly SeyeonProductionRelationshipCausalBindingV1[];
}): readonly ProductionRelationshipEventV1[] {
  const ids = input.experimentalEvent.causalPredecessorEventIds;
  if (ids.length === 0) return Object.freeze([]);

  const resolved = ids.map((experimentalId) => {
    const matches = input.bindings.filter(
      (binding) => binding.experimentalEventId === experimentalId,
    );
    if (matches.length !== 1) {
      throw new SeyeonProductionRelationshipAdmissionErrorV1(
        'Every experimental causal predecessor must resolve to exactly one Production Event.',
      );
    }
    return validateProductionRelationshipEventV1(matches[0]!.productionEvent);
  });
  return Object.freeze(resolved);
}

function assertCausalKinds(
  productionKind: ProductionRelationshipEventKindV1,
  predecessors: readonly ProductionRelationshipEventV1[],
): void {
  if (
    productionKind === 'COMMITMENT_KEPT' ||
    productionKind === 'COMMITMENT_BROKEN'
  ) {
    if (
      predecessors.length !== 1 ||
      predecessors[0]!.eventKind !== 'COMMITMENT_MADE'
    ) {
      throw new SeyeonProductionRelationshipAdmissionErrorV1(
        productionKind + ' requires exactly one Production COMMITMENT_MADE predecessor.',
      );
    }
    return;
  }

  if (productionKind === 'RECONCILIATION') {
    if (
      predecessors.length !== 1 ||
      ![
        'CONFLICT_OPENED',
        'RELATIONAL_EXPECTATION_INVALIDATED',
        'COMMITMENT_BROKEN',
      ].includes(predecessors[0]!.eventKind)
    ) {
      throw new SeyeonProductionRelationshipAdmissionErrorV1(
        'RECONCILIATION requires exactly one active Production conflict predecessor.',
      );
    }
    return;
  }

  if (predecessors.length !== 0) {
    throw new SeyeonProductionRelationshipAdmissionErrorV1(
      productionKind + ' does not accept causal predecessors in the Production V1 registry.',
    );
  }
}

function payloadFor(input: {
  readonly productionKind: ProductionRelationshipEventKindV1;
  readonly experimentalEvent: SeyeonRelationshipEventV2;
  readonly predecessors: readonly ProductionRelationshipEventV1[];
}): Readonly<Record<string, string>> {
  const singleton = stableKey('seyeon-semantic', {
    experimentalEventKind: input.experimentalEvent.eventKind,
    experimentalDedupeKey: input.experimentalEvent.dedupeKey,
  });

  switch (input.productionKind) {
    case 'COMMITMENT_MADE':
      return Object.freeze({ commitmentKey: singleton });
    case 'COMMITMENT_KEPT':
    case 'COMMITMENT_BROKEN':
      return Object.freeze({
        commitmentKey: input.predecessors[0]!.payload.commitmentKey!,
      });
    case 'CHARACTER_DETAIL_REMEMBERED':
      return Object.freeze({ detailKey: singleton });
    case 'CARE_ACCEPTED_BY_CHARACTER':
    case 'CARE_REQUESTED_BY_CHARACTER':
      return Object.freeze({ careKey: singleton });
    case 'CHARACTER_SELF_DISCLOSURE':
    case 'CHARACTER_VULNERABILITY_REVEALED':
      return Object.freeze({ topicKey: singleton });
    case 'RELATIONAL_EXPECTATION_INVALIDATED':
      return Object.freeze({ expectationKey: singleton });
    case 'CONFLICT_OPENED':
      return Object.freeze({ conflictKey: singleton });
    case 'RECONCILIATION':
      return Object.freeze({ resolutionKey: singleton });
    case 'RETURN_AFTER_ABSENCE':
      return Object.freeze({ observationKey: singleton });
  }
}

function sourceFor(input: AdmitSeyeonProductionRelationshipEventV1Input) {
  const event = input.experimentalEvent;
  const decision = input.authorityDecision;
  const productionAuthorityRef = text(
    input.productionAuthorityRef,
    'productionAuthorityRef',
    512,
  );

  if (event.eventKind === 'RETURNED_AFTER_ABSENCE') {
    const serverRefs = unique(decision.evidence.serverObservationRefs);
    if (serverRefs.length !== 1) {
      throw new SeyeonProductionRelationshipAdmissionErrorV1(
        'RETURNED_AFTER_ABSENCE requires exactly one server observation authority ref.',
      );
    }
    return Object.freeze({
      sourceKind: 'server_observation' as const,
      sourceRef: text(serverRefs[0], 'serverObservationRef', 512),
      sourceMessageRefs: Object.freeze([]),
      authorityRefs: unique([
        productionAuthorityRef,
        ...decision.evidence.authorityRefs,
        ...serverRefs,
      ]),
    });
  }

  const turnId = uuid(input.committedTurnId, 'committedTurnId');
  if (turnId !== uuid(event.sourceTurnId, 'experimentalEvent.sourceTurnId')) {
    throw new SeyeonProductionRelationshipAdmissionErrorV1(
      'Experimental Event source turn must be the committed Production turn.',
    );
  }

  const messageRefs = Object.freeze(
    event.sourceMessageRefs.map((ref, index) =>
      uuid(ref, 'experimentalEvent.sourceMessageRefs[' + index + ']'),
    ),
  );
  const guardedRef = decision.evidence.guardedCharacterOutputRef;
  if (CHARACTER_OUTPUT_EVENTS.has(event.eventKind)) {
    if (
      guardedRef === null ||
      uuid(guardedRef, 'guardedCharacterOutputRef') !==
        uuid(input.committedAssistantMessageRef, 'committedAssistantMessageRef') ||
      !messageRefs.includes(guardedRef.toLowerCase())
    ) {
      throw new SeyeonProductionRelationshipAdmissionErrorV1(
        'Character-output relationship Event must bind the exact committed guarded assistant message.',
      );
    }
  }

  return Object.freeze({
    sourceKind: 'conversation_turn' as const,
    sourceRef: turnId,
    sourceMessageRefs: messageRefs,
    authorityRefs: unique([
      productionAuthorityRef,
      ...decision.evidence.authorityRefs,
    ]),
  });
}

export function admitSeyeonProductionRelationshipEventV1(
  input: AdmitSeyeonProductionRelationshipEventV1Input,
): SeyeonProductionRelationshipAdmissionV1 {
  const event = input.experimentalEvent;
  const decision = input.authorityDecision;

  if (
    decision.decision !== 'ADMIT_EXPERIMENTAL' ||
    decision.eventKind !== event.eventKind ||
    decision.evidence.currentTurnId !== event.sourceTurnId ||
    decision.constraints.mayAppendExperimentalLedger !== true ||
    decision.constraints.mayAppendProductionRelationshipEvent !== false ||
    decision.constraints.mayMutateProductionRelationshipState !== false
  ) {
    throw new SeyeonProductionRelationshipAdmissionErrorV1(
      'Production admission requires a valid experimental Event Authority admission and cannot inherit Production mutation authority from it.',
    );
  }

  const authoritativeOccurredAt = instant(
    input.authoritativeOccurredAt,
    'authoritativeOccurredAt',
  );
  if (authoritativeOccurredAt !== instant(event.occurredAt, 'experimentalEvent.occurredAt')) {
    throw new SeyeonProductionRelationshipAdmissionErrorV1(
      'Experimental Event occurrence time must equal the authoritative committed source time.',
    );
  }

  const binding = resolveSeyeonProductionRelationshipEventBindingV1(
    event.eventKind,
  );
  const predecessors = causalProductionEvents({
    experimentalEvent: event,
    bindings: input.causalBindings,
  });
  assertCausalKinds(binding.productionEventKind, predecessors);

  const source = sourceFor(input);
  const allowedProvenance = new Set([
    source.sourceRef,
    ...source.sourceMessageRefs,
    ...source.authorityRefs,
  ]);

  const facts = Object.freeze(
    decision.admittedFacts.map((fact) => {
      if (fact.sourceRefs.some((ref) => !allowedProvenance.has(ref))) {
        throw new SeyeonProductionRelationshipAdmissionErrorV1(
          'Admitted fact provenance must be contained in the Production Event source envelope.',
        );
      }
      return Object.freeze({
        factKey: fact.factKey,
        statement: fact.statement,
        sourceRefs: Object.freeze([...fact.sourceRefs]),
      });
    }),
  );
  if (facts.length === 0) {
    throw new SeyeonProductionRelationshipAdmissionErrorV1(
      'Production relationship Event requires at least one authority-bound fact.',
    );
  }

  const interpretation =
    decision.characterInterpretation === null
      ? null
      : (() => {
          if (
            decision.characterInterpretation!.sourceRefs.some(
              (ref) => !allowedProvenance.has(ref),
            )
          ) {
            throw new SeyeonProductionRelationshipAdmissionErrorV1(
              'Character interpretation provenance must be contained in the Production Event source envelope.',
            );
          }
          return Object.freeze({
            statement: decision.characterInterpretation!.statement,
            sourceRefs: Object.freeze([
              ...decision.characterInterpretation!.sourceRefs,
            ]),
          });
        })();

  const productionEvent = validateProductionRelationshipEventV1({
    schemaVersion: 'relationship-event-v1',
    authority: 'authorized_relationship_event_v1',
    eventId: uuid(input.productionEventId, 'productionEventId'),
    dedupeKey: deriveSeyeonProductionRelationshipDedupeKeyV1({
      subjectId: input.subjectId,
      experimentalEvent: event,
    }),
    subjectId: uuid(input.subjectId, 'subjectId'),
    characterId: 'seyeon',
    eventKind: binding.productionEventKind,
    eventSchemaVersion: '1',
    characterBehaviorKey: binding.characterBehaviorKey,
    occurredAt: authoritativeOccurredAt,
    source,
    causalPredecessorEventIds: Object.freeze(
      predecessors.map((predecessor) => predecessor.eventId),
    ),
    facts,
    characterInterpretation: interpretation,
    payload: payloadFor({
      productionKind: binding.productionEventKind,
      experimentalEvent: event,
      predecessors,
    }),
  });

  return Object.freeze({
    schemaVersion: SEYEON_PRODUCTION_RELATIONSHIP_ADMISSION_VERSION_V1,
    decision: 'ADMIT_PRODUCTION' as const,
    sourceExperimentalEventId: event.eventId,
    sourceExperimentalDedupeKey: event.dedupeKey,
    event: productionEvent,
    constraints: Object.freeze({
      mayAppendProductionRelationshipEvent: true as const,
      mayMutateProductionRelationshipStateViaPolicyOnly: true as const,
      mayCreateGeneralDurableMemory: false as const,
      mayGrantFactAuthority: false as const,
      mayOverrideIntegrity: false as const,
      mayOverrideDisclosure: false as const,
    }),
  });
}
