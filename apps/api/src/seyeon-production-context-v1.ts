import {
  replayProductionRelationshipHistoryV1,
  type ProductionRelationshipHistoryRecordV1,
} from '../../../packages/domain/src/relationship-policy-reference-replay-v1.js';
import type {
  ProductionRelationshipEventV1,
} from '../../../packages/domain/src/relationship-event-registry-v1.js';
import type {
  SeyeonContextFocusKeyV2,
  SeyeonRecentMessageV2,
  SeyeonRetrievedClaimKindV2,
  SeyeonRetrievedMemoryV2,
} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type {
  RunSeyeonCharacterTurnV2Input,
} from './seyeon-character-runtime-v2.js';
import type {
  SeyeonProductionRelationshipTurnBindingV1,
} from './seyeon-production-relationship-read-v1.js';
import type {
  SeyeonProductionContextReadAuthorityPortV1,
  SeyeonProductionPersonalRecordAuthorityRowV1,
  SeyeonProductionPersonalRecordKindV1,
  SeyeonProductionRecentMessageAuthorityRowV1,
} from './seyeon-production-context-read-v1.js';

export const SEYEON_PRODUCTION_CONTEXT_VERSION_V1 =
  'seyeon-production-context-v1' as const;

export interface SeyeonProductionPersonalRecordProjectionV1 {
  readonly summary: string;
  readonly claimKind: SeyeonRetrievedClaimKindV2;
  readonly relevance: number;
  readonly salience: number;
}

export interface SeyeonProductionPersonalRecordProjectorV1 {
  readonly recordKind: SeyeonProductionPersonalRecordKindV1;
  readonly recordType: string;
  readonly schemaVersion: string;
  project(input: Readonly<{
    recordId: string;
    payload: unknown;
  }>): SeyeonProductionPersonalRecordProjectionV1;
}

/**
 * SRC-25 remains OPEN. Production ships no positive personal-record schema
 * projector until source authority approves exact type/version contracts.
 */
export const SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1 =
  Object.freeze([] as readonly SeyeonProductionPersonalRecordProjectorV1[]);

export interface SeyeonProductionPersonalRecordAdmissionV1 {
  readonly recordId: string;
  readonly recordKind: SeyeonProductionPersonalRecordKindV1;
  readonly recordType: string;
  readonly schemaVersion: string;
  readonly reason: 'ADMITTED' | 'UNSUPPORTED_SCHEMA';
}

export interface SeyeonProductionContextSnapshotV1 {
  readonly version: typeof SEYEON_PRODUCTION_CONTEXT_VERSION_V1;
  readonly relationshipRevisionUsedForTurn: number | null;
  readonly historyThroughRevision: number;
  readonly recentMessages: readonly SeyeonRecentMessageV2[];
  readonly retrievedMemories: readonly SeyeonRetrievedMemoryV2[];
  readonly personalRecordAdmissions:
    readonly SeyeonProductionPersonalRecordAdmissionV1[];
  readonly activeRelationshipEventCount: number;
  readonly relationshipHistoryRecords:
    readonly ProductionRelationshipHistoryRecordV1[];
}

export class SeyeonProductionContextErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonProductionContextErrorV1';
  }
}

export interface ComposeSeyeonProductionContextInputV1 {
  readonly resolvedSubjectId: string;
  readonly threadId: string;
  readonly currentUserMessageRef: string;
  readonly relationshipRevisionUsedForTurn: number | null;
  readonly authorityPort: SeyeonProductionContextReadAuthorityPortV1;
  readonly serverOwnedPersonalRecordProjectors?:
    readonly SeyeonProductionPersonalRecordProjectorV1[];
  readonly maxRecentMessages?: number;
  readonly maxRelationshipEvents?: number;
  readonly maxPersonalRecords?: number;
}

function text(value: string, path: string, max = 256): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > max) {
    throw new SeyeonProductionContextErrorV1(
      path + ' must be non-empty text within ' + max + ' characters.',
    );
  }
  return normalized;
}

function limit(
  value: number | undefined,
  fallback: number,
  max: number,
  path: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > max) {
    throw new SeyeonProductionContextErrorV1(
      path + ' must be an integer between 1 and ' + max + '.',
    );
  }
  return resolved;
}

function score(value: number, path: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new SeyeonProductionContextErrorV1(path + ' must be between 0 and 1.');
  }
  return value;
}

function projectorKey(input: {
  readonly recordKind: SeyeonProductionPersonalRecordKindV1;
  readonly recordType: string;
  readonly schemaVersion: string;
}): string {
  return [input.recordKind, input.recordType.trim(), input.schemaVersion.trim()]
    .join('\u0000');
}

