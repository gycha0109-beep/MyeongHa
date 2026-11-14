import { describe, expect, it, vi } from 'vitest';
import {
  createSharedMemoryClientV1,
  SharedMemoryClientErrorV1,
} from '../apps/web/src/my/shared-memory-client.js';

const NOTE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MIXED_CASE_NOTE_ID = 'AaAaAaAa-AaAa-4AaA-8AaA-AaAaAaAaAaAa';
const OTHER_NOTE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function reply(id: string) {
  return new Response(JSON.stringify({
    ok: true,
    data: { deleted: true, id },
    meta: { apiContractVersion: 'v0.9', requestId: 'test', serverTime: '2026-11-11T00:00:00.000Z' },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function client(fetchImpl: typeof fetch) {
  return createSharedMemoryClientV1({
    fetchImpl,
    resolveBearer: async () => ({ kind: 'member', token: 'member-test' }),
  });
}

describe('web manual shared-memory deletion response', () => {
  it('accepts a PostgreSQL-normalized UUID receipt for the same mixed-case owner memo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(NOTE_ID));
    await expect(client(fetchImpl).remove(MIXED_CASE_NOTE_ID)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [route, options] = fetchImpl.mock.calls[0]!;
    expect(route).toBe('/api/me/shared-memory');
    expect(options.method).toBe('DELETE');
    expect(options.body).toBe(JSON.stringify({ id: NOTE_ID }));
    expect(options.cache).toBe('no-store');
  });

  it('rejects a successful-looking response that identifies a different memo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply(OTHER_NOTE_ID));
    await expect(client(fetchImpl).remove(MIXED_CASE_NOTE_ID))
      .rejects.toMatchObject({ name: 'SharedMemoryClientErrorV1', code: 'INVALID_RESPONSE' });
  });

  it('rejects malformed target IDs before sending any request', async () => {
    const fetchImpl = vi.fn();
    await expect(client(fetchImpl).remove('not-a-uuid'))
      .rejects.toBeInstanceOf(SharedMemoryClientErrorV1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function editReply(id: string) {
  return new Response(JSON.stringify({
    ok: true,
    data: {
      item: {
        id, text: 'updated memo',
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-11T00:00:00.000Z',
      },
    },
    meta: { apiContractVersion: 'v0.9', requestId: 'test', serverTime: '2026-11-11T00:00:00.000Z' },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('web manual shared-memory edit receipt', () => {
  it('normalizes a mixed-case target UUID and accepts only the same canonical item', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(editReply(NOTE_ID));
    await expect(client(fetchImpl).edit(MIXED_CASE_NOTE_ID, 'updated memo', '2026-11-10T00:00:00.000Z'))
      .resolves.toMatchObject({ id: NOTE_ID, text: 'updated memo' });
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body)).toMatchObject({ id: NOTE_ID });
  });

  it('rejects a successful-looking edit receipt for a different item', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(editReply(OTHER_NOTE_ID));
    await expect(client(fetchImpl).edit(NOTE_ID, 'updated memo', '2026-11-10T00:00:00.000Z'))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects an invalid edit target before a request', async () => {
    const fetchImpl = vi.fn();
    await expect(client(fetchImpl).edit('not-a-uuid', 'updated memo', '2026-11-10T00:00:00.000Z'))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
