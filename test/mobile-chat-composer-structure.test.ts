import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { projectMobileChatComposeUiV1 } from '../apps/mobile/src/features/chat/mobile-chat-compose-ui-locale-v1.js';
import {
  CHAT_LAUNCH_CHARACTER_IDS_V1,
} from '../packages/api-client/src/index.js';
import { MOBILE_CHAT_KNOWN_CHARACTERS_V1, MOBILE_CHAT_LAUNCH_ROSTER_V1 } from '../apps/mobile/src/features/chat/chat-launch-roster.js';

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile Chat has six visible characters with nine historical server identities', () => {
  it('shows six mobile launch Characters and preserves nine canonical server IDs', async () => {
    expect(MOBILE_CHAT_KNOWN_CHARACTERS_V1.map((entry) => entry.characterId))
      .toEqual([...CHAT_LAUNCH_CHARACTER_IDS_V1]);
    expect(MOBILE_CHAT_LAUNCH_ROSTER_V1.map((entry) => entry.characterId))
      .toEqual(['seyeon', 'yeoul', 'rahyeon', 'taegyeom', 'yunho', 'baekheon']);
    const hub = await source('apps/mobile/src/app/(tabs)/chat/index.tsx');
    expect(hub).toContain('MOBILE_CHAT_LAUNCH_ROSTER_V1.map');
    expect(hub).toContain('handleOpen(character.characterId)');
    const hook = await source('apps/mobile/src/features/chat/use-mobile-chat-open.tsx');
    expect(hook).toContain('mobileChatOpenServiceV1.open(characterId)');
    expect(hub).toContain('일부 AI 답변과 기존 기록은 현재 이용이 제한될 수 있습니다.');
    expect(hub).not.toContain('세연은 회원 로그인 후 AI 대화가 가능');
  });

  it('shares a reusable composer but does not offer eight unsupported AI backends', async () => {
    const component = await source('apps/mobile/src/features/chat/ChatReadComponents.tsx');
    const detail = await source('apps/mobile/src/app/(tabs)/chat/[threadId].tsx');
    const service = await source('apps/mobile/src/features/chat/mobile-chat-turn-send-service.ts');
    expect(detail).toContain('<ChatComposer');
    expect(detail).toContain('<ChatReadMessages');
    expect(component).toContain("snapshot.characterId === 'seyeon'");
    expect(component).toContain("snapshot.characterId === 'seyeon' ? 'waiting_history' : 'character_not_ready'");
    expect(component).toContain('{composeUi.blockedTitle}');
    expect(projectMobileChatComposeUiV1('ko-KR', 'character_not_ready').blockedTitle)
      .toBe('이 캐릭터의 AI 대화는 준비 중입니다');
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
