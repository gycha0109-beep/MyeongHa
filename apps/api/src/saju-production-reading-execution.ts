import type { BirthProfileReadResponseV1 } from './birth-profile-read.js';

// Reject malformed prepared identities before any paid Saju network execution.
// The canonical owner, attempt and session are still rechecked by the governed DB transaction.
const OFFICIAL_ISSUE_UUID_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

import { bindCurrentBirthProfileRevisionForSajuV1 } from './saju-production-calculation-execution.js';
import {
  buildSajuProductionReadingRequestV1,
  type SajuProductionReadingHttpAdapterV1,
} from './saju-production-reading-http-adapter.js';

/**
 * Pure application execution boundary for one already-authorized Product Reading intent.
 *
 * It deliberately accepts an authoritative Birth Profile read result rather than client
 * Birth input. Persistence attempt allocation/finalization and Production Interpretation
 * Authority remain outside this function.
 */
export async function executeCurrentBirthProfileSajuReadingV1<AdmittedResponse>(input: {
  readonly profile: BirthProfileReadResponseV1;
  readonly readingText: string;
  readonly targetPersonRef?: string;
  readonly adapter: SajuProductionReadingHttpAdapterV1<AdmittedResponse>;
}): Promise<AdmittedResponse> {
  const birthRevision = bindCurrentBirthProfileRevisionForSajuV1(input.profile);
  const request = buildSajuProductionReadingRequestV1({
    birthRevision,
    readingText: input.readingText,
    ...(input.targetPersonRef === undefined
      ? {}
      : { targetPersonRef: input.targetPersonRef }),
  });
  return input.adapter.requestReading(request);
}


import {
  SAJU_OFFICIAL_DB_ISSUANCE_HANDOFF_VERSION_V1,
  persistIssuedSajuOfficialReadingV1,
  type SajuOfficialSourceVerificationPortV1,
  type SajuOfficialDbMappingVerificationPortV1,
  type SajuOfficialCurrentAuthorityPortV1,
  type SajuOfficialImmutableCommitPortV1,
  type SajuOfficialIssuanceResultV1,
} from './saju-official-reading-issuer-db-persistence-v1.js';

/** A separate, verified Subject-scope admission before contacting Production Saju. */
export interface SajuOfficialAttemptPreparePortV1 {
  /** Allocate one new transport attempt and admit its exact active purchase atomically. */
  prepareBeforeSourceCall(input: Readonly<{
    subjectId: string;
    readingId: string;
    readingSessionId: string;
    executionAttemptId: string;
    sourceBirthRevisionId: string;
  }>): Promise<boolean>;
}

export interface SajuOfficialIssuancePreflightPortV1 {
  admitBeforeSourceCall(input: Readonly<{
    subjectId: string;
    readingId: string;
    readingSessionId: string;
    executionAttemptId: string;
    sourceBirthRevisionId: string;
  }>): Promise<boolean>;
}

/**
 * One DB subject transaction opened AFTER the upstream Saju network request.
 * The current Birth/Commerce/Privacy admission and atomic finalize port must
 * share the same governed connection. An upstream success alone is not a grant.
 */
export interface SajuOfficialIssuedDbTransactionPortV1 {
  run(input: Readonly<{
    readonly subjectId: string;
    readonly commit: (ports: Readonly<{
      currentAuthority: SajuOfficialCurrentAuthorityPortV1;
      commitPort: SajuOfficialImmutableCommitPortV1;
    }>) => Promise<SajuOfficialIssuanceResultV1>;
  }>): Promise<SajuOfficialIssuanceResultV1>;
}

/**
 * Production-ready composition shape without a public or preview activation.
 * The actual Saju issuer and DB mapping verifiers have not been approved yet:
 * absent server-owned authorities => HELD without even calling Saju network.
 * 
 * A prior CREATE/transport PREPARE must have allocated exact pending identities.
 * On completion the existing DB finalize command stores the immutable record,
 * source native ID, response hash and outbox entry as a single DB transaction.
 */
