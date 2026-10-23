import { describe, expect, it } from 'vitest';
import {
  SAJU_FIVE_PREVIEW_TOPICS_V1, projectSajuFiveDomainPreviewV1,
} from '../apps/web/saju-five-domain-preview-projection.js';

function envelope(readingText: string, state = 'delivered') {
  return {
    ok: true,
    data: {
      lifecycle: 'preview',
      reading: {
        responseId: 'reading_response_' + 'a'.repeat(24),
        responseVersion: 'myeonghwa-product-reading-response-v2',
        state,
        messageCode: 'READING_DELIVERED',
        requiredAction: 'none',
        reading: {
          readingId: 'reading-' + readingText,
          sections: [
            { sectionType: 'overview', title: '프리뷰 안내', state: 'complete',
              blocks: [{ type: 'paragraph', text: '프리뷰 전용 결과입니다.' }] },
            { sectionType: 'personality', title: '원국 관찰', state: 'complete',
              blocks: [
                { type: 'paragraph', text: readingText + ' 실제 소스 풀이' },
                { type: 'source_hint', text: '근거 구조: 명식 사실' },
              ] },
          ],
          disclosures: [{ type: 'scope_limitation', text: '입력 범위에서만 풀이합니다.' }],
        },
      },
    },
  };
}

describe('Saju five-domain reader result, not a synthetic interpretation', () => {
  it('requests exactly five existing authorized natal preview topics', () => {
    expect(SAJU_FIVE_PREVIEW_TOPICS_V1.map(item => item.readingText)).toEqual([
      '전체 사주', '직업운', '재물운', '사업운', '연애운',
    ]);
  });

  it('displays source-delivered paragraphs, preserving domain-specific content and limits', () => {
    for (const topic of SAJU_FIVE_PREVIEW_TOPICS_V1) {
      const delivered = projectSajuFiveDomainPreviewV1(envelope(topic.readingText));
      expect(delivered?.sections[0]?.paragraphs).toEqual([topic.readingText + ' 실제 소스 풀이']);
      expect(delivered?.disclosures).toEqual(['입력 범위에서만 풀이합니다.']);
    }
  });

  it('does not fabricate results from unsupported or malformed deliveries', () => {
    expect(projectSajuFiveDomainPreviewV1(envelope('재물운', 'insufficient_evidence'))).toBeNull();
    const malformed = envelope('연애운');
    malformed.data.reading.responseVersion = 'made-up-preview';
    expect(projectSajuFiveDomainPreviewV1(malformed)).toBeNull();
  });
});
