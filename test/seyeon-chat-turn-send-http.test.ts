import { describe, expect, it } from 'vitest';
import { SeyeonProductionPinMigrationRequiredV1 } from '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import {
  handleSeyeonChatTurnSendRequestV1,
} from '../apps/api/src/chat-turn-send-http.js';

const THREAD_ID = '123e4567-e89b-42d3-a456-426614174000';
const TURN_ID = '223e4567-e89b-42d3-a456-426614174000';
const MESSAGE_ID = '323e4567-e89b-42d3-a456-426614174000';
const CLIENT_TURN_ID = '423e4567-e89b-42d3-a456-426614174000';

function memberVerifier() {
  return {
    verifyRequestIdentity: async () => Object.freeze({
      kind: 'member' as const,
      verifiedAuthUserId: 'auth-user',
    }),
  };
}

function request(body: unknown = { clientTurnId: CLIENT_TURN_ID, text: '안녕하세요.' }) {
  return new Request(`https://myeongha.internal/api/chat/${THREAD_ID}/turns`, {
    method: 'POST',
    headers: { authorization: 'Bearer member-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function replayResult() {
  return {
    runtimeVersion: 'production-seyeon-chat-runtime-v1',
    subjectId: 'subject',
    threadBinding: {} as never,
    bundleManifest: {} as never,
    execution: {
      version: 'seyeon-production-chat-execution-v1',
      disposition: 'committed_replay',
      receivedTurn: {} as never,
      committedTurn: {
        turnId: TURN_ID,
        attemptId: 'attempt',
        assistantMessageId: MESSAGE_ID,
        sequenceNo: 2,
        committedAt: '2026-10-07T00:00:00.000Z',
        postTurnOutboxEventId: null,
        replayed: true,
      },
      assistantText: '저장된 답변입니다.',
    },
  } as const;
}

describe('Seyeon Member turn-send HTTP', () => {
  it('blocks unverified age before runtime or AI Provider execution when enabled', async () => {
    let runtimeCalls = 0;
    const response = await handleSeyeonChatTurnSendRequestV1({
      request: request(),
      requestId: 'req-age-gate',
      serverTime: '2026-10-23T06:00:00Z',
      identityEvidenceVerifier: memberVerifier(),
      ageAdmissionPort: { admitFreePersonalization: async () => false },
      runtime: { run: async () => { runtimeCalls++; return replayResult() as never; } },
    });
    expect(response.status).toBe(403);
    expect((await response.json() as { error: { code: string } }).error.code)
      .toBe('AGE_VERIFICATION_REQUIRED');
    expect(runtimeCalls).toBe(0);
  });


  it.each(['committed_replay', 'executed'] as const)(
    'refuses %s HTTP first Reveal before metered runtime and sends zero assistant bytes',
    async (disposition) => {
      let runtimeCalls = 0;
      const response = await handleSeyeonChatTurnSendRequestV1({
        request: request(),
        requestId: 'req-first-reveal',
        serverTime: '2026-10-17T08:30:00.000Z',
        identityEvidenceVerifier: memberVerifier(),
        runtime: {
          run: async () => {
            runtimeCalls += 1;
            if (disposition === 'committed_replay') return replayResult() as never;
            return {
              ...replayResult(),
              execution: {
                ...replayResult().execution,
                disposition: 'executed',
                runtimeResult: {
                  envelope: { utterance: 'UNAUTHORIZED_FIRST_REVEAL_CANARY' },
                },
              },
            } as never;
          },
        },
      });

      const text = await response.text();
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(JSON.parse(text)).toMatchObject({
        ok: false,
        error: {
          code: 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
          messageKey: 'chat.secure_reveal_unavailable',
          retryable: false,
        },
      });
      expect(runtimeCalls).toBe(0);
      expect(text).not.toContain('저장된 답변입니다.');
      expect(text).not.toContain('UNAUTHORIZED_FIRST_REVEAL_CANARY');
      expect(text).not.toContain(TURN_ID);
      expect(text).not.toContain(MESSAGE_ID);
    },
  );

  it('does not start even the zero-source internal dogfood Provider without HTTP Reveal proof', async () => {
    let runtimeCalls = 0;
    const response = await handleSeyeonChatTurnSendRequestV1({
      request: request({ clientTurnId: CLIENT_TURN_ID, text: '안녕하세요.' }),
      requestId: 'req-no-db-privilege',
      serverTime: '2026-10-17T08:30:00.000Z',
      identityEvidenceVerifier: memberVerifier(),
      runtime: { run: async () => { runtimeCalls += 1; return replayResult() as never; } },
    });
    expect(response.status).toBe(503);
    expect(runtimeCalls).toBe(0);
  });

  it('keeps first-Reveal HOLD across an asynchronous Member verification gap', async () => {
    let allowIdentity!: () => void;
    const identityGate = new Promise<void>((resolve) => { allowIdentity = resolve; });
    let runtimeCalls = 0;
    const pending = handleSeyeonChatTurnSendRequestV1({
      request: request(),
      requestId: 'req-delayed-member-verification',
      serverTime: '2026-10-17T08:30:00.000Z',
      identityEvidenceVerifier: {
        verifyRequestIdentity: async () => {
          await identityGate;
          return Object.freeze({ kind: 'member' as const, verifiedAuthUserId: 'auth-user' });
        },
      },
      runtime: {
        run: async () => {
          runtimeCalls += 1;
          return replayResult() as never;
        },
      },
    });
    // A request waiting for authentication must never start a Provider or
    // publish already-persisted assistant bytes, even after identity resolves.
    expect(runtimeCalls).toBe(0);
    allowIdentity();
    const response = await pending;
    const wire = await response.text();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(wire).error).toMatchObject({
      code: 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
      retryable: false,
    });
    expect(runtimeCalls).toBe(0);
    expect(wire).not.toContain('저장된 답변입니다.');
    expect(wire).not.toContain(TURN_ID);
    expect(wire).not.toContain(MESSAGE_ID);
  });

  it('rejects authority injection fields before runtime execution', async () => {
    let calls = 0;
    const response = await handleSeyeonChatTurnSendRequestV1({
      request: request({
        clientTurnId: CLIENT_TURN_ID,
        text: '안녕하세요.',
        subjectId: 'client-owned',
        releaseId: 'client-owned',
      }),
      requestId: 'req-2',
      serverTime: '2026-10-07T00:00:00.000Z',
      identityEvidenceVerifier: memberVerifier(),
      runtime: { run: async () => { calls += 1; return replayResult() as never; } },
    });
    expect(response.status).toBe(400);
    expect(calls).toBe(0);
  });

  it('rejects Guest evidence without touching Production runtime', async () => {
    let calls = 0;
    const response = await handleSeyeonChatTurnSendRequestV1({
      request: request(),
      requestId: 'req-3',
      serverTime: '2026-10-07T00:00:00.000Z',
      identityEvidenceVerifier: {
        verifyRequestIdentity: async () => Object.freeze({
          kind: 'guest' as const,
          verifiedGuestTokenHash: 'guest-hash',
        }),
      },
      runtime: { run: async () => { calls += 1; return replayResult() as never; } },
    });
    expect(response.status).toBe(403);
    expect(calls).toBe(0);
  });

  it('rejects malformed clientTurnId and oversized text', async () => {
    for (const body of [
      { clientTurnId: 'bad-id', text: 'hello' },
      { clientTurnId: CLIENT_TURN_ID, text: 'x'.repeat(8001) },
    ]) {
      const response = await handleSeyeonChatTurnSendRequestV1({
        request: request(body),
        requestId: 'req-invalid',
        serverTime: '2026-10-07T00:00:00.000Z',
        identityEvidenceVerifier: memberVerifier(),
        runtime: { run: async () => replayResult() as never },
      });
      expect(response.status).toBe(400);
    }
  });
  it('denies before reaching the missing immutable source-Pin RPC diagnostic', async () => {
    const response = await handleSeyeonChatTurnSendRequestV1({
      request: request(),
      requestId: 'req-missing-pin',
      serverTime: '2026-10-16T08:00:00.000Z',
      identityEvidenceVerifier: memberVerifier(),
      runtime: { run: async () => { throw new SeyeonProductionPinMigrationRequiredV1(); } },
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatchObject({
      code: 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
      messageKey: 'chat.secure_reveal_unavailable',
      retryable: false,
    });
  });

  it('does not touch turn idempotency or persisted errors while first Reveal is HOLD', async () => {
    const failure = Object.assign(new Error('server-owned in-flight turn'), {
      code: 'P0001',
      constraint: 'cmd_chat_receive_turn_in_flight',
    });
    const response = await handleSeyeonChatTurnSendRequestV1({
      request: request(),
      requestId: 'req-stale-turn',
      serverTime: '2026-10-16T08:00:00.000Z',
      identityEvidenceVerifier: memberVerifier(),
      runtime: { run: async () => { throw failure; } },
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatchObject({
      code: 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
      messageKey: 'chat.secure_reveal_unavailable',
      retryable: false,
    });
  });

});
