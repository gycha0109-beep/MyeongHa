import { createHash } from 'node:crypto';

import {
  canonicalJson,
  admitSeyeonProductionRelationshipEventV1,
  validateProductionRelationshipEventV1,
  materializeSeyeonAuthorizedExperimentalEventV1,
  validateSeyeonEventAuthorityV1,
  type ProductionRelationshipEventV1,
  type ProductionRelationshipHistoryRecordV1,
  type SeyeonDialogueEnvelopeV2,
  type SeyeonEventAuthorityEvidenceV1,
  type SeyeonProductionRelationshipCausalBindingV1,
  type SeyeonRelationshipEventV2,
  type SeyeonRelationshipProjectionV2,
  type SeyeonTurnInterpretationV2,
} from '../../../packages/domain/src/index.js';
import {
  extractSeyeonEventCandidateV2,
} from './seyeon-event-extractor-v2.js';
import type {
  RunSeyeonCharacterTurnV2Result,
  SeyeonStructuredProviderPortV2,
} from './seyeon-character-runtime-v2.js';
import {
  prepareSeyeonPostTurnRelationshipContextV2,
  type SeyeonEventLedgerPortV2,
} from './seyeon-post-turn-relationship-v2.js';
import type {
  SeyeonProductionRelationshipSyncOutboxPortV1,
} from './seyeon-production-relationship-outbox-v1.js';
import {
  SEYEON_PRODUCTION_RELATIONSHIP_MODES_V1,
  snapshotSeyeonProductionCausalBindingsV1,
  type SeyeonProductionRelationshipModeV1,
} from './seyeon-production-relationship-sync-v1.js';

export const SEYEON_POST_TURN_ANALYSIS_SNAPSHOT_VERSION_V1 =
  'seyeon-post-turn-analysis-snapshot-v1' as const;
export const SEYEON_POST_TURN_ANALYSIS_WORKER_VERSION_V1 =
  'seyeon-post-turn-analysis-worker-v1' as const;

export const SEYEON_POST_TURN_ANALYSIS_CHECKPOINT_VERSION_V1 =
  'seyeon-post-turn-analysis-checkpoint-v1' as const;

export type SeyeonPostTurnAnalysisCheckpointV1 =
  | Readonly<{
      readonly schemaVersion:
        typeof SEYEON_POST_TURN_ANALYSIS_CHECKPOINT_VERSION_V1;
      readonly decision: 'none' | 'rejected';
    }>
  | Readonly<{
      readonly schemaVersion:
        typeof SEYEON_POST_TURN_ANALYSIS_CHECKPOINT_VERSION_V1;
      readonly decision: 'shadow' | 'relationship_event';
      readonly productionEvent: ProductionRelationshipEventV1;
    }>;

type Awaitable<T> = T | Promise<T>;

export interface SeyeonPostTurnAnalysisStableIdentityV1 {
  readonly experimentalEventId: string;
  readonly experimentalEventDedupeKey: string;
  readonly productionEventId: string;
  readonly relationshipSyncOutboxEventId: string;
}

export interface SeyeonPostTurnAnalysisSnapshotV1 {
  readonly schemaVersion:
    typeof SEYEON_POST_TURN_ANALYSIS_SNAPSHOT_VERSION_V1;
  readonly mode: SeyeonProductionRelationshipModeV1;
  readonly turnId: string;
  readonly userMessageId: string;
  readonly assistantMessageId: string;
  readonly preparedAt: string;
  readonly productionAuthorityRef: string;
  readonly interpretation: SeyeonTurnInterpretationV2;
  readonly envelope: SeyeonDialogueEnvelopeV2;
  readonly eventAuthorityEvidence: SeyeonEventAuthorityEvidenceV1;
  readonly priorEvents: readonly SeyeonRelationshipEventV2[];
  readonly relationshipBefore: SeyeonRelationshipProjectionV2;
  readonly productionCausalBindings:
    readonly SeyeonProductionRelationshipCausalBindingV1[];
  readonly identity: SeyeonPostTurnAnalysisStableIdentityV1;
}

