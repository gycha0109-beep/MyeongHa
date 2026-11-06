export const CHARACTER_WORKING_MEMORY_PROJECTION_SCHEMA_VERSION_V1 =
  'character-working-memory-projection-v1' as const;

export type CharacterWorkingMemoryRecordKindV1 = 'life_fact' | 'memory';
export type CharacterWorkingMemoryLifeFactSourceKindV1 =
  | 'user_explicit'
  | 'profile_edit'
  | 'merge_import';
export type CharacterWorkingMemoryMemorySourceKindV1 =
  | 'user_approved'
  | 'merge_import';
export type CharacterWorkingMemoryClaimKindV1 =
  | 'fact'
  | 'character_interpretation';

export interface CharacterWorkingMemoryProjectionResultV1 {
  readonly summary: string;
  readonly claimKind: CharacterWorkingMemoryClaimKindV1;
  readonly relevance: number;
  readonly salience: number;
}

export interface CharacterWorkingMemoryRecordProjectorV1 {
  readonly recordKind: CharacterWorkingMemoryRecordKindV1;
  readonly recordType: string;
  readonly schemaVersion: string;
  readonly projectorVersion: string;
  project(input: Readonly<{
    recordId: string;
    payload: unknown;
  }>): CharacterWorkingMemoryProjectionResultV1;
}

export interface CharacterWorkingMemoryLifeFactSourceV1 {
  readonly factId: string;
  readonly factType: string;
  readonly schemaVersion: string;
  readonly value: unknown;
  readonly grantId: string;
  readonly granteeCharacterId: string;
  readonly grantReason: 'user_choice' | 'merge_import';
  readonly grantedAt: string;
  readonly sourceKind: CharacterWorkingMemoryLifeFactSourceKindV1;
  readonly sourceMessageId: string | null;
  readonly sourceMergeActionId: string | null;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly confirmedAt: string;
  readonly createdAt: string;
}

export interface CharacterWorkingMemoryMemorySourceV1 {
  readonly memoryItemId: string;
  readonly memoryType: string;
  readonly schemaVersion: string;
  readonly content: unknown;
  readonly createdByCharacterId: string | null;
  readonly createdAt: string;
  readonly grantId: string;
  readonly granteeCharacterId: string;
  readonly grantReason: 'user_choice' | 'merge_import';
  readonly grantedAt: string;
  readonly sourceKind: CharacterWorkingMemoryMemorySourceKindV1;
  readonly sourceTurnId: string | null;
  readonly sourceMessageId: string | null;
  readonly sourceMergeActionId: string | null;
}

export interface CharacterWorkingMemoryRelationshipSourceV1 {
  readonly stateId: string;
  readonly characterId: string;
  readonly closeness: number;
  readonly trust: number;
  readonly friction: number;
  readonly relationshipStage: string;
  readonly policyVersion: string;
  readonly revision: number;
  readonly lastInteractionAt: string | null;
  readonly updatedAt: string;
}

export interface CharacterWorkingMemoryRelationshipEventSourceV1 {
  readonly eventType: string;
  readonly eventSchemaVersion: string;
  readonly stateRevisionAfter: number;
  readonly policyVersion: string;
  readonly appliedAt: string;
}

export interface CharacterWorkingMemoryRecentMessageSourceV1 {
  readonly messageId: string;
  readonly sequenceNo: number;
  readonly senderType: string;
  readonly characterId: string | null;
  readonly text: string;
  readonly createdAt: string;
}

export interface BuildCharacterWorkingMemoryProjectionInputV1 {
  readonly scope: Readonly<{
    subjectId: string;
    characterId: string;
    threadId: string;
    authorizedThreadCharacterIds: readonly string[];
    relationshipRevision: number | null;
  }>;
  readonly currentUserMessageRef: string;
  readonly lifeFacts: readonly CharacterWorkingMemoryLifeFactSourceV1[];
  readonly memories: readonly CharacterWorkingMemoryMemorySourceV1[];
  readonly relationship: CharacterWorkingMemoryRelationshipSourceV1 | null;
  readonly relationshipEvents: readonly CharacterWorkingMemoryRelationshipEventSourceV1[];
  readonly recentMessages: readonly CharacterWorkingMemoryRecentMessageSourceV1[];
  readonly projectors?: readonly CharacterWorkingMemoryRecordProjectorV1[];
}

