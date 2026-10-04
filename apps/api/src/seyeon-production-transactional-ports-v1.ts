import {
  createPostgresChatThreadRuntimeBindingAuthorityPortV1,
} from './postgres-chat-thread-runtime-binding.js';
import {
  createPostgresContentBundleManifestReadAuthorityPortV1,
} from './postgres-content-bundle-manifest-read-v1.js';
import {
  createPostgresSeyeonPostTurnAnalysisOutboxPortV1,
} from './postgres-seyeon-post-turn-analysis-worker-v1.js';
import {
  createPostgresSeyeonProductionChatPersistencePortV1,
} from './postgres-seyeon-production-chat-execution-v1.js';
import {
  createPostgresSeyeonProductionContextReadAuthorityPortV1,
} from './postgres-seyeon-production-context-read-v1.js';
import {
  createPostgresSeyeonProductionRelationshipSyncOutboxPortV1,
} from './postgres-seyeon-production-relationship-outbox-v1.js';
import {
  createPostgresSeyeonProductionRelationshipReadAuthorityPortV1,
} from './postgres-seyeon-production-relationship-read-v1.js';
import type {
  ChatThreadRuntimeBindingReadAuthorityPortV1,
} from './chat-thread-runtime-binding-read.js';
import type {
  ContentBundleManifestReadAuthorityPortV1,
} from './content-bundle-manifest-read.js';
import type {
  SeyeonPostTurnAnalysisOutboxPortV1,
} from './seyeon-post-turn-analysis-worker-v1.js';
import type {
  SeyeonProductionChatPersistencePortV1,
} from './seyeon-production-chat-execution-v1.js';
import type {
  SeyeonProductionContextReadAuthorityPortV1,
} from './seyeon-production-context-read-v1.js';
import type {
  SeyeonProductionRelationshipSyncOutboxPortV1,
} from './seyeon-production-relationship-outbox-v1.js';
import type {
  SeyeonProductionRelationshipReadAuthorityPortV1,
} from './seyeon-production-relationship-read-v1.js';
import type {
  SeyeonProductionSubjectTransactionRunnerV1,
} from './seyeon-production-subject-transaction-v1.js';

export interface SeyeonProductionTransactionalPortsV1 {
  readonly threadBinding: ChatThreadRuntimeBindingReadAuthorityPortV1;
  readonly bundleManifest: ContentBundleManifestReadAuthorityPortV1;
  readonly chatPersistence: SeyeonProductionChatPersistencePortV1;
  readonly relationshipRead: SeyeonProductionRelationshipReadAuthorityPortV1;
  readonly contextRead: SeyeonProductionContextReadAuthorityPortV1;
  readonly postTurnAnalysis: SeyeonPostTurnAnalysisOutboxPortV1;
  readonly relationshipSyncOutbox:
    SeyeonProductionRelationshipSyncOutboxPortV1;
}

function requireSubject(
  expectedSubjectId: string,
  actualSubjectId: string,
): void {
  if (
    expectedSubjectId.trim().toLowerCase() !==
    actualSubjectId.trim().toLowerCase()
  ) {
    throw new Error(
      'Se-yeon Production port received a different canonical Subject.',
    );
  }
}

export function createSeyeonProductionTransactionalPortsV1(input: {
  readonly subjectId: string;
  readonly runner: SeyeonProductionSubjectTransactionRunnerV1;
}): SeyeonProductionTransactionalPortsV1 {
  const { subjectId, runner } = input;

  const threadBinding: ChatThreadRuntimeBindingReadAuthorityPortV1 =
    Object.freeze({
      readRuntimeBinding(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresChatThreadRuntimeBindingAuthorityPortV1(client)
            .readRuntimeBinding(request),
        );
      },
    });

  const bundleManifest: ContentBundleManifestReadAuthorityPortV1 =
    Object.freeze({
      readBundleManifest(request) {
        return runner.run(subjectId, (client) =>
          createPostgresContentBundleManifestReadAuthorityPortV1(client)
            .readBundleManifest(request),
        );
      },
    });

  const chatPersistence: SeyeonProductionChatPersistencePortV1 =
    Object.freeze({
      receiveTurn(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonProductionChatPersistencePortV1(client)
            .receiveTurn(request),
        );
      },
      allocateAttempt(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonProductionChatPersistencePortV1(client)
            .allocateAttempt(request),
        );
      },
      markContextReady(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonProductionChatPersistencePortV1(client)
            .markContextReady(request),
        );
      },
      failAttempt(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonProductionChatPersistencePortV1(client)
            .failAttempt(request),
        );
      },
      persistGenerated(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonProductionChatPersistencePortV1(client)
            .persistGenerated(request),
        );
      },
      persistValidated(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonProductionChatPersistencePortV1(client)
            .persistValidated(request),
        );
      },
      commitTurn(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonProductionChatPersistencePortV1(client)
            .commitTurn(request),
        );
      },
    });

  const relationshipRead: SeyeonProductionRelationshipReadAuthorityPortV1 =
    Object.freeze({
      readCurrent(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonProductionRelationshipReadAuthorityPortV1(client)
            .readCurrent(request),
        );
      },
    });

  const contextRead: SeyeonProductionContextReadAuthorityPortV1 =
    Object.freeze({
      readPersonalRecords(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonProductionContextReadAuthorityPortV1(client)
            .readPersonalRecords(request),
        );
      },
      readRelationshipHistory(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonProductionContextReadAuthorityPortV1(client)
            .readRelationshipHistory(request),
        );
      },
      readRecentMessages(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonProductionContextReadAuthorityPortV1(client)
            .readRecentMessages(request),
        );
      },
    });

  const postTurnAnalysis: SeyeonPostTurnAnalysisOutboxPortV1 =
    Object.freeze({
      findByTurn(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonPostTurnAnalysisOutboxPortV1(client)
            .findByTurn(request),
        );
      },
      claim(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonPostTurnAnalysisOutboxPortV1(client)
            .claim(request),
        );
      },
      checkpoint(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonPostTurnAnalysisOutboxPortV1(client)
            .checkpoint(request),
        );
      },
      complete(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonPostTurnAnalysisOutboxPortV1(client)
            .complete(request),
        );
      },
    });

  const relationshipSyncOutbox: SeyeonProductionRelationshipSyncOutboxPortV1 =
    Object.freeze({
      enqueue(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonProductionRelationshipSyncOutboxPortV1(client)
            .enqueue(request),
        );
      },
      claim(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonProductionRelationshipSyncOutboxPortV1(client)
            .claim(request),
        );
      },
      complete(request) {
        requireSubject(subjectId, request.subjectId);
        return runner.run(subjectId, (client) =>
          createPostgresSeyeonProductionRelationshipSyncOutboxPortV1(client)
            .complete(request),
        );
      },
    });

  return Object.freeze({
    threadBinding,
    bundleManifest,
    chatPersistence,
    relationshipRead,
    contextRead,
    postTurnAnalysis,
    relationshipSyncOutbox,
  });
}