function personalMemories(input: {
  readonly rows: readonly SeyeonProductionPersonalRecordAuthorityRowV1[];
  readonly projectors: readonly SeyeonProductionPersonalRecordProjectorV1[];
  readonly max: number;
}): Readonly<{
  memories: readonly SeyeonRetrievedMemoryV2[];
  admissions: readonly SeyeonProductionPersonalRecordAdmissionV1[];
}> {
  const registry = new Map<string, SeyeonProductionPersonalRecordProjectorV1>();
  for (const projector of input.projectors) {
    const key = projectorKey(projector);
    if (registry.has(key)) {
      throw new SeyeonProductionContextErrorV1(
        'Personal record projector registry contains a duplicate type/version.',
      );
    }
    registry.set(key, projector);
  }

  const memories: SeyeonRetrievedMemoryV2[] = [];
  const admissions: SeyeonProductionPersonalRecordAdmissionV1[] = [];
  const seen = new Set<string>();

  for (const row of input.rows) {
    if (seen.has(row.recordId)) {
      throw new SeyeonProductionContextErrorV1(
        'Production personal record authority returned a duplicate record.',
      );
    }
    seen.add(row.recordId);

    const projector = registry.get(projectorKey(row));
    if (projector === undefined) {
      admissions.push(Object.freeze({
        recordId: row.recordId,
        recordKind: row.recordKind,
        recordType: row.recordType,
        schemaVersion: row.schemaVersion,
        reason: 'UNSUPPORTED_SCHEMA' as const,
      }));
      continue;
    }

    const projected = projector.project({
      recordId: row.recordId,
      payload: row.payload,
    });
    const summary = text(projected.summary, 'personalRecord.summary', 4000);
    admissions.push(Object.freeze({
      recordId: row.recordId,
      recordKind: row.recordKind,
      recordType: row.recordType,
      schemaVersion: row.schemaVersion,
      reason: 'ADMITTED' as const,
    }));

    if (memories.length < input.max) {
      memories.push(Object.freeze({
        memoryId: row.recordKind + ':' + row.recordId,
        kind: row.recordKind,
        claimKind: projected.claimKind,
        summary,
        sourceRef:
          row.recordKind + ':' + row.recordId + ':grant:' + row.grantId,
        relevance: score(projected.relevance, 'personalRecord.relevance'),
        salience: score(projected.salience, 'personalRecord.salience'),
      }));
    }
  }

  return Object.freeze({
    memories: Object.freeze(memories),
    admissions: Object.freeze(admissions),
  });
}

function relationshipSummary(event: ProductionRelationshipEventV1): string {
  return text(
    event.facts.map((fact) => fact.statement.trim()).filter(Boolean).join(' | '),
    'relationshipEvent.summary',
    4000,
  );
}

function relationshipMemories(input: {
  readonly subjectId: string;
  readonly events: readonly ProductionRelationshipEventV1[];
  readonly max: number;
}): readonly SeyeonRetrievedMemoryV2[] {
  return Object.freeze(input.events.slice(-input.max).map((event) => {
    if (event.subjectId !== input.subjectId || event.characterId !== 'seyeon') {
      throw new SeyeonProductionContextErrorV1(
        'Production relationship replay returned a different Subject or Character.',
      );
    }
    return Object.freeze({
      memoryId: 'relationship-event:' + event.eventId,
      kind: 'relationship_event' as const,
      claimKind: 'fact' as const,
      summary: relationshipSummary(event),
      sourceRef: 'relationship-event:' + event.eventId,
      causalAuthority: 'authorized_shared_history' as const,
      relevance: 1,
      salience: 1,
    });
  }));
}

function recentMessages(input: {
  readonly rows: readonly SeyeonProductionRecentMessageAuthorityRowV1[];
  readonly currentUserMessageRef: string;
  readonly max: number;
}): readonly SeyeonRecentMessageV2[] {
  const seen = new Set<string>();
  const result: SeyeonRecentMessageV2[] = [];
  for (const row of [...input.rows].sort(
    (left, right) => left.sequenceNo - right.sequenceNo,
  )) {
    if (seen.has(row.messageId)) {
      throw new SeyeonProductionContextErrorV1(
        'Production recent-message authority returned a duplicate message.',
      );
    }
    seen.add(row.messageId);
    if (row.messageId === input.currentUserMessageRef) continue;
    if (row.senderType === 'user') {
      result.push(Object.freeze({
        messageId: row.messageId,
        role: 'user' as const,
        text: row.text,
      }));
      continue;
    }
    if (row.senderType === 'character') {
      if (row.characterId !== 'seyeon') {
        throw new SeyeonProductionContextErrorV1(
          'Production recent-message context contains another Character.',
        );
      }
      result.push(Object.freeze({
        messageId: row.messageId,
        role: 'assistant' as const,
        text: row.text,
      }));
    }
  }
  return Object.freeze(result.slice(-input.max));
}

