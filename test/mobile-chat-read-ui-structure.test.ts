import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M6-B Chat read UI structure', () => {
  it('keeps known-thread detail under the Chat primary tab and read-only', async () => {
    const detail = await readRepoFile('apps/mobile/src/app/(tabs)/chat/[threadId].tsx');
    expect(detail).toContain('useMobileChatThreadV1');
    expect(detail).not.toContain('TextInput');
    expect(detail).not.toContain('fetch(');
    expect(detail).not.toContain('SecureStore');
    expect(detail).not.toContain('sendMessage');
  });

  it('keeps Chat Hub free of fake discovery and static Character roster', async () => {
    const hub = await readRepoFile('apps/mobile/src/app/(tabs)/chat/index.tsx');
    expect(hub).toContain('최근 대화 목록은 아직 서버에서 제공하지 않아');
    for (const name of ['백헌', '세연', '여울', '서린', '라현', '미라', '태겸', '윤호', '도윤']) {
      expect(hub).not.toContain(name);
    }
    expect(hub).not.toContain('threadId');
  });

  it('does not expose raw message payloads or redacted body content in UI components', async () => {
    const components = await readRepoFile('apps/mobile/src/features/chat/ChatReadComponents.tsx');
    expect(components).not.toContain('messagePayloadJsonb');
    expect(components).not.toContain('bodyText');
    expect(components).toContain('createMobileChatMessageViewV1');
  });
});
