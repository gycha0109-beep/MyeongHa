import {
  consumeOfficialReadingReaderAdmissionV1,
  type OfficialReadingReaderAdmissionScopeV1,
  type PreparedOfficialReadingReaderAdmissionV1,
} from './official-reading-reader-admission-v1.js';
import {
  encryptOfficialReaderProtectedBodyV1,
  type OfficialReaderProtectedBodyIdentityV1,
  type OfficialReaderProtectedBodyKeyV1,
} from './official-reader-protected-body-crypto-v1.js';
import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';
import { preflightOfficialReaderS3FromAdmittedArtifactV1 } from './official-reader-s3-authoritative-artifact-coverage-v1.js';
import {
  consumeOfficialReaderS3BoundPreviewSourceV1,
  type OfficialReaderS3BoundPreviewSourceV1,
} from './official-reader-private-s3-source-binding-v1.js';
import {
  assertOfficialReaderPrivateCurrentVerifiedPurchaseV1,
} from './official-reader-private-exact-verified-purchase-guard-v1.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectExecutionScopeV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

export const OFFICIAL_READER_PRIVATE_PAID_COMMIT_VERSION_V1 =
  'official-reader-s5-protected-answer-commit-v1' as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CURRENT_CLOCK_SQL = 'select clock_timestamp()::text as "effectiveAt"';
const COMMIT_SQL = `
  select public.internal_commit_official_reader_paid_answer_v1(
    $1::jsonb, $2::bytea, $3::bytea, $4::bytea
  ) as "result"
`;

export interface PrivateOfficialReaderPaidAnswerStagedV1 {
  /**
   * Minted during T1 on server authority, then the private generation ran
   * OUTSIDE the T1/T2 database transactions.
   */
  readonly originalAdmission: PreparedOfficialReadingReaderAdmissionV1;
  readonly turnId: string;
  readonly attemptId: string;
  readonly bodyId: string;
  readonly safeMessageId: string;
  /** Server-selected purchase-backed Grant; T2 SQL independently re-checks. */
  readonly originatingGrantId: string;
  /** Never send this generated text to ordinary Chat or an HTTP response. */
  readonly privateBody: string;
  /**
   * S3 coverage manifest produced for the private generation. It must match
   * the CURRENT independently stored Official Reading units at T2. This does
   * not replace Saju Owner Production source attestation.
   */
  readonly sourceCoverageCandidate: unknown;
  /**
   * One-use private T1 receipt from Saju's independently signed PREVIEW
   * transport, after exact source-unit coverage and DB-admitted snapshot.
   * This does NOT supply Production source authority or allow persistence.
   */
  readonly boundSignedPreviewSource: OfficialReaderS3BoundPreviewSourceV1;
  /**
   * Reserved for the Saju Owner's verified Production source assertion.
   * These field values alone cannot prove issuance: the S5 DB gate is HELD.
   */
  readonly productionSource: Readonly<{
    sourceAttestationRef: string;
    sourceResponseHash: string;
    semanticGuardVersion: string;
    outputGuardVersion: string;
  }>;
}

export interface PrivateOfficialReaderPaidAnswerCommittedV1 {
  readonly contractVersion: typeof OFFICIAL_READER_PRIVATE_PAID_COMMIT_VERSION_V1;
  readonly bodyId: string;
  readonly safeMessageId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly committedAt: string;
  readonly replayed: boolean;
}

export class PrivateOfficialReaderPaidAnswerCommitErrorV1 extends Error {
  readonly code = 'PAID_READER_COMMIT_UNAVAILABLE' as const;
  constructor() {
    super('Official Reader paid answer commit is not available.');
    this.name = 'PrivateOfficialReaderPaidAnswerCommitErrorV1';
  }
}

const PINNED_KEYS: readonly (keyof OfficialReadingReaderAdmissionScopeV1)[] =
  Object.freeze([
    'subjectId', 'threadId', 'contentRevision', 'readingId',
    'readerCharacterId', 'readerContentBundleId', 'contentReleaseId',
    'productId', 'productSpecVersion', 'sajuDomain',
    'readingContractVersion', 'officialArtifactResponseHash',
    'productRuleVersion', 'approvedPolicyRevision',
  ]);

