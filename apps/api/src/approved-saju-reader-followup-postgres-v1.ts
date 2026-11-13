import type { ChatReceivePlan } from './chat-receive.js';
import { prepareApprovedSajuReaderFollowupSourceV1 } from './character-standard-reading-chat-grounding-v2.js';
import type { CharacterStandardReadingChatTurnServerContextInputV1 } from './character-standard-reading-chat-turn-preflight.js';
import {
  recheckCurrentReaderQuestionAdmissionV1,
  type CharacterStandardReaderOutputHoldV1,
} from './character-standard-reading-chat-bounded-candidate-v1.js';
import { CHARACTER_OUTPUT_GUARD_VERSION_V1 } from '../../../packages/domain/src/index.js';
import { renderGroundedStandardReaderSceneV2 } from './reader-interpretation-preview-runtime-v2.js';
import type { CharacterSajuConsultationShadowPortV1 } from './character-saju-consultation-shadow-v1.js';
import {
  encryptOfficialReaderProtectedBodyV1,
  type OfficialReaderProtectedBodyIdentityV1,
  type OfficialReaderProtectedBodyKeyV1,
} from './official-reader-protected-body-crypto-v1.js';
import {
  createPostgresApprovedSajuReadingAccessV1,
  readPostgresApprovedSajuCanonicalReaderV1,
} from './postgres-approved-saju-reading-access-v1.js';
import { createPostgresCharacterRelationshipReadAuthorityPortV1 } from './postgres-character-relationship-read.js';
import { createPostgresChatThreadRuntimeBindingAuthorityPortV1 } from './postgres-chat-thread-runtime-binding.js';
import {
  createPostgresReaderContextMemoryGrantsAuthorityPortV1,
  createPostgresReaderContextMemoryItemsAuthorityPortV1,
} from './postgres-reader-context-memory.js';
import { createPostgresReaderContextNonMemoryReadAuthorityPortV1 } from './postgres-reader-context-non-memory.js';
import { createPostgresStandardFollowupAnchorAuthorityPortV1 } from './postgres-standard-followup-anchor-v1.js';
import {
  executePostgresApprovedSajuPaidAnswerTransactionV1,
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import type { ProductReaderEligibilityAuthorityPortV1 } from './product-reader-eligibility-policy-v1.js';
import {
  consumeReviewedPrivateReaderFollowupBodyV1,
  reviewPreparedPurchasedReaderQuestionV1,
  type ReaderFollowupCurrentAuthorityV1,
  type ReviewedPrivateReaderFollowupV1,
} from './reader-conversation-source-routing-v1.js';
import type { SajuProductionIssueProofTrustV1 } from './saju-production-reading-issue-source-v1.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

type CanonicalReaderProjectionV1 = Awaited<ReturnType<typeof readPostgresApprovedSajuCanonicalReaderV1>>;

export type ApprovedSajuReaderConsultationFactoryV1 = (scope: Readonly<{
  evaluationId: string;
  officialReadingRef: string;
  sourceResponseHash: string;
}>) => CharacterSajuConsultationShadowPortV1;

type PreparedApprovedSajuReaderFollowupV1 = Readonly<{
  reviewed: ReviewedPrivateReaderFollowupV1;
  productionSource: CanonicalReaderProjectionV1['issueIdentity'];
}>;

type ProtectedReaderCommitSource = Pick<CharacterStandardReaderOutputHoldV1,
  'subjectId' | 'threadId' | 'readingRef' | 'readerCharacterId' | 'readerContentBundleId' |
  'contentReleaseId' | 'productId' | 'contentRevision' | 'officialArtifactResponseHash' |
  'guardVersion' | 'groundingHash' | 'sourceUnitRefs' | 'focusedUnitRef'
> & Readonly<{ assistantAnchorMessageId: string | null }>;

const preparedPrivateCommits = new WeakMap<PreparedApprovedSajuReaderFollowupV1, Readonly<{
  protectedPool: PostgresSubjectPoolV1;
  outputHold: ProtectedReaderCommitSource;
  originatingGrantId: string;
  clientTurnId: string;
  requestHash: string;
}>>();

/** Private candidate preparation for the exact purchased Reading. Protected commit is separate. */
export async function prepareApprovedSajuReaderFollowupPostgresV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  issuanceProofPool: PostgresSubjectPoolV1;
  protectedPool: PostgresSubjectPoolV1;
  productionIssueProofTrusts: readonly SajuProductionIssueProofTrustV1[];
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readingId: string;
  receivePlan: ChatReceivePlan;
  contextInput: CharacterStandardReadingChatTurnServerContextInputV1;
  createProductReaderEligibilityAuthorityPort: (
    client: PostgresTransactionQueryV1,
  ) => ProductReaderEligibilityAuthorityPortV1;
  evaluationId: string;
  createConsultationPort: ApprovedSajuReaderConsultationFactoryV1;
  /** The browser may nominate a displayed scene index and hash, never a unit or source. */
  firstSceneQuestion?: Readonly<{ interpretationHash: string; segmentIndex: number }>;
}>): Promise<PreparedApprovedSajuReaderFollowupV1 | null> {
  if (input.verifiedEvidence.kind !== 'member'
      || input.issuanceProofPool === input.pool || input.protectedPool === input.pool
      || input.protectedPool === input.issuanceProofPool || input.productionIssueProofTrusts.length === 0) return null;
  const { pool, protectedPool, verifiedEvidence, readingId } = input;
  const firstSceneQuestion = input.firstSceneQuestion === undefined ? undefined : { ...input.firstSceneQuestion };
  const anchorAuthorityPort = {
    readLatestValidatedAnchor: (coordinates: Parameters<
      ReturnType<typeof createPostgresStandardFollowupAnchorAuthorityPortV1>['readLatestValidatedAnchor']
    >[0]) => executePostgresApprovedSajuPaidAnswerTransactionV1({
      pool: protectedPool, verifiedEvidence,
      execute: ({ client, resolvedSubject }) => {
        if (resolvedSubject.subjectId !== coordinates.subjectId) throw new Error('Reader subject changed.');
        return createPostgresStandardFollowupAnchorAuthorityPortV1(client, 'approved_saju')
          .readLatestValidatedAnchor(coordinates);
      },
    }),
  };
  const prepared = await executePostgresSubjectTransactionV1({
    pool, verifiedEvidence,
    execute: async (scope) => {
      const { client } = scope;
      const threadBindingAuthorityPort = createPostgresChatThreadRuntimeBindingAuthorityPortV1(client);
      const nonMemoryContextAuthorityPort = createPostgresReaderContextNonMemoryReadAuthorityPortV1(client);
      const source: { value?: CanonicalReaderProjectionV1 } = {};
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
            source.value = await readPostgresApprovedSajuCanonicalReaderV1({
              authority: { pool: input.issuanceProofPool, trusts: input.productionIssueProofTrusts },
              verifiedEvidence, subjectId: scope.resolvedSubject.subjectId, artifact,
            });
            return source.value.grounding;
          },
        },
      });
      if (source.value === undefined) return null;
      const { issueIdentity: productionSource, originatingGrantId } = source.value;
      return { preflight, grounded, productionSource, originatingGrantId };
    },
  });
  if (prepared === null) return null;
  const { preflight, productionSource, originatingGrantId } = prepared;
  const withCurrentAuthority = <T>(check: (authority: ReaderFollowupCurrentAuthorityV1) => Promise<T>) =>
    executePostgresSubjectTransactionV1({
      pool, verifiedEvidence,
      execute: ({ client, resolvedSubject }) => {
        if (resolvedSubject.subjectId !== preflight.scope.subjectId) throw new Error('Reader subject changed.');
        const { accessPort, artifactPort, purchasePort } = createPostgresApprovedSajuReadingAccessV1(client, readingId);
        return check({
          threadBindingAuthorityPort: createPostgresChatThreadRuntimeBindingAuthorityPortV1(client),
          accessAuthorityPort: accessPort, artifactAuthorityPort: artifactPort,
          currentVerifiedPurchaseAuthorityPort: purchasePort,
          productReaderEligibilityAuthorityPort: input.createProductReaderEligibilityAuthorityPort(client),
          anchorAuthorityPort,
          useApprovedSajuAnchorContinuity: true,
        });
      },
    });

  const question = await reviewPreparedPurchasedReaderQuestionV1({
    preflight, grounded: prepared.grounded, guardedScene: renderGroundedStandardReaderSceneV2(prepared.grounded),
    ...(firstSceneQuestion === undefined ? {} : { firstSceneQuestion }),
    anchorAuthorityPort, port: input.createConsultationPort({
      evaluationId: input.evaluationId, officialReadingRef: preflight.scope.readingId,
      sourceResponseHash: productionSource.nativeSourceResponseHash,
    }),
    recheckCurrent: () => withCurrentAuthority(async authority => {
      await recheckCurrentReaderQuestionAdmissionV1({ ...authority, preflight });
    }),
  });
  if (question === null) return null;
  const { readingId: readingRef, ...scope } = preflight.scope;
  const outputHold: ProtectedReaderCommitSource = {
    ...scope, readingRef, guardVersion: CHARACTER_OUTPUT_GUARD_VERSION_V1,
    assistantAnchorMessageId: question.previousSafeMessageId,
    groundingHash: prepared.grounded.grounding.groundingHash, sourceUnitRefs: question.sourceUnitRefs,
    focusedUnitRef: question.focusedUnitRef,
  };
  const { reviewed } = question;
  const result = Object.freeze({ reviewed, productionSource });
  preparedPrivateCommits.set(result, {
    protectedPool, outputHold, originatingGrantId,
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
  if (staged === undefined || input.protectedPool !== staged.protectedPool ||
    input.verifiedEvidence.kind !== 'member') return null;
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
          groundingHash: outputHold.groundingHash, sourceUnitRefs: outputHold.sourceUnitRefs,
          focusedUnitRef: outputHold.focusedUnitRef,
          previousSafeMessageId: outputHold.assistantAnchorMessageId,
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
