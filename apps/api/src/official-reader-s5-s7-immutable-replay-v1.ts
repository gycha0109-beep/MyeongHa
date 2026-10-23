import type { PreparedOfficialReadingReaderAdmissionV1 } from
  './official-reading-reader-admission-v1.js';
import type { OfficialReadingRecordReadAuthorityPortV1 } from
  './official-reading-record-read.js';
import {
  inspectOfficialReaderS6CiphertextS7IdentityV1,
  type OfficialReaderS6CiphertextIdentityWitnessV1,
  type OfficialReaderS7PreparedBindingWitnessV1,
} from './official-reader-s6-ciphertext-s7-identity-v1.js';
import {
  OFFICIAL_READER_SOURCE_THROUGH_DELIVERY_PARITY_VERSION_V1,
  type OfficialReaderSourceThroughDeliveryParityV1,
} from './official-reader-source-through-delivery-parity-v1.js';
import type {
  S5CommittedReferenceV1,
  S6PrivateReadReferenceV1,
  S7AcknowledgedReferenceV1,
} from './official-reader-s5-s7-reading-continuity-v1.js';

/**
 * S7 idempotent replay of the SAME already committed S5 paid answer.
 * This is a metadata-only reconciliation, not an instruction to replay,
 * display, charge, refund, or acknowledge a protected Reader answer.
 */
export const OFFICIAL_READER_S5_S7_REPLAY_CLOSURE_VERSION_V1 =
  'official-reader-s5-s7-immutable-replay-closure-v1' as const;

const S5_KEYS = [
  'contractVersion', 'bodyId', 'safeMessageId', 'turnId',
  'attemptId', 'committedAt', 'replayed',
] as const;
const S6_KEYS = [
  'bodyId', 'officialReadingId', 'readerCharacterId', 'committedAt', 'delivery',
] as const;
const PREPARED_KEYS = [
  'contractVersion', 'deliveryRequestId', 'deliveryAttemptId',
  'responsePreparedAt', 'replayed',
] as const;
const BINDING_KEYS = [
  'subjectId', 'threadId', 'safeMessageId', 'bodyId',
  'deliveryRequestId', 'deliveryAttemptId', 'responsePreparedAt',
] as const;
const ACK_KEYS = [
  'contractVersion', 'deliveryAttemptId', 'clientAcknowledgedAt', 'replayed',
] as const;

function exactFields(value: unknown, fields: readonly string[]): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length
    && fields.every(key => Object.hasOwn(value, key));
}

function fieldsEqual(a: unknown, b: unknown, keys: readonly string[]): boolean {
  if (!exactFields(a, keys) || !exactFields(b, keys)) return false;
  const original = a as Record<string, unknown>;
  const retry = b as Record<string, unknown>;
  return keys.every(key => original[key] === retry[key]);
}

function blocked(): OfficialReaderSourceThroughDeliveryParityV1 {
  return Object.freeze({
    contractVersion: OFFICIAL_READER_SOURCE_THROUGH_DELIVERY_PARITY_VERSION_V1,
    state: 'blocked',
    evidenceStage: 'UNAVAILABLE',
    sourceAuthority: 'NOT_EVALUATED',
    productionInterpretationAuthority: 'NOT_EVALUATED',
    privacyApproval: 'NOT_EVALUATED',
    s5AtomicStorage: 'DB_OWNER_REQUIRED',
    s7Delivery: 'DB_OWNER_REQUIRED',
    currentAccessAuthority: 'NOT_EVALUATED',
    canPersist: false,
    canDisclose: false,
    canPublish: false,
    canSell: false,
  });
}
const BLOCKED = blocked();

/**
 * Compare one original S5/S7 receipt with its duplicate retry while holding
 * the EXACT original S3 source and DB Owner S6 ciphertext AAD context.
 *
 * A second S5 commit and S7 preparation with identical request IDs must
 * return their original body/message/attempt/prepared timestamps and
 * replayed=true; they may NEVER create a new protected answer.
 *
 * An initial client ACK and its replay are compared only if BOTH are
 * explicitly present. A first ACK arriving between calls is a distinct S7
 * event and must be checked by the existing Owner ACK SQL, not fabricated
 * as a replay by this consistency function.
 *
 * The S6 and S7 witnesses must come from trusted server-side DB Owner rows.
 * Nothing here independently verifies that witness provenance or current
 * Reader entitlement; success remains HELD and disclosure is always denied.
 */