function unavailable(): never {
  throw new PrivateOfficialReaderPaidAnswerCommitErrorV1();
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) return unavailable();
  return value.toLowerCase();
}

function nonEmpty(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value
      || value.length === 0 || value.length > 256) return unavailable();
  return value;
}

function assertCurrentScope(
  before: OfficialReadingReaderAdmissionScopeV1,
  current: OfficialReadingReaderAdmissionScopeV1,
): void {
  if (PINNED_KEYS.some((key) => before[key] !== current[key])) unavailable();
}

async function databaseClock(scope: PostgresSubjectExecutionScopeV1): Promise<string> {
  const result = await scope.client.query<{ effectiveAt: unknown }>(CURRENT_CLOCK_SQL);
  const at = result.rows[0]?.effectiveAt;
  if (result.rows.length !== 1 || typeof at !== 'string'
      || !Number.isFinite(Date.parse(at))) return unavailable();
  return at;
}

/**
 * S5 private backend implementation. The Source Owner supplies the verified
 * original admission and generation via a separate T1 private boundary; this
 * method performs a FRESH T2 admission and encrypts the already generated
 * answer before calling the single SQL atomic Writer.
 *
 * This is deliberately NOT exported as any HTTP handler or public delivery.
 * Saju Production authority, Privacy approved key/delete/restore operations,
 * and the positive S5 DB scope gate are not yet installed. No application
 * role has EXECUTE on the SQL writer, so the current call cannot persist.
 */
