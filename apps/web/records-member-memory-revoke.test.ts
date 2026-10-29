import { describe, expect, it, vi } from 'vitest';
import { createRecordsRuntimeClient } from './records-runtime-client.js';

const MEMORY_ID = '22222222-2222-4222-8222-222222222222';
const PATH = `/api/memories/${MEMORY_ID}/grants/seyeon/revoke`;
const META = { apiContractVersion: 'v0.9', requestId: 'test-request', serverTime: '2026-10-29T00:00:00Z' };
const COMMITTED = { ok: true, data: { status: 'committed', memoryItemId: MEMORY_ID, characterId: 'seyeon', revokedGrantCount: 1, replayed: false }, meta: META };
const PENDING = { ok: true, data: { status: 'pending', memoryItemId: MEMORY_ID, characterId: 'seyeon', newUseBlocked: true }, meta: META };
const member = () => ({ kind: 'member', token: 'test-member-token' });

describe('Records Member Se-yeon memory access revocation', () => {
  it('sends only one bodyless POST and accepts verified committed ACK', async () => {
    const fetchImpl = vi.fn(async () => Response.json(COMMITTED));
    const client = createRecordsRuntimeClient({ fetchImpl, resolveBearer: member });
    await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).resolves.toMatchObject({ status: 'committed', revokedGrantCount: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(PATH);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { Authorization: 'Bearer test-member-token' },
    });
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });
  it('does not treat a pending acknowledgement as completed revocation', async () => {
    const fetchImpl = vi.fn(async () => Response.json(PENDING, { status: 202 }));
    const client = createRecordsRuntimeClient({ fetchImpl, resolveBearer: member });
    await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).resolves.toMatchObject({ status: 'pending', newUseBlocked: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('does not retry 503, timeout, mismatched, or uncommitted responses', async () => {
    const results = [
      () => new Response(null, { status: 503 }),
      () => { throw new Error('network failed'); },
      () => Response.json({ ...COMMITTED, data: { ...COMMITTED.data, memoryItemId: 'other-memory' } }),
      () => Response.json(PENDING),
      () => Response.json({ ...COMMITTED, data: { ...COMMITTED.data, replayed: true } }),
    ];
    for (const result of results) {
      const fetchImpl = vi.fn(async () => result());
      const client = createRecordsRuntimeClient({ fetchImpl, resolveBearer: member });
      await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).rejects.toMatchObject({ code: 'WEB_RECORDS_REVOKE_UNCONFIRMED' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });
  it('requires Member identity and rejects identity changes after POST', async () => {
    const fetchImpl = vi.fn(async () => Response.json(COMMITTED));
    const guest = createRecordsRuntimeClient({ fetchImpl, resolveBearer: () => ({ kind: 'guest', token: 'guest-token' }) });
    await expect(guest.revokeSeyeonMemoryGrant(MEMORY_ID)).rejects.toMatchObject({ code: 'WEB_RECORDS_MEMBER_REQUIRED' });
    expect(fetchImpl).not.toHaveBeenCalled();
    let count = 0;
    const client = createRecordsRuntimeClient({ fetchImpl, resolveBearer: () => ({ kind: 'member', token: ++count === 1 ? 'first' : 'second' }) });
    await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).rejects.toMatchObject({ code: 'WEB_RECORDS_SESSION_CHANGED' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