export interface CharacterWorkingMemoryProjectedRecordV1 {
  readonly recordKind: CharacterWorkingMemoryRecordKindV1;
  readonly recordId: string;
  readonly recordType: string;
  readonly schemaVersion: string;
  readonly projectorVersion: string;
  readonly claimKind: CharacterWorkingMemoryClaimKindV1;
  readonly summary: string;
  readonly sourceRef: string;
  readonly grantId: string;
  readonly granteeCharacterId: string;
  readonly grantReason: 'user_choice' | 'merge_import';
  readonly grantedAt: string;
  readonly sourceKind: CharacterWorkingMemoryLifeFactSourceKindV1 |
    CharacterWorkingMemoryMemorySourceKindV1;
  readonly sourceTurnId?: string | null;
  readonly sourceMessageId: string | null;
  readonly sourceMergeActionId: string | null;
  readonly validFrom?: string | null;
  readonly validTo?: string | null;
  readonly confirmedAt?: string;
  readonly createdAt: string;
  readonly createdByCharacterId?: string | null;
  readonly relevance: number;
  readonly salience: number;
}

export interface CharacterWorkingMemoryAdmissionV1 {
  readonly recordKind: CharacterWorkingMemoryRecordKindV1;
  readonly recordId: string;
  readonly recordType: string;
  readonly schemaVersion: string;
  readonly outcome: 'PROJECTED' | 'UNSUPPORTED_SCHEMA';
  readonly projectorVersion?: string;
}

export interface CharacterWorkingMemoryRecentMessageV1 {
  readonly messageId: string;
  readonly sequenceNo: number;
  readonly role: 'user' | 'assistant';
  readonly speakerCharacterId: string | null;
  readonly text: string;
  readonly createdAt: string;
}

export type CharacterWorkingMemoryExcludedMessageReasonV1 =
  | 'CURRENT_USER_MESSAGE_SEPARATE_INPUT'
  | 'SYSTEM_MESSAGE_NOT_CHAT_CONTEXT'
  | 'OTHER_CHARACTER_MESSAGE_REQUIRES_SEPARATE_CONTEXT_AUTHORITY';

export interface CharacterWorkingMemoryProjectionV1 {
  readonly schemaVersion: typeof CHARACTER_WORKING_MEMORY_PROJECTION_SCHEMA_VERSION_V1;
  readonly authority: Readonly<{
    readonly readOnly: true;
    readonly mayCreateDurableRecord: false;
    readonly mayChangeAccessGrant: false;
    readonly mayMutateRelationship: false;
    readonly includesProtectedSaju: false;
  }>;
  readonly scope: Readonly<{
    readonly subjectId: string;
    readonly characterId: string;
    readonly threadId: string;
    readonly relationshipRevision: number | null;
  }>;
  readonly relationship: CharacterWorkingMemoryRelationshipSourceV1 | null;
  readonly currentUserMessage: CharacterWorkingMemoryRecentMessageV1;
  readonly relationshipEventIndex: Readonly<{
    readonly exposure: 'metadata_only';
    readonly events: readonly CharacterWorkingMemoryRelationshipEventSourceV1[];
  }>;
  readonly recentConversation: readonly CharacterWorkingMemoryRecentMessageV1[];
  readonly excludedMessages: readonly Readonly<{
    readonly messageId: string;
    readonly reason: CharacterWorkingMemoryExcludedMessageReasonV1;
  }>[];
  readonly projectedRecords: readonly CharacterWorkingMemoryProjectedRecordV1[];
  readonly admissions: readonly CharacterWorkingMemoryAdmissionV1[];
}

export class CharacterWorkingMemoryProjectionErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'CharacterWorkingMemoryProjectionErrorV1';
  }
}

function requireText(value: unknown, label: string, maxLength = 512): string {
  if (typeof value !== 'string') {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'INVALID_SOURCE',
      label + ' must be text.',
    );
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'INVALID_SOURCE',
      label + ' must be non-empty text within its allowed length.',
    );
  }
  return normalized;
}

function requireTimestamp(value: unknown, label: string): string {
  const timestamp = requireText(value, label, 128);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'INVALID_SOURCE',
      label + ' must be a valid timestamp.',
    );
  }
  return timestamp;
}

function requireRevision(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'INVALID_SCOPE',
      label + ' must be a non-negative integer or null.',
    );
  }
  return value;
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'DUPLICATE_SOURCE',
      label + ' contains duplicate identities.',
    );
  }
}

function projectorKey(
  recordKind: CharacterWorkingMemoryRecordKindV1,
  recordType: string,
  schemaVersion: string,
): string {
  return recordKind + ':' + recordType + ':' + schemaVersion;
}

function buildProjectorRegistry(
  projectors: readonly CharacterWorkingMemoryRecordProjectorV1[],
): ReadonlyMap<string, CharacterWorkingMemoryRecordProjectorV1> {
  const registry = new Map<string, CharacterWorkingMemoryRecordProjectorV1>();
  for (const projector of projectors) {
    const key = projectorKey(
      projector.recordKind,
      requireText(projector.recordType, 'projector.recordType', 128),
      requireText(projector.schemaVersion, 'projector.schemaVersion', 128),
    );
    requireText(projector.projectorVersion, 'projector.projectorVersion', 128);
    if (registry.has(key)) {
      throw new CharacterWorkingMemoryProjectionErrorV1(
        'DUPLICATE_PROJECTOR',
        'Only one projector may own an exact record type and schema version.',
      );
    }
    registry.set(key, projector);
  }
  return registry;
}

