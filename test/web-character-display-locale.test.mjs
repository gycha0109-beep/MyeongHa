import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTER_DISPLAY_NAMES_V1, resolveCharacterDisplayNameV1 } from '../apps/web/character-display-locale.js';
import { resolveCanonicalCharacterPresentationV1 } from '../apps/web/character-presentation-identity.js';

const romanized = Object.freeze({
  seyeon: 'Seyeon',
  baekheon: 'Baekheon',
  yeoul: 'Yeoul',
  rahyeon: 'Rahyeon',
  taegyeom: 'Taegyeom',
  yunho: 'Yunho',
  seorin: 'Seorin',
  mira: 'Mira',
  doyun: 'Doyun',
});

describe('character names in English and Simplified Chinese', () => {
  it('uses the established Latin names for all nine characters in en-US, zh-CN and zh-TW', () => {
    for (const [id, name] of Object.entries(romanized)) {
      expect(CHARACTER_DISPLAY_NAMES_V1[id]['zh-TW']).toBe(name);
      for (const locale of ['en-US', 'zh-CN', 'zh-TW']) {
        expect(resolveCharacterDisplayNameV1(id, locale), id + ' ' + locale).toBe(name);
      }
    }
  });

  it('does not change existing Korean and Japanese name presentations or canonical authority', () => {
    for (const id of Object.keys(romanized)) {
      const canonical = resolveCanonicalCharacterPresentationV1(id);
      expect(resolveCharacterDisplayNameV1(id, 'ko-KR')).toBe(canonical.name);
      expect(resolveCharacterDisplayNameV1(id, 'ja-JP')).toBe(CHARACTER_DISPLAY_NAMES_V1[id]['ja-JP']);
      expect(resolveCharacterDisplayNameV1(id, 'invalid-locale')).toBe(canonical.name);
    }
    expect(resolveCharacterDisplayNameV1('not-a-character', 'en-US')).toBeNull();
  });

  it('uses the common resolver for hub card names, room headers and chat sender names', () => {
    const web = (name) => readFileSync(new URL('../apps/web/' + name, import.meta.url), 'utf8');
    for (const file of ['chat-hub.js', 'chat-character.js', 'chat-runtime-client.js']) {
      expect(web(file), file).toContain('resolveCharacterDisplayNameV1(');
    }
    expect(web('chat-hub.js')).toContain("document.addEventListener('myeongha:localechange'");
    expect(web('chat-character.js')).toContain("document.addEventListener('myeongha:localechange'");
    expect(web('chat-runtime-client.js')).toContain("document.addEventListener('myeongha:localechange'");
  });
});
