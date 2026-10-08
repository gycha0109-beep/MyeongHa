import { describe, expect, it, vi } from 'vitest';
import { createRecordsRuntimeClient } from '../apps/web/records-runtime-client.js';

const pagination = { pageSize: 50, hasMore: false, nextCursor: null };
const currentBirth = {
  birthProfile: {
    birthProfileId: '11111111-1111-4111-8111-111111111111',
    profileKind: 'self',
    archivedAt: null,
    currentRevision: {
      revisionId: '22222222-2222-4222-8222-222222222222',
      revisionNo: 3,
      input: {
        calendarType: 'lunar', birthDate: '1997-02-05',
        birthTime: null, timeKnown: false, isLeapMonth: true, sex: null,
      },
    },
  },
};
function ok(data: unknown) {
  return Response.json({ ok: true, data, meta: {
    apiContractVersion: 'v0.9', requestId: 'mock-records',
    serverTime: '2026-10-08T12:00:00.000Z',
  } });
}
function makeFetch(overrides: Record<string, () => Response> = {}) {
  const calls: Array<{ path: string; bearer: string | null }> = [];
  const fetchImpl = vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, bearer: new Headers(init?.headers).get('Authorization') });
    if (overrides[path]) return overrides[path]();
    switch (path) {
      case '/api/me': return ok({ subjectKind: 'member', profile: { displayName: '회원' } });
      case '/api/life-record': return ok({ facts: [], pagination });
      case '/api/readings': return ok({ readings: [], pagination });
      case '/api/memories': return ok({ memories: [], pagination });
      case '/api/me/birth-profile': return ok(currentBirth);
      default: return Response.json({ ok: false }, { status: 404 });
    }
  });
  return { calls, fetchImpl };
}

describe('Web Records current-self Birth integration', () => {
  it('reads the existing authoritative Birth endpoint inside one stable subject snapshot', async () => {
    const { calls, fetchImpl } = makeFetch();
    let bearerReads = 0;
    const runtime = createRecordsRuntimeClient({
      fetchImpl,
      resolveBearer: async () => {
        bearerReads += 1;
        return { kind: 'member', token: 'stable-member-token' };
      },
    });
    const result = await runtime.readRecords();
    expect(result.birth).toMatchObject({
      status: 'ready',
      payload: { birthProfile: { currentRevision: {
        revisionNo: 3,
        input: { calendarType: 'lunar', birthDate: '1997-02-05', timeKnown: false },
      } } },
    });
    expect(result.readings).toMatchObject({ readings: [] });
    expect(bearerReads).toBe(2);
    expect(calls.map(x => x.path)).toEqual([
      '/api/me', '/api/life-record', '/api/readings',
      '/api/memories', '/api/me/birth-profile',
    ]);
    expect(calls.every(x => x.bearer === 'Bearer stable-member-token')).toBe(true);
  });

  it('does not fabricate a Birth record when the Subject has none', async () => {
    const { fetchImpl } = makeFetch({
      '/api/me/birth-profile': () => ok({ birthProfile: null }),
    });
    const result = await createRecordsRuntimeClient({
      fetchImpl,
      resolveBearer: async () => ({ kind: 'guest', token: 'guest-token' }),
    }).readRecords();
    expect(result.birth).toEqual({ status: 'ready', payload: { birthProfile: null } });
  });

  it('keeps Saju and Memories available if the Birth endpoint temporarily fails', async () => {
    const { fetchImpl } = makeFetch({
      '/api/me/birth-profile': () => Response.json({ ok: false }, { status: 503 }),
    });
    const result = await createRecordsRuntimeClient({
      fetchImpl,
      resolveBearer: async () => ({ kind: 'member', token: 'stable-member-token' }),
    }).readRecords();
    expect(result.birth).toEqual({ status: 'unavailable' });
    expect(result.readings.readings).toEqual([]);
    expect(result.memories.memories).toEqual([]);
  });

  it('never displays an invalid current revision as verified Birth data', async () => {
    const { fetchImpl } = makeFetch({
      '/api/me/birth-profile': () => ok({
        birthProfile: {
          ...currentBirth.birthProfile,
          currentRevision: { ...currentBirth.birthProfile.currentRevision, input: {
            ...currentBirth.birthProfile.currentRevision.input,
            timeKnown: true, birthTime: null,
          } },
        },
      }),
    });
    const result = await createRecordsRuntimeClient({
      fetchImpl,
      resolveBearer: async () => ({ kind: 'member', token: 'stable-member-token' }),
    }).readRecords();
    expect(result.birth).toEqual({ status: 'unavailable' });
  });
});
