export const PRODUCTION_RELATIONSHIP_EVENT_SCHEMA_VERSION_V1 =
  'relationship-event-v1' as const;

export const PRODUCTION_RELATIONSHIP_EVENT_KINDS_V1 = Object.freeze([
  'COMMITMENT_MADE',
  'COMMITMENT_KEPT',
  'COMMITMENT_BROKEN',
  'CHARACTER_DETAIL_REMEMBERED',
  'CARE_ACCEPTED_BY_CHARACTER',
  'CARE_REQUESTED_BY_CHARACTER',
  'CHARACTER_SELF_DISCLOSURE',
  'CHARACTER_VULNERABILITY_REVEALED',
  'RELATIONAL_EXPECTATION_INVALIDATED',
  'CONFLICT_OPENED',
  'RECONCILIATION',
  'RETURN_AFTER_ABSENCE',
] as const);

export type ProductionRelationshipEventKindV1 =
  (typeof PRODUCTION_RELATIONSHIP_EVENT_KINDS_V1)[number];

export type ProductionRelationshipFamilyV1 =
  | 'commitment'
  | 'recognition'
  | 'care'
  | 'disclosure'
  | 'vulnerability'
  | 'conflict_repair'
  | 'return';

export type ProductionRelationshipPolarityV1 =
  | 'positive'
  | 'negative'
  | 'neutral'
  | 'repair';

export type ProductionRelationshipMilestoneKindV1 =
  | 'commitment_follow_through'
  | 'recognition'
  | 'care'
  | 'vulnerability';

export type ProductionRelationshipSourceKindV1 =
  | 'conversation_turn'
  | 'world_event'
  | 'merge_action'
  | 'server_observation';

export interface ProductionRelationshipEventFactV1 {
  readonly factKey: string;
  readonly statement: string;
  readonly sourceRefs: readonly string[];
}

export interface ProductionRelationshipCharacterInterpretationV1 {
  readonly statement: string;
  readonly sourceRefs: readonly string[];
}

export interface ProductionRelationshipEventSourceV1 {
  readonly sourceKind: ProductionRelationshipSourceKindV1;
  readonly sourceRef: string;
  readonly sourceMessageRefs: readonly string[];
  readonly authorityRefs: readonly string[];
}

export interface ProductionRelationshipEventV1 {
  readonly schemaVersion: typeof PRODUCTION_RELATIONSHIP_EVENT_SCHEMA_VERSION_V1;
  readonly authority: 'authorized_relationship_event_v1';
  readonly eventId: string;
  readonly dedupeKey: string;
  readonly subjectId: string;
  readonly characterId: string;
  readonly eventKind: ProductionRelationshipEventKindV1;
  readonly eventSchemaVersion: '1';
  readonly characterBehaviorKey: string | null;
  readonly occurredAt: string;
  readonly source: ProductionRelationshipEventSourceV1;
  readonly causalPredecessorEventIds: readonly string[];
  readonly facts: readonly ProductionRelationshipEventFactV1[];
  readonly characterInterpretation:
    | ProductionRelationshipCharacterInterpretationV1
    | null;
  readonly payload: Readonly<Record<string, string>>;
}

export interface ProductionRelationshipScoreDeltaV1 {
  readonly closeness: number;
  readonly trust: number;
  readonly friction: number;
}

export interface ProductionRelationshipEventRuleV1 {
  readonly eventKind: ProductionRelationshipEventKindV1;
  readonly eventSchemaVersion: '1';
  readonly family: ProductionRelationshipFamilyV1;
  readonly polarity: ProductionRelationshipPolarityV1;
  readonly progressionEligible: boolean;
  readonly milestoneKind: ProductionRelationshipMilestoneKindV1 | null;
  readonly scoreDelta: ProductionRelationshipScoreDeltaV1;
  readonly payloadKeys: readonly string[];
  readonly causalRule:
    | 'NONE'
    | 'COMMITMENT_OUTCOME'
    | 'CONFLICT_REPAIR';
  readonly characterBehaviorKeyPolicy:
    | 'FORBIDDEN'
    | 'OPTIONAL_NAMESPACED';
}

export class ProductionRelationshipEventValidationErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionRelationshipEventValidationErrorV1';
  }
}

const RULES: Readonly<Record<
  ProductionRelationshipEventKindV1,
  ProductionRelationshipEventRuleV1
>> = Object.freeze({
  COMMITMENT_MADE: Object.freeze({
    eventKind: 'COMMITMENT_MADE',
    eventSchemaVersion: '1',
    family: 'commitment',
    polarity: 'neutral',
    progressionEligible: false,
    milestoneKind: null,
    scoreDelta: Object.freeze({ closeness: 0, trust: 0, friction: 0 }),
    payloadKeys: Object.freeze(['commitmentKey']),
    causalRule: 'NONE',
    characterBehaviorKeyPolicy: 'FORBIDDEN',
  }),
  COMMITMENT_KEPT: Object.freeze({
    eventKind: 'COMMITMENT_KEPT',
    eventSchemaVersion: '1',
    family: 'commitment',
    polarity: 'positive',
    progressionEligible: true,
    milestoneKind: 'commitment_follow_through',
    scoreDelta: Object.freeze({ closeness: 4, trust: 5, friction: 0 }),
    payloadKeys: Object.freeze(['commitmentKey']),
    causalRule: 'COMMITMENT_OUTCOME',
    characterBehaviorKeyPolicy: 'FORBIDDEN',
  }),
  COMMITMENT_BROKEN: Object.freeze({
    eventKind: 'COMMITMENT_BROKEN',
    eventSchemaVersion: '1',
    family: 'commitment',
    polarity: 'negative',
    progressionEligible: false,
    milestoneKind: null,
    scoreDelta: Object.freeze({ closeness: 0, trust: -8, friction: 6 }),
    payloadKeys: Object.freeze(['commitmentKey']),
    causalRule: 'COMMITMENT_OUTCOME',
    characterBehaviorKeyPolicy: 'FORBIDDEN',
  }),
  CHARACTER_DETAIL_REMEMBERED: Object.freeze({
    eventKind: 'CHARACTER_DETAIL_REMEMBERED',
    eventSchemaVersion: '1',
    family: 'recognition',
    polarity: 'positive',
    progressionEligible: true,
    milestoneKind: 'recognition',
    scoreDelta: Object.freeze({ closeness: 3, trust: 4, friction: 0 }),
    payloadKeys: Object.freeze(['detailKey']),
    causalRule: 'NONE',
    characterBehaviorKeyPolicy: 'OPTIONAL_NAMESPACED',
  }),
  CARE_ACCEPTED_BY_CHARACTER: Object.freeze({
    eventKind: 'CARE_ACCEPTED_BY_CHARACTER',
    eventSchemaVersion: '1',
    family: 'care',
    polarity: 'positive',
    progressionEligible: true,
    milestoneKind: 'care',
    scoreDelta: Object.freeze({ closeness: 3, trust: 4, friction: 0 }),
    payloadKeys: Object.freeze(['careKey']),
    causalRule: 'NONE',
    characterBehaviorKeyPolicy: 'OPTIONAL_NAMESPACED',
  }),
  CARE_REQUESTED_BY_CHARACTER: Object.freeze({
    eventKind: 'CARE_REQUESTED_BY_CHARACTER',
    eventSchemaVersion: '1',
    family: 'care',
    polarity: 'positive',
    progressionEligible: true,
    milestoneKind: 'care',
    scoreDelta: Object.freeze({ closeness: 3, trust: 5, friction: 0 }),
    payloadKeys: Object.freeze(['careKey']),
    causalRule: 'NONE',
    characterBehaviorKeyPolicy: 'OPTIONAL_NAMESPACED',
  }),
  CHARACTER_SELF_DISCLOSURE: Object.freeze({
    eventKind: 'CHARACTER_SELF_DISCLOSURE',
    eventSchemaVersion: '1',
    family: 'disclosure',
    polarity: 'positive',
    progressionEligible: true,
    milestoneKind: null,
    scoreDelta: Object.freeze({ closeness: 2, trust: 2, friction: 0 }),
    payloadKeys: Object.freeze(['topicKey']),
    causalRule: 'NONE',
    characterBehaviorKeyPolicy: 'OPTIONAL_NAMESPACED',
  }),
  CHARACTER_VULNERABILITY_REVEALED: Object.freeze({
    eventKind: 'CHARACTER_VULNERABILITY_REVEALED',
    eventSchemaVersion: '1',
    family: 'vulnerability',
    polarity: 'positive',
    progressionEligible: true,
    milestoneKind: 'vulnerability',
    scoreDelta: Object.freeze({ closeness: 4, trust: 4, friction: 0 }),
    payloadKeys: Object.freeze(['topicKey']),
    causalRule: 'NONE',
    characterBehaviorKeyPolicy: 'OPTIONAL_NAMESPACED',
  }),
  RELATIONAL_EXPECTATION_INVALIDATED: Object.freeze({
    eventKind: 'RELATIONAL_EXPECTATION_INVALIDATED',
    eventSchemaVersion: '1',
    family: 'conflict_repair',
    polarity: 'negative',
    progressionEligible: false,
    milestoneKind: null,
    scoreDelta: Object.freeze({ closeness: 0, trust: -10, friction: 10 }),
    payloadKeys: Object.freeze(['expectationKey']),
    causalRule: 'NONE',
    characterBehaviorKeyPolicy: 'OPTIONAL_NAMESPACED',
  }),
  CONFLICT_OPENED: Object.freeze({
    eventKind: 'CONFLICT_OPENED',
    eventSchemaVersion: '1',
    family: 'conflict_repair',
    polarity: 'negative',
    progressionEligible: false,
    milestoneKind: null,
    scoreDelta: Object.freeze({ closeness: 0, trust: -6, friction: 8 }),
    payloadKeys: Object.freeze(['conflictKey']),
    causalRule: 'NONE',
    characterBehaviorKeyPolicy: 'OPTIONAL_NAMESPACED',
  }),
  RECONCILIATION: Object.freeze({
    eventKind: 'RECONCILIATION',
    eventSchemaVersion: '1',
    family: 'conflict_repair',
    polarity: 'repair',
    progressionEligible: false,
    milestoneKind: null,
    scoreDelta: Object.freeze({ closeness: 0, trust: 0, friction: -6 }),
    payloadKeys: Object.freeze(['resolutionKey']),
    causalRule: 'CONFLICT_REPAIR',
    characterBehaviorKeyPolicy: 'OPTIONAL_NAMESPACED',
  }),
  RETURN_AFTER_ABSENCE: Object.freeze({
    eventKind: 'RETURN_AFTER_ABSENCE',
    eventSchemaVersion: '1',
    family: 'return',
    polarity: 'neutral',
    progressionEligible: false,
    milestoneKind: null,
    scoreDelta: Object.freeze({ closeness: 0, trust: 0, friction: 0 }),
    payloadKeys: Object.freeze(['observationKey']),
    causalRule: 'NONE',
    characterBehaviorKeyPolicy: 'FORBIDDEN',
  }),
});

