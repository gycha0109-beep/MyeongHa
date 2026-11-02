export type CharacterChatIntroLocaleV1 = 'ko-KR' | 'ja-JP' | 'zh-TW' | 'en-US' | 'zh-CN';

export const CHARACTER_CHAT_INTROS_V1: Readonly<Record<string, Readonly<Record<CharacterChatIntroLocaleV1, readonly string[]>>>>;

export function resolveCharacterChatIntroV1(characterKey: string | null | undefined, requestedLocale: string): readonly string[] | null;
