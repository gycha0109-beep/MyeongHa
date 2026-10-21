export type CharacterUiLocaleV1 = 'ko-KR' | 'ja-JP' | 'zh-TW';
export declare const CHARACTER_DISPLAY_NAMES_V1: Readonly<Record<string, Readonly<Record<'ja-JP'|'zh-TW',string>>>>;
export declare function resolveCharacterDisplayNameV1(characterId: unknown, locale?: CharacterUiLocaleV1): string|null;
