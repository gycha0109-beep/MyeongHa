import {
  SEYEON_PRODUCTION_CONTEXT_VERSION_V1,
  type SeyeonProductionContextSnapshotV1,
} from './seyeon-production-context-v1.js';

/**
 * Production safety interlock while exact-Grant provenance, locked Commit,
 * and Reveal/replay authority remain unimplemented (#1843).
 *
 * This is NOT a substitute for atomic authorization. It prevents an admitted
 * personal record from reaching the model through the currently unprotected
 * Production Chat path, even if a positive projector is accidentally supplied.
 */
export const SEYEON_PERSONAL_RECORD_PRECOMMIT_HOLD_VERSION_V1 =
  'seyeon-personal-record-precommit-hold-v1' as const;

export class SeyeonPersonalRecordPrecommitHoldV1 extends Error {
  readonly code = 'PERSONAL_RECORD_ATOMIC_COMMIT_UNAVAILABLE' as const;

  constructor() {
    super('Se-yeon Production personal-record use requires atomic Commit authority.');
    this.name = 'SeyeonPersonalRecordPrecommitHoldV1';
  }
}

type PersonalRecordContextV1 = Pick<
  SeyeonProductionContextSnapshotV1,
  'version' | 'recentMessages' | 'retrievedMemories' |
  'personalRecordAdmissions' | 'personalRecordProjectionCandidates' |
  'relationshipHistoryRecords' | 'activeRelationshipEventCount' |
  'historyThroughRevision' | 'relationshipRevisionUsedForTurn'
>;

export function assertSeyeonPersonalRecordsNotUsedBeforeUnprotectedCommitV1(
  context: PersonalRecordContextV1,
): Readonly<{
  version: typeof SEYEON_PERSONAL_RECORD_PRECOMMIT_HOLD_VERSION_V1;
  state: 'no_admitted_personal_records';
  /** Current model context only; NOT a persisted zero-record proof. */
  permitsAtomicPersonalRecordCommit: false;
  permitsHttpReveal: false;
}> {
  if (
    context === null || typeof context !== 'object' ||
    context.version !== SEYEON_PRODUCTION_CONTEXT_VERSION_V1 ||
    !Array.isArray(context.retrievedMemories) ||
    !Array.isArray(context.personalRecordAdmissions) ||
    !Array.isArray(context.recentMessages) ||
    !Array.isArray(context.relationshipHistoryRecords) ||
    !Number.isSafeInteger(context.activeRelationshipEventCount) ||
    context.activeRelationshipEventCount < 0 ||
    !Number.isSafeInteger(context.historyThroughRevision) ||
    context.historyThroughRevision < 0 ||
    (context.relationshipRevisionUsedForTurn !== null &&
     (!Number.isSafeInteger(context.relationshipRevisionUsedForTurn) ||
      context.relationshipRevisionUsedForTurn < 0)) ||
    context.historyThroughRevision !== (context.relationshipRevisionUsedForTurn ?? 0) ||
    (context.personalRecordProjectionCandidates !== undefined &&
     (!Array.isArray(context.personalRecordProjectionCandidates) ||
      context.personalRecordProjectionCandidates.length !== 0))
  ) {
    throw new SeyeonPersonalRecordPrecommitHoldV1();
  }

  const modelUsedPersonalRecord = context.retrievedMemories.some(
    (memory) =>
      memory !== null &&
      typeof memory === 'object' &&
      (memory.kind === 'memory' || memory.kind === 'life_fact'),
  );
  const unsafeMemoryKind = context.retrievedMemories.some(
    (memory) =>
      memory === null ||
      typeof memory !== 'object' ||
      (memory.kind !== 'memory' &&
       memory.kind !== 'life_fact' &&
       memory.kind !== 'relationship_event'),
  );
  const admittedOrUnknown = context.personalRecordAdmissions.some(
    (admission) =>
      admission === null ||
      typeof admission !== 'object' ||
      admission.reason !== 'UNSUPPORTED_SCHEMA',
  );

  // G0-derived lineage is not yet approved: an old user/assistant message,
  // a relationship event, or even a nonzero historical revision without
  // remaining event text cannot be safely promoted to a "zero source" turn.
  // Fail BEFORE context_ready persistence and ANY Provider/Preflight call.
  const unverifiedDerivedSource = context.recentMessages.length !== 0 ||
    context.relationshipHistoryRecords.length !== 0 ||
    context.activeRelationshipEventCount !== 0 ||
    context.historyThroughRevision !== 0 ||
    context.retrievedMemories.some(memory => memory.kind === 'relationship_event');

  if (modelUsedPersonalRecord || unsafeMemoryKind || admittedOrUnknown ||
      unverifiedDerivedSource) {
    throw new SeyeonPersonalRecordPrecommitHoldV1();
  }

  return Object.freeze({
    version: SEYEON_PERSONAL_RECORD_PRECOMMIT_HOLD_VERSION_V1,
    state: 'no_admitted_personal_records' as const,
    permitsAtomicPersonalRecordCommit: false as const,
    permitsHttpReveal: false as const,
  });
}
