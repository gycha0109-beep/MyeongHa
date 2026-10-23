/** Staged authored UI labels only. Not a translation service or live locale admission. */
export type PlannedStaticUiLocaleV1 = 'en-US' | 'zh-CN';

/** Korean-authored UI key to approved-for-review English / Simplified Chinese pair.
 * Actual UI selection stays disabled until all surfaces and acceptance gates pass. */
export declare const PLANNED_STATIC_UI_COPY_V1:
  ReadonlyMap<string, readonly [english: string, simplifiedChinese: string]>;

/** Returns null for missing keys and unsupported locales, without translating source data. */
export declare function lookupPlannedStaticUiCopyV1(
  source: string,
  requestedLocale: unknown,
): string | null;
