import type { ContentReleaseRuntime } from '../../../packages/world-content/src/index.js';
import type {
  OfficialReadingCharacterGroundingProjectionPortV1,
} from './reader-interpretation-preview-runtime-v1.js';
import {
  runReaderInterpretationPreviewHttpV1,
  type ReaderInterpretationPreviewContextAuthorityPortV1,
  type ReaderInterpretationPreviewHttpResponseV1,
} from './reader-interpretation-preview-http.js';
import { createPostgresCharacterRelationshipReadAuthorityPortV1 } from './postgres-character-relationship-read.js';
import { createPostgresCharacterStandardReadingKnowledgePortsV1 } from './postgres-character-standard-reading-knowledge.js';
import { createPostgresChatThreadRuntimeBindingAuthorityPortV1 } from './postgres-chat-thread-runtime-binding.js';
import {
  createPostgresReaderContextMemoryGrantsAuthorityPortV1,
  createPostgresReaderContextMemoryItemsAuthorityPortV1,
} from './postgres-reader-context-memory.js';
import {
  createPostgresReaderContextNonMemoryReadAuthorityPortV1,
} from './postgres-reader-context-non-memory.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import {
  assertProductionReaderInterpretationActivationV1,
  parseProductionReaderInterpretationActivationConfigV1,
  type ProductionReaderInterpretationActivationEnvV1,
} from './production-reader-interpretation-activation.js';

export interface ExecuteReaderInterpretationPreviewPostgresInputV1 {
  readonly pool: PostgresSubjectPoolV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly effectiveAt: string;
  readonly body: unknown;
  readonly activationEnv: ProductionReaderInterpretationActivationEnvV1;
  readonly contentReleaseRuntime: ContentReleaseRuntime;
  readonly createContextAuthorityPort: (
    client: PostgresTransactionQueryV1,
  ) => ReaderInterpretationPreviewContextAuthorityPortV1;
  readonly groundingProjectionPort: OfficialReadingCharacterGroundingProjectionPortV1;
}

/**
 * Canonical subject-scoped PostgreSQL execution seam for Reader Interpretation Preview.
 *
 * All mutable owner-scoped Reader authorities are constructed from the same
 * transaction-local client after canonical subject resolution. Pinned immutable
 * content and non-content context authority remain explicit server-owned inputs;
 * this seam never substitutes browser Reader identity or development fixtures.
 */
export function executeReaderInterpretationPreviewPostgresV1(
  input: ExecuteReaderInterpretationPreviewPostgresInputV1,
): Promise<ReaderInterpretationPreviewHttpResponseV1> {
  const activationConfig =
    parseProductionReaderInterpretationActivationConfigV1(input.activationEnv);

  return executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: ({ resolvedSubject, client }) => {
      // The activation hash is derived only from the canonical subjects.id resolved
      // inside the transaction. Disabled/out-of-cohort requests stop here before
      // thread, Reading, content, relationship, Memory, or Saju authorities exist.
      assertProductionReaderInterpretationActivationV1({
        config: activationConfig,
        resolvedSubjectId: resolvedSubject.subjectId,
      });

      const knowledgePorts =
        createPostgresCharacterStandardReadingKnowledgePortsV1(client);

      return runReaderInterpretationPreviewHttpV1({
        resolvedSubjectId: resolvedSubject.subjectId,
        effectiveAt: input.effectiveAt,
        body: input.body,
        contextAuthorityPort: input.createContextAuthorityPort(client),
        contentReleaseRuntime: input.contentReleaseRuntime,
        threadBindingAuthorityPort:
          createPostgresChatThreadRuntimeBindingAuthorityPortV1(client),
        accessAuthorityPort: knowledgePorts.accessAuthorityPort,
        artifactAuthorityPort: knowledgePorts.artifactAuthorityPort,
        relationshipAuthorityPort:
          createPostgresCharacterRelationshipReadAuthorityPortV1(client),
        memoryItemsAuthorityPort:
          createPostgresReaderContextMemoryItemsAuthorityPortV1(client),
        memoryGrantsAuthorityPort:
          createPostgresReaderContextMemoryGrantsAuthorityPortV1(client),
        nonMemoryContextAuthorityPort:
          createPostgresReaderContextNonMemoryReadAuthorityPortV1(client),
        groundingProjectionPort: input.groundingProjectionPort,
      });
    },
  });
}