export async function composeSeyeonProductionContextV1(
  input: ComposeSeyeonProductionContextInputV1,
): Promise<SeyeonProductionContextSnapshotV1> {
  const subjectId = text(input.resolvedSubjectId, 'resolvedSubjectId');
  const threadId = text(input.threadId, 'threadId');
  const currentUserMessageRef = text(
    input.currentUserMessageRef,
    'currentUserMessageRef',
  );
  const throughRevision = input.relationshipRevisionUsedForTurn ?? 0;
  if (!Number.isSafeInteger(throughRevision) || throughRevision < 0) {
    throw new SeyeonProductionContextErrorV1(
      'relationshipRevisionUsedForTurn is invalid.',
    );
  }

  const recentLimit = limit(input.maxRecentMessages, 12, 24, 'maxRecentMessages');
  const relationshipLimit = limit(
    input.maxRelationshipEvents,
    8,
    16,
    'maxRelationshipEvents',
  );
  const personalLimit = limit(
    input.maxPersonalRecords,
    8,
    16,
    'maxPersonalRecords',
  );

  const [records, history, messages] = await Promise.all([
    input.authorityPort.readPersonalRecords({
      subjectId,
      characterId: 'seyeon',
    }),
    input.authorityPort.readRelationshipHistory({
      subjectId,
      characterId: 'seyeon',
      throughRevision,
    }),
    input.authorityPort.readRecentMessages({
      subjectId,
      threadId,
      limit: recentLimit + 1,
    }),
  ]);

  const replay = replayProductionRelationshipHistoryV1(history);
  if (replay.physicalRevision !== throughRevision) {
    throw new SeyeonProductionContextErrorV1(
      'Production relationship history does not match the revision pinned for this turn.',
    );
  }

  const personal = personalMemories({
    rows: records,
    projectors:
      input.serverOwnedPersonalRecordProjectors ??
      SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1,
    max: personalLimit,
  });
  const relationship = relationshipMemories({
    subjectId,
    events: replay.activeEvents,
    max: relationshipLimit,
  });

  return Object.freeze({
    version: SEYEON_PRODUCTION_CONTEXT_VERSION_V1,
    relationshipRevisionUsedForTurn: input.relationshipRevisionUsedForTurn,
    historyThroughRevision: throughRevision,
    recentMessages: recentMessages({
      rows: messages,
      currentUserMessageRef,
      max: recentLimit,
    }),
    retrievedMemories: Object.freeze([
      ...relationship,
      ...personal.memories,
    ]),
    personalRecordAdmissions: personal.admissions,
    activeRelationshipEventCount: replay.activeEvents.length,
    relationshipHistoryRecords: Object.freeze([...history]),
  });
}

export type SeyeonProductionBoundCharacterContextInputV1 = Omit<
  RunSeyeonCharacterTurnV2Input['contextInput'],
  'relationship' | 'recentMessages' | 'retrievedMemories'
>;

export function bindSeyeonProductionCharacterContextInputV1(input: {
  readonly base: SeyeonProductionBoundCharacterContextInputV1;
  readonly turnBinding: SeyeonProductionRelationshipTurnBindingV1;
  readonly productionContext: SeyeonProductionContextSnapshotV1;
}): RunSeyeonCharacterTurnV2Input['contextInput'] {
  if (
    input.productionContext.relationshipRevisionUsedForTurn !==
    input.turnBinding.relationshipRevisionUsedForTurn
  ) {
    throw new SeyeonProductionContextErrorV1(
      'Production context and relationship binding use different revisions.',
    );
  }

  const base = input.base as Readonly<{
    focuses?: readonly SeyeonContextFocusKeyV2[];
    additionalBibleSliceIds?:
      RunSeyeonCharacterTurnV2Input['contextInput']['additionalBibleSliceIds'];
    maxRecentMessages?: number;
    maxRetrievedMemories?: number;
  }>;

  return Object.freeze({
    relationship: input.turnBinding.relationship,
    recentMessages: input.productionContext.recentMessages,
    retrievedMemories: input.productionContext.retrievedMemories,
    ...(base.focuses === undefined ? {} : { focuses: base.focuses }),
    ...(base.additionalBibleSliceIds === undefined
      ? {}
      : { additionalBibleSliceIds: base.additionalBibleSliceIds }),
    ...(base.maxRecentMessages === undefined
      ? {}
      : { maxRecentMessages: base.maxRecentMessages }),
    ...(base.maxRetrievedMemories === undefined
      ? {}
      : { maxRetrievedMemories: base.maxRetrievedMemories }),
  });
}
