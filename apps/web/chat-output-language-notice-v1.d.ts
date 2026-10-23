export const CHAT_OUTPUT_LANGUAGE_NOTICE_VERSION_V1:
  'chat-output-language-notice-v1';

export type ChatOutputLanguageNoticeV1 = Readonly<{
  uiLocale: 'ko-KR' | 'ja-JP' | 'zh-TW';
  visible: boolean;
  sourceTextPreserved: true;
  translatedChatMessages: false;
  version: typeof CHAT_OUTPUT_LANGUAGE_NOTICE_VERSION_V1;
  text: string;
}>;

export function projectChatOutputLanguageNoticeV1(
  requestedUiLocale: string,
): ChatOutputLanguageNoticeV1;
