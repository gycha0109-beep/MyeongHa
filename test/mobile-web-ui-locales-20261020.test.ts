import { readFile } from 'node:fs/promises';
import { FORTUNE_COOKIE_MESSAGES_V1, displayFortuneCookieNoteV1 } from '../apps/mobile/src/features/home/mobile-fortune-cookie.js';
import { describe, expect, it } from 'vitest';

import {
  normalizeUiLocale,
  translateStaticUi,
  SUPPORTED_UI_LOCALES,
} from '../apps/web/ui-i18n.js';
import {
  normalizeMobileUiLocale,
  translateMobileUiCopy,
  formatMobileUiCopy,
  localizeMobileLiteralText,
  SUPPORTED_MOBILE_UI_LOCALES,
} from '../apps/mobile/src/ui/mobile-ui-copy.js';

async function source(path: string) {
  return readFile(new URL('../' + path, import.meta.url), 'utf8');
}

describe('Mobile / Web UI localization parity', () => {
  it('uses the same Korean / Japanese / Traditional Chinese language roster and fallback', () => {
    expect(SUPPORTED_MOBILE_UI_LOCALES).toEqual(SUPPORTED_UI_LOCALES);
    for (const value of ['ko-KR', 'ja-JP', 'zh-TW', 'zh-CN', 'en-US', null, undefined, '']) {
      expect(normalizeMobileUiLocale(value)).toBe(normalizeUiLocale(value));
    }
  });

  it('transplants every current web-authored translation without changing wording', async () => {
    const webSource = await source('apps/web/ui-i18n.js');
    const start = webSource.indexOf('const COPY = new Map(') + 'const COPY = new Map('.length;
    const end = webSource.indexOf('].map(([source', start) + 1;
    const entries = JSON.parse(webSource.slice(start, end)) as Array<[string, string, string]>;
    expect(entries.length).toBeGreaterThan(0);
    for (const [korean, japanese, chinese] of entries) {
      expect(translateMobileUiCopy(korean, 'ko-KR')).toBe(korean);
      expect(translateMobileUiCopy(korean, 'ja-JP')).toBe(japanese);
      expect(translateMobileUiCopy(korean, 'zh-TW')).toBe(chinese);
      expect(translateMobileUiCopy(korean, 'ja-JP')).toBe(translateStaticUi(korean, 'ja-JP'));
      expect(translateMobileUiCopy(korean, 'zh-TW')).toBe(translateStaticUi(korean, 'zh-TW'));
    }
  });

  it('keeps unknown or private text, submitted facts, and model output unchanged', () => {
    for (const value of [
      '사용자의 고유한 대화 내용',
      '1995-08-17 19:30',
      'PERSONAL_JOURNAL_SECRET_2026',
      '오늘 우울해서 친구에게만 말하고 싶었어요.',
    ]) {
      for (const locale of SUPPORTED_MOBILE_UI_LOCALES) {
        expect(translateMobileUiCopy(value, locale)).toBe(value);
      }
    }
  });

  it('supports web placeholders, mobile-only fixed copy and indented React Native literal leaves', () => {
    expect(translateMobileUiCopy('홈', 'ja-JP')).toBe('ホーム');
    expect(translateMobileUiCopy('사주', 'zh-TW')).toBe('八字命理');
    expect(translateMobileUiCopy('출생정보', 'ja-JP')).toBe('出生情報');
    expect(translateMobileUiCopy('화면 테마', 'zh-TW')).toBe('畫面主題');
    expect(formatMobileUiCopy('{reader}과 관상 보기', { reader: '세연' }, 'ja-JP'))
      .toBe('세연と人相鑑定'); // character label supplied by caller unchanged
    expect(localizeMobileLiteralText('\n          생년월일\n        ', 'ja-JP'))
      .toBe('\n          生年月日\n        ');
    expect(localizeMobileLiteralText('\n          출생정보\n        ', 'zh-TW'))
      .toBe('\n          出生資料\n        ');
  });

  it('has an app-wide persisted locale, settings choices and tab localization', async () => {
    const [root, provider, my, tabs, text] = await Promise.all([
      source('apps/mobile/src/app/_layout.tsx'),
      source('apps/mobile/src/ui/mobile-ui-locale.tsx'),
      source('apps/mobile/src/features/my/MyComponents.tsx'),
      source('apps/mobile/src/app/(tabs)/_layout.tsx'),
      source('apps/mobile/src/ui/MobileUiText.tsx'),
    ]);
    expect(root).toContain('<MobileUiLocaleProvider>');
    expect(provider).toContain("SecureStore.getItemAsync(MOBILE_UI_LOCALE_STORAGE_KEY)");
    expect(provider).toContain('SecureStore.setItemAsync(MOBILE_UI_LOCALE_STORAGE_KEY, normalized)');
    expect(my).toContain("value: 'ko-KR', label: '한국어'");
    expect(my).toContain("value: 'ja-JP', label: '日本語'");
    expect(my).toContain("value: 'zh-TW', label: '繁體中文'");
    expect(my).toContain('<MyLocaleSelector />');
    expect(tabs).toContain("title: t('사주')");
    expect(tabs).toContain("title: t('마이')");
    expect(text).toContain("typeof children === 'string'");
  });

  it('only opts in fixed JSX leaf text and does not change chat, readings, or API payloads', async () => {
    const [chat, saju, records, birth, sourceCopy] = await Promise.all([
      source('apps/mobile/src/features/chat/ChatReadComponents.tsx'),
      source('apps/mobile/src/features/saju/SajuPreviewReadingView.tsx'),
      source('apps/mobile/src/features/records/RecordsComponents.tsx'),
      source('apps/mobile/src/app/birth/index.tsx'),
      source('apps/mobile/src/ui/mobile-ui-copy.ts'),
    ]);
    expect(chat).toContain('SEYEON_HISTORY_REVEAL_HOLD');
    expect(chat).toContain('<MobileUiText');
    expect(saju).toContain('<MobileUiText');
    expect(records).toContain('<MobileUiText');
    expect(birth).toContain('<MobileUiText');
    expect(sourceCopy).toContain('export function translateMobileUiCopy');
    expect(sourceCopy).not.toContain('fetch(');
  });

  it('translates audited native-only screen guidance and accessible controls without touching private data', async () => {
    for (const sourceText of [
      '얼굴에 담긴 이야기를 만나기 위한 첫 단계, 사진부터 준비해 보세요.',
      '저마다 다른 목소리로, 당신의 이야기를 들어줄 연결자들을 만나보세요.',
      '나의 계정과 이야기, 설정을 살펴보세요.',
      '태어난 순간의 이야기를 바탕으로 나의 명식을 알아보세요.',
      '달력 닫기',
      '10년 전',
      '이전 달',
      '전면 카메라로 정면 사진 촬영',
      '선택한 Reader와 전체 사주 읽기 시작',
      '근거·상세 보기 ▼',
    ]) {
      expect(translateMobileUiCopy(sourceText, 'ja-JP')).not.toBe(sourceText);
      expect(translateMobileUiCopy(sourceText, 'zh-TW')).not.toBe(sourceText);
    }
    expect(formatMobileUiCopy('{reader}에게 보여줄 사진', { reader: '세연' }, 'ja-JP'))
      .toBe('セヨンに見せる写真'.replace('セヨン', '세연'));
    const [calendar, face, scene, composer] = await Promise.all([
      source('apps/mobile/src/features/birth/BirthDateCalendar.tsx'),
      source('apps/mobile/src/app/(tabs)/reading/face.tsx'),
      source('apps/mobile/src/app/reading/scene.tsx'),
      source('apps/mobile/src/features/chat/ChatReadComponents.tsx'),
    ]);
    expect(calendar).toContain("accessibilityLabel={previewText('달력 닫기')}");
    expect(calendar).toContain('previewMobileAuthoredUiLabelV1(source, previewLocale, t)');
    expect(face).toContain('accessibilityLabel={previewText("전면 카메라로 정면 사진 촬영")}');
    expect(face).toContain('plannedMobileUiPreviewLocaleV1(uiPreview, __DEV__)');
    expect(face).toContain('previewMobileAuthoredUiLabelV1(source, previewLocale, t)');
    expect(scene).toContain("t('근거')");
    expect(scene).toContain('{currentStep.primary}');
    expect(composer).toContain('SEYEON_HISTORY_REVEAL_HOLD');
  });

  it('keeps Android status/navigation windows outside the scrollable app and tabs', async () => {
    const [root, home, records, screen] = await Promise.all([
      source('apps/mobile/src/app/_layout.tsx'),
      source('apps/mobile/src/app/(tabs)/index.tsx'),
      source('apps/mobile/src/app/(tabs)/records/index.tsx'),
      source('apps/mobile/src/ui/MobileScreen.tsx'),
    ]);
    expect(root).toContain("SafeAreaProvider");
    expect(root).toContain("edges={['top', 'bottom']}");
    expect(root).toContain('<SafeAreaView');
    for (const nested of [home, records, screen]) {
      expect(nested).not.toContain('SafeAreaView');
    }
  });

  it('does not leak photographed Korean-only fixed copy or fortune notes when Japanese/Chinese is selected', async () => {
    const visibleCopy = [
      '행운의 쪽지 열기', 'MY MYEONGHA · 나의 공간',
      '계정, 출생정보와 명하에서 이어지는 길을 한곳에서 살펴보세요.',
      '지나온 이야기에도', '나의 결이 남습니다.',
      '아직 기록이 없습니다', '아직 현세록이 없습니다',
      '아직 지난 읽기가 없습니다', '아직 기억이 없습니다',
      '네 기둥 계산 완료', '좋은 아침이에요',
      '이용 상태는 대화방에서 확인',
    ];
    for (const locale of ['ja-JP', 'zh-TW'] as const) {
      for (const copy of visibleCopy) {
        const translated = translateMobileUiCopy(copy, locale);
        expect(translated, copy).not.toBe(copy);
        expect(translated, copy).not.toMatch(/[가-힣]/u);
      }
      for (let index = 0; index < FORTUNE_COOKIE_MESSAGES_V1.length; index += 1) {
        const note = displayFortuneCookieNoteV1(index, locale);
        expect(note).not.toBe('');
        expect(note).not.toMatch(/[가-힣]/u);
      }
    }
    expect(displayFortuneCookieNoteV1(0, 'ko-KR')).toBe(FORTUNE_COOKIE_MESSAGES_V1[0]);
    expect(displayFortuneCookieNoteV1(-1, 'ja-JP')).toBe('');
    expect(displayFortuneCookieNoteV1(FORTUNE_COOKIE_MESSAGES_V1.length, 'zh-TW')).toBe('');
  });

  it('translates static catalog/empty states while retaining personal names and official reading output', async () => {
    const [home, records, chat, saju, profile] = await Promise.all([
      source('apps/mobile/src/features/home/HomeComponents.tsx'),
      source('apps/mobile/src/features/records/RecordsComponents.tsx'),
      source('apps/mobile/src/app/(tabs)/chat/index.tsx'),
      source('apps/mobile/src/features/saju/SajuPreviewReadingView.tsx'),
      source('apps/mobile/src/features/my/MyComponents.tsx'),
    ]);
    expect(home).toContain('t(topic.title)');
    expect(home).toContain('t(topic.subtitle)');
    expect(records).toContain('previewText(emptyByCategory[label]');
    expect(chat).toContain('t(presentation.openingLine)');
    expect(saju).toContain('t(topic.availability.statusLabel)');
    expect(saju).toContain('{step.primary}');
    expect(profile).toContain("profile.displayName === '호칭 미설정'");
  });
});
