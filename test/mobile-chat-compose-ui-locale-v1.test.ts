import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  projectMobileChatComposeUiV1,
  type MobileChatComposeUiStatusV1,
} from '../apps/mobile/src/features/chat/mobile-chat-compose-ui-locale-v1.js';

const BLOCKED: readonly MobileChatComposeUiStatusV1[] =
  ['checking_character', 'waiting_history', 'character_not_ready'] as const;

describe('I18N-07 mobile Chat blocked composer UI acceptance', () => {
  it('projects all three non-admission states into KO JA ZH-TW without authorizing sending', () => {
    for (const status of BLOCKED) {
      const ko = projectMobileChatComposeUiV1('ko-KR', status);
      const ja = projectMobileChatComposeUiV1('ja-JP', status);
      const zh = projectMobileChatComposeUiV1('zh-TW', status);
      for (const state of [ko, ja, zh]) {
        expect(state.blockedTitle.trim().length).toBeGreaterThan(0);
        expect(state.blockedDescription.length).toBeGreaterThan(12);
        expect(state.placeholder.length).toBeGreaterThan(4);
        expect(state.sendAllowedByLocale).toBe(false);
        expect(state.readerOutputLocalized).toBe(false);
        expect(state.translatedChatSource).toBe(false);
        expect(Object.isFrozen(state)).toBe(true);
        expect(state).not.toHaveProperty('threadId');
        expect(state).not.toHaveProperty('characterId');
        expect(state).not.toHaveProperty('responseVoiceLocale');
      }
      expect(ja.blockedTitle).not.toBe(ko.blockedTitle);
      expect(zh.blockedTitle).not.toBe(ko.blockedTitle);
    }
    expect(projectMobileChatComposeUiV1('ko-KR', 'checking_character').blockedTitle)
      .toBe('대화 상대를 확인하고 있습니다');
    expect(projectMobileChatComposeUiV1('ko-KR', 'waiting_history').blockedTitle)
      .toBe('대화 기록을 확인한 뒤 메시지를 보낼 수 있습니다');
    expect(projectMobileChatComposeUiV1('ko-KR', 'character_not_ready').blockedTitle)
      .toBe('이 캐릭터의 AI 대화는 준비 중입니다');
  });

  it('keeps Korean fallback for unselected locales and never changes a blocked status because of UI locale', () => {
    for (const status of BLOCKED) {
      const canonical = projectMobileChatComposeUiV1('ko-KR', status);
      for (const unsupported of [undefined, null, 'en-US', 'ja', 'zh-CN', 'ko-kr']) {
        expect(projectMobileChatComposeUiV1(unsupported, status)).toEqual(canonical);
      }
    }
    const ja = projectMobileChatComposeUiV1('ja-JP', 'waiting_history');
    expect(ja.blockedDescription).toContain('入り直して');
    expect(projectMobileChatComposeUiV1('zh-TW', 'character_not_ready').blockedDescription)
      .toContain('尚未開放');
  });

  it('wires UI-only copy on the actual guarded Chat composer and preserves server messages and send admission', async () => {
    const [chat, screen, read] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/chat/ChatReadComponents.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/app/(tabs)/chat/[threadId].tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/chat/use-mobile-chat-thread.tsx', import.meta.url), 'utf8'),
    ]);
    expect(chat).toContain('projectMobileChatComposeUiV1(locale,');
    expect(chat).toContain("snapshot.characterId === null ? 'checking_character'");
    expect(chat).toContain("snapshot.characterId === 'seyeon' ? 'waiting_history' : 'character_not_ready'");
    expect(chat).toContain('const allowed = ready && seyeon;');
    expect(chat).toContain('{composeUi.blockedTitle}');
    expect(chat).toContain('{composeUi.blockedDescription}');
    expect(chat).toContain('placeholder={composeUi.placeholder}');
    expect(chat).toContain('status ?? t(');
    expect(chat).toContain('{message.body}');
    expect(chat).toContain('{greeting.openingLine}');
    expect(chat).toContain('isSeyeonHistoryRevealHoldV1(snapshot)');
    expect(screen).toContain('projectMobileSourceLanguageNoticeV1(locale,');
    expect(screen).toContain('<ChatReadMessages snapshot={snapshot} />');
    expect(screen).toContain('onSend={() => void send()}');
    expect(read).toContain('send');
    expect(chat).not.toContain('t(message.body)');
    expect(chat).not.toContain('t(greeting.openingLine)');
    expect(chat).not.toContain('readingLocale: locale');
    expect(chat).not.toContain('readerOutputLocale: locale');
  });
});
