import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  CHAT_TURN_ABANDON_AUTHORITY_BINDING_V1,
  ChatTurnAbandonAuthorityPortErrorV1,
  abandonChatTurn,
  type ChatTurnAbandonAuthorityPortV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '71000000-0000-0000-0000-00000000b124';
const TURN_ID = '72000000-0000-0000-0000-00000000b124';

class FakeAuthorityPortV1 implements ChatTurnAbandonAuthorityPortV1 {
  readonly calls: Array<{ subjectId: string; turnId: string }> = [];
  result: boolean | Error = false;

  abandonTurn(input: { readonly subjectId: string; readonly turnId: string }): boolean {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
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

describe('Chat turn abandon API authority boundary', () => {
  it('pins POST /api/chat/turns/:turnId/abandon to the DB abandon command', () => {
    expect(CHAT_TURN_ABANDON_AUTHORITY_BINDING_V1).toBe(
      'public.cmd_abandon_chat_turn_v1',
    );
  });

  it('abandons an eligible owned turn through subject + turn identity only', async () => {
    const authorityPort = new FakeAuthorityPortV1();

    const result = await abandonChatTurn({
      resolvedSubjectId: SUBJECT_ID,
      turnId: TURN_ID,
      authorityPort,
    });

    expect(authorityPort.calls).toEqual([{ subjectId: SUBJECT_ID, turnId: TURN_ID }]);
    expect(result).toEqual({ turnId: TURN_ID, state: 'abandoned' });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('returns the same public response for an authoritative abandon replay', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    authorityPort.result = true;

    const result = await abandonChatTurn({
      resolvedSubjectId: SUBJECT_ID,
      turnId: TURN_ID,
      authorityPort,
    });

    expect(result).toEqual({ turnId: TURN_ID, state: 'abandoned' });
    expect(result).not.toHaveProperty('replayed');
  });

  it('rejects missing subject identity and blank turn identity before DB authority', async () => {
    const missingSubjectPort = new FakeAuthorityPortV1();
    await expectApiCode(
      abandonChatTurn({ turnId: TURN_ID, authorityPort: missingSubjectPort }),
      'AUTH_REQUIRED',
    );
    expect(missingSubjectPort.calls).toHaveLength(0);

    for (const turnId of [undefined, null, '', '   ', 42]) {
      const authorityPort = new FakeAuthorityPortV1();
      await expectApiCode(
        abandonChatTurn({
          resolvedSubjectId: SUBJECT_ID,
          turnId,
          authorityPort,
        }),
        'INVALID_REQUEST',
      );
      expect(authorityPort.calls).toHaveLength(0);
    }
  });

  it('accepts no client-controlled abandon body fields', async () => {
    const emptyBodyPort = new FakeAuthorityPortV1();
    await expect(
      abandonChatTurn({
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        request: {},
        authorityPort: emptyBodyPort,
      }),
    ).resolves.toEqual({ turnId: TURN_ID, state: 'abandoned' });

    for (const request of [
      null,
      [],
      'abandon',
      { revision: 1 },
      { expectedRevision: 1 },
      { idempotencyKey: 'invented-key' },
      { state: 'failed_retryable' },
      { replayed: false },
    ]) {
      const authorityPort = new FakeAuthorityPortV1();
      await expectApiCode(
        abandonChatTurn({
          resolvedSubjectId: SUBJECT_ID,
          turnId: TURN_ID,
          request,
          authorityPort,
        }),
        'INVALID_REQUEST',
      );
      expect(authorityPort.calls).toHaveLength(0);
    }
  });

  it('conceals unknown or cross-subject turns as NOT_FOUND', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    authorityPort.result = new ChatTurnAbandonAuthorityPortErrorV1(
      'TURN_NOT_FOUND',
      'raw ownership detail',
    );

    const error = await expectApiCode(
      abandonChatTurn({
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        authorityPort,
      }),
      'NOT_FOUND',
    );
    expect(error.message).not.toContain('raw ownership detail');
  });

  it('maps a nonterminal execution attempt to TURN_IN_FLIGHT without orphaning it', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    authorityPort.result = new ChatTurnAbandonAuthorityPortErrorV1(
      'ATTEMPT_IN_FLIGHT',
      'raw attempt detail',
    );

    const error = await expectApiCode(
      abandonChatTurn({
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        authorityPort,
      }),
      'TURN_IN_FLIGHT',
    );
    expect(error.message).not.toContain('raw attempt detail');
  });

  it('maps committed, delivered, or final terminal state to RESOURCE_GONE', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    authorityPort.result = new ChatTurnAbandonAuthorityPortErrorV1(
      'TURN_TERMINAL',
      'raw terminal detail',
    );

    const error = await expectApiCode(
      abandonChatTurn({
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        authorityPort,
      }),
      'RESOURCE_GONE',
    );
    expect(error.message).not.toContain('raw terminal detail');
  });

  it('rejects a non-eligible logical state without inventing a state transition', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    authorityPort.result = new ChatTurnAbandonAuthorityPortErrorV1(
      'TURN_NOT_ELIGIBLE',
      'raw lifecycle detail',
    );

    const error = await expectApiCode(
      abandonChatTurn({
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        authorityPort,
      }),
      'INVALID_REQUEST',
    );
    expect(error.message).not.toContain('raw lifecycle detail');
  });

  it('maps invalid trusted DB input without exposing raw authority detail', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    authorityPort.result = new ChatTurnAbandonAuthorityPortErrorV1(
      'INVALID_INPUT',
      'raw database constraint detail',
    );

    const error = await expectApiCode(
      abandonChatTurn({
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        authorityPort,
      }),
      'INVALID_REQUEST',
    );
    expect(error.message).not.toContain('raw database constraint detail');
  });

  it('fails closed if the authority does not return a boolean replay marker', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    authorityPort.result = 'false' as unknown as boolean;

    await expect(
      abandonChatTurn({
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        authorityPort,
      }),
    ).rejects.toThrow('invalid replay marker');
  });

  it('rethrows infrastructure failures unchanged', async () => {
    const authorityPort = new FakeAuthorityPortV1();
    const failure = new Error('database transport unavailable');
    authorityPort.result = failure;

    await expect(
      abandonChatTurn({
        resolvedSubjectId: SUBJECT_ID,
        turnId: TURN_ID,
        authorityPort,
      }),
    ).rejects.toBe(failure);
  });
});
