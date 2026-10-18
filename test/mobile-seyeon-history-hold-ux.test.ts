import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { isSeyeonHistoryRevealHoldV1 } from '../apps/mobile/src/features/chat/seyeon-history-hold-state.js';

describe('Se-yeon history Reveal HOLD on mobile', () => {
  it('recognizes only the server authority HOLD error, not transient read failures', () => {
    expect(isSeyeonHistoryRevealHoldV1({ status: 'error', errorCode: 'SEYEON_HISTORY_REVEAL_HOLD' })).toBe(true);
    for (const [status, errorCode] of [
      ['ready', 'SEYEON_HISTORY_REVEAL_HOLD'],
      ['loading_initial', 'SEYEON_HISTORY_REVEAL_HOLD'],
      ['error', 'CHAT_READ_FAILED'],
      ['error', 'AUTH_REQUIRED'],
      ['error', null],
    ] as const) {
      expect(isSeyeonHistoryRevealHoldV1({ status, errorCode })).toBe(false);
    }
  });

  it('replaces misleading retry instructions without weakening the server-controlled read gate', async () => {
    const ui = await readFile(new URL('../apps/mobile/src/features/chat/ChatReadComponents.tsx', import.meta.url), 'utf8');
    const server = await readFile(new URL('../apps/api/src/chat-read-http.ts', import.meta.url), 'utf8');
    expect(ui).toContain('isSeyeonHistoryRevealHoldV1(snapshot)');
    expect(ui).toContain('개인정보 보호를 위한 서버 확인이 끝나지 않아');
    expect(ui).toContain('SEYEON_HISTORY_REVEAL_HOLD');
    expect(ui).toContain('if (isSeyeonHistoryRevealHoldV1(snapshot)) return null;');
    expect(ui).toContain('세연 대화는 서버의 보호 조치로 잠시 중단되었습니다');
    expect(server).toContain("throw new SeyeonChatHistoryRevealHoldV1()");
    expect(server).toContain("'SEYEON_HISTORY_REVEAL_HOLD'");
    expect(server).toContain("binding.participantCharacterIds.includes('seyeon')");
  });
});
