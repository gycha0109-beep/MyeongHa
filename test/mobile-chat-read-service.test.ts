import { describe, expect, it } from 'vitest';

import { MyeongHaApiClientV1 } from '../packages/api-client/src/index.js';
import { createMobileChatReadServiceV1 } from '../apps/mobile/src/features/chat/mobile-chat-read-service.js';

const threadId = '123e4567-e89b-42d3-a456-426614174000';

function success(data: unknown): Response {
  return Response.json(
    { ok: true, data, meta: { apiContractVersion: 'v0.9', requestId: 'req-chat' } },
    { status: 200 },
  );
}

describe('mobile Chat read service', () => {
  it('routes thread reads through the subject bearer boundary', async () => {
    let authorization: string | null = null;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        authorization = new Headers(init?.headers).get('Authorization');
        return success({
          threadId,
          characterId: 'baekheon',
          contentReleaseId: 'release-1',
          contentBundleId: 'bundle-1',
          contentRevision: 1,
          afterSequenceNo: 0,
          lastSequenceNo: 0,
          messages: [],
          pagination: { pageSize: 30, hasMore: false, nextAfterSequenceNo: null },
          latestCharacterMessage: null,
          relationship: null,
        });
      },
    });
    let sessions = 0;
    const service = createMobileChatReadServiceV1({
      client,
      session: {
        async withGuestBearer(operation) {
          sessions += 1;
          return operation('guest-token');
        },
      },
    });

    await service.readThreadPage(threadId);

    expect(sessions).toBe(1);
    expect(authorization).toBe('Bearer guest-token');
  });
});
