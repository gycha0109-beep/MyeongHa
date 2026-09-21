import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_READING_PRODUCT_RESPONSE_VERSION_V1,
  CharacterStandardReadingProtectedContextErrorV1,
  projectOfficialStandardReadingToProtectedCharacterSajuContextV1,
  type CharacterStandardReadingKnowledgeSourceV1,
} from '../apps/api/src/index.js';
import { hashProtectedSajuTextV1 } from '../packages/domain/src/index.js';

function responseSnapshot(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    responseId: 'reading_response_111111111111111111111111',
    responseVersion: OFFICIAL_READING_PRODUCT_RESPONSE_VERSION_V1,
    state: 'delivered',
    messageCode: 'READING_DELIVERED',
    requiredAction: 'none',
    reading: {
      readingId: '11111111-1111-4111-8111-111111111111',
      brand: { brandId: 'myeonghwa', displayName: '명화' },
      subject: {
        birthInputDisplay: {
          calendarType: 'solar',
          date: '1996-01-09',
          time: '09:30',
          timeKnown: true,
        },
        calculationState: 'resolved',
      },
      calculationSummary: {
        pillars: {
          year: { label: '연주', value: '갑자', status: 'resolved' },
          month: { label: '월주', value: '을축', status: 'resolved' },
          day: { label: '일주', value: '병인', status: 'resolved' },
          hour: { label: '시주', value: '정묘', status: 'resolved' },
        },
        ambiguity: [{ title: '시각 경계', summary: '경계값은 확인이 필요합니다.' }],
      },
      sections: [
        {
          sectionType: 'overview',
          title: '전체',
          state: 'complete',
          blocks: [
            { type: 'paragraph', text: '공식 핵심 풀이입니다.' },
            { type: 'key_points', items: ['첫 번째 포인트', '두 번째 포인트'] },
            {
              type: 'comparison',
              title: '관점 차이',
              perspectives: [
                { label: '관점 A', text: 'A에서는 이렇게 봅니다.' },
                { label: '관점 B', text: 'B에서는 다르게 봅니다.' },
              ],
            },
            {
              type: 'ambiguity',
              summary: '두 가능성이 남아 있습니다.',
              scenarios: [
                { label: '경우 1', text: '첫 경우입니다.' },
                { label: '경우 2', text: '둘째 경우입니다.' },
              ],
            },
          ],
        },
        {
          sectionType: 'timing',
          title: '흐름',
          state: 'complete',
          blocks: [
            {
              type: 'timeline',
              entries: [{ label: '2027', text: '변화가 강조되는 구간입니다.' }],
            },
            {
              type: 'fact_table',
              rows: [{ label: '오행', value: '목 기운이 표시됩니다.' }],
            },
            { type: 'source_hint', text: '적용 방법론 차이를 함께 확인하세요.' },
          ],
        },
      ],
      disclosures: [
        { type: 'scope_limitation', text: '이 결과는 현재 구매 범위에 한정됩니다.' },
      ],
      generatedAt: '2026-09-20T23:00:00.000Z',
    },
    ...overrides,
  };
}

function source(
  overrides: Partial<CharacterStandardReadingKnowledgeSourceV1> = {},
): CharacterStandardReadingKnowledgeSourceV1 {
  return {
    subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    readingId: '11111111-1111-4111-8111-111111111111',
    readingSessionId: '22222222-2222-4222-8222-222222222222',
    productId: '33333333-3333-4333-8333-333333333333',
    readerCharacterId: 'baekheon',
    readerContentBundleId: '55555555-5555-4555-8555-555555555555',
    topicKey: 'general',
    sajuDomain: 'general',
    readingPeriod: 'original',
    readingVariant: 'standard',
    sourceBirthRevisionId: '44444444-4444-4444-8444-444444444444',
    productSpecVersion: 'standard-reading-v1',
    domainCapabilityVersion: 'general-v1',
    readingContractVersion: OFFICIAL_READING_PRODUCT_RESPONSE_VERSION_V1,
    sajuEngineVersion: 'saju-engine-v1',
    responseHash: 'sha256:v1:official-reading-hash',
    productResponseState: 'delivered',
    responseSnapshotJsonb: responseSnapshot(),
    completedAt: '2026-09-20T23:00:00.000Z',
    ...overrides,
  };
}

