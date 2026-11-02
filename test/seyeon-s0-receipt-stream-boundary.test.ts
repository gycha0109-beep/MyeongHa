// Watchtower-Track: security
import { describe, expect, it } from 'vitest';
import { handleSeyeonPositiveReplyReceiptV1 } from '../apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const ATTEMPT = '00000000-0000-4000-8000-000000000001';
function noDbPool() {
  let connects = 0;
  const pool = { connect: async () => { connects += 1; throw Error('Receipt must reject before DB'); } } as unknown as PostgresSubjectPoolV1;
  return { pool, connects: () => connects };
}
function request(body: ReadableStream<Uint8Array>) {
  return new Request(`https://receipt.test/api/chat/delivery-receipts/${ATTEMPT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    duplex: 'half',
  } as RequestInit);
}
describe('S0 proof-only receipt request-body boundary', () => {
  it('rejects a locked receipt stream without an uncaught transport failure or DB access', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } });
    const input = request(stream);
    const lock = input.body!.getReader();
    const db = noDbPool();
    try {
      const response = await handleSeyeonPositiveReplyReceiptV1({
        request: input, pool: db.pool, requestId: 'locked-receipt',
      });
      expect(response.status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect((await response.json()).error.code).toBe('INVALID_DELIVERY_RECEIPT');
      expect(db.connects()).toBe(0);
    } finally {
      lock.releaseLock();
    }
  });

  it('contains reader cancellation and lock-release errors when malformed proof is rejected', async () => {
    const input = request(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{'));
      controller.close();
    } }));
    const stream = input.body!;
    const getReader = stream.getReader.bind(stream);
    Object.defineProperty(stream, 'getReader', { value: () => {
      const reader = getReader();
      Object.defineProperties(reader, {
        cancel: { value: () => { throw Error('cancel failed'); } },
        releaseLock: { value: () => { throw Error('release failed'); } },
      });
      return reader;
    } });
    const db = noDbPool();
    const response = await handleSeyeonPositiveReplyReceiptV1({
      request: input, pool: db.pool, requestId: 'cleanup-receipt',
    });
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await response.json()).error.code).toBe('INVALID_DELIVERY_RECEIPT');
    expect(db.connects()).toBe(0);
  });
});
