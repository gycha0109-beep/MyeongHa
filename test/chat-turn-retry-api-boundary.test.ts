import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/chat-receive.js';
import {
  CHAT_TURN_RETRY_AUTHORITY_BINDING_V1,
  ChatTurnRetryAuthorityPortErrorV1,
  retryChatTurn,
  type ChatTurnRetryAuthorityPortV1,
  type ChatTurnRetryAuthorityRowV1,
  type ChatTurnRetryExecutionMetadataPortV1,
} from '../apps/api/src/chat-turn-retry-command.js';

const SUBJECT_ID = '81000000-0000-0000-0000-00000000b125';
const TURN_ID = '82000000-0000-0000-0000-00000000b125';
const ATTEMPT_ID = '83000000-0000-0000-0000-00000000b125';

class FakeAuthorityPortV1 implements ChatTurnRetryAuthorityPortV1 {
  readonly calls: Array<{
    subjectId: string;
    turnId: string;
    attemptId: string;
    plannerVersion: string | null;
  }> = [];
  result: ChatTurnRetryAuthorityRowV1 | Error = {
    attemptId: ATTEMPT_ID,
    attemptNo: 2,
    replayed: false,
  };

  retryTurn(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly plannerVersion: string | null;
  }): ChatTurnRetryAuthorityRowV1 {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeExecutionMetadataPortV1 implements ChatTurnRetryExecutionMetadataPortV1 {
  calls = 0;
  result: { attemptId: string; plannerVersion: string | null } = {
    attemptId: ATTEMPT_ID,
    plannerVersion: 'planner-v2',
  };

  issueRetryAttemptMetadata(): {
    readonly attemptId: string;
    readonly plannerVersion: string | null;
  } {
    this.calls += 1;
    return this.result;
  }
}

async function expectApiCode(
  promise: Promise<unknown>,
  code: string,
): Promise<ApiCommandError> {
  try {
    await promise;
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
    return error as ApiCommandError;
  }
}

describe('Chat turn retry API authority boundary', () => {
  it('pins POST /api/chat/turns/:turnId/retry to the retry-only DB command', () => {
    expect(CHAT_TURN_RETRY_AUTHORITY_BINDING_V1).toBe(
      'public.cmd_retry_chat_turn_attempt_v1',
    );
  });

  it('issues server-owned attempt provenance and returns only the logical turn id', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    const executionMetadataPort = new FakeExecutionMetadataPortV1();

    const result = await retryChatTurn({
      resolvedSubjectId: SUBJECT_ID,
      turnId: TURN_ID,
      authorityPort,
      executionMetadataPort,
    });

    expect(executionMetadataPort.calls).toBe(1);
    expect(authorityPort.calls).toEqual([
      {
        subjectId: SUBJECT_ID,
        turnId: TURN_ID,
        attemptId: ATTEMPT_ID,
        plannerVersion: 'planner-v2',
      },
    ]);
    expect(result).toEqual({ turnId: TURN_ID });
    expect(result).not.toHaveProperty('attemptId');
    expect(result).not.toHaveProperty('attemptNo');
    expect(result).not.toHaveProperty('plannerVersion');
    expect(result).not.toHaveProperty('replayed');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('allows nullable planner provenance without fabricating a version', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    const executionMetadataPort = new FakeExecutionMetadataPortV1();
    executionMetadataPort.result = { attemptId: ATTEMPT_ID, plannerVersion: null };

    await retryChatTurn({
      resolvedSubjectId: SUBJECT_ID,
      turnId: TURN_ID,
      authorityPort,
      executionMetadataPort,
    });

    expect(authorityPort.calls[0]?.plannerVersion).toBeNull();
  });

  it('rejects missing subject identity and blank turn identity before metadata or DB authority', async () => {
    const missingSubjectAuthority = new FakeAuthorityPortV1();
    const missingSubjectMetadata = new FakeExecutionMetadataPortV1();
    await expectApiCode(
      retryChatTurn({
        turnId: TURN_ID,
        authorityPort: missingSubjectAuthority,
        executionMetadataPort: missingSubjectMetadata,
      }),
      'AUTH_REQUIRED',
    );
    expect(missingSubjectAuthority.calls).toHaveLength(0);
    expect(missingSubjectMetadata.calls).toBe(0);

    for (const turnId of [undefined, null, '', '   ', 42]) {
      const authorityPort = new FakeAuthorityPortV1();
      const executionMetadataPort = new FakeExecutionMetadataPortV1();
      await expectApiCode(
        retryChatTurn({
          resolvedSubjectId: SUBJECT_ID,
          turnId,
          authorityPort,
          executionMetadataPort,
        }),
        'INVALID_REQUEST',
      );
      expect(authorityPort.calls).toHaveLength(0);
      expect(executionMetadataPort.calls).toBe(0);
    }
  });

  it('accepts no client-controlled retry body fields', async () => {
    const emptyBodyAuthority = new FakeAuthorityPortV1();
    const emptyBodyMetadata = new FakeExecutionMetadataPortV1();
    await expect(
      retryChatTurn({
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        request: {},
        authorityPort: emptyBodyAuthority,
        executionMetadataPort: emptyBodyMetadata,
      }),
    ).resolves.toEqual({ turnId: TURN_ID });

    for (const request of [
      null,
      [],
      'retry',
      { attemptId: ATTEMPT_ID },
      { attemptNo: 2 },
      { plannerVersion: 'client-planner' },
      { revision: 1 },
      { expectedRevision: 1 },
      { idempotencyKey: 'invented-key' },
      { state: 'failed_retryable' },
    ]) {
      const authorityPort = new FakeAuthorityPortV1();
      const executionMetadataPort = new FakeExecutionMetadataPortV1();
      await expectApiCode(
        retryChatTurn({
          resolvedSubjectId: SUBJECT_ID,
          turnId: TURN_ID,
          request,
          authorityPort,
          executionMetadataPort,
        }),
        'INVALID_REQUEST',
      );
      expect(authorityPort.calls).toHaveLength(0);
      expect(executionMetadataPort.calls).toBe(0);
    }
  });

  it('fails closed on invalid server-owned execution metadata before DB authority', async () => {
    for (const metadata of [
      { attemptId: '', plannerVersion: 'planner-v2' },
      { attemptId: '   ', plannerVersion: 'planner-v2' },
      { attemptId: ATTEMPT_ID, plannerVersion: '' },
      { attemptId: ATTEMPT_ID, plannerVersion: '   ' },
    ]) {
      const authorityPort = new FakeAuthorityPortV1();
      const executionMetadataPort = new FakeExecutionMetadataPortV1();
      executionMetadataPort.result = metadata;

      await expect(
        retryChatTurn({
          resolvedSubjectId: SUBJECT_ID,
          turnId: TURN_ID,
          authorityPort,
          executionMetadataPort,
        }),
      ).rejects.toThrow(/execution metadata/);
      expect(authorityPort.calls).toHaveLength(0);
    }
  });

  it('conceals unknown or cross-subject turns as NOT_FOUND', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    const executionMetadataPort = new FakeExecutionMetadataPortV1();
    authorityPort.result = new ChatTurnRetryAuthorityPortErrorV1(
      'TURN_NOT_FOUND',
      'raw ownership detail',
    );

    const error = await expectApiCode(
      retryChatTurn({
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        authorityPort,
        executionMetadataPort,
      }),
      'NOT_FOUND',
    );
    expect(error.message).not.toContain('raw ownership detail');
  });

  it('maps an already-started retry to TURN_IN_FLIGHT', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    const executionMetadataPort = new FakeExecutionMetadataPortV1();
    authorityPort.result = new ChatTurnRetryAuthorityPortErrorV1(
      'ATTEMPT_IN_FLIGHT',
      'raw attempt detail',
    );

    const error = await expectApiCode(
      retryChatTurn({
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        authorityPort,
        executionMetadataPort,
      }),
      'TURN_IN_FLIGHT',
    );
    expect(error.message).not.toContain('raw attempt detail');
  });

  it('maps terminal turns to RESOURCE_GONE and non-retryable states to INVALID_REQUEST', async () => {
    for (const [authorityCode, apiCode] of [
      ['TURN_TERMINAL', 'RESOURCE_GONE'],
      ['TURN_NOT_RETRYABLE', 'INVALID_REQUEST'],
      ['INVALID_INPUT', 'INVALID_REQUEST'],
    ] as const) {
      const authorityPort = new FakeAuthorityPortV1();
      const executionMetadataPort = new FakeExecutionMetadataPortV1();
      authorityPort.result = new ChatTurnRetryAuthorityPortErrorV1(
        authorityCode,
        'raw lifecycle detail',
      );

      const error = await expectApiCode(
        retryChatTurn({
          resolvedSubjectId: SUBJECT_ID,
          turnId: TURN_ID,
          authorityPort,
          executionMetadataPort,
        }),
        apiCode,
      );
      expect(error.message).not.toContain('raw lifecycle detail');
    }
  });

  it('fails closed if the DB authority returns a different, invalid, or replayed attempt', async () => {
    for (const row of [
      {
        attemptId: '84000000-0000-0000-0000-00000000b125',
        attemptNo: 2,
        replayed: false,
      },
      { attemptId: ATTEMPT_ID, attemptNo: 0, replayed: false },
      { attemptId: ATTEMPT_ID, attemptNo: 2.5, replayed: false },
      { attemptId: ATTEMPT_ID, attemptNo: 2, replayed: true },
    ]) {
      const authorityPort = new FakeAuthorityPortV1();
      const executionMetadataPort = new FakeExecutionMetadataPortV1();
      authorityPort.result = row;

      await expect(
        retryChatTurn({
          resolvedSubjectId: SUBJECT_ID,
          turnId: TURN_ID,
          authorityPort,
          executionMetadataPort,
        }),
      ).rejects.toThrow(/Chat turn retry authority/);
    }
  });

  it('rethrows metadata and DB infrastructure failures unchanged', async () => {
    const metadataFailure = new Error('metadata issuer unavailable');
    const metadataPort: ChatTurnRetryExecutionMetadataPortV1 = {
      issueRetryAttemptMetadata() {
        throw metadataFailure;
      },
    };
    await expect(
      retryChatTurn({
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        authorityPort: new FakeAuthorityPortV1(),
        executionMetadataPort: metadataPort,
      }),
    ).rejects.toBe(metadataFailure);

    const authorityFailure = new Error('database transport unavailable');
    const authorityPort = new FakeAuthorityPortV1();
    authorityPort.result = authorityFailure;
    await expect(
      retryChatTurn({
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        authorityPort,
        executionMetadataPort: new FakeExecutionMetadataPortV1(),
      }),
    ).rejects.toBe(authorityFailure);
  });
});
