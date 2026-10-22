import type { PreparedOfficialReadingReaderAdmissionV1 } from './official-reading-reader-admission-v1.js';
import {
  OFFICIAL_READER_S3_SIGNED_SOURCE_RECONCILIATION_VERSION_V1,
  reconcileOfficialReaderS3SignedSourceArtifactV1,
} from './official-reader-s3-signed-source-artifact-reconciliation-v1.js';
import {
  hashSajuHeldSourceProofRequestV1,
  type SajuHeldSourceProofVerifierContextV1,
  type SajuHeldSourceProofVerifierTrustV1,
} from './saju-held-source-proof-verifier-v1.js';

/**
 * S3 server-private bridge for the *existing* Saju signed PREVIEW transport
 * proof. A preview signature authenticates response bytes only. It is NOT
 * Production source authority, semantic/output authorization, purchase, or
 * permission to commit, disclose or sell a paid answer.
 *
 * This ticket carries no response body, selected unit plaintext, signing
 * secret, arbitrary verifier flags or mutable proof envelope into T2.
 */
export const OFFICIAL_READER_S3_BOUND_PREVIEW_VERSION_V1 =
  'official-reader-s3-bound-preview-source-v1' as const;

export interface OfficialReaderS3BoundPreviewSourceV1 {
  readonly version: typeof OFFICIAL_READER_S3_BOUND_PREVIEW_VERSION_V1;
  readonly lifecycle: 'preview';
  readonly canPersist: false;
  readonly canDisclose: false;
}

type BoundRecord = Readonly<{
  subjectId: string;
  readingId: string;
  threadId: string;
  readerCharacterId: string;
  bundleId: string;
  releaseId: string;
  contentRevision: number;
  productId: string;
  productSpecVersion: string;
  readingContractVersion: string;
  officialArtifactResponseHash: string;
  storedResponseDigest: string;
  candidateDigest: string;
}> & { used: boolean };

const issued = new WeakMap<object, BoundRecord>();

export class OfficialReaderS3BoundPreviewErrorV1 extends Error {
  readonly code = 'READER_S3_SOURCE_UNAVAILABLE' as const;
  constructor() {
    super('Official Reader signed source binding is unavailable.');
    this.name = 'OfficialReaderS3BoundPreviewErrorV1';
  }
}
function unavailable(): never {
  throw new OfficialReaderS3BoundPreviewErrorV1();
}

function recordFrom(admission: PreparedOfficialReadingReaderAdmissionV1):
  Omit<BoundRecord, 'used' | 'candidateDigest'> {
  const { scope, source } = admission;
  if (source.subjectId !== scope.subjectId
      || source.readingId !== scope.readingId
      || source.readerCharacterId !== scope.readerCharacterId
      || source.readerContentBundleId !== scope.readerContentBundleId
      || source.productId !== scope.productId
      || source.productSpecVersion !== scope.productSpecVersion
      || source.readingContractVersion !== scope.readingContractVersion
      || source.responseHash !== scope.officialArtifactResponseHash
      || source.productResponseState !== 'delivered') unavailable();

  return {
    subjectId: scope.subjectId,
    readingId: scope.readingId,
    threadId: scope.threadId,
    readerCharacterId: scope.readerCharacterId,
    bundleId: scope.readerContentBundleId,
    releaseId: scope.contentReleaseId,
    contentRevision: scope.contentRevision,
    productId: scope.productId,
    productSpecVersion: scope.productSpecVersion,
    readingContractVersion: scope.readingContractVersion,
    officialArtifactResponseHash: scope.officialArtifactResponseHash,
    storedResponseDigest: hashSajuHeldSourceProofRequestV1(
      source.responseSnapshotJsonb,
    ),
  };
}

/**
 * Called at T1 only, outside the S1 database lock and after the authenticated
 * Subject/Birth and Reader admission has resolved the immutable Saju artifact.
 * The underlying verifier claims Saju's replay nonce in shared persistent
 * storage. No untrusted caller can mint a ticket by setting "verified": true.
 */