export interface PreparedSeyeonPostTurnAnalysisSnapshotV1 {
  readonly snapshot: SeyeonPostTurnAnalysisSnapshotV1;
  readonly snapshotHash: string;
}

export interface SeyeonPostTurnAnalysisClaimV1 {
  readonly outboxEventId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly userMessageId: string;
  readonly userText: string;
  readonly assistantMessageId: string;
  readonly assistantText: string;
  readonly committedAt: string;
  readonly snapshotJsonb: unknown;
  readonly snapshotHash: string;
  readonly checkpointJsonb: unknown | null;
  readonly status: string;
  readonly lockOwner: string;
  readonly leaseExpiresAt: string;
  readonly reclaimed: boolean;
}

export interface SeyeonPostTurnAnalysisOutboxPortV1 {
  findByTurn(input: Readonly<{
    subjectId: string;
    turnId: string;
  }>): Awaitable<readonly Readonly<{
    outboxEventId: string;
    status: string;
    leaseExpiresAt: string | null;
  }>[]>;
  
  claim(input: Readonly<{
    subjectId: string;
    outboxEventId: string;
    lockOwner: string;
    leaseExpiresAt: string;
  }>): Awaitable<readonly SeyeonPostTurnAnalysisClaimV1[]>;

  checkpoint(input: Readonly<{
    subjectId: string;
    outboxEventId: string;
    lockOwner: string;
    checkpoint: SeyeonPostTurnAnalysisCheckpointV1;
  }>): Awaitable<readonly Readonly<{
    outboxEventId: string;
    status: string;
    replayed: boolean;
  }>[]>;
  
  complete(input: Readonly<{
    subjectId: string;
    outboxEventId: string;
    lockOwner: string;
  }>): Awaitable<readonly Readonly<{
    outboxEventId: string;
    status: string;
    processedAt: string;
    replayed: boolean;
  }>[]>;
}

export interface PrepareSeyeonPostTurnAnalysisSnapshotInputV1 {
  readonly subjectId: string;
  readonly mode: SeyeonProductionRelationshipModeV1;
  readonly turnId: string;
  readonly userMessageId: string;
  readonly assistantMessageId: string;
  readonly preparedAt: string;
  readonly productionAuthorityRef: string;
  readonly runtimeResult: RunSeyeonCharacterTurnV2Result;
  readonly ledger: SeyeonEventLedgerPortV2;
  readonly semanticRelevanceByEventId: Readonly<Record<string, number>>;
  readonly recentlyMentionedEventIds?: readonly string[];
  readonly serverObservationRefs?: readonly string[];
  readonly productionHistoryRecords:
    readonly ProductionRelationshipHistoryRecordV1[];
  readonly identity: SeyeonPostTurnAnalysisStableIdentityV1;
}

export interface ProcessSeyeonPostTurnAnalysisInputV1 {
  readonly subjectId: string;
  readonly outboxEventId: string;
  readonly lockOwner: string;
  readonly leaseExpiresAt: string;
  readonly outboxPort: SeyeonPostTurnAnalysisOutboxPortV1;
  readonly extractorProvider: SeyeonStructuredProviderPortV2;
  readonly relationshipSyncOutboxPort?:
    SeyeonProductionRelationshipSyncOutboxPortV1;
}

export type ProcessSeyeonPostTurnAnalysisResultV1 =
  | Readonly<{
      readonly version: typeof SEYEON_POST_TURN_ANALYSIS_WORKER_VERSION_V1;
      readonly decision: 'disabled' | 'none' | 'rejected';
      readonly outboxEventId: string;
      readonly reclaimed: boolean;
      readonly processedAt: string;
    }>
  | Readonly<{
      readonly version: typeof SEYEON_POST_TURN_ANALYSIS_WORKER_VERSION_V1;
      readonly decision: 'shadow';
      readonly outboxEventId: string;
      readonly reclaimed: boolean;
      readonly productionEventId: string;
      readonly processedAt: string;
    }>
  | Readonly<{
      readonly version: typeof SEYEON_POST_TURN_ANALYSIS_WORKER_VERSION_V1;
      readonly decision: 'enqueued';
      readonly outboxEventId: string;
      readonly reclaimed: boolean;
      readonly productionEventId: string;
      readonly relationshipSyncOutboxEventId: string;
      readonly relationshipSyncReplayed: boolean;
      readonly processedAt: string;
    }>;

export class SeyeonPostTurnAnalysisErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonPostTurnAnalysisErrorV1';
  }
}

function boundedText(value: unknown, path: string, max: number): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > max
  ) {
    throw new SeyeonPostTurnAnalysisErrorV1(
      path + ' must be bounded non-empty text.',
    );
  }
  return value.trim();
}

function instant(value: unknown, path: string): string {
  const raw = boundedText(value, path, 64);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw new SeyeonPostTurnAnalysisErrorV1(
      path + ' must be an ISO-compatible instant.',
    );
  }
  return new Date(parsed).toISOString();
}

function hashSnapshot(snapshot: SeyeonPostTurnAnalysisSnapshotV1): string {
  return (
    'sha256:v1:' +
    createHash('sha256').update(canonicalJson(snapshot)).digest('hex')
  );
}

function one<T>(rows: readonly T[], label: string): T {
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new SeyeonPostTurnAnalysisErrorV1(
      label + ' must return exactly one row.',
    );
  }
  return rows[0];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateSeyeonPostTurnAnalysisCheckpointV1(
  raw: unknown,
): SeyeonPostTurnAnalysisCheckpointV1 {
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== SEYEON_POST_TURN_ANALYSIS_CHECKPOINT_VERSION_V1 ||
    typeof raw.decision !== 'string'
  ) {
    throw new SeyeonPostTurnAnalysisErrorV1(
      'Post-turn analysis checkpoint shape is invalid.',
    );
  }

  if (raw.decision === 'none' || raw.decision === 'rejected') {
    return Object.freeze({
      schemaVersion: SEYEON_POST_TURN_ANALYSIS_CHECKPOINT_VERSION_V1,
      decision: raw.decision,
    });
  }

  if (
    raw.decision === 'shadow' ||
    raw.decision === 'relationship_event'
  ) {
    if (!isRecord(raw.productionEvent)) {
      throw new SeyeonPostTurnAnalysisErrorV1(
        'Post-turn analysis checkpoint Production Event is missing.',
      );
    }
    return Object.freeze({
      schemaVersion: SEYEON_POST_TURN_ANALYSIS_CHECKPOINT_VERSION_V1,
      decision: raw.decision,
      productionEvent: validateProductionRelationshipEventV1(
        raw.productionEvent as unknown as ProductionRelationshipEventV1,
      ),
    });
  }

  throw new SeyeonPostTurnAnalysisErrorV1(
    'Post-turn analysis checkpoint decision is unsupported.',
  );
}

async function checkpoint(input: {
  subjectId: string;
  outboxEventId: string;
  lockOwner: string;
  checkpoint: SeyeonPostTurnAnalysisCheckpointV1;
  outboxPort: SeyeonPostTurnAnalysisOutboxPortV1;
}): Promise<SeyeonPostTurnAnalysisCheckpointV1> {
  const row = one(
    await input.outboxPort.checkpoint({
      subjectId: input.subjectId,
      outboxEventId: input.outboxEventId,
      lockOwner: input.lockOwner,
      checkpoint: input.checkpoint,
    }),
    'Se-yeon post-turn analysis checkpoint',
  );
  if (
    row.outboxEventId !== input.outboxEventId ||
    row.status !== 'processing'
  ) {
    throw new SeyeonPostTurnAnalysisErrorV1(
      'Post-turn analysis checkpoint did not remain in processing state.',
    );
  }
  return input.checkpoint;
}

