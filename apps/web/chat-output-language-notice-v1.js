import { normalizeUiLocale } from './ui-i18n.js';

/**
 * I18N-06e — display-language notice for the existing Chat Room.
 *
 * This copy belongs to the UI shell only. It does not inspect, transform,
 * classify, rewrite, or translate source-owned chat messages or stored
 * transcripts, and it does not claim that JA/ZH-TW Reader generation exists.
 */
export const CHAT_OUTPUT_LANGUAGE_NOTICE_VERSION_V1 =
  'chat-output-language-notice-v1';

const ORIGINAL_MESSAGE_NOTICE = Object.freeze({
  'ja-JP': '画面の表示言語のみ切り替わります。会話のメッセージは原文のまま表示され、自動翻訳されません。',
  'zh-TW': '只會切換介面顯示語言。對話訊息會保留原文，不會自動翻譯。',
});

export function projectChatOutputLanguageNoticeV1(requestedUiLocale) {
  const uiLocale = normalizeUiLocale(requestedUiLocale);
  const visible = uiLocale !== 'ko-KR';
  return Object.freeze({
    uiLocale,
    visible,
    sourceTextPreserved: true,
    translatedChatMessages: false,
    version: CHAT_OUTPUT_LANGUAGE_NOTICE_VERSION_V1,
    text: visible ? ORIGINAL_MESSAGE_NOTICE[uiLocale] : '',
  });
}