function projectRecord(input: Readonly<{
  recordKind: CharacterWorkingMemoryRecordKindV1;
  recordId: string;
  recordType: string;
  schemaVersion: string;
  payload: unknown;
  grantId: string;
  granteeCharacterId: string;
  grantReason: 'user_choice' | 'merge_import';
  grantedAt: string;
  sourceKind: CharacterWorkingMemoryLifeFactSourceKindV1 |
    CharacterWorkingMemoryMemorySourceKindV1;
  sourceTurnId?: string | null;
  sourceMessageId: string | null;
  sourceMergeActionId: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  confirmedAt?: string;
  createdAt: string;
  createdByCharacterId?: string | null;
  registry: ReadonlyMap<string, CharacterWorkingMemoryRecordProjectorV1>;
}>): Readonly<{
  record: CharacterWorkingMemoryProjectedRecordV1 | null;
  admission: CharacterWorkingMemoryAdmissionV1;
}> {
  const recordId = requireText(input.recordId, 'recordId', 256);
  const recordType = requireText(input.recordType, 'recordType', 128);
  const schemaVersion = requireText(input.schemaVersion, 'schemaVersion', 128);
  const grantId = requireText(input.grantId, 'grantId', 256);
  const granteeCharacterId = requireText(
    input.granteeCharacterId,
    'granteeCharacterId',
    128,
  );
  const sourceKind = requireText(input.sourceKind, 'sourceKind', 64);
  const allowedSourceKinds = input.recordKind === 'life_fact'
    ? ['user_explicit', 'profile_edit', 'merge_import']
    : ['user_approved', 'merge_import'];
  if (!allowedSourceKinds.includes(sourceKind)) {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'INVALID_SOURCE_KIND',
      'Record source kind is unsupported for this record type.',
    );
  }
  const sourceMessageId = input.sourceMessageId === null
    ? null
    : requireText(input.sourceMessageId, 'sourceMessageId', 256);
  const sourceMergeActionId = input.sourceMergeActionId === null
    ? null
    : requireText(input.sourceMergeActionId, 'sourceMergeActionId', 256);
  const sourceTurnId = input.sourceTurnId === undefined || input.sourceTurnId === null
    ? input.sourceTurnId ?? null
    : requireText(input.sourceTurnId, 'sourceTurnId', 256);
  const grantReason = input.grantReason;
  if (grantReason !== 'user_choice' && grantReason !== 'merge_import') {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'INVALID_GRANT_REASON',
      'Record grant reason is unsupported.',
    );
  }
  const grantedAt = requireTimestamp(input.grantedAt, 'grantedAt');
  const createdAt = requireTimestamp(input.createdAt, 'createdAt');
  const validFrom = input.validFrom === undefined
    ? undefined
    : input.validFrom === null ? null : requireTimestamp(input.validFrom, 'validFrom');
  const validTo = input.validTo === undefined
    ? undefined
    : input.validTo === null ? null : requireTimestamp(input.validTo, 'validTo');
  if (
    validFrom !== undefined && validFrom !== null &&
    validTo !== undefined && validTo !== null &&
    Date.parse(validTo) < Date.parse(validFrom)
  ) {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'INVALID_VALIDITY_RANGE',
      'Life Fact validity end cannot precede its start.',
    );
  }
  const confirmedAt = input.confirmedAt === undefined
    ? undefined
    : requireTimestamp(input.confirmedAt, 'confirmedAt');
  if (input.recordKind === 'life_fact' && confirmedAt === undefined) {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'MISSING_CONFIRMATION_TIME',
      'Life Fact projection requires its authoritative confirmation timestamp.',
    );
  }
  const sourceRef =
    input.recordKind + ':' + recordId + ':grant:' + grantId;
  const projector = input.registry.get(
    projectorKey(input.recordKind, recordType, schemaVersion),
  );

  if (projector === undefined) {
    return Object.freeze({
      record: null,
      admission: Object.freeze({
        recordKind: input.recordKind,
        recordId,
        recordType,
        schemaVersion,
        outcome: 'UNSUPPORTED_SCHEMA' as const,
      }),
    });
  }

  const projected = projector.project({
    recordId,
    payload: input.payload,
  });
  const summary = requireText(projected.summary, 'projected.summary', 4000);
  if (
    projected.claimKind !== 'fact' &&
    projected.claimKind !== 'character_interpretation'
  ) {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'INVALID_PROJECTOR_OUTPUT',
      'Projector returned an unsupported claim kind.',
    );
  }
  if (input.recordKind === 'life_fact' && projected.claimKind !== 'fact') {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'INVALID_PROJECTOR_OUTPUT',
      'A Life Fact projector must preserve factual claim authority.',
    );
  }
  for (const [label, score] of [
    ['relevance', projected.relevance],
    ['salience', projected.salience],
  ] as const) {
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      throw new CharacterWorkingMemoryProjectionErrorV1(
        'INVALID_PROJECTOR_OUTPUT',
        'Projector ' + label + ' must be between 0 and 1.',
      );
    }
  }

  const record: CharacterWorkingMemoryProjectedRecordV1 = Object.freeze({
    recordKind: input.recordKind,
    recordId,
    recordType,
    schemaVersion,
    projectorVersion: projector.projectorVersion,
    claimKind: projected.claimKind,
    summary,
    sourceRef,
    grantId,
    granteeCharacterId,
    grantReason,
    grantedAt,
    sourceKind: sourceKind as CharacterWorkingMemoryLifeFactSourceKindV1 |
      CharacterWorkingMemoryMemorySourceKindV1,
    sourceMessageId,
    sourceMergeActionId,
    ...(input.sourceTurnId === undefined ? {} : { sourceTurnId }),
    ...(validFrom === undefined ? {} : { validFrom }),
    ...(validTo === undefined ? {} : { validTo }),
    ...(confirmedAt === undefined ? {} : { confirmedAt }),
    createdAt,
    ...(input.createdByCharacterId === undefined ? {} : {
      createdByCharacterId: input.createdByCharacterId === null
        ? null
        : requireText(input.createdByCharacterId, 'createdByCharacterId', 128),
    }),
    relevance: projected.relevance,
    salience: projected.salience,
  });

  return Object.freeze({
    record,
    admission: Object.freeze({
      recordKind: input.recordKind,
      recordId,
      recordType,
      schemaVersion,
      outcome: 'PROJECTED' as const,
      projectorVersion: projector.projectorVersion,
    }),
  });
}

