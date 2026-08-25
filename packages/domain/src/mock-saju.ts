import type { SajuDomain } from '../../contracts/src/index.js';

export interface MockSajuRequest {
  readonly requestId: string;
  readonly domain: SajuDomain;
  readonly birthRevisionRef: string;
}

export interface ProtectedMockSajuSegment {
  readonly segmentId: string;
  readonly text: string;
  readonly semanticAuthority: 'none_dev_fixture_only';
}

export interface MockSajuResult {
  readonly adapterMode: 'synthetic_dev_fixture';
  readonly readingRef: string;
  readonly domain: SajuDomain;
  readonly protectedSegments: readonly ProtectedMockSajuSegment[];
  readonly ambiguity: readonly string[];
}

export class MockSajuAdapter {
  request(input: MockSajuRequest): MockSajuResult {
    const requestId = input.requestId.trim();
    const revisionRef = input.birthRevisionRef.trim();
    if (requestId.length === 0 || revisionRef.length === 0) {
      throw new TypeError('Mock Saju request requires requestId and birthRevisionRef.');
    }

    const segment = Object.freeze({
      segmentId: `mock-segment:${requestId}`,
      text: '개발용 모의 사주 결과입니다. 실제 명리 해석 의미를 포함하지 않습니다.',
      semanticAuthority: 'none_dev_fixture_only' as const,
    });

    return Object.freeze({
      adapterMode: 'synthetic_dev_fixture' as const,
      readingRef: `mock-reading:${requestId}`,
      domain: input.domain,
      protectedSegments: Object.freeze([segment]),
      ambiguity: Object.freeze([]),
    });
  }
}
