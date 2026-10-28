import type { BirthProfileReadResponseV1 } from './birth-profile-read.js';
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
  if (!input.sourceVerifier || !input.mappingVerifier || !input.dbTransaction) {
    return unavailable;
  }

  const birth = bindCurrentBirthProfileRevisionForSajuV1(input.profile);
  if (birth.birthRevisionRef !== input.sourceBirthRevisionId) {
    return Object.freeze({
      ...unavailable,
      reason: 'current_authority_unavailable' as const,
    });
  }

  const response = await executeCurrentBirthProfileSajuReadingV1({
    profile: input.profile,
    readingText: input.readingText,
    adapter: input.adapter,
    ...(input.targetPersonRef === undefined
      ? {}
      : { targetPersonRef: input.targetPersonRef }),
  });
  return input.dbTransaction.run({
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
        sourceVerifier: input.sourceVerifier,
        mappingVerifier: input.mappingVerifier,
        currentAuthority,
        commitPort,
      }),
  });
}