describe('Official Standard Reading -> protected Character Saju context', () => {
  it('projects exact Official Reading text into server-injected protected fields', () => {
    const result = projectOfficialStandardReadingToProtectedCharacterSajuContextV1(source());

    expect(result.readingRef).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.domain).toBe('general');
    expect(result.coverageState).toBe('complete');
    expect(result.protectedSegments.map((segment) => segment.text)).toEqual([
      '공식 핵심 풀이입니다.',
      '첫 번째 포인트',
      '두 번째 포인트',
      '관점 차이\n관점 A: A에서는 이렇게 봅니다.',
      '관점 차이\n관점 B: B에서는 다르게 봅니다.',
      '2027: 변화가 강조되는 구간입니다.',
      '오행: 목 기운이 표시됩니다.',
      '적용 방법론 차이를 함께 확인하세요.',
    ]);
    expect(result.disclosures.map((item) => item.text)).toEqual([
      '이 결과는 현재 구매 범위에 한정됩니다.',
    ]);
    expect(result.ambiguity).toEqual([
      '두 가능성이 남아 있습니다.\n경우 1: 첫 경우입니다.\n경우 2: 둘째 경우입니다.',
      '시각 경계\n경계값은 확인이 필요합니다.',
    ]);

    for (const item of [...result.protectedSegments, ...result.disclosures]) {
      expect(item.sourceReadingRef).toBe(result.readingRef);
      expect(item.contentHash).toBe(hashProtectedSajuTextV1(item.text));
    }
  });

  it('projects delivered_with_fallback conservatively as partial coverage', () => {
    const snapshot = responseSnapshot({ state: 'delivered_with_fallback' });
    const result = projectOfficialStandardReadingToProtectedCharacterSajuContextV1(
      source({
        productResponseState: 'delivered_with_fallback',
        responseSnapshotJsonb: snapshot,
      }),
    );
    expect(result.coverageState).toBe('partial');
  });

  it('fails closed when the stored contract version is not the pinned Saju public contract', () => {
    expect(() =>
      projectOfficialStandardReadingToProtectedCharacterSajuContextV1(
        source({ readingContractVersion: 'myeonghwa-product-reading-response-v1' }),
      ),
    ).toThrow(CharacterStandardReadingProtectedContextErrorV1);
  });

  it('fails closed when snapshot provenance disagrees with stored state', () => {
    expect(() =>
      projectOfficialStandardReadingToProtectedCharacterSajuContextV1(
        source({
          responseSnapshotJsonb: responseSnapshot({ state: 'delivered_with_fallback' }),
        }),
      ),
    ).toThrow(/snapshot state does not match/u);
  });

  it('fails closed when snapshot Reading identity differs from the authorized Official Reading', () => {
    const snapshot = responseSnapshot();
    const reading = snapshot.reading as Record<string, unknown>;
    expect(() =>
      projectOfficialStandardReadingToProtectedCharacterSajuContextV1(
        source({
          responseSnapshotJsonb: {
            ...snapshot,
            reading: { ...reading, readingId: '99999999-9999-4999-8999-999999999999' },
          },
        }),
      ),
    ).toThrow(/snapshot identity does not match/u);
  });

  it('fails closed on an unknown block type instead of inventing semantics', () => {
    const snapshot = responseSnapshot();
    const reading = snapshot.reading as Record<string, unknown>;
    const sections = reading.sections as readonly Record<string, unknown>[];
    const first = sections[0]!;
    expect(() =>
      projectOfficialStandardReadingToProtectedCharacterSajuContextV1(
        source({
          responseSnapshotJsonb: {
            ...snapshot,
            reading: {
              ...reading,
              sections: [
                {
                  ...first,
                  blocks: [{ type: 'invented_block', text: '사용하면 안 됩니다.' }],
                },
              ],
            },
          },
        }),
      ),
    ).toThrow(/not supported by the pinned ProductReadingResponse contract/u);
  });

  it('does not use Character prose or client handoff text to replace Official Reading text', () => {
    const result = projectOfficialStandardReadingToProtectedCharacterSajuContextV1(source());
    const allProtected = [
      ...result.protectedSegments.map((item) => item.text),
      ...result.disclosures.map((item) => item.text),
      ...result.ambiguity,
    ].join('\n');

    expect(allProtected).not.toContain('클라이언트가 바꾼 사주 본문');
    expect(allProtected).not.toContain('백헌이 새로 만든 명리 결론');
  });
});
