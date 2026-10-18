import type { CharacterStandardReadingKnowledgeSourceV1 } from './character-standard-reading-knowledge.js';
import type { OfficialReadingReaderAdmissionScopeV1 } from './official-reading-reader-admission-v1.js';
import {
  OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1,
  type OfficialReaderS3CoveragePreflightV1,
} from './official-reader-s3-source-coverage-preflight-v1.js';
import {
  preflightOfficialReaderS3FromAdmittedArtifactV1,
} from './official-reader-s3-authoritative-artifact-coverage-v1.js';
import {
  hashSajuHeldSourceProofRequestV1,
  verifySajuHeldSourceProofV1,
  type SajuHeldSourceProofVerifierContextV1,
  type SajuHeldSourceProofVerifierTrustV1,
} from './saju-held-source-proof-verifier-v1.js';

export const OFFICIAL_READER_S3_SIGNED_SOURCE_RECONCILIATION_VERSION_V1 =
  'official-reader-s3-signed-source-reconciliation-v1' as const;

export type OfficialReaderS3SignedSourceReconciliationV1 = Readonly<{
  version: typeof OFFICIAL_READER_S3_SIGNED_SOURCE_RECONCILIATION_VERSION_V1;
  state: 'blocked' | 'held';
  reason: 'source_or_transport_mismatch' | 'signed_preview_source_consistent_only';
  transportIntegrity: 'NOT_VERIFIED' | 'VERIFIED';
  sourceAuthority: 'NOT_EVALUATED';
  semanticAuthority: 'NOT_EVALUATED';
  outputAuthority: 'NOT_EVALUATED';
  privacyApproval: 'NOT_EVALUATED';
  canExecute: false;
  canPublish: false;
  canSell: false;
  publicDisclosureAuthorized: false;
}>;

function decision(valid: boolean): OfficialReaderS3SignedSourceReconciliationV1 {
  return Object.freeze({
    version: OFFICIAL_READER_S3_SIGNED_SOURCE_RECONCILIATION_VERSION_V1,
    state: valid ? 'held' as const : 'blocked' as const,
    reason: valid
      ? 'signed_preview_source_consistent_only' as const
      : 'source_or_transport_mismatch' as const,
    transportIntegrity: valid ? 'VERIFIED' as const : 'NOT_VERIFIED' as const,
    sourceAuthority: 'NOT_EVALUATED' as const,
    semanticAuthority: 'NOT_EVALUATED' as const,
    outputAuthority: 'NOT_EVALUATED' as const,
    privacyApproval: 'NOT_EVALUATED' as const,
    canExecute: false as const,
    canPublish: false as const,
    canSell: false as const,
    publicDisclosureAuthorized: false as const,
  });
}
const BLOCKED = decision(false);

/**
 * Offline, server-only S3 reconciliation of two INDEPENDENT provenances:
 * 1. A DB-authorized and pinned Official Reading artifact + exact Saju units;
 * 2. The real Saju source-issued, signed PREVIEW envelope for the same bytes.
 *
 * This is *not* Saju's official/Production source attestation (#2410), nor a
 * Privacy-approved write (#2318), nor a final T2/release permission. A new
 * signed Preview response for a DIFFERENT execution must fail closed even when
 * the original Reading/Reader and candidate unit shape appear plausible.
 *
 * Caller must already have server-verified Subject+Birth revision, the exact
 * DB-admitted artifact and request, and an independently configured verifier
 * with the cross-replica PostgreSQL nonce-claim ledger. No browser inputs or
 * Saju service I/O are performed here.
 */
export async function reconcileOfficialReaderS3SignedSourceArtifactV1(input: Readonly<{
  scope: OfficialReadingReaderAdmissionScopeV1;
  source: CharacterStandardReadingKnowledgeSourceV1;
  candidate: unknown;
  previewEnvelope: unknown;
  trust: SajuHeldSourceProofVerifierTrustV1;
  context: SajuHeldSourceProofVerifierContextV1;
}>): Promise<OfficialReaderS3SignedSourceReconciliationV1> {
  try {
    const preflight: OfficialReaderS3CoveragePreflightV1 =
      preflightOfficialReaderS3FromAdmittedArtifactV1(input);
    if (preflight.version !== OFFICIAL_READER_S3_COVERAGE_PREFLIGHT_VERSION_V1
      || preflight.state !== 'held'
      || preflight.publicDisclosureAuthorized !== false
      || preflight.sourceAuthority !== 'NOT_EVALUATED') return BLOCKED;

    // Signer verification authenticates the response in the *envelope*.
    // Independently hash the exact DB artifact and compare the two before
    // considering the transport useful for the Official Reader source.
    const actualStoredResponseHash =
      hashSajuHeldSourceProofRequestV1(input.source.responseSnapshotJsonb);
    const verified = await verifySajuHeldSourceProofV1(
      input.previewEnvelope, input.trust, input.context,
    );
    if (verified.state !== 'held' || verified.transportIntegrity !== 'VERIFIED'
      || verified.sourceAuthority !== 'NOT_EVALUATED'
      || verified.releaseAuthorization !== 'NOT_EVALUATED'
      || verified.canPublish !== false || verified.canSell !== false
      || verified.verifiedSource === undefined
      || verified.verifiedSource.readingId !== input.source.readingId
      || verified.verifiedSource.responseBodyHash !== actualStoredResponseHash) {
      return BLOCKED;
    }

    // A successful Preview signature only means the independently admitted
    // stored response is byte-canonically identical to the signed response.
    // It does NOT certify Saju interpretation validity, Source authority,
    // present Entitlement status, Privacy approval or final disclosure.
    return decision(true);
  } catch {
    return BLOCKED;
  }
}
