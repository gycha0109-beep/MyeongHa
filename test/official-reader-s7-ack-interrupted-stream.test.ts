import { describe, expect, it, vi } from 'vitest';
import {
  handleOfficialReaderPaidDeliveryAckHttpV1,
} from '../apps/api/src/official-reader-paid-chat-delivery-ack-http-v1.js';

const THREAD = '11111111-1111-4111-8111-111111111111';
const MARKER = '22222222-2222-4222-8222-222222222222';
const URL = `https://myeongha.example.test/api/chat/${THREAD}/paid-readings/${MARKER}/ack`;
const ORIGIN = 'https://myeongha.example.test';

function request(body: BodyInit): Request {
  return new Request(URL, {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      'X-Reader-Delivery-Ack': '1',
    },
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}
function handle(req: Request, verify = vi.fn(async () => null)) {
  return handleOfficialReaderPaidDeliveryAckHttpV1({
    request: req,
    requestId: 'test-only',
    serverTime: '2026-10-26T00:00:00.000Z',
    paidReadReleaseEnabled: true,
    identityEvidenceVerifier: { verifyRequestIdentity: verify } as never,
    pool: {} as never,
  });
}

describe('S7 paid Reader delivery ACK interrupted request transport', () => {
  it('returns a bounded invalid-request response for a body already locked by another reader', async () => {
    const req = request('{}');
    const locked = req.body!.getReader();
    const verify = vi.fn(async () => null);
    try {
      const response = await handle(req, verify);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'INVALID_REQUEST' },
      });
      expect(verify).not.toHaveBeenCalled();
    } finally {
      locked.releaseLock();
    }
  });

  it('rejects an interrupted request stream without consulting Member or payment authority', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() { throw new Error('interrupted ACK upload'); },
    });
    const verify = vi.fn(async () => null);
    const response = await handle(request(stream), verify);
    expect(response.status).toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });

  it('does not let a reader cleanup exception escape the ACK error boundary', async () => {
    const req = request('{}');
    let reads = 0;
    Object.defineProperty(req, 'body', {
      value: {
        getReader: () => ({
          read: async () => ++reads === 1
            ? { done: false, value: Uint8Array.from([123]) }
            : { done: true, value: undefined },
          releaseLock: () => { throw new Error('cleanup exception'); },
        }),
      },
    });
    const verify = vi.fn(async () => null);
    const response = await handle(req, verify);
    expect(response.status).toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });
});
