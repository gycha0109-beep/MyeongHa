import { describe, expect, it, vi } from 'vitest';
import { createRecordsRuntimeClient, RecordsRuntimeError } from './records-runtime-client.js';

const MEMORY_ID = '22222222-2222-4222-8222-222222222222';
const PATH = `/api/memories/${MEMORY_ID}/grants/seyeon/revoke`;
const ACK = {
  ok: true,
  data: {
    status: 'committed', memoryItemId: MEMORY_ID, characterId: 'seyeon',
    revokedGrantCount: 1, replayed: false,
  },
  meta: {
    apiContractVersion: 'v0.9', requestId: 'rev-1',
    serverTime: '2026-10-24T00:00:00Z',
  },
};

describe('member Se-yeon original memory grant revocation from Records', () => {
  it('sends exactly one bodyless POST with Member bearer and accepts only committed ACK', async () => {
    const fetchImpl = vi.fn(async (_endpoint: string, _init?: RequestInit) => Response.json(ACK));
    const client = createRecordsRuntimeClient({
      fetchImpl,
      resolveBearer: () => ({ kind: 'member', token: 'member-token' }),
    });
    await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).resolves.toMatchObject({
      memoryItemId: MEMORY_ID, revokedGrantCount: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(PATH);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { Authorization: 'Bearer member-token' },
    });
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it('does not retry a 503 or accept a mismatched/ambiguous success', async () => {
    const fetchImpl = vi.fn(async (_endpoint: string, _init?: RequestInit) => new Response(null, { status: 503 }));
    const client = createRecordsRuntimeClient({
      fetchImpl,
      resolveBearer: () => ({ kind: 'member', token: 'member-token' }),
    });
    await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).rejects.toMatchObject({
      code: 'WEB_RECORDS_REVOKE_UNAVAILABLE',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    fetchImpl.mockImplementation(async () => Response.json({
      ...ACK, data: { ...ACK.data, memoryItemId: 'another-memory' },
    }));
    await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).rejects.toBeInstanceOf(RecordsRuntimeError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
