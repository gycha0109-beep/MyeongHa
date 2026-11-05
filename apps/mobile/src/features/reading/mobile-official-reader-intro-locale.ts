import { translateMobileUiCopy, type MobileUiLocale } from '../../ui/mobile-ui-copy.js';

/** Only the three archive-only Reader descriptions that are missing from
 * the shared fixed UI dictionary. No Chat, Reading payload or entitlement data.
 */
const ARCHIVE_ONLY_READER_TONES_V1: Readonly<Record<string, Readonly<{
  'ja-JP': string;
  'zh-TW': string;
}>>> = Object.freeze({
  '과거의 반복과 지금의 흐름을 연결해 봅니다.': Object.freeze({
    'ja-JP': '過去の繰り返しと現在の流れを結びつけて見ます。',
    'zh-TW': '連結過往的反覆模式與當下的走向。',
  }),
  '과장 없이 지금 쓸 수 있는 정보부터 봅니다.': Object.freeze({
    'ja-JP': '誇張せず、今使える情報から確認します。',
    'zh-TW': '不誇大，先看當下可運用的資訊。',
  }),
  '복잡한 설명보다 걸리는 부분부터 시작합니다.': Object.freeze({
    'ja-JP': '複雑な説明より、まず気になるところから始めます。',
    'zh-TW': '不從複雜說明開始，而是先看目前卡住的地方。',
  }),
});

/** Presentation-only conversion of canonical authored Reader descriptions. */
export function localizeMobileOfficialReaderToneV1(
  source: string,
  locale: MobileUiLocale,
): string {
  if (locale === 'ja-JP' || locale === 'zh-TW') {
    const reviewed = ARCHIVE_ONLY_READER_TONES_V1[source]?.[locale];
    if (reviewed !== undefined) return reviewed;
  }
  return translateMobileUiCopy(source, locale);
}
