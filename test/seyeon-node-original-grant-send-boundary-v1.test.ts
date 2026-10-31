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
  it.each([
    {label: 'too short deadline', deadlineMs: 99},
    {label: 'unbounded deadline', deadlineMs: 10_001},
    {label: 'fractional deadline', deadlineMs: 150.5},
    {label: 'non-finite deadline', deadlineMs: Number.POSITIVE_INFINITY},
  ])('closes Node socket on $label before invoking DB authority', async ({deadlineMs}) => {
    let destroyed = false;
    let reads = 0;
    const response = {
      headersSent: false,
      writableEnded: false,
      destroyed: false,
      destroy() { destroyed = true; },
    } as unknown as ServerResponse;
    await expect(sendSeyeonNodeOriginalGrantResponseV1({
      response,
      requestSignal: new AbortController().signal,
      deadlineMs,
      withLockedOriginalGrant: async () => { reads++; },
    })).rejects.toThrow(/Invalid bounded send deadline/u);
    expect(destroyed).toBe(true);
    expect(reads).toBe(0);
  });

  it('closes Node socket on malformed server receipt metadata before DB authorization', async () => {
    let destroyed = false;
    let reads = 0;
    const response = {
      headersSent: false,
      writableEnded: false,
      destroyed: false,
      destroy() { destroyed = true; },
    } as unknown as ServerResponse;
    await expect(sendSeyeonNodeOriginalGrantResponseV1({
      response,
      requestSignal: new AbortController().signal,
      chatResponseMetadata: {
        turnId: 'invalid',
        assistantMessageId: '66666666-6666-4666-8666-666666666666',
        sequenceNo: 2,
        replayed: false,
        requestId: 'g3-malformed-receipt',
        serverTime: '2026-10-22T00:00:00.000Z',
      },
      withLockedOriginalGrant: async () => { reads++; },
    })).rejects.toThrow(/canonical server-owned identifiers/u);
    expect(destroyed).toBe(true);
    expect(reads).toBe(0);
  });

  it('rejects a replay receipt at the socket boundary before any private DB read', async () => {
    let destroyed=false;
    let reads=0;
    const response={
      headersSent:false,writableEnded:false,destroyed:false,
      destroy(){destroyed=true;},
    } as unknown as ServerResponse;
    await expect(sendSeyeonNodeOriginalGrantResponseV1({
      response,requestSignal:new AbortController().signal,
      chatResponseMetadata:{
        turnId:'44444444-4444-4444-8444-444444444444',
        assistantMessageId:'66666666-6666-4666-8666-666666666666',
        sequenceNo:2,replayed:true,requestId:'g3-replay-denied',
        serverTime:'2026-10-18T13:00:00.000Z',
      },
      withLockedOriginalGrant:async()=>{reads++;},
    })).rejects.toThrow(/Replayed Seyeon turns/u);
    expect(destroyed).toBe(true);
    expect(reads).toBe(0);
  });

  it('destroys an already-started response without a second protected send', async () => {
    let destroyed = false;
    let reads = 0;
    const response = {
      headersSent: true,
      writableEnded: false,
      destroyed: false,
      destroy() { destroyed = true; },
    } as unknown as ServerResponse;
    await expect(sendSeyeonNodeOriginalGrantResponseV1({
      response,
      requestSignal: new AbortController().signal,
      withLockedOriginalGrant: async () => { reads++; },
    })).rejects.toThrow(/already started/u);
    expect(destroyed).toBe(true);
    expect(reads).toBe(0);
  });

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

  it('contains a synchronous Node socket write failure without an unhandled send rejection', async () => {
    let lockReleasedAfterFailure = false;
    await withNodeSocket(async response => {
      // Emulate an adapter/socket rejecting a synchronous end() call after
      // the finished/error/abort handlers were installed.
      response.end = (() => {
        throw new Error('synthetic synchronous Node write failure');
      }) as typeof response.end;
      await expect(sendSeyeonNodeOriginalGrantResponseV1({
        response,
        requestSignal: new AbortController().signal,
        withLockedOriginalGrant: async ({ deliver }) => {
          try {
            await deliver(CANARY);
          } finally {
            lockReleasedAfterFailure = true;
          }
        },
      })).rejects.toThrow('synthetic synchronous Node write failure');
      expect(response.destroyed).toBe(true);
      expect(lockReleasedAfterFailure).toBe(true);
    }, async url => {
      await expect(fetch(url)).rejects.toThrow();
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
          replayed: false,
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
