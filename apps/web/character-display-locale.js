import { resolveCanonicalCharacterPresentationV1 } from './character-presentation-identity.js';
// Temporary presentation: Korean canonical / Japanese katakana /
// Latin romanization in Traditional Chinese, Simplified Chinese and English.
// NEVER use display names as identity or permission keys.
export const CHARACTER_DISPLAY_NAMES_V1 = Object.freeze({
  seyeon: Object.freeze({ 'ja-JP': 'セヨン', 'zh-TW': 'Seyeon' }),
  baekheon: Object.freeze({ 'ja-JP': 'ベクホン', 'zh-TW': 'Baekheon' }),
  yeoul: Object.freeze({ 'ja-JP': 'ヨウル', 'zh-TW': 'Yeoul' }),
  rahyeon: Object.freeze({ 'ja-JP': 'ラヒョン', 'zh-TW': 'Rahyeon' }),
  taegyeom: Object.freeze({ 'ja-JP': 'テギョム', 'zh-TW': 'Taegyeom' }),
  yunho: Object.freeze({ 'ja-JP': 'ユノ', 'zh-TW': 'Yunho' }),
  seorin: Object.freeze({ 'ja-JP': 'ソリン', 'zh-TW': 'Seorin' }),
  mira: Object.freeze({ 'ja-JP': 'ミラ', 'zh-TW': 'Mira' }),
  doyun: Object.freeze({ 'ja-JP': 'ドユン', 'zh-TW': 'Doyun' }),
});
export function resolveCharacterDisplayNameV1(characterId, locale = 'ko-KR') {
  const canonical = resolveCanonicalCharacterPresentationV1(characterId);
  if (!canonical) return null;
  if (locale === 'ja-JP') {
    return CHARACTER_DISPLAY_NAMES_V1[canonical.presentationKey]?.['ja-JP'] ?? canonical.name;
  }
  if (locale === 'zh-TW' || locale === 'en-US' || locale === 'zh-CN') {
    return CHARACTER_DISPLAY_NAMES_V1[canonical.presentationKey]?.['zh-TW'] ?? canonical.name;
  }
  return canonical.name;
}
