import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientV1,
  readOfficialReadingRecordV1,
} from '../packages/api-client/src/index.js';

const readingId = '44444444-4444-4444-8444-444444444444';
const readingSessionId = '55555555-5555-4555-8555-555555555555';
const responseId = `reading_response_${'c'.repeat(24)}`;

function responseSnapshot(state: 'delivered' | 'delivered_with_fallback' = 'delivered') {
  return {
    responseId,
    responseVersion: 'myeonghwa-product-reading-response-v2',
    state,
    messageCode:
      state === 'delivered'
        ? 'READING_DELIVERED'
        : 'READING_DELIVERED_WITH_GROUNDED_FALLBACK',
    requiredAction: 'none',
    reading: {
      readingId,
      sections: [
        {
          sectionType: 'career',
          title: '직업 흐름',
          state: 'complete',
          blocks: [
            { type: 'paragraph', text: '저장된 공식 해석' },
            { type: 'source_hint', text: '근거 구조: 저장된 근거' },
          ],
        },
      ],
      disclosures: [
        { type: 'scope_limitation', text: '저장 당시 범위만 다시 표시합니다.' },
      ],
    },
  };
}

function record(state: 'delivered' | 'delivered_with_fallback' = 'delivered') {
  return {
    readingId,
    readingSessionId,
    sajuDomain: 'career',
    readingContractVersion: 'myeonghwa-product-reading-response-v2',
    productResponseState: state,
    readerCharacterIds: ['seyeon'],
    completedAt: '2026-09-23T00:01:00.000Z',
    reading: responseSnapshot(state),
    responseHash: 'must-not-project',
  };
}

function success(data: unknown): Response {
  return Response.json({ ok: true, data });
}

describe('shared Official Reading archive client', () => {
  it('reads the exact owner-scoped record and projects only safe Product Reading display data', async () => {
    let path = '';
    let authorization: string | null = null;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        path = `${url.pathname}?${url.searchParams.toString()}`;
        authorization = new Headers(init?.headers).get('Authorization');
        return success(record());
      },
    });

    const result = await readOfficialReadingRecordV1(
      client,
      'owner-token',
      readingId,
    );

    expect(path).toBe(`/api/readings?readingId=${readingId}`);
    expect(authorization).toBe('Bearer owner-token');
    expect(result).toEqual({
      readingId,
      readingSessionId,
      sajuDomain: 'career',
      readingContractVersion: 'myeonghwa-product-reading-response-v2',
      productResponseState: 'delivered',
      readerCharacterIds: ['seyeon'],
      completedAt: '2026-09-23T00:01:00.000Z',
      display: {
        kind: 'delivered',
        responseVersion: 'myeonghwa-product-reading-response-v2',
        responseState: 'delivered',
        readingId,
        steps: [{
          title: '직업 흐름',
          primary: '저장된 공식 해석',
          supporting: [],
          structure: ['근거 구조: 저장된 근거'],
        }],
        notices: ['저장 당시 범위만 다시 표시합니다.'],
      },
    });
    expect(result).not.toHaveProperty('responseHash');
    expect(result).not.toHaveProperty('reading');
  });

  it('rejects malformed ids before network execution', async () => {
    let calls = 0;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => {
        calls += 1;
        return success(record());
      },
    });

    await expect(
      readOfficialReadingRecordV1(client, 'owner-token', 'reading-1'),
    ).rejects.toMatchObject({ code: 'CLIENT_OFFICIAL_READING_ID_INVALID' });
    expect(calls).toBe(0);
  });

  it('fails closed on stored snapshot provenance drift', async () => {
    const drifted = record();
    drifted.reading.reading.readingId =
      '77777777-7777-4777-8777-777777777777';
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success(drifted),
    });

    await expect(
      readOfficialReadingRecordV1(client, 'owner-token', readingId),
    ).rejects.toMatchObject({ code: 'API_RECORDS_RESPONSE_INVALID' });
  });

  it('rejects non-openable archive states instead of substituting another Reading', async () => {
    const value = {
      ...record(),
      productResponseState: 'clarification_required',
    };
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success(value),
    });

    await expect(
      readOfficialReadingRecordV1(client, 'owner-token', readingId),
    ).rejects.toMatchObject({ code: 'API_RECORDS_RESPONSE_INVALID' });
  });
});
