import { describe, expect, it, vi } from 'vitest';
import {
  handleSeyeonPrivateMemoryProposalAcceptRequestV1,
  SEYEON_PRIVATE_MEMORY_ACCEPT_HTTP_V1,
} from '../apps/api/src/seyeon-private-memory-proposal-accept-http-v1.js';

const PROPOSAL = '00000000-0000-4000-8000-000000000002';
const ROUTE = 'https://example.invalid/api/memory/proposals/' + PROPOSAL + '/accept';
const makeRequest = (body: unknown, url=ROUTE) => new Request(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('private proposal acceptance remains OFF at the HTTP boundary', () => {
  const metadata = { requestId: 'req-1', serverTime: '2026-10-22T01:00:00Z' };
  const pool = { connect: vi.fn(() => { throw Error('No DB connection allowed'); }) };
  const member = { kind: 'member' as const, verifiedAuthUserId: PROPOSAL };
  const identityEvidenceVerifier = { verifyRequestIdentity: vi.fn(async () => member) };

  it('is unmounted and returns 503 before DB even with authenticated member', async () => {
    const accept = vi.fn();
    const response = await handleSeyeonPrivateMemoryProposalAcceptRequestV1({
      request: makeRequest({ grantChoice: { mode: 'private' } }),
      ...metadata, identityEvidenceVerifier, pool,
      accept,
    });
    expect(SEYEON_PRIVATE_MEMORY_ACCEPT_HTTP_V1.publicRouteMounted).toBe(false);
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(accept).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rejects out-of-contract Grant modes/extra data without auth or DB read', async () => {
    for (const body of [
      { grantChoice: { mode: 'character_only', characterId: 'seyeon' } },
      { grantChoice: { mode: 'current_characters' } },
      { grantChoice: { mode: 'private', other: true } },
      { grantChoice: { mode: 'private' }, subjectId: PROPOSAL },
      {},
    ]) {
      const accept = vi.fn();
      const verifier = { verifyRequestIdentity: vi.fn(async () => member) };
      const response = await handleSeyeonPrivateMemoryProposalAcceptRequestV1({
        request: makeRequest(body), ...metadata,
        identityEvidenceVerifier: verifier, pool, accept,
      });
      expect(response.status).toBe(400);
      expect(verifier.verifyRequestIdentity).not.toHaveBeenCalled();
      expect(accept).not.toHaveBeenCalled();
    }
  });

  it('rejects a locked proposal body without touching auth or the database', async () => {
    const request = makeRequest({ grantChoice: { mode: 'private' } });
    const lock = request.body!.getReader();
    const verifier = { verifyRequestIdentity: vi.fn(async () => member) };
    try {
      const response = await handleSeyeonPrivateMemoryProposalAcceptRequestV1({
        request, ...metadata, identityEvidenceVerifier: verifier, pool,
      });
      expect(response.status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect((await response.json()).error.code).toBe('INVALID_REQUEST');
      expect(verifier.verifyRequestIdentity).not.toHaveBeenCalled();
      expect(pool.connect).not.toHaveBeenCalled();
    } finally { lock.releaseLock(); }
  });

  it('keeps malformed body rejection even when stream cleanup throws', async () => {
    const request = makeRequest({ grantChoice: { mode: 'public' } });
    const original = request.body!.getReader.bind(request.body);
    Object.defineProperty(request.body!, 'getReader', {
      value: () => {
        const reader = original();
        Object.defineProperty(reader, 'releaseLock', {
          value: () => { throw Error('test cleanup failure'); },
        });
        return reader;
      },
    });
    const response = await handleSeyeonPrivateMemoryProposalAcceptRequestV1({
      request, ...metadata, identityEvidenceVerifier, pool,
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_REQUEST');
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('rejects a never-ending proposal body without invoking admission', async () => {
    const request = new Request(ROUTE, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new TextEncoder().encode('{"grantChoice":')); },
        cancel() {},
      }),
      duplex: 'half',
    } as RequestInit);
    const verifier = { verifyRequestIdentity: vi.fn(async () => member) };
    const response = await handleSeyeonPrivateMemoryProposalAcceptRequestV1({
      request, ...metadata, identityEvidenceVerifier: verifier, pool,
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_REQUEST');
    expect(verifier.verifyRequestIdentity).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  }, 4000);

  it('requires a Member and denies Guests before the DB admission', async () => {
    for (const identity of [null, { kind: 'guest' as const, verifiedGuestTokenHash: 'token' }]) {
      const response = await handleSeyeonPrivateMemoryProposalAcceptRequestV1({
        request: makeRequest({ grantChoice: { mode: 'private' } }),
        ...metadata, pool,
        identityEvidenceVerifier: { verifyRequestIdentity: async () => identity },
      });
      expect(response.status).toBe(identity === null ? 401 : 403);
    }
  });

  it('uses an explicit server-only admission and only returns a matching committed receipt', async () => {
    const accept = vi.fn(async (request: {memoryItemId: string}) =>
      ({memoryItemId: request.memoryItemId,grantCount:0 as const,replayed:false as const}));
    const response = await handleSeyeonPrivateMemoryProposalAcceptRequestV1({
      request: makeRequest({ grantChoice: { mode: 'private' } }),
      ...metadata, identityEvidenceVerifier, pool,
      approvedDbWriteAdmission: () => true, accept,
    });
    expect(response.status).toBe(200);
    expect(accept).toHaveBeenCalledTimes(1);
    const result = await response.json();
    expect(result.data.grantCount).toBe(0);
    expect(result.data.replayed).toBe(false);
    expect(result.data.memoryItemId).toBe(accept.mock.calls[0]?.[0].memoryItemId);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
