// Watchtower-Track: security
// Minimal genuine Node socket tests for the bounded send adapter, separate
// from R10's already-proven disposable PostgreSQL original-Grant lock tests.
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  sendSeyeonNodeOriginalGrantResponseV1,
} from '../apps/api/src/seyeon-node-original-grant-send-boundary-v1.js';

const CANARY = 'R11_OFFLINE_PROTECTED_ASSISTANT_CANARY';

async function withNodeSocket(
  handler: (response: ServerResponse) => Promise<void>,
  assertClient: (url: string) => Promise<void>,
): Promise<void> {
  let finished!: (error?: unknown) => void;
  const handlerDone = new Promise<void>((resolve, reject) => {
    finished = (error?: unknown) => error === undefined ? resolve() : reject(error);
  });
  const server = createServer((_request, response) => {
    void handler(response).then(() => finished(), error => finished(error));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  try {
    await assertClient('http://127.0.0.1:' + (server.address() as AddressInfo).port);
    await handlerDone;
  } finally {
    await new Promise<void>(resolve => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
}

describe('R11 Node-owned bounded original Grant disclosure transport candidate', () => {
  it('authorized: transfers one non-streaming JSON body before releasing the lock callback', async () => {
    const events: string[] = [];
    await withNodeSocket(async response => {
      const outcome = await sendSeyeonNodeOriginalGrantResponseV1({
        response,
        requestSignal: new AbortController().signal,
        deadlineMs: 3_000,
        withLockedOriginalGrant: async ({ deliver, signal }) => {
          expect(signal.aborted).toBe(false);
          events.push('lock:held');
          await deliver(CANARY);
          events.push('socket:finished-before-lock-release');
        },
      });
      expect(outcome).toBe('assistant_sent');
      events.push('lock:released');
    }, async url => {
      const res = await fetch(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(res.headers.get('transfer-encoding')).not.toBe('chunked');
      expect(await res.json()).toMatchObject({
        ok: true, assistantText: CANARY,
      });
    });
    expect(events).toEqual([
      'lock:held', 'socket:finished-before-lock-release', 'lock:released',
    ]);
  });

  it('revoked/unverifiable: sends only 503 no-store and zero private bytes', async () => {
    await withNodeSocket(async response => {
      const outcome = await sendSeyeonNodeOriginalGrantResponseV1({
        response,
        requestSignal: new AbortController().signal,
        withLockedOriginalGrant: async ({ deliver }) => { await deliver(null); },
      });
      expect(outcome).toBe('reveal_held');
    }, async url => {
      const res = await fetch(url);
      const body = await res.text();
      expect(res.status).toBe(503);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(body).toContain('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
      expect(body).not.toContain(CANARY);
    });
  });

  it('abort while authority is pending: destroys the socket and rejects any late buffered send', async () => {
    const requestAbort = new AbortController();
    let notifyPending!: () => void;
    const pending = new Promise<void>(resolve => { notifyPending = resolve; });
    let rejectedLateSend = false;
    await withNodeSocket(async response => {
      await expect(sendSeyeonNodeOriginalGrantResponseV1({
        response,
        requestSignal: requestAbort.signal,
        deadlineMs: 3_000,
        withLockedOriginalGrant: async ({ signal, deliver }) => {
          notifyPending();
          if (!signal.aborted) {
            await new Promise<void>(resolve => {
              signal.addEventListener('abort', () => resolve(), { once: true });
            });
          }
          await expect(deliver(CANARY)).rejects.toThrow();
          rejectedLateSend = true;
        },
      })).rejects.toThrow();
    }, async url => {
      const fetching = fetch(url);
      await pending;
      requestAbort.abort();
      await expect(fetching).rejects.toThrow();
    });
    expect(rejectedLateSend).toBe(true);
  });
  it('delivers existing Chat API data/meta shape with only freshly authorized Node text', async () => {
    const metadata = {
      turnId: '44444444-4444-4444-8444-444444444444',
      assistantMessageId: '66666666-6666-4666-8666-666666666666',
      sequenceNo: 2,
      replayed: false,
      requestId: 'request-socket-canary',
      serverTime: '2026-10-18T13:00:00.000Z',
    } as const;
    await withNodeSocket(async response => {
      await sendSeyeonNodeOriginalGrantResponseV1({
        response,
        requestSignal: new AbortController().signal,
        chatResponseMetadata: metadata,
        withLockedOriginalGrant: async ({ deliver }) => { await deliver(CANARY); },
      });
    }, async url => {
      const res = await fetch(url);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ok: true,
        data: {
          turnId: metadata.turnId,
          assistantMessageId: metadata.assistantMessageId,
          assistantText: CANARY,
          sequenceNo: 2,
          replayed: false,
        },
        meta: {
          apiContractVersion: 'v0.9',
          requestId: metadata.requestId,
          serverTime: metadata.serverTime,
        },
      });
    });
  });

  it('keeps absent original authorization as app-compatible static 503 without user text', async () => {
    await withNodeSocket(async response => {
      await sendSeyeonNodeOriginalGrantResponseV1({
        response,
        requestSignal: new AbortController().signal,
        chatResponseMetadata: {
          turnId: '44444444-4444-4444-8444-444444444444',
          assistantMessageId: '66666666-6666-4666-8666-666666666666',
          sequenceNo: 2,
          replayed: true,
          requestId: 'request-held',
          serverTime: '2026-10-18T13:00:00.000Z',
        },
        withLockedOriginalGrant: async ({ deliver }) => { await deliver(null); },
      });
    }, async url => {
      const res = await fetch(url);
      const body = await res.text();
      expect(res.status).toBe(503);
      expect(JSON.parse(body)).toMatchObject({
        ok: false,
        error: {
          code: 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
          messageKey: 'chat.secure_reveal_unavailable',
          retryable: false,
        },
        meta: { apiContractVersion: 'v0.9', requestId: 'request-held' },
      });
      expect(body).not.toContain(CANARY);
      expect(body).not.toContain('assistantText');
    });
  });

});
