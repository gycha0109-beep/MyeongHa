import { translateMobileUiCopy, type MobileUiLocale } from '../../ui/mobile-ui-copy.js';

/** Formatting only: the server-calculated stem and element never change. */
const STEM_HANJA_V1: Readonly<Record<string, string>> = Object.freeze({
  갑: '甲', 을: '乙', 병: '丙', 정: '丁', 무: '戊',
  기: '己', 경: '庚', 신: '辛', 임: '壬', 계: '癸',
});

const ELEMENT_HANJA_V1: Readonly<Record<string, string>> = Object.freeze({
  목: '木', 화: '火', 토: '土', 금: '金', 수: '水',
});
const ELEMENT_ENGLISH_V1: Readonly<Record<string, string>> = Object.freeze({
  목: 'Wood', 화: 'Fire', 토: 'Earth', 금: 'Metal', 수: 'Water',
});

const UNRESOLVED_DAY_STEM_V1: Readonly<Record<MobileUiLocale, string>> = Object.freeze({
  'ko-KR': '일간 미확정',
  'ja-JP': '日干は未確定',
  'zh-TW': '日干尚未確認',
  'en-US': 'Day stem not confirmed',
  'zh-CN': '日干尚未确认',
});

/** Home follows the Saju pillar grid: Korean name in KO, Japanese stem
 * reading in JA and the immutable verified Hanja in the other languages.
 * Unknown factual values are preserved verbatim, never guessed.
 */
export function formatMobileHomeDayStemV1(source: string, locale: MobileUiLocale): string {
  if (source === '일간 미확정') return UNRESOLVED_DAY_STEM_V1[locale];
  const parts = source.split(' · ');
  if (parts.length !== 2 || STEM_HANJA_V1[parts[1]!] !== parts[0]) return source;
  if (locale === 'ko-KR') return source;
  if (locale === 'ja-JP') return `${parts[0]} · ${translateMobileUiCopy(parts[1]!, locale)}`;
  return parts[0]!;
}

/** Five-language display of a verified Saju element; unknowns stay visible. */
export function formatMobileHomeElementV1(source: string, locale: MobileUiLocale): string {
  if (source === '오행 미확정') {
    return ({
      'ko-KR': '오행 미확정',
      'ja-JP': '五行は未確定',
      'zh-TW': '五行尚未確認',
      'en-US': 'Element not confirmed',
      'zh-CN': '五行尚未确认',
    } as const)[locale];
  }
  if (!(source in ELEMENT_HANJA_V1)) return source;
  if (locale === 'ko-KR') return source;
  if (locale === 'ja-JP' || locale === 'zh-TW' || locale === 'zh-CN') return ELEMENT_HANJA_V1[source]!;
  return ELEMENT_ENGLISH_V1[source]!;
}
