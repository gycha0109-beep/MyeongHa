import { describe, expect, it, vi } from 'vitest';
import { createRecordsMemoryGrantRevokeClient } from './records-memory-grant-revoke.js';
import { presentSeyeonMemoryGrantStatusV1 } from './records-memory-grant-presentation.js';

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

  it('recognizes a durable 202 pending withdrawal as new-use-blocked but not committed', async () => {
    const pending = {
      ...ACK,
      data: { status: 'pending', memoryItemId: MEMORY_ID, characterId: 'seyeon', newUseBlocked: true },
    };
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(pending, { status: 202 }));
    const client = createRecordsMemoryGrantRevokeClient({
      fetchImpl, resolveBearer: () => ({ kind: 'member', token: 'member-token' }),
    });
    await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).resolves.toEqual({
      status: 'pending', memoryItemId: MEMORY_ID, characterId: 'seyeon', newUseBlocked: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it('rejects status/ACK mismatches and unverified pending claims without retry', async () => {
    const pendingData = { status: 'pending', memoryItemId: MEMORY_ID, characterId: 'seyeon', newUseBlocked: true };
    const cases = [
      [200, pendingData],
      [202, ACK.data],
      [202, { ...pendingData, newUseBlocked: false }],
      [202, { ...pendingData, memoryItemId: '33333333-3333-4333-8333-333333333333' }],
      [202, { ...pendingData, revokedGrantCount: 1 }],
      [202, { ...pendingData, replayed: false }],
    ] as const;
    for (const [status, data] of cases) {
      const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
        Response.json({ ...ACK, data }, { status }));
      const client = createRecordsMemoryGrantRevokeClient({
        fetchImpl, resolveBearer: () => ({ kind: 'member', token: 'member-token' }),
      });
      await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).rejects.toMatchObject({
        code: 'MEMORY_REVOKE_UNCONFIRMED',
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('preserves durable withdrawal on reload without trusting filtered RLS absence', () => {
    const pending = presentSeyeonMemoryGrantStatusV1('withdrawal_pending', false);
    expect(pending).toMatchObject({kind: 'withdrawal_pending', revokeAvailable: false});
    expect(pending.message).toContain('철회 완료를 기다리고');

    const inconsistent = presentSeyeonMemoryGrantStatusV1('active', true);
    expect(inconsistent.kind).toBe('unknown');
    expect(inconsistent.revokeAvailable).toBe(false);
    expect(inconsistent.message).toContain('일치하지 않습니다');

    expect(presentSeyeonMemoryGrantStatusV1('unknown', false)).toMatchObject({
      kind: 'unknown', revokeAvailable: false,
    });
    expect(presentSeyeonMemoryGrantStatusV1('unknown', true)).toMatchObject({
      kind: 'unknown', revokeAvailable: false,
    });
    expect(presentSeyeonMemoryGrantStatusV1('not_granted', true)).toMatchObject({
      kind: 'no_access', revokeAvailable: false,
    });
    expect(presentSeyeonMemoryGrantStatusV1('active', false)).toMatchObject({
      kind: 'granted', revokeAvailable: true,
    });
    expect(() => presentSeyeonMemoryGrantStatusV1('invalid' as never, false)).toThrow();
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