export async function prepareOfficialReaderS3BoundPreviewSourceV1(input: Readonly<{
  originalAdmission: PreparedOfficialReadingReaderAdmissionV1;
  sourceCoverageCandidate: unknown;
  signedPreviewEnvelope: unknown;
  verifierTrust: SajuHeldSourceProofVerifierTrustV1;
  verifierContext: SajuHeldSourceProofVerifierContextV1;
}>): Promise<OfficialReaderS3BoundPreviewSourceV1> {
  try {
    const binding = recordFrom(input.originalAdmission);
    const decision = await reconcileOfficialReaderS3SignedSourceArtifactV1({
      scope: input.originalAdmission.scope,
      source: input.originalAdmission.source,
      candidate: input.sourceCoverageCandidate,
      previewEnvelope: input.signedPreviewEnvelope,
      trust: input.verifierTrust,
      context: input.verifierContext,
    });
    if (decision.version !== OFFICIAL_READER_S3_SIGNED_SOURCE_RECONCILIATION_VERSION_V1
        || decision.state !== 'held'
        || decision.transportIntegrity !== 'VERIFIED'
        || decision.sourceAuthority !== 'NOT_EVALUATED'
        || decision.semanticAuthority !== 'NOT_EVALUATED'
        || decision.outputAuthority !== 'NOT_EVALUATED'
        || decision.privacyApproval !== 'NOT_EVALUATED'
        || decision.canExecute !== false || decision.canPublish !== false
        || decision.canSell !== false
        || decision.publicDisclosureAuthorized !== false) unavailable();

    const token: OfficialReaderS3BoundPreviewSourceV1 = Object.freeze({
      version: OFFICIAL_READER_S3_BOUND_PREVIEW_VERSION_V1,
      lifecycle: 'preview',
      canPersist: false,
      canDisclose: false,
    });
    issued.set(token, {
      ...binding,
      candidateDigest: hashSajuHeldSourceProofRequestV1(input.sourceCoverageCandidate),
      used: false,
    });
    return token;
  } catch {
    return unavailable();
  }
}

/**
 * T2 compares the freshly DB-resolved exact source snapshot to the one whose
 * Preview transport signature was actually checked in T1. This comparison
 * is not a Production issuer proof: the S5 SQL gate remains owner-HELD.
 * Consuming the one-use handle before SQL prevents reuse after a rollback.
 */
export function consumeOfficialReaderS3BoundPreviewSourceV1(input: Readonly<{
  token: OfficialReaderS3BoundPreviewSourceV1;
  freshAdmission: PreparedOfficialReadingReaderAdmissionV1;
  sourceCoverageCandidate: unknown;
}>): Readonly<{ storedResponseDigest: string }> {
  if (!input?.token || typeof input.token !== 'object'
      || input.token.version !== OFFICIAL_READER_S3_BOUND_PREVIEW_VERSION_V1
      || input.token.lifecycle !== 'preview'
      || input.token.canPersist !== false
      || input.token.canDisclose !== false) return unavailable();

  const original = issued.get(input.token);
  if (!original || original.used) return unavailable();
  original.used = true;

  try {
    const fresh = recordFrom(input.freshAdmission);
    if (hashSajuHeldSourceProofRequestV1(input.sourceCoverageCandidate)
        !== original.candidateDigest) return unavailable();
    const fields: readonly (keyof Omit<BoundRecord, 'used' | 'candidateDigest'>)[] = [
      'subjectId','readingId','threadId','readerCharacterId',
      'bundleId','releaseId','contentRevision',
      'productId','productSpecVersion','readingContractVersion',
      'officialArtifactResponseHash','storedResponseDigest',
    ];
    if (fields.some((field) => original[field] !== fresh[field])) {
      return unavailable();
    }
    return Object.freeze({ storedResponseDigest: original.storedResponseDigest });
  } catch {
    return unavailable();
  }
}
