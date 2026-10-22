import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { projectMobileSourceLanguageNoticeV1 } from '../apps/mobile/src/ui/mobile-source-language-notice-v1.js';
import { projectChatOutputLanguageNoticeV1 } from '../apps/web/chat-output-language-notice-v1.js';
import { readingSourceLanguageNoticeV1 } from '../apps/web/reading-detail-ui-locale.js';

const source = (path: string) => readFile(new URL('../' + path, import.meta.url), 'utf8');

describe('I18N-06e mobile original-content notices', () => {
  it('uses the same authored Korean-first notices as Web and never implies a translated Reader output', () => {
    for (const locale of ['ko-KR', 'ja-JP', 'zh-TW', 'zh-CN', 'en-US', '', undefined] as const) {
      const chat = projectMobileSourceLanguageNoticeV1(locale, 'chat');
      const reading = projectMobileSourceLanguageNoticeV1(locale, 'reading');
      const webChat = projectChatOutputLanguageNoticeV1(locale);
      const webReading = readingSourceLanguageNoticeV1(locale);
      expect(chat.uiLocale).toBe(webChat.uiLocale);
      expect(chat.visible).toBe(webChat.visible);
      expect(chat.text).toBe(webChat.text);
      expect(reading.uiLocale).toBe(webReading.uiLocale);
      expect(reading.visible).toBe(webReading.visible);
      expect(reading.text).toBe(webReading.text);
      expect(chat.sourceTextPreserved).toBe(true);
      expect(chat.translatedSourceText).toBe(false);
      expect(reading.sourceTextPreserved).toBe(true);
      expect(reading.translatedSourceText).toBe(false);
      expect(Object.isFrozen(chat)).toBe(true);
    }
    expect(() => projectMobileSourceLanguageNoticeV1('ja-JP', 'other' as 'chat')).toThrow(TypeError);
  });

  it('binds to real mobile Chat, Reader preview, Saju preview and archived Reading screens', async () => {
    const [chat, scene, preview, archive] = await Promise.all([
      source('apps/mobile/src/app/(tabs)/chat/[threadId].tsx'),
      source('apps/mobile/src/app/reading/scene.tsx'),
      source('apps/mobile/src/features/saju/SajuPreviewReadingView.tsx'),
      source('apps/mobile/src/app/reading/[readingId].tsx'),
    ]);
    for (const screen of [chat, scene, preview, archive]) {
      expect(screen).toContain('projectMobileSourceLanguageNoticeV1(locale,');
      expect(screen).toContain('sourceNotice.visible ? (');
      expect(screen).toContain('{sourceNotice.text}');
      expect(screen).not.toContain('translateMobileUiCopy(step.primary');
    }
    expect(chat).toContain('<ChatReadMessages snapshot={snapshot} />');
    expect(scene).toContain("state.kind === 'ready' && sourceNotice.visible");
    expect(scene).toContain('{currentStep.primary}');
    expect(preview).toContain('>{step.primary}</Text>');
    expect(archive).toContain('>{step.primary}</Text>');
    expect(archive).toContain('>{notice}');
    expect(chat).not.toContain('sourceNotice.text + message.body');
  });
});
