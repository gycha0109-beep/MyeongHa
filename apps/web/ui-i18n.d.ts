/** Localized labels only: never translates user chat messages or official readings. */
export type WebUiLocale = 'ko-KR' | 'ja-JP' | 'zh-TW';
export declare const SUPPORTED_UI_LOCALES: readonly WebUiLocale[];
export declare const UI_LOCALE_STORAGE_KEY: string;
export declare function normalizeUiLocale(value: unknown): WebUiLocale;
export declare function translateStaticUi(source: string, locale: WebUiLocale): string;
