import { describe, expect, it, vi } from 'vitest';

import {
  createPostgresSeyeonProductionChatPersistencePortV1,
} from '../apps/api/src/postgres-seyeon-production-chat-execution-v1.js';
import type {
  PostgresTransactionQueryV1,
} from '../apps/api/src/postgres-subject-execution.js';

function client(rows: readonly unknown[]): PostgresTransactionQueryV1 {
  return {
    query: vi.fn(async () => ({ rows })),
  } as unknown as PostgresTransactionQueryV1;
}

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const TURN_ID = '33333333-3333-4333-8333-333333333333';
const USER_MESSAGE_ID = '44444444-4444-4444-8444-444444444444';
const ATTEMPT_ID = '55555555-5555-4555-8555-555555555555';

describe('Se-yeon Production Chat PostgreSQL adapter', () => {
  it('maps the narrow receive runtime result', async () => {
    const queryClient = client([{
      turnId: TURN_ID,
      userMessageId: USER_MESSAGE_ID,
      userText: '안녕하세요',
      threadCharacterId: '66666666-6666-4666-8666-666666666666',
      contentReleaseId: '77777777-7777-4777-8777-777777777777',
      contentBundleId: '88888888-8888-4888-8888-888888888888',
      replayed: false,
    }]);
    const port = createPostgresSeyeonProductionChatPersistencePortV1(queryClient);

    await expect(port.receiveTurn({
      subjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      turnId: TURN_ID,
      userMessageId: USER_MESSAGE_ID,
      clientTurnId: 'client-1',
      requestHash: 'sha256:v1:test',
      requestContractVersion: 'chat-request-v1',
      requestSnapshot: { text: '안녕하세요' },
      resolvedContentReleaseId: '77777777-7777-4777-8777-777777777777',
      resolvedContentBundleId: '88888888-8888-4888-8888-888888888888',
      userText: '안녕하세요',
      userContentHash: 'sha256:v1:user',
    })).resolves.toEqual(expect.objectContaining({
      turnId: TURN_ID,
      userMessageId: USER_MESSAGE_ID,
      userText: '안녕하세요',
      replayed: false,
    }));

    expect(queryClient.query).toHaveBeenCalledWith(
      expect.stringContaining('cmd_receive_seyeon_chat_turn_runtime_v1'),
      expect.arrayContaining([SUBJECT_ID, THREAD_ID, 'client-1']),
    );
  });

  it('maps attempt allocation and commit provenance', async () => {
    const attemptClient = client([{
      attemptId: ATTEMPT_ID,
      attemptNo: 1,
      replayed: false,
    }]);
    const attemptPort =
      createPostgresSeyeonProductionChatPersistencePortV1(attemptClient);

    await expect(attemptPort.allocateAttempt({
      subjectId: SUBJECT_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      plannerVersion: 'seyeon-production-chat-planner-v1',
    })).resolves.toEqual({
      attemptId: ATTEMPT_ID,
      attemptNo: 1,
      replayed: false,
    });

    const commitClient = client([{
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      assistantMessageId: '99999999-9999-4999-8999-999999999999',
      sequenceNo: '8',
      committedAt: '2026-10-03T08:00:00.000Z',
      replayed: false,
    }]);
    const commitPort =
      createPostgresSeyeonProductionChatPersistencePortV1(commitClient);

    await expect(commitPort.commitTurn({
      subjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      assistantMessageId: '99999999-9999-4999-8999-999999999999',
      outboxEventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })).resolves.toEqual({
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      assistantMessageId: '99999999-9999-4999-8999-999999999999',
      sequenceNo: 8,
      committedAt: '2026-10-03T08:00:00.000Z',
      replayed: false,
    });
  });

  it('uses the narrow generated and validated runtime functions', async () => {
    const queryClient = client([{ replayed: false }]);
    const port = createPostgresSeyeonProductionChatPersistencePortV1(queryClient);

    await port.persistGenerated({
      subjectId: SUBJECT_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      threadCharacterId: '66666666-6666-4666-8666-666666666666',
      aiExecutionLogId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      providerKey: 'test-provider',
      modelKey: 'test-model',
      rendererVersion: 'seyeon-character-runtime-v2',
      bodyText: '세연 답변',
      messagePayload: { schemaVersion: 'seyeon-dialogue-envelope-v2' },
      messageSchemaVersion: 'seyeon-dialogue-envelope-v2',
      contentHash: 'sha256:v1:generated',
      groundingRefs: [],
    });

    expect(queryClient.query).toHaveBeenCalledWith(
      expect.stringContaining('cmd_persist_seyeon_chat_generated_runtime_v1'),
      expect.arrayContaining(['test-provider', 'test-model']),
    );

    await port.persistValidated({
      subjectId: SUBJECT_ID,
      turnId: TURN_ID,
      attemptId: ATTEMPT_ID,
      aiExecutionLogId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      providerKey: 'test-reviewer',
      modelKey: 'test-review-model',
      outputGuardVersion: 'seyeon-semantic-review-v2',
      generatedContentHash: 'sha256:v1:generated',
      validationResult: { passed: true },
      groundingRefs: [],
    });

    expect(queryClient.query).toHaveBeenCalledWith(
      expect.stringContaining('cmd_persist_seyeon_chat_validated_runtime_v1'),
      expect.arrayContaining(['test-reviewer', 'test-review-model']),
    );
  });
});
