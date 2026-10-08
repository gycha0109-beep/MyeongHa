import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  CHAT_LAUNCH_CHARACTER_IDS_V1,
} from '../packages/api-client/src/index.js';
import { MOBILE_CHAT_LAUNCH_ROSTER_V1 } from '../apps/mobile/src/features/chat/chat-launch-roster.js';

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile Chat mirrors web nine-character entry with server-owned send', () => {
  it('presents all nine canonical Characters for room open/reuse', async () => {
    expect(MOBILE_CHAT_LAUNCH_ROSTER_V1.map((entry) => entry.characterId))
      .toEqual([...CHAT_LAUNCH_CHARACTER_IDS_V1]);
    const hub = await source('apps/mobile/src/app/(tabs)/chat/index.tsx');
    expect(hub).toContain('MOBILE_CHAT_LAUNCH_ROSTER_V1.map');
    expect(hub).toContain('handleOpen(character.characterId)');
    const hook = await source('apps/mobile/src/features/chat/use-mobile-chat-open.tsx');
    expect(hook).toContain('mobileChatOpenServiceV1.open(characterId)');
    expect(hub).toContain('세연은 실제 AI 대화가 가능');
  });

  it('shares a reusable composer but does not offer eight unsupported AI backends', async () => {
    const component = await source('apps/mobile/src/features/chat/ChatReadComponents.tsx');
    const detail = await source('apps/mobile/src/app/(tabs)/chat/[threadId].tsx');
    const service = await source('apps/mobile/src/features/chat/mobile-chat-turn-send-service.ts');
    expect(detail).toContain('<ChatComposer');
    expect(detail).toContain('<ChatReadMessages');
    expect(component).toContain("snapshot.characterId === 'seyeon'");
    expect(component).toContain('이 캐릭터의 AI 대화는 준비 중입니다');
    expect(service).toContain("turn.characterId !== 'seyeon'");
  });

  it('performs Member-only server-authoritative send, then forward-cursor reread', async () => {
    const hook = await source('apps/mobile/src/features/chat/use-mobile-chat-thread.tsx');
    expect(hook).toContain('mobileChatTurnSendServiceV1.send(');
    expect(hook).toContain('mobileChatPendingTurnStoreV1.write(');
    expect(hook).toContain('result.assistantMessageId');
    expect(hook).toContain('controller.loadMore()');
    expect(hook).not.toContain('assistantText:');
  });
});