function validateRelationship(
  relationship: CharacterWorkingMemoryRelationshipSourceV1 | null,
  characterId: string,
  expectedRevision: number | null,
): CharacterWorkingMemoryRelationshipSourceV1 | null {
  if (relationship === null) {
    if (expectedRevision !== null) {
      throw new CharacterWorkingMemoryProjectionErrorV1(
        'RELATIONSHIP_REVISION_MISMATCH',
        'The pinned relationship revision has no current projection.',
      );
    }
    return null;
  }
  if (relationship.characterId !== characterId) {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'RELATIONSHIP_CHARACTER_MISMATCH',
      'Current relationship projection belongs to a different Character.',
    );
  }
  if (
    expectedRevision === null ||
    relationship.revision !== expectedRevision ||
    !Number.isSafeInteger(relationship.revision) ||
    relationship.revision < 0
  ) {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'RELATIONSHIP_REVISION_MISMATCH',
      'Current relationship projection does not match the turn-pinned revision.',
    );
  }
  for (const [label, score] of [
    ['closeness', relationship.closeness],
    ['trust', relationship.trust],
    ['friction', relationship.friction],
  ] as const) {
    if (!Number.isFinite(score)) {
      throw new CharacterWorkingMemoryProjectionErrorV1(
        'INVALID_RELATIONSHIP',
        'Relationship ' + label + ' must be finite.',
      );
    }
  }
  return Object.freeze({
    stateId: requireText(relationship.stateId, 'relationship.stateId', 256),
    characterId,
    closeness: relationship.closeness,
    trust: relationship.trust,
    friction: relationship.friction,
    relationshipStage: requireText(
      relationship.relationshipStage,
      'relationship.relationshipStage',
      128,
    ),
    policyVersion: requireText(
      relationship.policyVersion,
      'relationship.policyVersion',
      128,
    ),
    revision: relationship.revision,
    lastInteractionAt: relationship.lastInteractionAt === null
      ? null
      : requireTimestamp(relationship.lastInteractionAt, 'relationship.lastInteractionAt'),
    updatedAt: requireTimestamp(relationship.updatedAt, 'relationship.updatedAt'),
  });
}

function validateRelationshipEvents(
  events: readonly CharacterWorkingMemoryRelationshipEventSourceV1[],
  expectedRevision: number | null,
): readonly CharacterWorkingMemoryRelationshipEventSourceV1[] {
  if (expectedRevision === null && events.length > 0) {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'RELATIONSHIP_REVISION_MISMATCH',
      'Relationship events cannot exist without a pinned current relationship.',
    );
  }
  const normalized = events.map((event) => {
    if (
      !Number.isSafeInteger(event.stateRevisionAfter) ||
      event.stateRevisionAfter <= 0 ||
      expectedRevision === null ||
      event.stateRevisionAfter > expectedRevision
    ) {
      throw new CharacterWorkingMemoryProjectionErrorV1(
        'RELATIONSHIP_EVENT_REVISION_INVALID',
        'Relationship event exceeds the pinned relationship revision.',
      );
    }
    return Object.freeze({
      eventType: requireText(event.eventType, 'relationshipEvent.eventType', 128),
      eventSchemaVersion: requireText(
        event.eventSchemaVersion,
        'relationshipEvent.eventSchemaVersion',
        128,
      ),
      stateRevisionAfter: event.stateRevisionAfter,
      policyVersion: requireText(
        event.policyVersion,
        'relationshipEvent.policyVersion',
        128,
      ),
      appliedAt: requireTimestamp(event.appliedAt, 'relationshipEvent.appliedAt'),
    });
  }).sort((left, right) => left.stateRevisionAfter - right.stateRevisionAfter);
  assertUnique(
    normalized.map((event) => String(event.stateRevisionAfter)),
    'relationship event revisions',
  );
  return Object.freeze(normalized);
}