export function validateSeyeonPostTurnAnalysisSnapshotV1(
  raw: unknown,
  expectedHash?: string,
): SeyeonPostTurnAnalysisSnapshotV1 {
  if (!isRecord(raw)) {
    throw new SeyeonPostTurnAnalysisErrorV1(
      'Post-turn analysis snapshot must be an object.',
    );
  }
  if (
    raw.schemaVersion !== SEYEON_POST_TURN_ANALYSIS_SNAPSHOT_VERSION_V1 ||
    typeof raw.mode !== 'string' ||
    !SEYEON_PRODUCTION_RELATIONSHIP_MODES_V1.includes(
      raw.mode as SeyeonProductionRelationshipModeV1,
    ) ||
    !Array.isArray(raw.priorEvents) ||
    raw.priorEvents.length > 8 ||
    !Array.isArray(raw.productionCausalBindings) ||
    raw.productionCausalBindings.length > 8 ||
    !isRecord(raw.interpretation) ||
    !isRecord(raw.envelope) ||
    !isRecord(raw.eventAuthorityEvidence) ||
    !isRecord(raw.relationshipBefore) ||
    !isRecord(raw.identity)
  ) {
    throw new SeyeonPostTurnAnalysisErrorV1(
      'Post-turn analysis snapshot shape is invalid.',
    );
  }

  const snapshot = Object.freeze({
    schemaVersion: SEYEON_POST_TURN_ANALYSIS_SNAPSHOT_VERSION_V1,
    mode: raw.mode as SeyeonProductionRelationshipModeV1,
    turnId: boundedText(raw.turnId, 'snapshot.turnId', 256),
    userMessageId: boundedText(
      raw.userMessageId,
      'snapshot.userMessageId',
      256,
    ),
    assistantMessageId: boundedText(
      raw.assistantMessageId,
      'snapshot.assistantMessageId',
      256,
    ),
    preparedAt: instant(raw.preparedAt, 'snapshot.preparedAt'),
    productionAuthorityRef: boundedText(
      raw.productionAuthorityRef,
      'snapshot.productionAuthorityRef',
      512,
    ),
    interpretation: raw.interpretation as unknown as SeyeonTurnInterpretationV2,
    envelope: raw.envelope as unknown as SeyeonDialogueEnvelopeV2,
    eventAuthorityEvidence:
      raw.eventAuthorityEvidence as unknown as SeyeonEventAuthorityEvidenceV1,
    priorEvents:
      raw.priorEvents as unknown as readonly SeyeonRelationshipEventV2[],
    relationshipBefore:
      raw.relationshipBefore as unknown as SeyeonRelationshipProjectionV2,
    productionCausalBindings:
      raw.productionCausalBindings as unknown as
        readonly SeyeonProductionRelationshipCausalBindingV1[],
    identity: Object.freeze({
      experimentalEventId: boundedText(
        raw.identity.experimentalEventId,
        'snapshot.identity.experimentalEventId',
        256,
      ),
      experimentalEventDedupeKey: boundedText(
        raw.identity.experimentalEventDedupeKey,
        'snapshot.identity.experimentalEventDedupeKey',
        256,
      ),
      productionEventId: boundedText(
        raw.identity.productionEventId,
        'snapshot.identity.productionEventId',
        256,
      ),
      relationshipSyncOutboxEventId: boundedText(
        raw.identity.relationshipSyncOutboxEventId,
        'snapshot.identity.relationshipSyncOutboxEventId',
        256,
      ),
    }),
  });

  if (expectedHash !== undefined && hashSnapshot(snapshot) !== expectedHash) {
    throw new SeyeonPostTurnAnalysisErrorV1(
      'Post-turn analysis snapshot hash does not match committed outbox provenance.',
    );
  }
  return snapshot;
}

