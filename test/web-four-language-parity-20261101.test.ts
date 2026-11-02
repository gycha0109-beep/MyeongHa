import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { translateStaticUi } from '../apps/web/ui-i18n.js';
import { JA_TW_TO_EN_CN_STATIC_UI_COPY_V1 } from '../apps/web/ui-i18n-ja-tw-en-cn-copy-v1.js';
import { EN_CN_TO_JA_TW_ACTIVE_STATIC_UI_COPY_V1 } from '../apps/web/ui-i18n-en-cn-ja-tw-active-copy-v1.js';
import { CHARACTER_CHAT_INTROS_V1, resolveCharacterChatIntroV1 } from '../apps/web/character-chat-intro-locale.js';

const web = resolve(process.cwd(), 'apps/web');
const read = (name: string) => readFileSync(resolve(web, name), 'utf8');
const locales = ['ko-KR', 'ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const;

describe('Full Japanese and Traditional Chinese parity baseline', () => {
  it('completes all 243 Japanese/Traditional Chinese-only fixed UI translations in English and Simplified Chinese', () => {
    expect(JA_TW_TO_EN_CN_STATIC_UI_COPY_V1.size).toBe(243);
    for (const [source, values] of JA_TW_TO_EN_CN_STATIC_UI_COPY_V1) {
      for (const locale of ['en-US', 'zh-CN'] as const) {
        expect(values[locale], source).toBeTruthy();
        expect(translateStaticUi(source, locale), source).toBe(values[locale]);
        expect(translateStaticUi(source, locale), source).not.toMatch(/[가-힣]/u);
      }
    }
  });

  it('keeps the previously approved Japanese and Traditional Chinese translations byte-for-byte', () => {
    const ui = read('ui-i18n.js');
    const start = ui.indexOf('const COPY = new Map(') + 'const COPY = new Map('.length;
    const end = ui.indexOf('].map(([source', start) + 1;
    const baseline = JSON.parse(ui.slice(start, end)) as Array<[string, string, string]>;
    expect(baseline.length).toBe(781);
    for (const [source, japanese, traditionalChinese] of baseline) {
      expect(translateStaticUi(source, 'ja-JP'), source).toBe(japanese);
      expect(translateStaticUi(source, 'zh-TW'), source).toBe(traditionalChinese);
    }
  });

  it('also localizes the 55 previously English/Simplified Chinese-only strings referenced by live web code', () => {
    expect(EN_CN_TO_JA_TW_ACTIVE_STATIC_UI_COPY_V1.size).toBe(55);
    for (const [source, values] of EN_CN_TO_JA_TW_ACTIVE_STATIC_UI_COPY_V1) {
      for (const locale of ['ja-JP', 'zh-TW'] as const) {
        expect(translateStaticUi(source, locale), source).toBe(values[locale]);
        expect(translateStaticUi(source, locale), source).not.toMatch(/[가-힣]/u);
      }
    }
  });

  it('localizes every fixed character greeting independently from stored user and AI messages', () => {
    const characters = Object.keys(CHARACTER_CHAT_INTROS_V1);
    expect(characters).toHaveLength(9);
    for (const key of characters) {
      for (const locale of locales) {
        const lines = resolveCharacterChatIntroV1(key, locale);
        expect(lines).toHaveLength(2);
        expect(lines?.every(line => line.trim().length > 0)).toBe(true);
        if (locale !== 'ko-KR') expect(lines?.join(' '), key + ':' + locale).not.toMatch(/[가-힣]/u);
      }
    }
    for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN'] as const) {
      expect(translateStaticUi('라이트 모드로 전환', locale)).not.toMatch(/[가-힣]/u);
    }
    const chat = read('chat-character.js');
    const hub = read('chat-hub.js');
    expect(chat).toContain('setDialogueLines(resolveCharacterChatIntroV1(');
    expect(chat).toContain("document.addEventListener('myeongha:localechange'");
    expect(hub).toContain("resolveCharacterChatIntroV1(person.key, getUiLocale()).join(' ')");
    expect(read('ui-i18n.js')).toContain('[data-chat-body-source]');
  });

  it('never alters unknown private data, model output or stored reading text', () => {
    for (const locale of locales) {
      expect(translateStaticUi('이 문장은 사용자 개인의 비공개 대화입니다.', locale))
        .toBe('이 문장은 사용자 개인의 비공개 대화입니다.');
    }
    const source = read('ui-i18n.js');
    expect(source).toContain('[data-official-reading]');
    expect(source).toContain('[data-chat-body-source]');
  });
});