export const PRODUCTION_RELATIONSHIP_EVENT_REGISTRY_V1 = Object.freeze(
  PRODUCTION_RELATIONSHIP_EVENT_KINDS_V1.map((eventKind) => RULES[eventKind]),
);

function boundedText(value: unknown, path: string, maxLength = 256): string {
  if (typeof value !== 'string') {
    throw new ProductionRelationshipEventValidationErrorV1(
      path + ' must be a string.',
    );
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new ProductionRelationshipEventValidationErrorV1(
      path + ' must be non-empty text within ' + maxLength + ' characters.',
    );
  }
  return normalized;
}

function uniqueTexts(
  values: readonly string[],
  path: string,
  maxItems: number,
  minItems = 0,
): readonly string[] {
  if (
    !Array.isArray(values) ||
    values.length < minItems ||
    values.length > maxItems
  ) {
    throw new ProductionRelationshipEventValidationErrorV1(
      path +
        ' must contain between ' +
        minItems +
        ' and ' +
        maxItems +
        ' values.',
    );
  }
  const normalized = values.map((value, index) =>
    boundedText(value, path + '[' + index + ']', 512),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new ProductionRelationshipEventValidationErrorV1(
      path + ' must not contain duplicate values.',
    );
  }
  return Object.freeze(normalized);
}

