import type { MobileUiLocale } from '../../ui/mobile-ui-copy.js';
import { translateMobileUiCopy } from '../../ui/mobile-ui-copy.js';
import { formatMobileHomeElementV1 } from '../home/mobile-home-saju-facts.js';
import type { MobileSajuViewModelV1 } from './saju-view-model.js';

type DayMasterV1 = MobileSajuViewModelV1['dayMaster'];

/**
 * Presentation only: copies immutable server-calculated Day Stem facts and
 * follows the approved Saju pillar / Home labels, never interpreting them.
 */
export function mobileSajuDayNameV1(day: DayMasterV1, locale: MobileUiLocale): string {
  if (day.status !== 'resolved') return translateMobileUiCopy('확정되지 않음', locale);
  if (locale === 'ko-KR') return day.hangul;
  if (locale === 'ja-JP') {
    const japaneseReading = translateMobileUiCopy(day.hangul, locale);
    return japaneseReading === day.hangul ? day.hanja : japaneseReading;
  }
  return day.hanja;
}

const YIN_YANG_V1: Readonly<Record<'양' | '음', Readonly<Record<MobileUiLocale, string>>>> = Object.freeze({
  양: Object.freeze({ 'ko-KR': '양', 'ja-JP': '陽', 'zh-TW': '陽', 'en-US': 'Yang', 'zh-CN': '阳' }),
  음: Object.freeze({ 'ko-KR': '음', 'ja-JP': '陰', 'zh-TW': '陰', 'en-US': 'Yin', 'zh-CN': '阴' }),
});

/** Element and yin-yang labels are verified display facts, not fortune claims. */
export function mobileSajuDayQualifiersV1(day: DayMasterV1, locale: MobileUiLocale): string {
  if (day.status !== 'resolved') return '';
  const parts: string[] = [];
  if (day.element !== null) parts.push(formatMobileHomeElementV1(day.element, locale));
  if (day.yinYang !== null) parts.push(YIN_YANG_V1[day.yinYang][locale]);
  return parts.join(' · ');
}
