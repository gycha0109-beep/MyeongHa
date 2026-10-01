import { describe, expect, it } from 'vitest';

import {
  projectProductReadingResponseV2,
} from '../packages/api-client/src/index.js';

describe('shared Product Reading safe display projector', () => {
  it('fails closed on unknown public block vocabulary', () => {
    expect(() => projectProductReadingResponseV2({
      responseId: `reading_response_${'e'.repeat(24)}`,
      responseVersion: 'myeonghwa-product-reading-response-v2',
      state: 'delivered',
      messageCode: 'READING_DELIVERED',
      requiredAction: 'none',
      reading: {
        readingId: 'reading-safe-1',
        sections: [{
          sectionType: 'overview',
          title: '핵심',
          state: 'complete',
          blocks: [{ type: 'mobile_invented_block', text: '노출 금지' }],
        }],
        disclosures: [],
      },
    })).toThrow();
  });
});
