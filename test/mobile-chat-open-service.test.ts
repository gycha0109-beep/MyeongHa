import { describe, expect, it } from 'vitest';

import { MyeongHaApiClientV1 } from '../packages/api-client/src/index.js';
import { createMobileChatOpenServiceV1 } from '../apps/mobile/src/features/chat/mobile-chat-open-service.js';

const threadId = '123e4567-e89b-42d3-a456-426614174000';

describe('mobile Member Chat-open service', () => {
  it('uses only the Member bearer boundary for Chat open/reuse', async () => {
    let authorization: string | null = null;
    let body: unknown = null;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (_input, init) => {
        authorization = new Headers(init?.headers).get('Authorization');
        body = JSON.parse(String(init?.body));
        return Response.json({
          ok: true,
          data: { threadId, characterId: 'baekheon', created: true },
        });
      },
    });
    let memberCalls = 0;
    const service = createMobileChatOpenServiceV1({
      client,
      memberSession: {
        async withMemberBearer(operation) {
          memberCalls += 1;
          return operation('member-only-token');
        },
      },
    });

    await expect(service.open('baekheon')).resolves.toMatchObject({
      threadId,
      characterId: 'baekheon',
      created: true,
    });
    expect(memberCalls).toBe(1);
    expect(authorization).toBe('Bearer member-only-token');
    expect(body).toEqual({ characterId: 'baekheon' });
  });
});
