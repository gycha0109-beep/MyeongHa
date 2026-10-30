import { describe, expect, it, vi } from 'vitest';
import { createRecordsRuntimeClient } from '../apps/web/records-runtime-client.js';

const pagination = { pageSize: 50, hasMore: false, nextCursor: null };
const ok = (data: unknown) => Response.json({ ok: true, data, meta: {
  apiContractVersion: 'v0.9', requestId: 'mock-records',
  serverTime: '2026-10-08T12:00:00.000Z',
} });

describe('Web Records page-scoped reads', () => {
  function makeClient(overrides: Record<string, () => Response> = {}) {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (path: string) => {
      calls.push(path);
      if (overrides[path]) return overrides[path]();
      if (path === '/api/me') return ok({ subjectKind: 'member', profile: { displayName: '회원' } });
      if (path === '/api/life-record') return ok({ facts: [], pagination });
      if (path === '/api/readings') return ok({ readings: [], pagination });
      throw new Error('Records must not request ' + path);
    });
    return { calls, runtime: createRecordsRuntimeClient({
      fetchImpl, resolveBearer: () => ({ kind: 'member', token: 'stable-member-token' }),
    }) };
  }

  it('fetches only profile, Life Facts and official Reading History', async () => {
    const { calls, runtime } = makeClient();
    const result = await runtime.readRecords();
    expect(result).toHaveProperty('profile');
    expect(result).toHaveProperty('lifeFacts');
    expect(result).toHaveProperty('readings');
    expect(result).not.toHaveProperty('birth');
    expect(result).not.toHaveProperty('memories');
    expect(calls).toEqual(['/api/me', '/api/life-record', '/api/readings']);
  });

  it('keeps Life Facts readable when the official archive is unavailable', async () => {
    const { runtime } = makeClient({
      '/api/readings': () => Response.json({ ok: false }, { status: 503 }),
    });
    const result = await runtime.readRecords();
    expect(result.readings).toEqual({ status: 'unavailable' });
    expect(result.lifeFacts.facts).toEqual([]);
  });

  it('fails closed if the current account is denied', async () => {
    const { runtime } = makeClient({
      '/api/readings': () => Response.json({ ok: false }, { status: 403 }),
    });
    await expect(runtime.readRecords()).rejects.toMatchObject({
      code: 'WEB_RECORDS_SESSION_REQUIRED',
    });
  });
});
