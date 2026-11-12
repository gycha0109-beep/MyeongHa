import type { ChatReceivePlan } from './chat-receive.js';
import { prepareApprovedSajuReaderFollowupSourceV1 } from './character-standard-reading-chat-grounding-v2.js';
import type { CharacterStandardReadingChatTurnServerContextInputV1 } from './character-standard-reading-chat-turn-preflight.js';
import type { CharacterStandardReaderOutputHoldV1 } from './character-standard-reading-chat-bounded-candidate-v1.js';
import type { CharacterSajuConsultationShadowPortV1 } from './character-saju-consultation-shadow-v1.js';
import {
  encryptOfficialReaderProtectedBodyV1,
  type OfficialReaderProtectedBodyIdentityV1,
  type OfficialReaderProtectedBodyKeyV1,
} from './official-reader-protected-body-crypto-v1.js';
import { createPostgresApprovedSajuReadingAccessV1 } from './postgres-approved-saju-reading-access-v1.js';
import { createPostgresCharacterRelationshipReadAuthorityPortV1 } from './postgres-character-relationship-read.js';
import { createPostgresChatThreadRuntimeBindingAuthorityPortV1 } from './postgres-chat-thread-runtime-binding.js';
import {
  createPostgresReaderContextMemoryGrantsAuthorityPortV1,
  createPostgresReaderContextMemoryItemsAuthorityPortV1,
} from './postgres-reader-context-memory.js';
import { createPostgresReaderContextNonMemoryReadAuthorityPortV1 } from './postgres-reader-context-non-memory.js';
import { createPostgresStandardFollowupAnchorAuthorityPortV1 } from './postgres-standard-followup-anchor-v1.js';
import {
  executePostgresApprovedSajuIssuerTransactionV1,
  executePostgresApprovedSajuPaidAnswerTransactionV1,
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import type { ProductReaderEligibilityAuthorityPortV1 } from './product-reader-eligibility-policy-v1.js';
import {
  consumeReviewedPrivateReaderFollowupBodyV1,
  prepareReaderConversationResponseCandidateV1,
  reviewPreparedReaderConversationFollowupV1,
  type ReviewedPrivateReaderFollowupV1,
} from './reader-conversation-source-routing-v1.js';
import { projectSajuCanonicalReaderGroundingV1 } from './saju-canonical-reader-source-v1.js';
import {
  verifyArchivedSajuProductionIssueProofV1,
  type SajuProductionIssueProofTrustV1,
} from './saju-production-reading-issue-source-v1.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

type VerifiedReaderIssueIdentityV1 = Omit<
  NonNullable<ReturnType<typeof verifyArchivedSajuProductionIssueProofV1>>, 'readerSource'
>;

type PreparedApprovedSajuReaderFollowupV1 = Readonly<{
  reviewed: ReviewedPrivateReaderFollowupV1;
  productionSource: VerifiedReaderIssueIdentityV1;
}>;

const preparedPrivateCommits = new WeakMap<PreparedApprovedSajuReaderFollowupV1, Readonly<{
  ordinaryPool: PostgresSubjectPoolV1;
  issuerPool: PostgresSubjectPoolV1;
  outputHold: CharacterStandardReaderOutputHoldV1;
  originatingGrantId: string;
  clientTurnId: string;
  requestHash: string;
}>>();

/** Private candidate preparation for the exact purchased Reading. Protected commit is separate. */
export async function prepareApprovedSajuReaderFollowupPostgresV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  issuanceProofPool: PostgresSubjectPoolV1;
  productionIssueProofTrusts: readonly SajuProductionIssueProofTrustV1[];
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readingId: string;
  receivePlan: ChatReceivePlan;
  contextInput: CharacterStandardReadingChatTurnServerContextInputV1;
  createProductReaderEligibilityAuthorityPort: (
    client: PostgresTransactionQueryV1,
  ) => ProductReaderEligibilityAuthorityPortV1;
  consultationPort: CharacterSajuConsultationShadowPortV1;
}>): Promise<PreparedApprovedSajuReaderFollowupV1 | null> {
  if (input.verifiedEvidence.kind !== 'member' || input.consultationPort.evaluateBatch === undefined
      || input.issuanceProofPool === input.pool || input.productionIssueProofTrusts.length === 0) return null;
  const { pool, verifiedEvidence, readingId } = input;
  const prepared = await executePostgresSubjectTransactionV1({
    pool, verifiedEvidence,
    execute: async (scope) => {
      const { client } = scope;
      const threadBindingAuthorityPort = createPostgresChatThreadRuntimeBindingAuthorityPortV1(client);
      const nonMemoryContextAuthorityPort = createPostgresReaderContextNonMemoryReadAuthorityPortV1(client);
      const source: {
        verified?: VerifiedReaderIssueIdentityV1;
        originatingGrantId?: string;
      } = {};
      const { preflight, grounded } = await prepareApprovedSajuReaderFollowupSourceV1({
        scope, readingId, receivePlan: input.receivePlan,
        effectiveAt: new Date().toISOString(), contextInput: input.contextInput,
        threadBindingAuthorityPort, nonMemoryContextAuthorityPort,
        relationshipAuthorityPort: createPostgresCharacterRelationshipReadAuthorityPortV1(client),
        memoryItemsAuthorityPort: createPostgresReaderContextMemoryItemsAuthorityPortV1(client),
        memoryGrantsAuthorityPort: createPostgresReaderContextMemoryGrantsAuthorityPortV1(client),
        productReaderEligibilityAuthorityPort: input.createProductReaderEligibilityAuthorityPort(client),
        groundingProjectionPort: {
          async projectGrounding(artifact) {
            const receipt = await executePostgresApprovedSajuIssuerTransactionV1({
              pool: input.issuanceProofPool, verifiedEvidence,
              execute: async ({ client: issuer, resolvedSubject }) => {
                if (resolvedSubject.subjectId !== scope.resolvedSubject.subjectId) return null;
                const { rows } = await issuer.query<{ receipt: unknown }>(
                  'select public.qry_approved_saju_source_issue_proof_v1($1::uuid,$2::uuid) as receipt',
                  [resolvedSubject.subjectId, artifact.readingId],
                );
                return rows.length === 1 ? rows[0]?.receipt : null;
              },
            });
            const verified = verifyArchivedSajuProductionIssueProofV1({
              receipt, trusts: input.productionIssueProofTrusts, readingId: artifact.readingId,
              storedResponse: artifact.responseSnapshotJsonb, storedResponseHash: artifact.officialArtifactResponseHash,
            });
            const grant = (receipt as { originatingGrantId?: unknown } | null)?.originatingGrantId;
            if (verified?.readerSource === undefined || typeof grant !== 'string' ||
              !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(grant)) {
              throw new Error('Signed canonical Reader source is unavailable.');
            }
            source.verified = Object.freeze({
              sourceProofFingerprint: verified.sourceProofFingerprint,
              nativeSourceResponseHash: verified.nativeSourceResponseHash,
              executionAttemptId: verified.executionAttemptId,
            });
            source.originatingGrantId = grant;
            return projectSajuCanonicalReaderGroundingV1(verified.readerSource, {
              readingId: artifact.readingId, storedResponseHash: artifact.officialArtifactResponseHash,
              sajuDomain: artifact.sajuDomain,
            });
          },
        },
      });
      const candidate = await prepareReaderConversationResponseCandidateV1({
        userText: input.receivePlan.normalizedRequest.text,
        admittedDomain: grounded.scope.sajuDomain,
        official: {
          preflight, grounded,
          anchorAuthorityPort: createPostgresStandardFollowupAnchorAuthorityPortV1(client),
          recentMessageAuthorityPort: nonMemoryContextAuthorityPort,
          rendererDraft: {
            schemaVersion: 'v1', emotion: 'neutral',
            memoryProposals: [], relationshipEventProposals: [], suggestedActions: [],
          },
        },
      });
      if (candidate.mode !== 'official_followup_output_hold' ||
        source.verified === undefined || source.originatingGrantId === undefined) return null;
      return { outputHold: candidate.outputHold, productionSource: source.verified, originatingGrantId: source.originatingGrantId };
    },
  });
  if (prepared === null) return null;
  const { outputHold, productionSource, originatingGrantId } = prepared;
  const reviewed = await reviewPreparedReaderConversationFollowupV1({
    outputHold,
    port: input.consultationPort,
    withCurrentAuthority: (check) => executePostgresSubjectTransactionV1({
      pool, verifiedEvidence,
      execute: ({ client, resolvedSubject }) => {
        if (resolvedSubject.subjectId !== outputHold.subjectId) throw new Error('Reader subject changed.');
        const { accessPort, artifactPort, purchasePort } = createPostgresApprovedSajuReadingAccessV1(client, readingId);
        return check({
          threadBindingAuthorityPort: createPostgresChatThreadRuntimeBindingAuthorityPortV1(client),
          accessAuthorityPort: accessPort, artifactAuthorityPort: artifactPort,
          currentVerifiedPurchaseAuthorityPort: purchasePort,
          productReaderEligibilityAuthorityPort: input.createProductReaderEligibilityAuthorityPort(client),
          anchorAuthorityPort: createPostgresStandardFollowupAnchorAuthorityPortV1(client),
          recentMessageAuthorityPort: createPostgresReaderContextNonMemoryReadAuthorityPortV1(client),
        });
      },
    }),
  });
  if (reviewed === null) return null;
  const result = Object.freeze({ reviewed, productionSource });
  preparedPrivateCommits.set(result, {
    ordinaryPool: pool, issuerPool: input.issuanceProofPool, outputHold, originatingGrantId,
    clientTurnId: input.receivePlan.normalizedRequest.clientTurnId, requestHash: input.receivePlan.requestHash,
  });
  return result;
}

