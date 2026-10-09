import type {
  SeyeonProductionContextSnapshotV1,
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
  'retrievedMemories' | 'personalRecordAdmissions'
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
    !Array.isArray(context.retrievedMemories) ||
    !Array.isArray(context.personalRecordAdmissions)
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

  if (modelUsedPersonalRecord || unsafeMemoryKind || admittedOrUnknown) {
    throw new SeyeonPersonalRecordPrecommitHoldV1();
  }

  return Object.freeze({
    version: SEYEON_PERSONAL_RECORD_PRECOMMIT_HOLD_VERSION_V1,
    state: 'no_admitted_personal_records' as const,
    permitsAtomicPersonalRecordCommit: false as const,
    permitsHttpReveal: false as const,
  });
}
