import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { projectMobileChatHistoryShellV1 } from '../apps/mobile/src/features/chat/mobile-chat-history-shell-locale-v1.js';
import { isSeyeonHistoryRevealHoldV1 } from '../apps/mobile/src/features/chat/seyeon-history-hold-state.js';

const source = (path: string) => readFile(new URL('../' + path, import.meta.url), 'utf8');

describe('I18N-07 mobile Chat read-state and privacy HOLD UI', () => {
  it('shows fixed loading/error/empty/paging/protected messages in all approved UI locales', () => {
    const ko = projectMobileChatHistoryShellV1('ko-KR');
    const ja = projectMobileChatHistoryShellV1('ja-JP');
    const zh = projectMobileChatHistoryShellV1('zh-TW');
    for (const [locale, shell] of [['ko-KR', ko], ['ja-JP', ja], ['zh-TW', zh]] as const) {
      expect(shell.uiLocale).toBe(locale);
      for (const key of ['loading', 'holdTitle', 'holdDescription', 'holdComposerTitle',
        'holdComposerDescription', 'errorTitle', 'errorDescription', 'errorCodeLabel',
        'empty', 'retry', 'end', 'next', 'profile'] as const) {
        expect(shell[key].trim().length).toBeGreaterThan(0);
      }
      expect(shell.translatedMessageBody).toBe(false);
      expect(shell.translatedGreeting).toBe(false);
      expect(shell.privacyHoldBypassed).toBe(false);
      expect(shell.readerOutputLocalized).toBe(false);
      expect(Object.isFrozen(shell)).toBe(true);
      expect(shell).not.toHaveProperty('threadId');
      expect(shell).not.toHaveProperty('allowed');
      expect(shell).not.toHaveProperty('responseLocale');
    }
    expect(ko.holdDescription).toContain('반복해서 불러와도 해제되지 않습니다');
    expect(ko.holdComposerDescription).toContain('앱을 다시 설치해도');
    expect(ja.holdDescription).toContain('解除されません');
    expect(ja.holdComposerDescription).toContain('再インストールしても');
    expect(zh.holdDescription).toContain('不會解除限制');
    expect(zh.holdComposerDescription).toContain('重新安裝');
    expect(ja.errorTitle).not.toBe(ko.errorTitle);
    expect(zh.retry).not.toBe(ko.retry);
  });

  it('falls back to Korean for every unsupported or absent UI locale', () => {
    const ko = projectMobileChatHistoryShellV1('ko-KR');
    for (const unsupported of ['ja', 'zh-CN', 'en-US', null, undefined, 'ko-kr']) {
      expect(projectMobileChatHistoryShellV1(unsupported)).toEqual(ko);
    }
  });

  it('does not turn a protected history into a retryable or accessible conversation', () => {
    expect(isSeyeonHistoryRevealHoldV1({ status: 'error', errorCode: 'SEYEON_HISTORY_REVEAL_HOLD' })).toBe(true);
    for (const locale of ['ko-KR', 'ja-JP', 'zh-TW'] as const) {
      const shell = projectMobileChatHistoryShellV1(locale);
      expect(shell.privacyHoldBypassed).toBe(false);
      expect(shell.holdDescription.length).toBeGreaterThan(0);
    }
  });

  it('uses UI-only labels in the actual Chat reader without translating payload, diagnostic IDs or greetings', async () => {
    const [component, room] = await Promise.all([
      source('apps/mobile/src/features/chat/ChatReadComponents.tsx'),
      source('apps/mobile/src/app/(tabs)/chat/[threadId].tsx'),
    ]);
    expect(component).toContain('projectMobileChatHistoryShellV1(locale)');
    expect(component).toContain('isSeyeonHistoryRevealHoldV1(snapshot)');
    expect(component).toContain('if (isSeyeonHistoryRevealHoldV1(snapshot)) return null;');
    for (const field of ['loading', 'holdTitle', 'holdDescription', 'holdComposerTitle',
      'holdComposerDescription', 'errorTitle', 'errorDescription', 'errorCodeLabel',
      'empty', 'retry', 'end', 'next', 'profile']) {
      expect(component).toContain('shell.' + field);
    }
    expect(component).toContain('SEYEON_HISTORY_REVEAL_HOLD');
    expect(component).toContain('{snapshot.errorCode}');
    expect(component).toContain('{message.body}');
    expect(component).toContain('{greeting.openingLine}');
    expect(component).toContain('message.redacted && styles.redactedBubble');
    expect(component).toContain('const allowed = ready && seyeon;');
    expect(room).toContain('projectMobileSourceLanguageNoticeV1(locale,');
    expect(component).not.toContain('t(message.body)');
    expect(component).not.toContain('t(greeting.openingLine)');
    expect(component).not.toContain('translateMobileUiCopy(message.body');
  });
});
