import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildSeyeonRendererRequestV2,
  buildSeyeonSemanticReviewRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import {
  assertSeyeonReplyLanguageV1,
  seyeonReplyLanguageInstructionV1,
  SeyeonReplyLanguageMismatchV1,
} from '../apps/api/src/seyeon-reply-locale-v1.js';
import type { RequestUiLocaleV1 } from '../apps/api/src/request-ui-locale-v1.js';
import type { SeyeonRendererPacketV2 } from '../packages/domain/src/seyeon-renderer-v2.js';

const root = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const locales: readonly RequestUiLocaleV1[] = ['ko-KR', 'ja-JP', 'zh-TW', 'en-US', 'zh-CN'];
function packet(): SeyeonRendererPacketV2 {
  return {
    interpretation: {
      chosenAction: { key: 'approach' },
      expressionState: 'baseline',
      reveal: { level: 'public' },
      memoryRefsUsed: [],
    },
    disclosure: { decision: null, retrievedSources: [] },
    bibleSlices: [],
  } as unknown as SeyeonRendererPacketV2;
}

describe('Se-yeon generated-reply language is bound per submitted turn', () => {
  it('passes every explicit locale into the actual renderer and reviewer requests', () => {
    for (const locale of locales) {
      const render = buildSeyeonRendererRequestV2(packet(), locale);
      const review = buildSeyeonSemanticReviewRequestV2({
        packet: packet(),
        replyLocale: locale,
        rendererDraft: { utterance: 'unchanged' },
        utteranceHash: 'hash',
      });
      expect(render.instructions).toContain('OUTPUT LANGUAGE IS BOUND TO THIS ONE USER TURN: ' + locale);
      expect(render.instructions).toContain(seyeonReplyLanguageInstructionV1(locale));
      expect((render.input as { replyLocale: string }).replyLocale).toBe(locale);
      expect((review.input as { replyLocale: string }).replyLocale).toBe(locale);
      expect(render.instructions).toContain('canonical authority');
    }
    expect(buildSeyeonRendererRequestV2(packet()).instructions).toContain('ko-KR');
  });

  it('fails closed before persistence if renderer clearly replies in a different language', () => {
    const correct: Readonly<Record<RequestUiLocaleV1, string>> = {
      'ko-KR': '안녕하세요. 무슨 이야기를 나눌까요?',
      'ja-JP': 'こんにちは。今日はどんな話をしましょうか？',
      'zh-TW': '你好，今天想聊什麼呢？',
      'en-US': 'Hello, what would you like to talk about today?',
      'zh-CN': '你好，今天想聊什么呢？',
    };
    for (const locale of locales) {
      expect(() => assertSeyeonReplyLanguageV1(correct[locale], locale)).not.toThrow();
    }
    expect(() => assertSeyeonReplyLanguageV1('안녕하세요.', 'en-US'))
      .toThrow(SeyeonReplyLanguageMismatchV1);
    expect(() => assertSeyeonReplyLanguageV1('Hello there.', 'ja-JP'))
      .toThrow(SeyeonReplyLanguageMismatchV1);
    expect(() => assertSeyeonReplyLanguageV1('こんにちは。', 'zh-CN'))
      .toThrow(SeyeonReplyLanguageMismatchV1);
    expect(() => assertSeyeonReplyLanguageV1('Hello there.', 'zh-TW'))
      .toThrow(SeyeonReplyLanguageMismatchV1);
  });

  it('connects browser locale through the HTTP boundary and production renderer', () => {
    const ui = read('apps/web/ui-i18n.js');
    const browser = read('apps/web/chat-runtime-client.js');
    const http = read('apps/api/src/chat-turn-send-http.ts');
    const prod = read('apps/api/src/production-seyeon-chat-runtime-v1.ts');
    const execution = read('apps/api/src/seyeon-production-chat-execution-v1.ts');
    const runtime = read('apps/api/src/seyeon-character-runtime-v2.ts');

    expect(ui).toContain('return { [UI_LOCALE_REQUEST_HEADER_V1]: locale };');
    expect(browser).toContain('locale: getUiLocale(),');

    expect(browser).toContain('language: pendingTurn.locale');
    expect(browser).toContain("'X-MyeongHa-UI-Locale': pendingTurn.locale");
    expect(http).toContain('resolveRequestUiLocaleV1(input.request).locale');
    expect(prod).toContain("replyLocale: runInput.replyLocale ?? 'ko-KR'");
    expect(execution).toContain("replyLocale: input.replyLocale ?? 'ko-KR'");
    expect(runtime).toContain("buildSeyeonRendererRequestV2(rendererPacket, input.replyLocale ?? 'ko-KR')");
    expect(runtime).toContain('assertSeyeonReplyLanguageV1(admittedRendererDraft.utterance');
  });

  it('keeps the first greeting at the language of room entry while leaving past replies untouched', () => {
    const chat = read('apps/web/chat-character.js');
    const ui = read('apps/web/ui-i18n.js');
    const messages = read('apps/web/chat-runtime-client.js');

    expect(chat).toContain('const chatEntryLocale = getUiLocale()');
    expect(chat).toContain('resolveCharacterChatIntroV1(characterKey, chatEntryLocale)');
    expect(chat).toContain('resolveCharacterChatIntroV1(identity.presentationKey, chatEntryLocale)');
    expect(chat).toContain("dialogueLine?.setAttribute('data-chat-intro-language-locked', '')");
    expect(ui).toContain('[data-chat-intro-language-locked]');
    expect(messages).toContain('paragraph.textContent = message.bodyText');
    expect(messages).toContain('assistantText: result.assistantText');
    expect(ui).toContain('[data-chat-body-source]');
  });
});

