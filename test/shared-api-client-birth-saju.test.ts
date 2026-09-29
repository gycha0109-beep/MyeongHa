import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientV1,
  calculateCurrentSajuV1,
  createBirthProfileV1,
  readCurrentBirthProfileV1,
} from '../packages/api-client/src/index.js';

function success(data: unknown, status = 200): Response {
  return Response.json(
    { ok: true, data, meta: { apiContractVersion: 'v0.9', requestId: 'req-1' } },
    { status },
  );
}

const currentBirth = Object.freeze({
  birthProfileId: 'birth-1',
  profileKind: 'self',
  label: null,
  archivedAt: null,
  currentRevision: {
    revisionId: 'revision-1',
    revisionNo: 1,
    input: {
      calendarType: 'solar',
      birthDate: '1995-08-17',
      birthTime: '14:30',
      timeKnown: true,
      isLeapMonth: false,
      sex: 'male',
    },
  },
  revisions: [{ revisionId: 'revision-1', revisionNo: 1, isCurrent: true }],
});

const resolvedPillar = Object.freeze({
  status: 'resolved',
  value: {
    stem: { value: '갑', hanja: '甲', element: '목', yinYang: '양' },
    branch: { value: '자', hanja: '子', element: '수', yinYang: '양' },
  },
});

const calculation = Object.freeze({
  schemaVersion: 'myeongha-saju-production-calculation-ingress-v1',
  kind: 'saju_calculation_evidence',
  semanticAuthority: 'calculation_only',
  interpretationAuthorized: false,
  birthRevisionRef: 'revision-1',
  snapshot: {
    snapshotId: 'snapshot-1',
    schemaVersion: 'snapshot-v1',
    calculationHash: 'hash-1',
    createdAt: '2026-09-29T00:00:00.000Z',
    pillars: {
      year: resolvedPillar,
      month: resolvedPillar,
      day: resolvedPillar,
      hour: resolvedPillar,
    },
    completeness: {
      birthTimeKnown: true,
      fullyResolved: true,
      resolvedPaths: ['pillars.year', 'pillars.month', 'pillars.day', 'pillars.hour'],
      ambiguousPaths: [],
      unavailablePaths: [],
    },
  },
});

describe('shared Birth and Saju API client', () => {
  it('reads null current Birth Profile without manufacturing local state', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success({ birthProfile: null }),
    });

    await expect(
      readCurrentBirthProfileV1(client, 'opaque-guest-token'),
    ).resolves.toBeNull();
  });

  it('parses the canonical current self Birth Profile', async () => {
    let authorization: string | null = null;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        authorization = new Headers(init?.headers).get('Authorization');
        return success({ birthProfile: currentBirth });
      },
    });

    const result = await readCurrentBirthProfileV1(client, 'opaque-guest-token');
    expect(authorization).toBe('Bearer opaque-guest-token');
    expect(result?.currentRevision.input.birthDate).toBe('1995-08-17');
    expect(result?.profileKind).toBe('self');
  });

  it('sends the exact Birth create contract and parses revision-1 receipt', async () => {
    let body: unknown;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return success(
          { birthProfileId: 'birth-1', revisionId: 'revision-1', revisionNo: 1 },
          201,
        );
      },
    });

    const request = {
      label: null,
      input: {
        calendarType: 'solar' as const,
        birthDate: '1995-08-17',
        birthTime: '14:30',
        timeKnown: true,
        isLeapMonth: false,
        sex: 'male' as const,
      },
    };

    const receipt = await createBirthProfileV1(
      client,
      'opaque-guest-token',
      request,
    );

    expect(body).toEqual(request);
    expect(receipt).toEqual({
      birthProfileId: 'birth-1',
      revisionId: 'revision-1',
      revisionNo: 1,
    });
  });

  it('posts current Saju calculation with no request body', async () => {
    let method = '';
    let body: BodyInit | null | undefined = 'unexpected';
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        method = init?.method ?? '';
        body = init?.body;
        return success({ calculation });
      },
    });

    const result = await calculateCurrentSajuV1(
      client,
      'opaque-guest-token',
    );

    expect(method).toBe('POST');
    expect(body).toBeUndefined();
    expect(result.semanticAuthority).toBe('calculation_only');
    expect(result.interpretationAuthorized).toBe(false);
    expect(result.snapshot.pillars.day.status).toBe('resolved');
  });

  it('rejects a calculation payload that attempts to authorize interpretation', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () =>
        success({
          calculation: {
            ...calculation,
            interpretationAuthorized: true,
          },
        }),
    });

    await expect(
      calculateCurrentSajuV1(client, 'opaque-guest-token'),
    ).rejects.toMatchObject({
      kind: 'malformed_response',
      code: 'API_SAJU_RESPONSE_INVALID',
    });
  });
});