export function prepareSeyeonPostTurnAnalysisSnapshotV1(
  input: PrepareSeyeonPostTurnAnalysisSnapshotInputV1,
): PreparedSeyeonPostTurnAnalysisSnapshotV1 {
  const prepared = prepareSeyeonPostTurnRelationshipContextV2({
    ledger: input.ledger,
    semanticRelevanceByEventId: input.semanticRelevanceByEventId,
    ...(input.recentlyMentionedEventIds === undefined
      ? {}
      : { recentlyMentionedEventIds: input.recentlyMentionedEventIds }),
    now: instant(input.preparedAt, 'preparedAt'),
  });

  const productionCausalBindings =
    snapshotSeyeonProductionCausalBindingsV1({
      subjectId: input.subjectId,
      experimentalEvents: prepared.priorEvents,
      productionHistoryRecords: input.productionHistoryRecords,
    });

  const snapshot: SeyeonPostTurnAnalysisSnapshotV1 = Object.freeze({
    schemaVersion: SEYEON_POST_TURN_ANALYSIS_SNAPSHOT_VERSION_V1,
    mode: input.mode,
    turnId: boundedText(input.turnId, 'turnId', 256),
    userMessageId: boundedText(input.userMessageId, 'userMessageId', 256),
    assistantMessageId: boundedText(
      input.assistantMessageId,
      'assistantMessageId',
      256,
    ),
    preparedAt: instant(input.preparedAt, 'preparedAt'),
    productionAuthorityRef: boundedText(
      input.productionAuthorityRef,
      'productionAuthorityRef',
      512,
    ),
    interpretation: input.runtimeResult.interpretation,
    envelope: input.runtimeResult.envelope,
    eventAuthorityEvidence: Object.freeze({
      integrityDecisions:
        input.runtimeResult.governedPreflight.integrity.decisions,
      riskCausality: input.runtimeResult.riskCausality,
      ...(input.serverObservationRefs === undefined
        ? {}
        : { serverObservationRefs: input.serverObservationRefs }),
    }),
    priorEvents: prepared.priorEvents,
    relationshipBefore: prepared.relationshipBefore,
    productionCausalBindings,
    identity: Object.freeze({
      experimentalEventId: boundedText(
        input.identity.experimentalEventId,
        'identity.experimentalEventId',
        256,
      ),
      experimentalEventDedupeKey: boundedText(
        input.identity.experimentalEventDedupeKey,
        'identity.experimentalEventDedupeKey',
        256,
      ),
      productionEventId: boundedText(
        input.identity.productionEventId,
        'identity.productionEventId',
        256,
      ),
      relationshipSyncOutboxEventId: boundedText(
        input.identity.relationshipSyncOutboxEventId,
        'identity.relationshipSyncOutboxEventId',
        256,
      ),
    }),
  });

  return Object.freeze({
    snapshot,
    snapshotHash: hashSnapshot(snapshot),
  });
}

async function complete(input: {
  subjectId: string;
  outboxEventId: string;
  lockOwner: string;
  outboxPort: SeyeonPostTurnAnalysisOutboxPortV1;
}) {
  const row = one(
    await input.outboxPort.complete({
      subjectId: input.subjectId,
      outboxEventId: input.outboxEventId,
      lockOwner: input.lockOwner,
    }),
    'Se-yeon post-turn analysis completion',
  );
  if (
    row.outboxEventId !== input.outboxEventId ||
    row.status !== 'processed'
  ) {
    throw new SeyeonPostTurnAnalysisErrorV1(
      'Post-turn analysis outbox did not reach processed state.',
    );
  }
  return row;
}