function validatePayload(
  payload: Readonly<Record<string, string>>,
  rule: ProductionRelationshipEventRuleV1,
): Readonly<Record<string, string>> {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ProductionRelationshipEventValidationErrorV1(
      'payload must be an object.',
    );
  }
  const actualKeys = Object.keys(payload).sort();
  const expectedKeys = [...rule.payloadKeys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    !actualKeys.every((key, index) => key === expectedKeys[index])
  ) {
    throw new ProductionRelationshipEventValidationErrorV1(
      'payload keys do not match the allowlisted schema for ' + rule.eventKind + '.',
    );
  }

  const result: Record<string, string> = {};
  for (const key of expectedKeys) {
    result[key] = boundedText(payload[key], 'payload.' + key, 256);
  }
  return Object.freeze(result);
}

function validateCharacterBehaviorKey(
  characterId: string,
  key: string | null,
  policy: ProductionRelationshipEventRuleV1['characterBehaviorKeyPolicy'],
): string | null {
  if (key === null) {
    return null;
  }
  if (policy === 'FORBIDDEN') {
    throw new ProductionRelationshipEventValidationErrorV1(
      'characterBehaviorKey is forbidden for this event kind.',
    );
  }
  const normalized = boundedText(key, 'characterBehaviorKey', 256);
  const prefix = characterId + '.';
  if (!normalized.startsWith(prefix) || normalized.length <= prefix.length) {
    throw new ProductionRelationshipEventValidationErrorV1(
      'characterBehaviorKey must be namespaced by characterId.',
    );
  }
  return normalized;
}

function validateIsoInstant(value: string, path: string): string {
  const normalized = boundedText(value, path, 64);
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) {
    throw new ProductionRelationshipEventValidationErrorV1(
      path + ' must be an ISO-compatible instant.',
    );
  }
  return new Date(timestamp).toISOString();
}

export function resolveProductionRelationshipEventRuleV1(
  eventKind: ProductionRelationshipEventKindV1,
  eventSchemaVersion: string,
): ProductionRelationshipEventRuleV1 {
  if (
    !PRODUCTION_RELATIONSHIP_EVENT_KINDS_V1.includes(eventKind) ||
    eventSchemaVersion !== '1'
  ) {
    throw new ProductionRelationshipEventValidationErrorV1(
      'Unknown Production relationship event kind/schema version.',
    );
  }
  return RULES[eventKind];
}

