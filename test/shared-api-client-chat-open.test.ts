import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientV1,
  openMemberCharacterThreadV1,
  parseChatLaunchCharacterIdV1,
} from '../packages/api-client/src/index.js';

const threadId = '123e4567-e89b-42d3-a456-426614174000';

function success(data: unknown): Response {
  return Response.json({ ok: true, data }, { status: 200 });
}

describe('shared Member Chat-open client', () => {
  it('sends exactly the canonical Launch character id with the Member bearer', async () => {
    let method = '';
    let path = '';
    let authorization: string | null = null;
    let body: unknown = null;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        method = init?.method ?? '';
        path = url.pathname;
        authorization = new Headers(init?.headers).get('Authorization');
        body = JSON.parse(String(init?.body));
        return success({ threadId, characterId: 'seyeon', created: false });
      },
    });

    await expect(
      openMemberCharacterThreadV1(client, 'member-bearer', 'seyeon'),
    ).resolves.toEqual({
      threadId,
      characterId: 'seyeon',
      created: false,
    });

    expect(method).toBe('POST');
    expect(path).toBe('/api/chat');
    expect(authorization).toBe('Bearer member-bearer');
    expect(body).toEqual({ characterId: 'seyeon' });
  });

  it('rejects an unapproved Character before network execution', async () => {
    let calls = 0;
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => {
        calls += 1;
        return success({});
      },
    });

    await expect(
      openMemberCharacterThreadV1(client, 'member-bearer', 'doyoon'),
    ).rejects.toMatchObject({ code: 'CLIENT_CHAT_OPEN_INVALID' });
    expect(calls).toBe(0);
    expect(() => parseChatLaunchCharacterIdV1('doyoon')).toThrow();
  });

  it('fails closed when the server returns a different Character', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () =>
        success({ threadId, characterId: 'yeoul', created: true }),
    });

    await expect(
      openMemberCharacterThreadV1(client, 'member-bearer', 'seyeon'),
    ).rejects.toMatchObject({ code: 'API_CHAT_RESPONSE_INVALID' });
  });
});