/** Commit one reviewed candidate to the existing encrypted store. No delivery or disclosure. */
export async function commitApprovedSajuReaderFollowupPostgresV1(input: Readonly<{
  protectedPool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  prepared: PreparedApprovedSajuReaderFollowupV1;
  turnId: string;
  attemptId: string;
  bodyId: string;
  safeMessageId: string;
  key: OfficialReaderProtectedBodyKeyV1;
}>): Promise<Readonly<{ bodyId: string; safeMessageId: string; committedAt: string; replayed: boolean }> | null> {
  const staged = preparedPrivateCommits.get(input.prepared);
  if (staged === undefined || input.protectedPool === staged.ordinaryPool ||
    input.protectedPool === staged.issuerPool || input.verifiedEvidence.kind !== 'member') return null;
  preparedPrivateCommits.delete(input.prepared);
  const { outputHold, originatingGrantId, clientTurnId, requestHash } = staged;
  const { prepared, turnId, attemptId, bodyId, safeMessageId } = input;
  try {
    return await executePostgresApprovedSajuPaidAnswerTransactionV1({
      pool: input.protectedPool,
      verifiedEvidence: input.verifiedEvidence,
      execute: async ({ client, resolvedSubject }) => {
        if (resolvedSubject.subjectId !== outputHold.subjectId) return null;
        const body = consumeReviewedPrivateReaderFollowupBodyV1(prepared.reviewed);
        if (body === null) return null;
        const identity: OfficialReaderProtectedBodyIdentityV1 = {
          subjectId: outputHold.subjectId,
          threadId: outputHold.threadId,
          turnId, attemptId, safeMessageId,
          officialReadingId: outputHold.readingRef,
          readerCharacterId: outputHold.readerCharacterId,
          readerContentBundleId: outputHold.readerContentBundleId,
          contentReleaseId: outputHold.contentReleaseId,
          originatingEntitlementGrantId: originatingGrantId,
          productId: outputHold.productId,
          sourceResponseHash: prepared.productionSource.nativeSourceResponseHash,
        };
        const cipher = encryptOfficialReaderProtectedBodyV1({ identity, body, key: input.key });
        const request = {
          subjectId: identity.subjectId, threadId: identity.threadId,
          turnId, clientTurnId, requestHash, attemptId, bodyId, safeMessageId,
          readingId: identity.officialReadingId, readerCharacterId: identity.readerCharacterId,
          readerContentBundleId: identity.readerContentBundleId, contentReleaseId: identity.contentReleaseId,
          contentRevision: outputHold.contentRevision, originatingGrantId, productId: identity.productId,
          archiveResponseHash: outputHold.officialArtifactResponseHash,
          nativeSourceResponseHash: identity.sourceResponseHash, sourceAttemptId: prepared.productionSource.executionAttemptId,
          semanticGuardVersion: prepared.reviewed.evaluatorVersion, outputGuardVersion: outputHold.guardVersion,
          encryptionKeyRef: cipher.keyRef,
        };
        const { rows } = await client.query<{ result: {
          bodyId: unknown; safeMessageId: unknown; committedAt: unknown; replayed: unknown;
        } }>('select public.cmd_commit_approved_saju_paid_answer_v1($1::jsonb,$2::bytea,$3::bytea,$4::bytea) as result', [
          JSON.stringify(request), Buffer.from(cipher.iv), Buffer.from(cipher.authTag), Buffer.from(cipher.ciphertext),
        ]);
        const result = rows[0]?.result;
        if (rows.length !== 1 || result?.bodyId !== bodyId || result.safeMessageId !== safeMessageId ||
          typeof result.committedAt !== 'string' || !Number.isFinite(Date.parse(result.committedAt)) ||
          typeof result.replayed !== 'boolean') throw new Error('Invalid protected commit result.');
        return Object.freeze({ bodyId, safeMessageId, committedAt: result.committedAt, replayed: result.replayed });
      },
    });
  } catch {
    return null;
  }
}