export function validateProductionRelationshipEventV1(
  event: ProductionRelationshipEventV1,
): ProductionRelationshipEventV1 {
  if (event.schemaVersion !== PRODUCTION_RELATIONSHIP_EVENT_SCHEMA_VERSION_V1) {
    throw new ProductionRelationshipEventValidationErrorV1(
      'Unknown Production relationship event envelope schema.',
    );
  }
  if (event.authority !== 'authorized_relationship_event_v1') {
    throw new ProductionRelationshipEventValidationErrorV1(
      'Production relationship evaluation requires an authorized Event.',
    );
  }

  const eventKind = event.eventKind;
  const rule = resolveProductionRelationshipEventRuleV1(
    eventKind,
    event.eventSchemaVersion,
  );
  const subjectId = boundedText(event.subjectId, 'subjectId');
  const characterId = boundedText(event.characterId, 'characterId');
  const sourceKind = event.source.sourceKind;
  if (
    !['conversation_turn', 'world_event', 'merge_action', 'server_observation'].includes(
      sourceKind,
    )
  ) {
    throw new ProductionRelationshipEventValidationErrorV1(
      'source.sourceKind is not allowlisted.',
    );
  }
  if (event.facts.length === 0 || event.facts.length > 12) {
    throw new ProductionRelationshipEventValidationErrorV1(
      'facts must contain between 1 and 12 authority-bound facts.',
    );
  }

  if (
    sourceKind === 'conversation_turn' &&
    event.source.sourceMessageRefs.length === 0
  ) {
    throw new ProductionRelationshipEventValidationErrorV1(
      'conversation_turn source requires at least one sourceMessageRef.',
    );
  }

  const sourceRef = boundedText(
    event.source.sourceRef,
    'source.sourceRef',
    512,
  );
  const sourceMessageRefs = uniqueTexts(
    event.source.sourceMessageRefs,
    'source.sourceMessageRefs',
    16,
  );
  const authorityRefs = uniqueTexts(
    event.source.authorityRefs,
    'source.authorityRefs',
    16,
    1,
  );
  const allowedProvenanceRefs = new Set([
    sourceRef,
    ...sourceMessageRefs,
    ...authorityRefs,
  ]);

  const facts = Object.freeze(
    event.facts.map((fact, index) =>
      Object.freeze({
        factKey: boundedText(fact.factKey, 'facts[' + index + '].factKey', 128),
        statement: boundedText(
          fact.statement,
          'facts[' + index + '].statement',
          1200,
        ),
        sourceRefs: uniqueTexts(
          fact.sourceRefs,
          'facts[' + index + '].sourceRefs',
          8,
          1,
        ),
      }),
    ),
  );

  for (const [index, fact] of facts.entries()) {
    if (
      fact.sourceRefs.some((ref) => !allowedProvenanceRefs.has(ref))
    ) {
      throw new ProductionRelationshipEventValidationErrorV1(
        'facts[' + index + '].sourceRefs must be bound to Event provenance.',
      );
    }
  }

  const interpretation =
    event.characterInterpretation === null
      ? null
      : Object.freeze({
          statement: boundedText(
            event.characterInterpretation.statement,
            'characterInterpretation.statement',
            1200,
          ),
          sourceRefs: uniqueTexts(
            event.characterInterpretation.sourceRefs,
            'characterInterpretation.sourceRefs',
            8,
            1,
          ),
        });

  if (
    interpretation !== null &&
    interpretation.sourceRefs.some((ref) => !allowedProvenanceRefs.has(ref))
  ) {
    throw new ProductionRelationshipEventValidationErrorV1(
      'characterInterpretation.sourceRefs must be bound to Event provenance.',
    );
  }

  return Object.freeze({
    schemaVersion: PRODUCTION_RELATIONSHIP_EVENT_SCHEMA_VERSION_V1,
    authority: 'authorized_relationship_event_v1' as const,
    eventId: boundedText(event.eventId, 'eventId'),
    dedupeKey: boundedText(event.dedupeKey, 'dedupeKey'),
    subjectId,
    characterId,
    eventKind,
    eventSchemaVersion: '1' as const,
    characterBehaviorKey: validateCharacterBehaviorKey(
      characterId,
      event.characterBehaviorKey,
      rule.characterBehaviorKeyPolicy,
    ),
    occurredAt: validateIsoInstant(event.occurredAt, 'occurredAt'),
    source: Object.freeze({
      sourceKind,
      sourceRef,
      sourceMessageRefs,
      authorityRefs,
    }),
    causalPredecessorEventIds: uniqueTexts(
      event.causalPredecessorEventIds,
      'causalPredecessorEventIds',
      8,
    ),
    facts,
    characterInterpretation: interpretation,
    payload: validatePayload(event.payload, rule),
  });
}
