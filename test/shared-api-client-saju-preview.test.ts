import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientV1,
  SAJU_PREVIEW_READING_TEXTS_V1,
  readCurrentSajuPreviewReadingV1,
} from '../packages/api-client/src/index.js';

const responseId = `reading_response_${'a'.repeat(24)}`;

function success(reading: unknown): Response {
  return Response.json({
    ok: true,
    data: { lifecycle: 'preview', reading },
    meta: { apiContractVersion: 'v0.9', requestId: 'req-preview-1' },
  });
}

function deliveredReading() {
  return {
    responseId,
    responseVersion: 'myeonghwa-product-reading-response-v2',
    state: 'delivered',
    messageCode: 'READING_DELIVERED',
    requiredAction: 'none',
    reading: {
      readingId: 'reading-1',
      sections: [
        {
          sectionType: 'overview',
          title: '프리뷰 안내',
          state: 'complete',
          blocks: [
            { type: 'paragraph', text: '연구 검증 중인 프리뷰입니다.' },
          ],
        },
        {
          sectionType: 'career',
          title: '직업 흐름',
          state: 'complete',
          blocks: [
            { type: 'paragraph', text: '첫 번째 해석 문장' },
            { type: 'source_hint', text: '근거 구조: 일간과 월주의 관계' },
            { type: 'key_points', items: ['두 번째 포인트', '세 번째 포인트'] },
            {
              type: 'comparison',
              title: '비교',
              perspectives: [{ label: 'A', text: '비교 문장' }],
            },
          ],
        },
        {
          sectionType: 'wealth',
          title: '표시하지 않는 섹션',
          state: 'unavailable',
          blocks: [{ type: 'paragraph', text: '노출 금지' }],
        },
      ],
      disclosures: [
        { type: 'scope_limitation', text: '원국 범위만 다룹니다.' },
        { type: 'methodology_difference', text: '방법론 차이를 함께 확인합니다.' },
      ],
    },
  };
}

describe('shared current-subject Saju Preview client', () => {
  it('uses exactly the five server-approved Preview texts', () => {
    expect(SAJU_PREVIEW_READING_TEXTS_V1).toEqual([
      '전체 사주',
      '직업운',
      '재물운',
      '연애운',
      '사업운',
    ]);
  });

  it('sends exactly readingText and projects only governed display blocks', async () => {
    let body: unknown = null;
    let authorization: string | null = null;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        authorization = new Headers(init?.headers).get('Authorization');
        body = JSON.parse(String(init?.body));
        return success(deliveredReading());
      },
    });

    await expect(
      readCurrentSajuPreviewReadingV1(client, 'opaque-subject-token', '직업운'),
    ).resolves.toEqual({
      kind: 'delivered',
      readingText: '직업운',
      responseState: 'delivered',
      readingId: 'reading-1',
      steps: [
        {
          title: '직업 흐름',
          primary: '첫 번째 해석 문장',
          supporting: [
            '두 번째 포인트',
            '세 번째 포인트',
            'A: 비교 문장',
            '방법론 차이를 함께 확인합니다.',
          ],
          structure: ['근거 구조: 일간과 월주의 관계'],
        },
      ],
      notices: [
        '연구 검증 중인 프리뷰입니다.',
        '원국 범위만 다룹니다.',
      ],
    });
    expect(authorization).toBe('Bearer opaque-subject-token');
    expect(body).toEqual({ readingText: '직업운' });
  });

  it('rejects an unapproved Preview text before network execution', async () => {
    let calls = 0;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => {
        calls += 1;
        return success(deliveredReading());
      },
    });

    await expect(
      readCurrentSajuPreviewReadingV1(client, 'opaque-subject-token', '올해 운세'),
    ).rejects.toMatchObject({ code: 'CLIENT_SAJU_PREVIEW_READING_INVALID' });
    expect(calls).toBe(0);
  });

  it('keeps non-delivered Product states semantic-neutral', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success({
        responseId,
        responseVersion: 'myeonghwa-product-reading-response-v2',
        state: 'insufficient_evidence',
        messageCode: 'READING_EVIDENCE_INSUFFICIENT',
        requiredAction: 'none',
        coverage: {
          state: 'insufficient',
          hasAvailableEvidence: false,
          missingRequirementCount: 2,
        },
      }),
    });

    await expect(
      readCurrentSajuPreviewReadingV1(client, 'opaque-subject-token', '재물운'),
    ).resolves.toEqual({
      kind: 'not_delivered',
      readingText: '재물운',
      responseState: 'insufficient_evidence',
      messageCode: 'READING_EVIDENCE_INSUFFICIENT',
      requiredAction: 'none',
    });
  });

  it('fails closed on a section type outside the public Product Reading contract', async () => {
    const response = deliveredReading();
    response.reading.sections[1]!.sectionType = 'invented_mobile_section';
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success(response),
    });

    await expect(
      readCurrentSajuPreviewReadingV1(client, 'opaque-subject-token', '직업운'),
    ).rejects.toMatchObject({ code: 'API_SAJU_PREVIEW_RESPONSE_INVALID' });
  });

  it('fails closed when state/message/action provenance drifts', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success({
        ...deliveredReading(),
        messageCode: 'READING_TEMPORARILY_UNAVAILABLE',
      }),
    });

    await expect(
      readCurrentSajuPreviewReadingV1(client, 'opaque-subject-token', '전체 사주'),
    ).rejects.toMatchObject({ code: 'API_SAJU_PREVIEW_RESPONSE_INVALID' });
  });
});
