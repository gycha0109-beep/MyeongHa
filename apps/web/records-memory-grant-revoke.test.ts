import { describe, expect, it, vi } from 'vitest';
import { createRecordsMemoryGrantRevokeClient } from './records-memory-grant-revoke.js';

const MEMORY_ID = '22222222-2222-4222-8222-222222222222';
const ENDPOINT = `/api/memories/${MEMORY_ID}/grants/seyeon/revoke`;
const ACK = Object.freeze({
  ok: true,
  data: {
    status: 'committed', memoryItemId: MEMORY_ID,
    characterId: 'seyeon', revokedGrantCount: 1, replayed: false,
  },
  meta: {
    apiContractVersion: 'v0.9', requestId: 'revoke-test-1',
    serverTime: '2026-10-29T00:00:00Z',
  },
});

describe('Records Member Memory Grant revocation transport', () => {
  it('sends exactly one bodyless Member POST and trusts only an exact committed receipt', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(ACK));
    const client = createRecordsMemoryGrantRevokeClient({
      fetchImpl, resolveBearer: () => ({ kind: 'member', token: 'member-token' }),
    });
    await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).resolves.toMatchObject({
      memoryItemId: MEMORY_ID, characterId: 'seyeon', revokedGrantCount: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(ENDPOINT);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST', cache: 'no-store', credentials: 'same-origin',
      headers: { Authorization: 'Bearer member-token' },
    });
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it('never retries an unknown 503 or accepts a mismatched receipt', async () => {
    let response: Response = new Response(null, { status: 503 });
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => response);
    const client = createRecordsMemoryGrantRevokeClient({
      fetchImpl, resolveBearer: () => ({ kind: 'member', token: 'member-token' }),
    });
    await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).rejects.toMatchObject({
      code: 'MEMORY_REVOKE_UNCONFIRMED',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    response = Response.json({ ...ACK, data: { ...ACK.data, memoryItemId: 'other-memory' } });
    await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).rejects.toMatchObject({
      code: 'MEMORY_REVOKE_UNCONFIRMED',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('blocks guests and malformed IDs before sending anything', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(ACK));
    const client = createRecordsMemoryGrantRevokeClient({
      fetchImpl, resolveBearer: () => ({ kind: 'guest', token: 'guest-token' }),
    });
    await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).rejects.toMatchObject({
      code: 'MEMORY_REVOKE_MEMBER_REQUIRED',
    });
    await expect(client.revokeSeyeonMemoryGrant('not-a-uuid')).rejects.toMatchObject({
      code: 'MEMORY_REVOKE_INVALID_ID',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not acknowledge a commit across a changed Member session', async () => {
    let calls = 0;
    const client = createRecordsMemoryGrantRevokeClient({
      fetchImpl: async () => Response.json(ACK),
      resolveBearer: () => ({ kind: 'member', token: ++calls === 1 ? 'member-a' : 'member-b' }),
    });
    await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).rejects.toMatchObject({
      code: 'MEMORY_REVOKE_SESSION_CHANGED',
    });
  });
});
