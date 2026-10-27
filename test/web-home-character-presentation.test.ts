import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveCharacterDisplayNameV1 } from '../apps/web/character-display-locale.js';

const home = readFileSync(new URL('../apps/web/src/home/HomePage.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../apps/web/home-moonlight.css', import.meta.url), 'utf8');

describe('homepage character presentation', () => {
  it('uses canonical character keys to localize names rather than exposing Korean catalog text', () => {
    const expected = {
      seyeon: { 'ko-KR': '세연', 'ja-JP': 'セヨン', 'en-US': 'Seyeon', 'zh-CN': 'Seyeon', 'zh-TW': 'Seyeon' },
      baekheon: { 'ko-KR': '백헌', 'ja-JP': 'ベクホン', 'en-US': 'Baekheon', 'zh-CN': 'Baekheon', 'zh-TW': 'Baekheon' },
      yeoul: { 'ko-KR': '여울', 'ja-JP': 'ヨウル', 'en-US': 'Yeoul', 'zh-CN': 'Yeoul', 'zh-TW': 'Yeoul' },
    } as const;
    for (const [id, names] of Object.entries(expected)) {
      for (const locale of ['ko-KR', 'ja-JP', 'en-US', 'zh-CN', 'zh-TW'] as const) {
        expect(resolveCharacterDisplayNameV1(id, locale), id + ' ' + locale).toBe(names[locale]);
      }
    }
    expect(home).toContain('resolveCharacterDisplayNameV1(reader.key, locale) ?? reader.name');
    expect(home).toContain("document.addEventListener('myeongha:localechange', syncLocale)");
    expect(home).toContain("document.removeEventListener('myeongha:localechange', syncLocale)");
    expect(home).toContain('<h3 data-ui-react-owned>');
    expect(home).toContain('alt={resolveCharacterDisplayNameV1(reader.key, locale) ?? reader.name} data-ui-react-owned');
    expect(home).not.toContain('<h3>{reader.name}</h3>');
  });

  it('reduces only Seyeon and Yeoul portrait zoom in the home cards while retaining a blurred cover backdrop', () => {
    expect(home).toContain('data-character={reader.key}');
    expect(css).toContain('.mhx-character-art[data-character="seyeon"] img { width: 93%; margin-inline: auto; object-position: center 28%; }');
    expect(css).toContain('.mhx-character-art[data-character="yeoul"] img { width: 75%; margin-inline: auto; object-position: center 45%; }');
    expect(css).toContain('.mhx-character-art[data-character="yeoul"]::before');
    expect(css).toContain('filter: blur(14px)');
    expect(css).toContain('mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)');
  });
});
