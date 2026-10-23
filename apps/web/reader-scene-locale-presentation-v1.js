import { normalizeUiLocale } from './ui-i18n.js';

/**
 * I18N-06: UI language is independent of the Reader's source-generated
 * utterance. The V1 Reader Scene DTO contains no authorized output locale,
 * so this layer must never claim a Japanese/Taiwanese Reader voice or
 * translate the source text. It only emits authored UI status copy.
 */
export const READER_SCENE_LOCALE_PRESENTATION_VERSION_V1 =
  'reader-scene-locale-presentation-v1';

const ORIGINAL_COPY = Object.freeze({
  'ko-KR': '대리자의 원문 답변을 그대로 표시합니다.',
  'ja-JP': '案内人の返答は原文のまま表示しています。表示言語の変更では翻訳されません。',
  'zh-TW': '引路人的回覆會保留原文；切換介面語言不會翻譯回覆。',
});

export function projectReaderSceneLocalePresentationV1(viewModel, requestedUiLocale) {
  const uiLocale = normalizeUiLocale(requestedUiLocale);
  if (!viewModel || typeof viewModel !== 'object' ||
      (viewModel.state !== 'ready' && viewModel.state !== 'protected_fallback')) {
    throw new TypeError('Reader Scene locale presentation requires a prepared scene view.');
  }
  return Object.freeze({
    ...viewModel,
    uiLocale,
    contentLanguage: 'source_unasserted',
    localizedReaderOutput: false,
    originalContentPreserved: true,
    localePresentationVersion: READER_SCENE_LOCALE_PRESENTATION_VERSION_V1,
    sourceLanguageNotice: ORIGINAL_COPY[uiLocale],
  });
}
