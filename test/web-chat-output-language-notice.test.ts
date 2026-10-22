import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  CHAT_OUTPUT_LANGUAGE_NOTICE_VERSION_V1,
  projectChatOutputLanguageNoticeV1,
} from '../apps/web/chat-output-language-notice-v1.js';

const pagePath = new URL('../apps/web/src/chat/ChatPage.tsx', import.meta.url);
const clientPath = new URL('../apps/web/chat-runtime-client.js', import.meta.url);

describe('I18N-06e Chat source message presentation', () => {
  it('preserves the original message and hides the notice for Korean UI', () => {
    expect(projectChatOutputLanguageNoticeV1('ko-KR')).toEqual({
      uiLocale: 'ko-KR',
      visible: false,
      sourceTextPreserved: true,
      translatedChatMessages: false,
      version: CHAT_OUTPUT_LANGUAGE_NOTICE_VERSION_V1,
      text: '',
    });
  });

  it('describes the unchanged server message without implying JA/ZH-TW Reader output', () => {
    const ja = projectChatOutputLanguageNoticeV1('ja-JP');
    const zh = projectChatOutputLanguageNoticeV1('zh-TW');
    for (const decision of [ja, zh]) {
      expect(decision.visible).toBe(true);
      expect(decision.sourceTextPreserved).toBe(true);
      expect(decision.translatedChatMessages).toBe(false);
      expect(decision.text.length).toBeGreaterThan(20);
      expect(/[가-힣]/u.test(decision.text)).toBe(false);
      expect(Object.isFrozen(decision)).toBe(true);
      expect('outputApproved' in decision).toBe(false);
    }
    expect(ja.uiLocale).toBe('ja-JP');
    expect(zh.uiLocale).toBe('zh-TW');
    expect(ja.text).toContain('自動翻訳されません');
    expect(zh.text).toContain('不會自動翻譯');
  });

  it('never claims an unsupported locale is supported', () => {
    for (const value of ['', 'ja', 'zh-CN', 'en-US', 'ko-kr']) {
      expect(projectChatOutputLanguageNoticeV1(value)).toEqual(
        projectChatOutputLanguageNoticeV1('ko-KR'),
      );
    }
  });

  it('has an actual Chat UI slot and repaints only its notice on localechange', async () => {
    const [page, runtime] = await Promise.all([
      readFile(pagePath, 'utf8'),
      readFile(clientPath, 'utf8'),
    ]);
    expect(page).toContain('data-chat-source-language-notice');
    expect(page).toContain('role="note"');
    expect(runtime).toContain(
      "const languageNotice = document.querySelector('[data-chat-source-language-notice]')",
    );
    expect(runtime).toContain("document.addEventListener('myeongha:localechange', () => {\n  paintSourceLanguageNotice();");
    expect(runtime).toContain('languageNotice.textContent = presentation.text;');
    expect(runtime).toContain('languageNotice.hidden = !presentation.visible;');
    // The previously implemented original-response field remains source-owned.
    expect(runtime).toContain('paragraph.textContent = message.bodyText;');
    expect(runtime).toContain("paragraph.dataset.chatBodySource = '';");
    expect(runtime).not.toContain('message.bodyText = translateStaticUi');
    expect(runtime).not.toContain('message.bodyText = uiText');
  });
});
