import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import type {
  SeyeonProductionContextSnapshotV1,
} from './seyeon-production-context-v1.js';

export const SEYEON_ATTEMPT_ZERO_PERSONAL_PROOF_VERSION_V1 =
  'seyeon-attempt-zero-personal-proof-v1' as const;

const CONTEXT_VERSION = 'seyeon-production-context-v1';

export class SeyeonAttemptZeroPersonalProofHoldV1 extends Error {
  readonly code = 'UNVERIFIABLE_ZERO_PERSONAL_RECORD_CONTEXT' as const;

  constructor() {
    super('Server-owned Se-yeon zero-personal-record proof is unavailable.');
    this.name = 'SeyeonAttemptZeroPersonalProofHoldV1';
  }
}

export interface SeyeonAttemptZeroPersonalProofV1 {
  readonly schemaVersion: typeof SEYEON_ATTEMPT_ZERO_PERSONAL_PROOF_VERSION_V1;
  readonly source: 'server-composed-context';
  readonly subjectId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly characterId: 'seyeon';
  readonly recordState: 'explicit_zero_admitted';
  readonly recordCount: 0;
  readonly records: readonly [];
  readonly unsupportedSchemaCount: number;
  /** Unkeyed integrity checksum, not authentication or Grant authority. */
  readonly proofDigest: string;
  readonly permitsAtomicPersonalRecordCommit: false;
  readonly permitsHttpReveal: false;
}

type Context = Pick<
  SeyeonProductionContextSnapshotV1,
  'version' | 'retrievedMemories' | 'personalRecordAdmissions'
>;

function identity(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 && value.length <= 256 &&
    value.trim() === value;
}

/**
 * Called only by the server after Context Assembly, before any model request.
 * Produces a durable, attempt-scoped EMPTY provenance marker. It is stored
 * within existing immutable chat_turn_attempts.validation_result_jsonb by the
 * governed persistValidated command; the marker is NOT a DB authorization or
 * publication permit. Non-empty personal-record attempts remain HOLD.
 */
export function createSeyeonAttemptZeroPersonalProofV1(input: {
  readonly subjectId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly context: Context;
}): SeyeonAttemptZeroPersonalProofV1 {
  if (!identity(input.subjectId) || !identity(input.threadId) ||
      !identity(input.turnId) || !identity(input.attemptId)) {
    throw new SeyeonAttemptZeroPersonalProofHoldV1();
  }
  const c = input.context;
  if (c === null || typeof c !== 'object' ||
      c.version !== CONTEXT_VERSION ||
      !Array.isArray(c.retrievedMemories) ||
      !Array.isArray(c.personalRecordAdmissions)) {
    throw new SeyeonAttemptZeroPersonalProofHoldV1();
  }

  for (const m of c.retrievedMemories) {
    if (m === null || typeof m !== 'object' ||
        m.kind !== 'relationship_event') {
      throw new SeyeonAttemptZeroPersonalProofHoldV1();
    }
  }
  for (const a of c.personalRecordAdmissions) {
    if (a === null || typeof a !== 'object' ||
        a.reason !== 'UNSUPPORTED_SCHEMA') {
      throw new SeyeonAttemptZeroPersonalProofHoldV1();
    }
  }

  // No payload, prompt, personal-record ID, or grant ID is persisted here.
  const material = Object.freeze({
    schemaVersion: SEYEON_ATTEMPT_ZERO_PERSONAL_PROOF_VERSION_V1,
    source: 'server-composed-context' as const,
    subjectId: input.subjectId,
    threadId: input.threadId,
    turnId: input.turnId,
    attemptId: input.attemptId,
    characterId: 'seyeon' as const,
    recordState: 'explicit_zero_admitted' as const,
    recordCount: 0 as const,
    records: Object.freeze([] as const),
    unsupportedSchemaCount: c.personalRecordAdmissions.length,
  });
  return Object.freeze({
    ...material,
    proofDigest: 'sha256:v1:' +
      createHash('sha256').update(canonicalJson(material)).digest('hex'),
    permitsAtomicPersonalRecordCommit: false as const,
    permitsHttpReveal: false as const,
  });
}