export async function executeAndPersistCurrentBirthSajuOfficialReadingV1<AdmittedResponse>(
  input: Readonly<{
    profile: BirthProfileReadResponseV1;
    readingText: string;
    targetPersonRef?: string;
    adapter: SajuProductionReadingHttpAdapterV1<AdmittedResponse>;
    subjectId: string;
    readingId: string;
    readingSessionId: string;
    executionAttemptId: string;
    outboxEventId: string;
    /** Pinned by the authoritative DB Reading Session, not by the browser. */
    sourceBirthRevisionId: string;
    sourceVerifier?: SajuOfficialSourceVerificationPortV1;
    mappingVerifier?: SajuOfficialDbMappingVerificationPortV1;
    /** Optional when the exact attempt is already prepared by a trusted DB caller. */
    attemptPrepare?: SajuOfficialAttemptPreparePortV1;
    preflight?: SajuOfficialIssuancePreflightPortV1;
    dbTransaction?: SajuOfficialIssuedDbTransactionPortV1;
  }>,
): Promise<SajuOfficialIssuanceResultV1> {
  const unavailable = Object.freeze({
    contractVersion: SAJU_OFFICIAL_DB_ISSUANCE_HANDOFF_VERSION_V1,
    state: 'held' as const,
    reason: 'production_source_unverified' as const,
    canDisclose: false as const,
    canSell: false as const,
  });
  // The existing current Saju proof endpoint only emits Preview/HELD.
  // Never charge an upstream call without a wired Production issuer + DB scope.
  const { sourceVerifier, mappingVerifier, attemptPrepare, preflight, dbTransaction } = input;
  const hasBeforeSourceAuthority = attemptPrepare === undefined
    ? typeof preflight?.admitBeforeSourceCall === 'function'
    : typeof attemptPrepare.prepareBeforeSourceCall === 'function';
  if (typeof sourceVerifier?.verifyProductionIssue !== 'function'
    || typeof mappingVerifier?.verifyIssuedReadingMapping !== 'function'
    || !hasBeforeSourceAuthority
    || typeof dbTransaction?.run !== 'function') {
    return unavailable;
  }

  if (![input.subjectId, input.readingId, input.readingSessionId,
    input.executionAttemptId, input.outboxEventId,
    input.sourceBirthRevisionId].every((value) =>
    typeof value === 'string' && OFFICIAL_ISSUE_UUID_V1.test(value))) {
    return unavailable;
  }

  // The official issued-Reading contract pins SELF Birth only. SRC-08 has no
  // approved target Birth ownership/correlation contract for this issuance path.
  // Never send a caller-supplied target reference to Production Saju as a shortcut.
  if (input.targetPersonRef !== undefined) {
    return unavailable;
  }

  const birth = bindCurrentBirthProfileRevisionForSajuV1(input.profile);
  if (birth.birthRevisionRef !== input.sourceBirthRevisionId) {
    return Object.freeze({
      ...unavailable,
      reason: 'current_authority_unavailable' as const,
    });
  }

  // Validate the exact request BEFORE a paid attempt is allocated. Invalid
  // text must never strand a newly allocated running DB attempt.
  const executedRequest = buildSajuProductionReadingRequestV1({
    birthRevision: birth,
    readingText: input.readingText,
  });
  const exactAttempt = {
    subjectId: input.subjectId,
    readingId: input.readingId,
    readingSessionId: input.readingSessionId,
    executionAttemptId: input.executionAttemptId,
    sourceBirthRevisionId: input.sourceBirthRevisionId,
  };

  // A NEW attempt is allocated together with its exact current entitlement
  // under one DB transaction. A separate post-allocation preflight could
  // reject after the attempt committed and strand it in 'running'.
  // Already-prepared trusted attempts use the standalone read-only preflight.
  const admittedBeforeSource = attemptPrepare === undefined
    ? await preflight?.admitBeforeSourceCall(exactAttempt)
    : typeof attemptPrepare.prepareBeforeSourceCall === 'function'
      && await attemptPrepare.prepareBeforeSourceCall(exactAttempt) === true;
  if (admittedBeforeSource !== true) {
    return Object.freeze({ ...unavailable, reason: 'current_authority_unavailable' as const });
  }

  // The immutable finalize transaction independently rechecks the grant,
  // current Birth and issuer provenance before any report can be stored.
  const response = await input.adapter.requestReading(executedRequest);
  return dbTransaction.run({
    subjectId: input.subjectId,
    commit: ({ currentAuthority, commitPort }) =>
      persistIssuedSajuOfficialReadingV1({
        subjectId: input.subjectId,
        readingId: input.readingId,
        readingSessionId: input.readingSessionId,
        executionAttemptId: input.executionAttemptId,
        outboxEventId: input.outboxEventId,
        sourceBirthRevisionId: input.sourceBirthRevisionId,
        sourceResponse: response,
        executedRequest,
        sourceVerifier,
        mappingVerifier,
        currentAuthority,
        commitPort,
      }),
  });
}
