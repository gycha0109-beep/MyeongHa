import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M6-A Chat read authority boundary', () => {
  it('implements read only and does not expose Chat-open/send mutation in the Mobile service', async () => {
    const service = await readRepoFile('apps/mobile/src/features/chat/mobile-chat-read-service.ts');
    expect(service).toContain('readChatThreadPageV1');
    expect(service).not.toContain('POST');
    expect(service).not.toContain('open');
    expect(service).not.toContain('send');
  });

  it('keeps the Chat Hub from fabricating recent-thread discovery after Member open is added', async () => {
    const hub = await readRepoFile('apps/mobile/src/app/(tabs)/chat/index.tsx');
    expect(hub).not.toContain('/api/chat');
    expect(hub).toContain('최근 대화 목록은 아직 서버에서 제공하지 않아');
  });
});
