import { createHash, randomUUID } from 'node:crypto';

import type {
  SeyeonProductionChatExecutionIdPortV1,
} from './seyeon-production-chat-execution-v1.js';
import type {
  SeyeonProductionRelationshipSyncIdPortV1,
} from './seyeon-production-relationship-sync-v1.js';

export interface SeyeonProductionRuntimeIdPortV1
extends SeyeonProductionChatExecutionIdPortV1,
  SeyeonProductionRelationshipSyncIdPortV1 {}

function semanticDedupe(input: {
  readonly subjectId: string;
  readonly turnId: string;
  readonly userMessageId: string;
  readonly assistantMessageId: string;
}): string {
  const material = [
    input.subjectId.trim().toLowerCase(),
    input.turnId.trim().toLowerCase(),
    input.userMessageId.trim().toLowerCase(),
    input.assistantMessageId.trim().toLowerCase(),
  ].join('\u0000');
  return (
    'seyeon-post-turn-v1:' +
    createHash('sha256').update(material, 'utf8').digest('hex')
  );
}

export function createSeyeonProductionRuntimeIdPortV1(
  createUuid: () => string = randomUUID,
): SeyeonProductionRuntimeIdPortV1 {
  const next = () => createUuid();

  return Object.freeze({
    nextTurnId: next,
    nextUserMessageId: next,
    nextAttemptId: next,
    nextAssistantMessageId: next,
    nextCommitOutboxEventId: next,
    nextPostTurnAnalysisOutboxEventId: next,
    nextRelationshipSyncOutboxEventId: next,
    nextAiExecutionLogId: (
      _stage: 'renderer' | 'output_guard',
    ) => next(),
    nextExperimentalEventId: next,
    nextExperimentalEventDedupeKey: semanticDedupe,
    nextExperimentalLedgerEntryId: next,
    nextProductionEventId: async () => next(),
    nextStateId: async () => next(),
    nextHistoryEntryId: async () => next(),
    nextProvenanceRefId: async () => next(),
  });
}
