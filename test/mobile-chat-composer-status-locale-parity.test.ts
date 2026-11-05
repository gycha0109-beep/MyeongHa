import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { localizeMobileChatComposerStatusV1, MOBILE_CHAT_COMPOSER_AUTHORED_STATUS_KEYS_V1 }
  from '../apps/mobile/src/features/chat/mobile-chat-composer-status-copy.js';

describe('Chat composer status and retry notices in five UI languages', () => {
  it('translates precisely 15 local status messages while preserving unknown private text', () => {
    expect(MOBILE_CHAT_COMPOSER_AUTHORED_STATUS_KEYS_V1).toHaveLength(15);
    expect(new Set(MOBILE_CHAT_COMPOSER_AUTHORED_STATUS_KEYS_V1).size).toBe(15);
    for (const source of MOBILE_CHAT_COMPOSER_AUTHORED_STATUS_KEYS_V1) {
      expect(localizeMobileChatComposerStatusV1(source, 'ko-KR')).toBe(source);
      for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
        const localized = localizeMobileChatComposerStatusV1(source, locale);
        expect(localized, `${locale}: ${source}`).not.toBe(source);
        expect(localized).not.toMatch(/[가-힣]/u);
      }
    }
    for (const locale of ['ko-KR', 'ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
      expect(localizeMobileChatComposerStatusV1('개인 대화 본문', locale)).toBe('개인 대화 본문');
      expect(localizeMobileChatComposerStatusV1('PROVIDER_UNKNOWN_RESPONSE', locale)).toBe('PROVIDER_UNKNOWN_RESPONSE');
    }
  });
  it('keeps statuses tied to client-authored send code, and never touches the actual transcript', async () => {
    const [hook, ui] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/chat/use-mobile-chat-thread.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/chat/ChatReadComponents.tsx', import.meta.url), 'utf8'),
    ]);
    for (const source of MOBILE_CHAT_COMPOSER_AUTHORED_STATUS_KEYS_V1) {
      expect(hook, `missing source: ${source}`).toContain(source);
    }
    expect(ui).toContain('localizeMobileChatComposerStatusV1(status, locale)');
    expect(ui).toContain('status === null ? t(');
    expect(ui).toContain('value={draft}');
    expect(ui).toContain('onChangeText={onChangeDraft}');
    expect(ui).toContain('isSeyeonHistoryRevealHoldV1(snapshot)');
    expect(hook).toContain("current.characterId !== 'seyeon'");
    expect(hook).toContain('mobileChatPendingTurnStoreV1.write(');
    expect(hook).toContain('mobileChatTurnSendServiceV1.send(');
    expect(ui).not.toContain('t(status)');
  });
});