async function finishFromCheckpoint(input: {
  subjectId: string;
  claimed: SeyeonPostTurnAnalysisClaimV1;
  lockOwner: string;
  outboxPort: SeyeonPostTurnAnalysisOutboxPortV1;
  relationshipSyncOutboxPort?:
    SeyeonProductionRelationshipSyncOutboxPortV1;
  checkpoint: SeyeonPostTurnAnalysisCheckpointV1;
}): Promise<ProcessSeyeonPostTurnAnalysisResultV1> {
  const checkpointValue = input.checkpoint;

  if (
    checkpointValue.decision === 'none' ||
    checkpointValue.decision === 'rejected'
  ) {
    const done = await complete({
      subjectId: input.subjectId,
      outboxEventId: input.claimed.outboxEventId,
      lockOwner: input.lockOwner,
      outboxPort: input.outboxPort,
    });
    return Object.freeze({
      version: SEYEON_POST_TURN_ANALYSIS_WORKER_VERSION_V1,
      decision: checkpointValue.decision,
      outboxEventId: input.claimed.outboxEventId,
      reclaimed: input.claimed.reclaimed,
      processedAt: done.processedAt,
    });
  }

  if (checkpointValue.decision === 'shadow') {
    const done = await complete({
      subjectId: input.subjectId,
      outboxEventId: input.claimed.outboxEventId,
      lockOwner: input.lockOwner,
      outboxPort: input.outboxPort,
    });
    return Object.freeze({
      version: SEYEON_POST_TURN_ANALYSIS_WORKER_VERSION_V1,
      decision: 'shadow' as const,
      outboxEventId: input.claimed.outboxEventId,
      reclaimed: input.claimed.reclaimed,
      productionEventId: productionEvent.eventId,
      processedAt: done.processedAt,
    });
  }

  if (checkpointValue.decision !== 'relationship_event') {
    throw new SeyeonPostTurnAnalysisErrorV1(
      'Post-turn analysis checkpoint decision is inconsistent with write recovery.',
    );
  }
  const productionEvent = checkpointValue.productionEvent;

  if (input.relationshipSyncOutboxPort === undefined) {
    throw new SeyeonPostTurnAnalysisErrorV1(
      'Write-capable post-turn analysis requires relationship sync outbox authority.',
    );
  }

  const syncRow = one(
    await input.relationshipSyncOutboxPort.enqueue({
      subjectId: input.subjectId,
      outboxEventId:
        validateSeyeonPostTurnAnalysisSnapshotV1(
          input.claimed.snapshotJsonb,
          input.claimed.snapshotHash,
        ).identity.relationshipSyncOutboxEventId,
      turnId: input.claimed.turnId,
      productionEvent,
    }),
    'Se-yeon relationship sync enqueue',
  );

  const done = await complete({
    subjectId: input.subjectId,
    outboxEventId: input.claimed.outboxEventId,
    lockOwner: input.lockOwner,
    outboxPort: input.outboxPort,
  });

  return Object.freeze({
    version: SEYEON_POST_TURN_ANALYSIS_WORKER_VERSION_V1,
    decision: 'enqueued' as const,
    outboxEventId: input.claimed.outboxEventId,
    reclaimed: input.claimed.reclaimed,
    productionEventId: checkpointValue.productionEvent.eventId,
    relationshipSyncOutboxEventId: syncRow.outboxEventId,
    relationshipSyncReplayed: syncRow.replayed,
    processedAt: done.processedAt,
  });
}

