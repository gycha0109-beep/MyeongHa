// Watchtower-Track: security
// D-04 UNAPPROVED. This is an actual 127.0.0.1 HTTP/socket negative
// regression, NOT Vercel proxy proof, a DB+wire atomicity claim, or G3 approval.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { type AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  resolveMeDispatchTargetForTestV1,
  toCanonicalMeRequestForTestV1,
} from '../api/me.js';
import { handleSeyeonChatTurnSendRequestV1 } from '../apps/api/src/chat-turn-send-http.js';

const THREAD = 'd4000000-0000-4000-8000-000000000078';
const TURN = '423e4567-e89b-42d3-a456-426614174078';
const CANARY = 'D04_REVOKED_ORIGINAL_GRANT_ASSISTANT_MUST_NOT_ESCAPE';

type LoopbackHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

async function withLoopback(handler: LoopbackHandler, run: (origin: string) => Promise<void>) {
  const server = createServer((request, response) => {
    void handler(request, response).catch(() => {
      if (!response.headersSent) response.statusCode = 500;
      response.end('loopback-handler-error');
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  try {
    const address = server.address() as AddressInfo;
    await run('http://127.0.0.1:' + address.port);
  } finally {
    // Also close idle HTTP keep-alive connections if a negative assertion fails.
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
}

async function incomingBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const part of request) {
    chunks.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function writeFetchResponse(response: ServerResponse, result: Response) {
  response.statusCode = result.status;
  result.headers.forEach((value, name) => response.setHeader(name, value));
  response.end(Buffer.from(await result.arrayBuffer()));
}

const syntheticMember = {
  verifyRequestIdentity: async () => Object.freeze({
    kind: 'member' as const,
    verifiedAuthUserId: 'synthetic-loopback-member',
  }),
};

describe('D-04 network loopback: send timing is distinct from Response construction', () => {
  it.each([
    '/api/me?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id=' + THREAD,
    '/api/chat/' + THREAD + '/turns?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id=' + THREAD,
  ])('delaying the real socket write on %s still sends only the 503 HOLD body', async (route) => {
    let runtimeCalls = 0;
    let signalResponseReady!: () => void;
    let allowSocketWrite!: () => void;
    const responseReady = new Promise<void>((resolve) => { signalResponseReady = resolve; });
    const socketWriteGate = new Promise<void>((resolve) => { allowSocketWrite = resolve; });

    await withLoopback(async (request, response) => {
      const body = await incomingBody(request);
      const source = new Request('http://127.0.0.1' + request.url, {
        method: 'POST',
        headers: {
          authorization: String(request.headers.authorization ?? ''),
          'content-type': 'application/json',
          'x-seyeon-reveal-authorized': String(request.headers['x-seyeon-reveal-authorized'] ?? ''),
        },
        body,
      });
      const target = resolveMeDispatchTargetForTestV1(source);
      expect(target).toMatchObject({ kind: 'chat-turn-send', threadId: THREAD });
      const canonical = toCanonicalMeRequestForTestV1(source, target ?? undefined);
      const held = await handleSeyeonChatTurnSendRequestV1({
        request: canonical,
        requestId: 'd04-loopback-wire-negative',
        serverTime: '2026-10-18T00:00:00.000Z',
        identityEvidenceVerifier: syntheticMember,
        runtime: {
          run: async () => {
            runtimeCalls += 1;
            return { execution: { disposition: 'committed_replay', assistantText: CANARY } } as never;
          },
        },
      });
      signalResponseReady(); // Web Response exists, but no HTTP headers/body have been written.
      await socketWriteGate;
      await writeFetchResponse(response, held);
    }, async (origin) => {
      const pending = fetch(origin + route, {
        method: 'POST',
        headers: {
          authorization: 'Bearer synthetic-member',
          'content-type': 'application/json',
          'x-seyeon-reveal-authorized': 'true', // untrusted client declaration
        },
        body: JSON.stringify({ clientTurnId: TURN, text: '합성 대화' }),
      });
      try {
        await responseReady;
        // Simulated revocation occurs while the *network* write is withheld.
        // Current handler must already be HOLD independently of this variable.
        const originalGrantRevoked = true;
        allowSocketWrite();
        const received = await pending;
        const bytes = await received.text();
        expect(originalGrantRevoked).toBe(true);
        expect(received.status).toBe(503);
        expect(received.headers.get('cache-control')).toBe('no-store');
        expect(received.headers.get('content-type')).not.toContain('text/event-stream');
        expect(bytes).toContain('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
        expect(bytes).not.toContain(CANARY);
        expect(bytes).not.toContain(THREAD);
        expect(bytes).not.toContain(TURN);
        expect(runtimeCalls).toBe(0);
      } finally {
        allowSocketWrite();
      }
    });
  });

  it('negative counterexample: a pre-revoke synthetic Response leaks on the actual socket after revoke', async () => {
    // Never call a Production handler or use a real Grant. This deliberately
    // demonstrates why R=DB read or new Response cannot substitute for S=send.
    let signalPrepared!: () => void;
    let allowSocketWrite!: () => void;
    const prepared = new Promise<void>((resolve) => { signalPrepared = resolve; });
    const gate = new Promise<void>((resolve) => { allowSocketWrite = resolve; });
    let originalGrantActive = true;

    await withLoopback(async (request, response) => {
      await incomingBody(request);
      const stale = Response.json({ assistantText: CANARY });
      signalPrepared();
      await gate;
      await writeFetchResponse(response, stale);
    }, async (origin) => {
      const pending = fetch(origin + '/synthetic-unsafe-only', {
        method: 'POST', body: 'synthetic',
      });
      try {
        await prepared;
        originalGrantActive = false; // simulated revoke COMMIT/ACK before S
        allowSocketWrite();
        const arrived = await pending;
        const bytes = await arrived.text();
        expect(originalGrantActive).toBe(false);
        expect(arrived.status).toBe(200);
        expect(bytes).toContain(CANARY);
      } finally {
        allowSocketWrite();
      }
    });
  });
});
