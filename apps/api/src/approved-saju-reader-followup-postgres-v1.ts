import type { ChatReceivePlan } from './chat-receive.js';
import { prepareApprovedSajuReaderFollowupSourceV1 } from './character-standard-reading-chat-grounding-v2.js';
import type { CharacterStandardReadingChatTurnServerContextInputV1 } from './character-standard-reading-chat-turn-preflight.js';
import type { CharacterSajuConsultationShadowPortV1 } from './character-saju-consultation-shadow-v1.js';
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
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import type { ProductReaderEligibilityAuthorityPortV1 } from './product-reader-eligibility-policy-v1.js';
import {
  prepareReaderConversationResponseCandidateV1,
  reviewPreparedReaderConversationFollowupV1,
  type ReviewedPrivateReaderFollowupV1,
} from './reader-conversation-source-routing-v1.js';
import type { OfficialReadingCharacterGroundingProjectionPortV1 } from './reader-interpretation-preview-runtime-v1.js';
import {
  verifyArchivedSajuProductionIssueProofV1,
  type SajuProductionIssueProofTrustV1,
} from './saju-production-reading-issue-source-v1.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

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
  groundingProjectionPort: OfficialReadingCharacterGroundingProjectionPortV1;
  consultationPort: CharacterSajuConsultationShadowPortV1;
}>): Promise<Readonly<{
  reviewed: ReviewedPrivateReaderFollowupV1;
  productionSource: NonNullable<ReturnType<typeof verifyArchivedSajuProductionIssueProofV1>>;
}> | null> {
  if (input.verifiedEvidence.kind !== 'member' || input.consultationPort.evaluateBatch === undefined
      || input.issuanceProofPool === input.pool || input.productionIssueProofTrusts.length === 0) return null;
  const { pool, verifiedEvidence, readingId } = input;
  const prepared = await executePostgresSubjectTransactionV1({
    pool, verifiedEvidence,
    execute: async (scope) => {
      const { client } = scope;
      const threadBindingAuthorityPort = createPostgresChatThreadRuntimeBindingAuthorityPortV1(client);
      const nonMemoryContextAuthorityPort = createPostgresReaderContextNonMemoryReadAuthorityPortV1(client);
      const { preflight, grounded } = await prepareApprovedSajuReaderFollowupSourceV1({
        scope, readingId, receivePlan: input.receivePlan,
        effectiveAt: new Date().toISOString(), contextInput: input.contextInput,
        threadBindingAuthorityPort, nonMemoryContextAuthorityPort,
        relationshipAuthorityPort: createPostgresCharacterRelationshipReadAuthorityPortV1(client),
        memoryItemsAuthorityPort: createPostgresReaderContextMemoryItemsAuthorityPortV1(client),
        memoryGrantsAuthorityPort: createPostgresReaderContextMemoryGrantsAuthorityPortV1(client),
        productReaderEligibilityAuthorityPort: input.createProductReaderEligibilityAuthorityPort(client),
        groundingProjectionPort: input.groundingProjectionPort,
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
      if (candidate.mode !== 'official_followup_output_hold') return null;
      const outputHold = candidate.outputHold;
      const { artifactPort } = createPostgresApprovedSajuReadingAccessV1(client, readingId);
      const sources = await artifactPort.readArtifactSource({
        subjectId: outputHold.subjectId, readingId, readerCharacterId: outputHold.readerCharacterId,
        effectiveAt: outputHold.effectiveAt,
      });
      if (sources.length !== 1 || sources[0]?.responseHash !== outputHold.officialArtifactResponseHash) return null;
      return { outputHold, storedResponse: sources[0].responseSnapshotJsonb };
    },
  });
  if (prepared === null) return null;
  const { outputHold, storedResponse } = prepared;
  const receipt = await executePostgresApprovedSajuIssuerTransactionV1({
    pool: input.issuanceProofPool, verifiedEvidence,
    execute: async ({ client, resolvedSubject }) => {
      if (resolvedSubject.subjectId !== outputHold.subjectId) return null;
      const { rows } = await client.query<{ receipt: unknown }>(
        'select public.qry_approved_saju_source_issue_proof_v1($1::uuid,$2::uuid) as receipt',
        [outputHold.subjectId, readingId],
      );
      return rows.length === 1 ? rows[0]?.receipt : null;
    },
  });
  const productionSource = verifyArchivedSajuProductionIssueProofV1({
    receipt, trusts: input.productionIssueProofTrusts, readingId, storedResponse,
    storedResponseHash: outputHold.officialArtifactResponseHash,
  });
  if (productionSource === null) return null;
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
  return reviewed === null ? null : Object.freeze({ reviewed, productionSource });
}