export async function processSeyeonPostTurnAnalysisV1(
  input: ProcessSeyeonPostTurnAnalysisInputV1,
): Promise<ProcessSeyeonPostTurnAnalysisResultV1> {
  const claimed = one(
    await input.outboxPort.claim({
      subjectId: input.subjectId,
      outboxEventId: input.outboxEventId,
      lockOwner: input.lockOwner,
      leaseExpiresAt: input.leaseExpiresAt,
    }),
    'Se-yeon post-turn analysis claim',
  );

  const snapshot = validateSeyeonPostTurnAnalysisSnapshotV1(
    claimed.snapshotJsonb,
    claimed.snapshotHash,
  );
  if (
    snapshot.turnId !== claimed.turnId ||
    snapshot.userMessageId !== claimed.userMessageId ||
    snapshot.assistantMessageId !== claimed.assistantMessageId ||
    snapshot.envelope.utterance !== claimed.assistantText
  ) {
    throw new SeyeonPostTurnAnalysisErrorV1(
      'Committed Chat material does not match the post-turn analysis snapshot.',
    );
  }

  if (claimed.checkpointJsonb !== null) {
    return finishFromCheckpoint({
      subjectId: input.subjectId,
      claimed,
      lockOwner: input.lockOwner,
      outboxPort: input.outboxPort,
      ...(input.relationshipSyncOutboxPort === undefined
        ? {}
        : {
            relationshipSyncOutboxPort:
              input.relationshipSyncOutboxPort,
          }),
      checkpoint: validateSeyeonPostTurnAnalysisCheckpointV1(
        claimed.checkpointJsonb,
      ),
    });
  }

  if (snapshot.mode === 'OFF') {
    const done = await complete({
      subjectId: input.subjectId,
      outboxEventId: claimed.outboxEventId,
      lockOwner: input.lockOwner,
      outboxPort: input.outboxPort,
    });
    return Object.freeze({
      version: SEYEON_POST_TURN_ANALYSIS_WORKER_VERSION_V1,
      decision: 'disabled' as const,
      outboxEventId: claimed.outboxEventId,
      reclaimed: claimed.reclaimed,
      processedAt: done.processedAt,
    });
  }

  const extractionContext = Object.freeze({
    turnId: claimed.turnId,
    messages: Object.freeze([
      Object.freeze({
        messageId: claimed.userMessageId,
        role: 'user' as const,
        text: claimed.userText,
      }),
      Object.freeze({
        messageId: claimed.assistantMessageId,
        role: 'assistant' as const,
        text: claimed.assistantText,
      }),
    ]),
    priorEvents: snapshot.priorEvents,
    interpretation: snapshot.interpretation,
    envelope: snapshot.envelope,
    relationshipBefore: snapshot.relationshipBefore,
  });

  const candidate = await extractSeyeonEventCandidateV2({
    context: extractionContext,
    provider: input.extractorProvider,
  });

  if (candidate.decision === 'none') {
    const saved = await checkpoint({
      subjectId: input.subjectId,
      outboxEventId: claimed.outboxEventId,
      lockOwner: input.lockOwner,
      outboxPort: input.outboxPort,
      checkpoint: Object.freeze({
        schemaVersion:
          SEYEON_POST_TURN_ANALYSIS_CHECKPOINT_VERSION_V1,
        decision: 'none' as const,
      }),
    });
    return finishFromCheckpoint({
      subjectId: input.subjectId,
      claimed,
      lockOwner: input.lockOwner,
      outboxPort: input.outboxPort,
      checkpoint: saved,
    });
  }

  const authorityDecision = validateSeyeonEventAuthorityV1({
    candidate,
    context: extractionContext,
    evidence: snapshot.eventAuthorityEvidence,
  });
  if (authorityDecision.decision === 'REJECT') {
    const saved = await checkpoint({
      subjectId: input.subjectId,
      outboxEventId: claimed.outboxEventId,
      lockOwner: input.lockOwner,
      outboxPort: input.outboxPort,
      checkpoint: Object.freeze({
        schemaVersion:
          SEYEON_POST_TURN_ANALYSIS_CHECKPOINT_VERSION_V1,
        decision: 'rejected' as const,
      }),
    });
    return finishFromCheckpoint({
      subjectId: input.subjectId,
      claimed,
      lockOwner: input.lockOwner,
      outboxPort: input.outboxPort,
      checkpoint: saved,
    });
  }

  const experimentalEvent =
    materializeSeyeonAuthorizedExperimentalEventV1({
      authorityDecision,
      eventId: snapshot.identity.experimentalEventId,
      dedupeKey: snapshot.identity.experimentalEventDedupeKey,
      occurredAt: claimed.committedAt,
    });

  const admission = admitSeyeonProductionRelationshipEventV1({
    subjectId: input.subjectId,
    productionEventId: snapshot.identity.productionEventId,
    productionAuthorityRef: snapshot.productionAuthorityRef,
    committedTurnId: claimed.turnId,
    committedAssistantMessageRef: claimed.assistantMessageId,
    authoritativeOccurredAt: claimed.committedAt,
    experimentalEvent,
    authorityDecision,
    causalBindings: snapshot.productionCausalBindings,
  });

  const saved = await checkpoint({
    subjectId: input.subjectId,
    outboxEventId: claimed.outboxEventId,
    lockOwner: input.lockOwner,
    outboxPort: input.outboxPort,
    checkpoint: Object.freeze({
      schemaVersion:
        SEYEON_POST_TURN_ANALYSIS_CHECKPOINT_VERSION_V1,
      decision:
        snapshot.mode === 'SHADOW'
          ? ('shadow' as const)
          : ('relationship_event' as const),
      productionEvent: admission.event,
    }),
  });

  return finishFromCheckpoint({
    subjectId: input.subjectId,
    claimed,
    lockOwner: input.lockOwner,
    outboxPort: input.outboxPort,
    ...(input.relationshipSyncOutboxPort === undefined
      ? {}
      : {
          relationshipSyncOutboxPort:
            input.relationshipSyncOutboxPort,
        }),
    checkpoint: saved,
  });
}