export async function inspectOfficialReaderS5S7ImmutableReplayV1(input: Readonly<{
  readerAdmission: PreparedOfficialReadingReaderAdmissionV1;
  recordAuthorityPort: OfficialReadingRecordReadAuthorityPortV1;
  sajuHandoff: unknown;
  s6CiphertextIdentity: OfficialReaderS6CiphertextIdentityWitnessV1;
  originalS5Commit: S5CommittedReferenceV1;
  replayS5Commit: S5CommittedReferenceV1;
  originalS6Read: S6PrivateReadReferenceV1;
  replayS6Read: S6PrivateReadReferenceV1;
  originalS7Binding: OfficialReaderS7PreparedBindingWitnessV1;
  replayS7Binding: OfficialReaderS7PreparedBindingWitnessV1;
  originalS7Acknowledged?: S7AcknowledgedReferenceV1;
  replayS7Acknowledged?: S7AcknowledgedReferenceV1;
}>): Promise<OfficialReaderSourceThroughDeliveryParityV1> {
  try {
    const original = input.originalS5Commit;
    const replay = input.replayS5Commit;
    if (!exactFields(original, S5_KEYS)
      || !exactFields(replay, S5_KEYS)
      || replay.replayed !== true
      || !S5_KEYS.filter(key => key !== 'replayed')
        .every(key => original[key] === replay[key])) return BLOCKED;

    const firstRead = input.originalS6Read;
    const againRead = input.replayS6Read;
    // Compare S6 scalar identity separately; delivery objects are not
    // referentially identical when independently read from PostgreSQL.
    if (!exactFields(firstRead, S6_KEYS) || !exactFields(againRead, S6_KEYS)
      || firstRead.bodyId !== againRead.bodyId
      || firstRead.officialReadingId !== againRead.officialReadingId
      || firstRead.readerCharacterId !== againRead.readerCharacterId
      || firstRead.committedAt !== againRead.committedAt) return BLOCKED;

    const prepared = firstRead.delivery;
    const retryPrepared = againRead.delivery;
    if (!exactFields(firstRead, S6_KEYS) || !exactFields(againRead, S6_KEYS)
      || !exactFields(prepared, PREPARED_KEYS)
      || !exactFields(retryPrepared, PREPARED_KEYS)
      || !prepared || !retryPrepared
      || retryPrepared.replayed !== true
      || !PREPARED_KEYS.filter(key => key !== 'replayed')
        .every(key => prepared[key] === retryPrepared[key])
      || !fieldsEqual(input.originalS7Binding, input.replayS7Binding, BINDING_KEYS)
      || input.replayS7Binding.deliveryRequestId !== retryPrepared.deliveryRequestId
      || input.replayS7Binding.deliveryAttemptId !== retryPrepared.deliveryAttemptId
      || input.replayS7Binding.responsePreparedAt !== retryPrepared.responsePreparedAt) return BLOCKED;

    const firstAck = input.originalS7Acknowledged;
    const replayAck = input.replayS7Acknowledged;
    if ((firstAck === undefined) !== (replayAck === undefined)) return BLOCKED;
    if (firstAck !== undefined && replayAck !== undefined
      && (!exactFields(firstAck, ACK_KEYS)
        || !exactFields(replayAck, ACK_KEYS)
        || replayAck.replayed !== true
        || !ACK_KEYS.filter(key => key !== 'replayed')
          .every(key => firstAck[key] === replayAck[key]))) return BLOCKED;

    const state = await inspectOfficialReaderS6CiphertextS7IdentityV1({
      readerAdmission: input.readerAdmission,
      recordAuthorityPort: input.recordAuthorityPort,
      sajuHandoff: input.sajuHandoff,
      s5Commit: replay,
      s6Read: againRead,
      s6CiphertextIdentity: input.s6CiphertextIdentity,
      s7PreparedBinding: input.replayS7Binding,
      ...(replayAck === undefined ? {} : { s7Acknowledged: replayAck }),
    });
    return state.state === 'held'
      && state.canDisclose === false
      && state.canPersist === false
      && state.sourceAuthority === 'NOT_EVALUATED'
      ? state : BLOCKED;
  } catch {
    return BLOCKED;
  }
}