function buildRecentConversation(input: Readonly<{
  messages: readonly CharacterWorkingMemoryRecentMessageSourceV1[];
  characterId: string;
  authorizedThreadCharacterIds: readonly string[];
  currentUserMessageRef: string;
}>): Readonly<{
  currentUserMessage: CharacterWorkingMemoryRecentMessageV1;
  recentConversation: readonly CharacterWorkingMemoryRecentMessageV1[];
  excludedMessages: readonly Readonly<{
    messageId: string;
    reason: CharacterWorkingMemoryExcludedMessageReasonV1;
  }>[];
}> {
  const recentConversation: CharacterWorkingMemoryRecentMessageV1[] = [];
  const excludedMessages: Array<Readonly<{
    messageId: string;
    reason: CharacterWorkingMemoryExcludedMessageReasonV1;
  }>> = [];
  const messageIds: string[] = [];
  const sequenceNumbers: number[] = [];
  let currentMessageFound = false;
  let currentUserMessage: CharacterWorkingMemoryRecentMessageV1 | null = null;

  for (const message of input.messages) {
    const messageId = requireText(message.messageId, 'recentMessage.messageId', 256);
    if (!Number.isSafeInteger(message.sequenceNo) || message.sequenceNo < 1) {
      throw new CharacterWorkingMemoryProjectionErrorV1(
        'INVALID_MESSAGE_SEQUENCE',
        'Recent message sequence must be a positive integer.',
      );
    }
    messageIds.push(messageId);
    sequenceNumbers.push(message.sequenceNo);
    const text = requireText(message.text, 'recentMessage.text', 8000);
    const createdAt = requireTimestamp(message.createdAt, 'recentMessage.createdAt');

    if (message.senderType === 'user') {
      if (message.characterId !== null) {
        throw new CharacterWorkingMemoryProjectionErrorV1(
          'INVALID_MESSAGE_SPEAKER',
          'User messages cannot carry a Character identity.',
        );
      }
      if (messageId === input.currentUserMessageRef) {
        currentMessageFound = true;
        currentUserMessage = Object.freeze({
          messageId,
          sequenceNo: message.sequenceNo,
          role: 'user' as const,
          speakerCharacterId: null,
          text,
          createdAt,
        });
        excludedMessages.push(Object.freeze({
          messageId,
          reason: 'CURRENT_USER_MESSAGE_SEPARATE_INPUT' as const,
        }));
      } else {
        recentConversation.push(Object.freeze({
          messageId,
          sequenceNo: message.sequenceNo,
          role: 'user' as const,
          speakerCharacterId: null,
          text,
          createdAt,
        }));
      }
      continue;
    }

    if (message.senderType === 'system') {
      if (message.characterId !== null) {
        throw new CharacterWorkingMemoryProjectionErrorV1(
          'INVALID_MESSAGE_SPEAKER',
          'System messages cannot carry a Character identity.',
        );
      }
      excludedMessages.push(Object.freeze({
        messageId,
        reason: 'SYSTEM_MESSAGE_NOT_CHAT_CONTEXT' as const,
      }));
      continue;
    }

    if (message.senderType === 'character') {
      const speakerCharacterId = requireText(
        message.characterId,
        'recentMessage.characterId',
        128,
      );
      if (speakerCharacterId !== input.characterId) {
        excludedMessages.push(Object.freeze({
          messageId,
          reason: 'OTHER_CHARACTER_MESSAGE_REQUIRES_SEPARATE_CONTEXT_AUTHORITY' as const,
        }));
        continue;
      }
      recentConversation.push(Object.freeze({
        messageId,
        sequenceNo: message.sequenceNo,
        role: 'assistant' as const,
        speakerCharacterId,
        text,
        createdAt,
      }));
      continue;
    }

    throw new CharacterWorkingMemoryProjectionErrorV1(
      'INVALID_MESSAGE_SPEAKER',
      'Recent message sender type is unsupported.',
    );
  }

  assertUnique(messageIds, 'recent message ids');
  assertUnique(sequenceNumbers.map(String), 'recent message sequence numbers');
  for (let index = 1; index < sequenceNumbers.length; index += 1) {
    if (sequenceNumbers[index]! <= sequenceNumbers[index - 1]!) {
      throw new CharacterWorkingMemoryProjectionErrorV1(
        'MESSAGE_ORDER_INVALID',
        'Recent messages must be in strictly increasing sequence order.',
      );
    }
  }
  if (!currentMessageFound || currentUserMessage === null) {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'CURRENT_USER_MESSAGE_MISSING',
      'The exact current User message must be present in the authoritative recent-message read.',
    );
  }
  if (
    input.messages.length > 0 &&
    input.messages[input.messages.length - 1]?.messageId !== input.currentUserMessageRef
  ) {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'CURRENT_USER_MESSAGE_NOT_LATEST',
      'The current User message must be the latest message in the pinned thread snapshot.',
    );
  }

  return Object.freeze({
    currentUserMessage,
    recentConversation: Object.freeze(recentConversation),
    excludedMessages: Object.freeze(excludedMessages),
  });
}

