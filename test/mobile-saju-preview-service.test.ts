import { describe, expect, it } from 'vitest';

import { MyeongHaApiClientV1 } from '../packages/api-client/src/index.js';
import { createMobileSajuPreviewServiceV1 } from '../apps/mobile/src/features/saju/mobile-saju-preview-service.js';

const responseId = `reading_response_${'b'.repeat(24)}`;

describe('mobile Saju Preview service', () => {
  it('routes Preview Reading through the active subject bearer', async () => {
    let authorization: string | null = null;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        authorization = new Headers(init?.headers).get('Authorization');
        return Response.json({
          ok: true,
          data: {
            lifecycle: 'preview',
            reading: {
              responseId,
              responseVersion: 'myeonghwa-product-reading-response-v2',
              state: 'temporarily_unavailable',
              messageCode: 'READING_TEMPORARILY_UNAVAILABLE',
              requiredAction: 'try_again_later',
            },
          },
        });
      },
    });

    let sessionCalls = 0;
    const service = createMobileSajuPreviewServiceV1({
      client,
      session: {
        async withActiveBearer(operation) {
          sessionCalls += 1;
          return operation('active-subject-token');
        },
      },
    });

    await expect(service.read('사업운')).resolves.toMatchObject({
      kind: 'not_delivered',
      readingText: '사업운',
      responseState: 'temporarily_unavailable',
    });
    expect(sessionCalls).toBe(1);
    expect(authorization).toBe('Bearer active-subject-token');
  });
});
