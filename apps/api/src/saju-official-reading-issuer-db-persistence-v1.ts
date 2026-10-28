import { projectProductReadingResponseV2 } from '../../../packages/api-client/src/product-reading-display.js';
import type { SajuProductionReadingRequestV1 } from './saju-production-reading-http-adapter.js';
import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';

/**
 * Saju Production source -> DB-owned immutable Official Reading handoff.
 *
 * This is a server-internal composition, NOT a Production issuer, public route,
 * signer, or permission grant. The current Saju Preview proof is HELD and MUST
 * never satisfy the two independent Production authority ports below.
 *
 * The DB transport finalize procedure remains REVOKED for the ordinary API
 * executor until the authorized DB/Privacy deployment admits the issuer.
 */
export const SAJU_OFFICIAL_DB_ISSUANCE_HANDOFF_VERSION_V1 =
  'saju-official-db-issuance-handoff-v1' as const;

const HASH = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const RESPONSE_VERSION = 'myeonghwa-product-reading-response-v2';
const STATES = new Set(['delivered', 'delivered_with_fallback']);

function obj(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function id(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= 256;
}
function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** Returned ONLY from a real Saju Production issuer signature/semantic verifier. */
export interface VerifiedSajuProductionIssueV1 {
  readonly state: 'production_source_verified';
  readonly nativeReadingId: string;
  readonly sourceResponseHash: string;
  readonly sourceBirthRevisionId: string;
  readonly sourceBirthInputHash: string;
  readonly engineVersion: string;
  readonly externalRequestRef: string;
}

/** DB Owner must separately attest that the ONLY transformation is Reading ID. */
export interface ApprovedSajuReadingIdMappingV1 {
  readonly state: 'approved_mapping';
  readonly subjectId: string;
  readonly dbReadingId: string;
  readonly readingSessionId: string;
  readonly sourceBirthRevisionId: string;
  readonly nativeReadingId: string;
  readonly originalResponseHash: string;
  readonly storedResponseHash: string;
}

export interface SajuOfficialSourceVerificationPortV1 {
  verifyProductionIssue(input: Readonly<{
    readonly sourceResponse: unknown;
    readonly executedRequest: SajuProductionReadingRequestV1;
    readonly subjectId: string;
    readonly dbReadingId: string;
    readonly readingSessionId: string;
    readonly sourceBirthRevisionId: string;
  }>): Promise<VerifiedSajuProductionIssueV1 | null>;
}

export interface SajuOfficialDbMappingVerificationPortV1 {
  verifyIssuedReadingMapping(input: Readonly<{
    readonly subjectId: string;
    readonly dbReadingId: string;
    readonly readingSessionId: string;
    readonly sourceBirthRevisionId: string;
    readonly source: VerifiedSajuProductionIssueV1;
    readonly originalResponse: unknown;
  }>): Promise<ApprovedSajuReadingIdMappingV1 | null>;
}

/** Run this immediately before finalization in the SAME governed DB transaction. */
export interface SajuOfficialCurrentAuthorityPortV1 {
  admitCurrentIssue(input: Readonly<{
    readonly subjectId: string;
    readonly dbReadingId: string;
    readonly readingSessionId: string;
    readonly sourceBirthRevisionId: string;
    readonly sourceResponseHash: string;
    readonly storedResponseHash: string;
  }>): Promise<boolean>;
}

export interface SajuOfficialImmutableCommitPortV1 {
  finalizeSuccess(input: Readonly<{
    readonly subjectId: string;
    readonly readingId: string;
    readonly executionAttemptId: string;
    readonly outboxEventId: string;
    readonly engineVersion: string;
    readonly externalRequestRef: string;
    readonly nativeReadingId: string;
    readonly sourceResponseHash: string;
    readonly sourceBirthInputHash: string;
    readonly readingContractVersion: typeof RESPONSE_VERSION;
    readonly productResponseState: 'delivered' | 'delivered_with_fallback';
    readonly storedSnapshot: Readonly<Record<string, unknown>>;
    readonly storedResponseHash: string;
  }>): Promise<Readonly<{
    readonly readingId: string;
    readonly executionAttemptId: string;
    readonly responseHash: string;
    readonly replayed: boolean;
  }>>;
}

export type SajuOfficialIssuanceResultV1 =
  | Readonly<{
    contractVersion: typeof SAJU_OFFICIAL_DB_ISSUANCE_HANDOFF_VERSION_V1;
    state: 'held';
    reason: 'production_source_unverified' | 'db_mapping_unverified' | 'current_authority_unavailable';
    canDisclose: false;
    canSell: false;
  }>
  | Readonly<{
    contractVersion: typeof SAJU_OFFICIAL_DB_ISSUANCE_HANDOFF_VERSION_V1;
    state: 'committed';
    readingId: string;
    responseHash: string;
    replayed: boolean;
    // A durable commit receipt never constitutes Reader/Public disclosure.
    canDisclose: false;
    canSell: false;
  }>;

function held(reason: Extract<SajuOfficialIssuanceResultV1, { state: 'held' }>['reason']):
  SajuOfficialIssuanceResultV1 {
  return Object.freeze({
    contractVersion: SAJU_OFFICIAL_DB_ISSUANCE_HANDOFF_VERSION_V1,
    state: 'held', reason, canDisclose: false, canSell: false,
  });
}

/**
 * Caller passes the response returned by authenticated server-to-server Saju
 * transport, NOT a browser body. The ports are verified server-owned
 * dependencies; their absence is a HOLD, never permissive fallback.
 *
 * Transport attempt allocation happens through the existing governed DB
 * lifecycle BEFORE this call. The commit port must use the existing atomic
 * cmd_finalize_reading_transport_success_v1 within its authorized transaction.
 */
export async function persistIssuedSajuOfficialReadingV1(input: Readonly<{
  readonly subjectId: string;
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly executionAttemptId: string;
  readonly outboxEventId: string;
  readonly sourceBirthRevisionId: string;
  readonly sourceResponse: unknown;
  /** Exact request sent to the authenticated Saju host, for issuer digest verification. */
  readonly executedRequest: SajuProductionReadingRequestV1;
  readonly sourceVerifier?: SajuOfficialSourceVerificationPortV1;
  readonly mappingVerifier?: SajuOfficialDbMappingVerificationPortV1;
  readonly currentAuthority?: SajuOfficialCurrentAuthorityPortV1;
  readonly commitPort?: SajuOfficialImmutableCommitPortV1;
}>): Promise<SajuOfficialIssuanceResultV1> {
  if (![input.subjectId, input.readingId, input.readingSessionId,
    input.executionAttemptId, input.outboxEventId,
    input.sourceBirthRevisionId].every(uuid)) {
    return held('production_source_unverified');
  }
  // No Production issuer exists in the current Saju runtime. In particular,
  // a Preview source proof, even when HMAC-verified, cannot enter this path.
  if (!input.sourceVerifier || !input.mappingVerifier
    || !input.currentAuthority || !input.commitPort) {
    return held('production_source_unverified');
  }

  const native = input.sourceResponse;
  if (!obj(native) || !obj(native.reading)
    || native.responseVersion !== RESPONSE_VERSION
    || !STATES.has(String(native.state))
    || !id(native.responseId)
    || !id(native.reading.readingId)) {
    return held('production_source_unverified');
  }
  try {
    if (projectProductReadingResponseV2(native).kind !== 'delivered') {
      return held('production_source_unverified');
    }
  } catch {
    return held('production_source_unverified');
  }

  const source = await input.sourceVerifier.verifyProductionIssue({
    sourceResponse: native, executedRequest: input.executedRequest, subjectId: input.subjectId,
    dbReadingId: input.readingId, readingSessionId: input.readingSessionId,
    sourceBirthRevisionId: input.sourceBirthRevisionId,
  });
  const originalHash = hashSajuHeldSourceProofRequestV1(native);
  if (source?.state !== 'production_source_verified'
    || source.nativeReadingId !== native.reading.readingId
    || source.sourceResponseHash !== originalHash
    || !HASH.test(source.sourceResponseHash)
    || source.sourceBirthRevisionId !== input.sourceBirthRevisionId
    || !id(source.sourceBirthInputHash)
    || !id(source.engineVersion)
    || !id(source.externalRequestRef)) {
    return held('production_source_unverified');
  }

  const mapped = await input.mappingVerifier.verifyIssuedReadingMapping({
    subjectId: input.subjectId, dbReadingId: input.readingId,
    readingSessionId: input.readingSessionId,
    sourceBirthRevisionId: input.sourceBirthRevisionId,
    source, originalResponse: native,
  });

  // Only the DB UUID is remapped, never interpreted/rewritten text, scope,
  // disclosures, ambiguity, birth data, or issuer response metadata.
  const storedSnapshot = Object.freeze({
    ...native,
    reading: Object.freeze({ ...native.reading, readingId: input.readingId }),
  });
  const storedHash = hashSajuHeldSourceProofRequestV1(storedSnapshot);
  if (mapped?.state !== 'approved_mapping'
    || mapped.subjectId !== input.subjectId
    || mapped.dbReadingId !== input.readingId
    || mapped.readingSessionId !== input.readingSessionId
    || mapped.sourceBirthRevisionId !== input.sourceBirthRevisionId
    || mapped.nativeReadingId !== source.nativeReadingId
    || mapped.originalResponseHash !== originalHash
    || mapped.storedResponseHash !== storedHash
    || !HASH.test(mapped.storedResponseHash)) {
    return held('db_mapping_unverified');
  }

  const current = await input.currentAuthority.admitCurrentIssue({
    subjectId: input.subjectId, dbReadingId: input.readingId,
    readingSessionId: input.readingSessionId,
    sourceBirthRevisionId: input.sourceBirthRevisionId,
    sourceResponseHash: originalHash,
    storedResponseHash: storedHash,
  });
  if (current !== true) return held('current_authority_unavailable');

  const committed = await input.commitPort.finalizeSuccess({
    subjectId: input.subjectId,
    readingId: input.readingId,
    executionAttemptId: input.executionAttemptId,
    outboxEventId: input.outboxEventId,
    engineVersion: source.engineVersion,
    externalRequestRef: source.externalRequestRef,
    nativeReadingId: source.nativeReadingId,
    sourceResponseHash: originalHash,
    sourceBirthInputHash: source.sourceBirthInputHash,
    readingContractVersion: RESPONSE_VERSION,
    productResponseState: native.state as 'delivered' | 'delivered_with_fallback',
    storedSnapshot,
    storedResponseHash: 'sha256:v1:' + storedHash,
  });

  if (committed.readingId !== input.readingId
    || committed.executionAttemptId !== input.executionAttemptId
    || committed.responseHash !== 'sha256:v1:' + storedHash
    || typeof committed.replayed !== 'boolean') {
    throw new Error('Official Reading immutable commit receipt does not bind the verified source.');
  }
  return Object.freeze({
    contractVersion: SAJU_OFFICIAL_DB_ISSUANCE_HANDOFF_VERSION_V1,
    state: 'committed',
    readingId: committed.readingId,
    responseHash: committed.responseHash,
    replayed: committed.replayed,
    canDisclose: false, canSell: false,
  });
}
