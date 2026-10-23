import { normalizeMobileLegacySourceUiLocale, type MobileUiLocale } from './mobile-ui-copy.js';

/**
 * UI-only disclosure for existing source-owned Chat / Saju Reading text.
 * Does not translate, infer an output language, approve Reader generation,
 * or alter official records. The source body stays with its current owner.
 */
export type MobileSourceTextSurfaceV1 = 'chat' | 'reading';

const ORIGINAL_TEXT_NOTICE = Object.freeze({
  chat: Object.freeze({
    'ko-KR': '',
    'ja-JP': '画面の表示言語のみ切り替わります。会話のメッセージは原文のまま表示され、自動翻訳されません。',
    'zh-TW': '只會切換介面顯示語言。對話訊息會保留原文，不會自動翻譯。',
  }),
  reading: Object.freeze({
    'ko-KR': '',
    'ja-JP': '切り替わるのは画面の表示言語のみです。鑑定本文は原文のまま表示され、自動翻訳されません。',
    'zh-TW': '僅切換介面顯示語言；命理解讀正文會保留原文，不會自動翻譯。',
  }),
});

export function projectMobileSourceLanguageNoticeV1(
  requestedUiLocale: unknown,
  surface: MobileSourceTextSurfaceV1,
): Readonly<{
  uiLocale: MobileUiLocale;
  surface: MobileSourceTextSurfaceV1;
  visible: boolean;
  sourceTextPreserved: true;
  translatedSourceText: false;
  text: string;
}> {
  if (surface !== 'chat' && surface !== 'reading') {
    throw new TypeError('Unsupported original-text notice surface.');
  }
  const uiLocale = normalizeMobileLegacySourceUiLocale(requestedUiLocale);
  return Object.freeze({
    uiLocale,
    surface,
    visible: uiLocale !== 'ko-KR',
    sourceTextPreserved: true,
    translatedSourceText: false,
    text: ORIGINAL_TEXT_NOTICE[surface][uiLocale],
  });
}