export function buildCharacterWorkingMemoryProjectionV1(
  input: BuildCharacterWorkingMemoryProjectionInputV1,
): CharacterWorkingMemoryProjectionV1 {
  const rawInput = input as unknown as Record<string, unknown>;
  if (
    Object.hasOwn(rawInput, 'saju') ||
    Object.hasOwn(rawInput, 'protectedSaju') ||
    Object.hasOwn(rawInput, 'officialReading')
  ) {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'PROTECTED_READING_CONTEXT_SEPARATE',
      'Official Reading and protected Saju content must use their separate Reader Knowledge authority path.',
    );
  }

  const subjectId = requireText(input.scope.subjectId, 'scope.subjectId', 256);
  const characterId = requireText(input.scope.characterId, 'scope.characterId', 128);
  const threadId = requireText(input.scope.threadId, 'scope.threadId', 256);
  const relationshipRevision = requireRevision(
    input.scope.relationshipRevision,
    'scope.relationshipRevision',
  );
  const authorizedThreadCharacterIds = input.scope.authorizedThreadCharacterIds.map(
    (value) => requireText(value, 'scope.authorizedThreadCharacterId', 128),
  );
  assertUnique(authorizedThreadCharacterIds, 'authorized thread Character ids');
  if (!authorizedThreadCharacterIds.includes(characterId)) {
    throw new CharacterWorkingMemoryProjectionErrorV1(
      'THREAD_CHARACTER_NOT_AUTHORIZED',
      'The active Character is not an authorized participant in this thread.',
    );
  }

  const currentUserMessageRef = requireText(
    input.currentUserMessageRef,
    'currentUserMessageRef',
    256,
  );
  const registry = buildProjectorRegistry(input.projectors ?? []);

  const lifeFactIds = input.lifeFacts.map((fact) =>
    requireText(fact.factId, 'lifeFact.factId', 256),
  );
  const memoryIds = input.memories.map((memory) =>
    requireText(memory.memoryItemId, 'memory.memoryItemId', 256),
  );
  assertUnique(lifeFactIds, 'Life Fact ids');
  assertUnique(memoryIds, 'Memory Item ids');

  const projectedRecords: CharacterWorkingMemoryProjectedRecordV1[] = [];
  const admissions: CharacterWorkingMemoryAdmissionV1[] = [];

  for (const fact of input.lifeFacts) {
    if (fact.granteeCharacterId !== characterId) {
      throw new CharacterWorkingMemoryProjectionErrorV1(
        'LIFE_FACT_GRANT_SCOPE_MISMATCH',
        'Life Fact authority returned a grant for a different Character.',
      );
    }
    const result = projectRecord({
      recordKind: 'life_fact',
      recordId: fact.factId,
      recordType: fact.factType,
      schemaVersion: fact.schemaVersion,
      payload: fact.value,
      grantId: fact.grantId,
      granteeCharacterId: fact.granteeCharacterId,
      grantReason: fact.grantReason,
      grantedAt: fact.grantedAt,
      sourceKind: fact.sourceKind,
      sourceMessageId: fact.sourceMessageId,
      sourceMergeActionId: fact.sourceMergeActionId,
      validFrom: fact.validFrom,
      validTo: fact.validTo,
      confirmedAt: fact.confirmedAt,
      createdAt: fact.createdAt,
      registry,
    });
    admissions.push(result.admission);
    if (result.record !== null) projectedRecords.push(result.record);
  }

  for (const memory of input.memories) {
    if (memory.granteeCharacterId !== characterId) {
      throw new CharacterWorkingMemoryProjectionErrorV1(
        'MEMORY_GRANT_SCOPE_MISMATCH',
        'Memory authority returned a grant for a different Character.',
      );
    }
    const result = projectRecord({
      recordKind: 'memory',
      recordId: memory.memoryItemId,
      recordType: memory.memoryType,
      schemaVersion: memory.schemaVersion,
      payload: memory.content,
      grantId: memory.grantId,
      granteeCharacterId: memory.granteeCharacterId,
      grantReason: memory.grantReason,
      grantedAt: memory.grantedAt,
      sourceKind: memory.sourceKind,
      sourceTurnId: memory.sourceTurnId,
      sourceMessageId: memory.sourceMessageId,
      sourceMergeActionId: memory.sourceMergeActionId,
      createdAt: memory.createdAt,
      createdByCharacterId: memory.createdByCharacterId,
      registry,
    });
    admissions.push(result.admission);
    if (result.record !== null) projectedRecords.push(result.record);
  }

  const relationship = validateRelationship(
    input.relationship,
    characterId,
    relationshipRevision,
  );
  const relationshipEvents = validateRelationshipEvents(
    input.relationshipEvents,
    relationshipRevision,
  );
  const conversation = buildRecentConversation({
    messages: input.recentMessages,
    characterId,
    authorizedThreadCharacterIds,
    currentUserMessageRef,
  });

  projectedRecords.sort((left, right) =>
    left.recordKind.localeCompare(right.recordKind) ||
    left.recordId.localeCompare(right.recordId),
  );
  admissions.sort((left, right) =>
    left.recordKind.localeCompare(right.recordKind) ||
    left.recordId.localeCompare(right.recordId),
  );

  return Object.freeze({
    schemaVersion: CHARACTER_WORKING_MEMORY_PROJECTION_SCHEMA_VERSION_V1,
    authority: Object.freeze({
      readOnly: true as const,
      mayCreateDurableRecord: false as const,
      mayChangeAccessGrant: false as const,
      mayMutateRelationship: false as const,
      includesProtectedSaju: false as const,
    }),
    scope: Object.freeze({
      subjectId,
      characterId,
      threadId,
      relationshipRevision,
    }),
    relationship,
    relationshipEventIndex: Object.freeze({
      exposure: 'metadata_only' as const,
      events: relationshipEvents,
    }),
    currentUserMessage: conversation.currentUserMessage,
    recentConversation: conversation.recentConversation,
    excludedMessages: conversation.excludedMessages,
    projectedRecords: Object.freeze(projectedRecords),
    admissions: Object.freeze(admissions),
  });
}