export async function commitPrivateOfficialReaderPaidAnswerV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly staged: PrivateOfficialReaderPaidAnswerStagedV1;
  readonly key: OfficialReaderProtectedBodyKeyV1;
  readonly prepareFreshAdmission: (
    scope: PostgresSubjectExecutionScopeV1,
    effectiveAt: string,
  ) => Promise<PreparedOfficialReadingReaderAdmissionV1>;
}): Promise<PrivateOfficialReaderPaidAnswerCommittedV1> {
  try {
    const staged = input.staged;
    const original = staged.originalAdmission.scope;
    const originalTicket = staged.originalAdmission.ticket;
    const proof = staged.productionSource;

    const turnId = uuid(staged.turnId);
    const attemptId = uuid(staged.attemptId);
    const bodyId = uuid(staged.bodyId);
    const safeMessageId = uuid(staged.safeMessageId);
    const originatingGrantId = uuid(staged.originatingGrantId);
    const sourceAttestationRef = nonEmpty(proof.sourceAttestationRef);
    const sourceResponseHash = nonEmpty(proof.sourceResponseHash);
    const semanticGuardVersion = nonEmpty(proof.semanticGuardVersion);
    const outputGuardVersion = nonEmpty(proof.outputGuardVersion);

    if (typeof staged.privateBody !== 'string'
        || staged.privateBody.trim().length === 0) return unavailable();

    return await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
      execute: async (scope) => {
        const effectiveAt = await databaseClock(scope);
        const current = await input.prepareFreshAdmission(scope, effectiveAt);
        if (current.scope.subjectId !== scope.resolvedSubject.subjectId
            || current.scope.effectiveAt !== effectiveAt
            || original.subjectId !== scope.resolvedSubject.subjectId) {
          return unavailable();
        }
        assertCurrentScope(original, current.scope);
        // Preserve Commerce refund as the authority. This locks the
        // exact official Reader scope with S1 and rechecks a currently
        // verified production Receipt for the pinned Bundle, before any
        // expensive private encryption or attempt at the atomic S5 Writer.
        // Calling the S5 commit directly cannot bypass this additional
        // current-purchase gate.
        await assertOfficialReaderPrivateCurrentVerifiedPurchaseV1({
          scope, admission: current,
        });
        // The signed PREVIEW envelope is verified in T1, outside S1/DB
        // locks. This one-use receipt binds those authenticated bytes to
        // exactly this fresh T2 DB-admitted artifact without Saju I/O here.
        const signedPreview = consumeOfficialReaderS3BoundPreviewSourceV1({
          token: staged.boundSignedPreviewSource,
          freshAdmission: current,
          sourceCoverageCandidate: staged.sourceCoverageCandidate,
        });
        const sourceDigest = hashSajuHeldSourceProofRequestV1(
          current.source.responseSnapshotJsonb,
        );
        if (signedPreview.storedResponseDigest !== sourceDigest
            || sourceResponseHash !== `sha256:v1:${sourceDigest}`) {
          return unavailable();
        }
        const sourceCoverage = preflightOfficialReaderS3FromAdmittedArtifactV1({
          scope: current.scope,
          source: current.source,
          candidate: staged.sourceCoverageCandidate,
        });
        if (sourceCoverage.state !== 'held'
            || sourceCoverage.publicDisclosureAuthorized !== false
            || sourceCoverage.sourceAuthority !== 'NOT_EVALUATED') {
          return unavailable();
        }
        consumeOfficialReadingReaderAdmissionV1({
          ticket: current.ticket, expectedScope: current.scope,
        });
        consumeOfficialReadingReaderAdmissionV1({
          ticket: originalTicket, expectedScope: original,
        });

        const present = current.scope;
        const identity: OfficialReaderProtectedBodyIdentityV1 = {
          subjectId: uuid(present.subjectId),
          threadId: uuid(present.threadId),
          turnId,
          attemptId,
          safeMessageId,
          officialReadingId: uuid(present.readingId),
          readerCharacterId: nonEmpty(present.readerCharacterId),
          readerContentBundleId: uuid(present.readerContentBundleId),
          contentReleaseId: uuid(present.contentReleaseId),
          originatingEntitlementGrantId: originatingGrantId,
          productId: uuid(present.productId),
          sourceResponseHash,
        };

        const encrypted = encryptOfficialReaderProtectedBodyV1({
          identity,
          body: staged.privateBody,
          key: input.key,
        });
        const request = {
          contractVersion: OFFICIAL_READER_PRIVATE_PAID_COMMIT_VERSION_V1,
          subjectId: identity.subjectId,
          threadId: identity.threadId,
          turnId, attemptId, bodyId, safeMessageId,
          officialReadingId: identity.officialReadingId,
          readerCharacterId: identity.readerCharacterId,
          readerContentBundleId: identity.readerContentBundleId,
          contentReleaseId: identity.contentReleaseId,
          contentRevision: present.contentRevision,
          originatingGrantId,
          productId: identity.productId,
          productSpecVersion: present.productSpecVersion,
          officialArtifactResponseHash: present.officialArtifactResponseHash,
          sourceAttestationRef,
          sourceResponseHash,
          semanticGuardVersion,
          outputGuardVersion,
          encryptionKeyRef: encrypted.keyRef,
        };

        const response = await scope.client.query<{ result: unknown }>(
          COMMIT_SQL,
          [
            JSON.stringify(request),
            Buffer.from(encrypted.iv),
            Buffer.from(encrypted.authTag),
            Buffer.from(encrypted.ciphertext),
          ],
        );
        const row = response.rows[0]?.result;
        if (response.rows.length !== 1 || typeof row !== 'object'
            || row === null || Array.isArray(row)) return unavailable();
        const result = row as Record<string, unknown>;
        if (result.contractVersion !== OFFICIAL_READER_PRIVATE_PAID_COMMIT_VERSION_V1
            || result.bodyId !== bodyId || result.turnId !== turnId
            || result.attemptId !== attemptId
            || result.safeMessageId !== safeMessageId
            || typeof result.replayed !== 'boolean'
            || typeof result.committedAt !== 'string'
            || !Number.isFinite(Date.parse(result.committedAt))) {
          return unavailable();
        }
        return Object.freeze({
          contractVersion: OFFICIAL_READER_PRIVATE_PAID_COMMIT_VERSION_V1,
          bodyId, safeMessageId, turnId, attemptId,
          committedAt: result.committedAt,
          replayed: result.replayed,
        });
      },
    });
  } catch {
    // Do not propagate generated Saju text, SQL parameters or provider errors.
    return unavailable();
  }
}
