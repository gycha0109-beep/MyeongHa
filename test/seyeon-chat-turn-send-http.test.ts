import { describe, expect, it } from 'vitest';
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
    threadBinding: { threadId: THREAD_ID, participantCharacterIds: ['seyeon'] } as never,
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

function authorizedDisclosure() {
  return {
    reveal: async () => Object.freeze({
      state: 'authorized' as const,
      assistantText: '저장된 답변입니다.',
    }),
  };
}

describe('Seyeon Member turn-send HTTP', () => {
  it('accepts only clientTurnId + text and exposes a narrow replay-safe receipt', async () => {
    let received: unknown;
    const response = await handleSeyeonChatTurnSendRequestV1({
      request: request(),
      requestId: 'req-1',
      serverTime: '2026-10-07T00:00:00.000Z',
      identityEvidenceVerifier: memberVerifier(),
      controlledDisclosurePort: authorizedDisclosure(),
      runtime: {
        run: async (input) => {
          received = input;
          return replayResult() as never;
        },
      },
    });

    expect(response.status).toBe(200);
    expect(received).toEqual({
      verifiedEvidence: { kind: 'member', verifiedAuthUserId: 'auth-user' },
      threadId: THREAD_ID,
      clientTurnId: CLIENT_TURN_ID,
      text: '안녕하세요.',
    });
    const payload = await response.json();
    expect(payload.data).toEqual({
      turnId: TURN_ID,
      assistantMessageId: MESSAGE_ID,
      assistantText: '저장된 답변입니다.',
      sequenceNo: 2,
      replayed: true,
    });
    expect(payload.data.subjectId).toBeUndefined();
    expect(payload.data.provider).toBeUndefined();
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
      controlledDisclosurePort: authorizedDisclosure(),
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
      controlledDisclosurePort: authorizedDisclosure(),
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
      controlledDisclosurePort: authorizedDisclosure(),
        runtime: { run: async () => replayResult() as never },
      });
      expect(response.status).toBe(400);
    }
  });
});


describe('Seyeon HTTP current-rights disclosure enforcement', () => {
  it('requires a server-owned port before calling runtime (no paid model when absent)', async () => {
    let calls = 0;
    const response = await handleSeyeonChatTurnSendRequestV1({
      request: request(),
      requestId: 'req-no-port',
      serverTime: '2026-10-07T00:00:00.000Z',
      identityEvidenceVerifier: memberVerifier(),
      runtime: {
        run: async () => { calls += 1; return replayResult() as never; },
      },
    } as never);
    expect(response.status).toBe(503);
    expect((await response.json()).error).toEqual({
      code: 'CHAT_DISCLOSURE_UNAVAILABLE',
      messageKey: 'chat.disclosure_unavailable',
      retryable: false,
    });
    expect(calls).toBe(0);
  });

  it('exposes only DB-authorized text, never execution or replay raw text', async () => {
    for (const disposition of ['committed_replay', 'executed'] as const) {
      let disclosureArgs: unknown;
      const response = await handleSeyeonChatTurnSendRequestV1({
        request: request(),
        requestId: 'req-safe-text',
        serverTime: '2026-10-07T00:00:00.000Z',
        identityEvidenceVerifier: memberVerifier(),
        controlledDisclosurePort: {
          reveal: async (scope) => {
            disclosureArgs = scope;
            return { state: 'authorized' as const, assistantText: '현재 권한으로 확인한 답변' };
          },
        },
        runtime: { run: async () => ({
          ...replayResult(),
          execution: {
            ...replayResult().execution,
            disposition,
            assistantText: '권한 없는 과거 본문',
            runtimeResult: { envelope: { utterance: '권한 없는 새 본문' } },
          },
        }) as never },
      });
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.data.assistantText).toBe('현재 권한으로 확인한 답변');
      expect(JSON.stringify(payload)).not.toContain('권한 없는');
      expect(disclosureArgs).toEqual({
        verifiedEvidence: { kind: 'member', verifiedAuthUserId: 'auth-user' },
        subjectId: 'subject',
        threadId: THREAD_ID,
        turnId: TURN_ID,
        attemptId: 'attempt',
        assistantMessageId: MESSAGE_ID,
        disposition,
      });
    }
  });

  it('holds both first and replayed answers when permission is revoked or authority fails', async () => {
    for (const responseFromPort of [
      async () => ({ state: 'held' as const }),
      async () => { throw new Error('sensitive-db-error-and-content'); },
      async () => ({ state: 'authorized' as const, assistantText: '' }),
    ]) {
      const response = await handleSeyeonChatTurnSendRequestV1({
        request: request(),
        requestId: 'req-held',
        serverTime: '2026-10-07T00:00:00.000Z',
        identityEvidenceVerifier: memberVerifier(),
        controlledDisclosurePort: { reveal: responseFromPort },
        runtime: { run: async () => replayResult() as never },
      });
      expect(response.status).toBe(503);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const payload = await response.text();
      expect(payload).toContain('CHAT_DISCLOSURE_UNAVAILABLE');
      expect(payload).not.toContain('저장된 답변입니다.');
      expect(payload).not.toContain('sensitive-db-error');
    }
  });

  it('rejects a server result bound to a different thread before disclosure', async () => {
    let disclosureCalls = 0;
    const response = await handleSeyeonChatTurnSendRequestV1({
      request: request(),
      requestId: 'req-cross-thread',
      serverTime: '2026-10-07T00:00:00.000Z',
      identityEvidenceVerifier: memberVerifier(),
      controlledDisclosurePort: {
        reveal: async () => {
          disclosureCalls += 1;
          return { state: 'authorized' as const, assistantText: 'should-not-return' };
        },
      },
      runtime: { run: async () => ({
        ...replayResult(),
        threadBinding: { threadId: 'wrong-thread', participantCharacterIds: ['seyeon'] },
      }) as never },
    });
    expect(response.status).toBe(503);
    expect(disclosureCalls).toBe(0);
    expect(await response.text()).not.toContain('should-not-return');
  });

  it('rejects client-supplied disclosure authority parameters', async () => {
    let calls = 0;
    const response = await handleSeyeonChatTurnSendRequestV1({
      request: request({
        clientTurnId: CLIENT_TURN_ID,
        text: '안녕하세요.',
        controlledDisclosurePort: { state: 'authorized' },
      }),
      requestId: 'req-forged-port',
      serverTime: '2026-10-07T00:00:00.000Z',
      identityEvidenceVerifier: memberVerifier(),
      controlledDisclosurePort: authorizedDisclosure(),
      runtime: { run: async () => { calls += 1; return replayResult() as never; } },
    });
    expect(response.status).toBe(400);
    expect(calls).toBe(0);
  });
});
