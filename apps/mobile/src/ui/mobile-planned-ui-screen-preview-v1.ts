import { lookupPlannedMobileStaticUiCopyV1 } from './mobile-planned-ui-copy-v1.js';

export type MobilePlannedUiPreviewLocaleV1 = 'en-US' | 'zh-CN';

/** A URL param may be supplied only in Expo development, never via persisted locale. */
export function plannedMobileUiPreviewLocaleV1(
  requested: unknown,
  development: boolean,
): MobilePlannedUiPreviewLocaleV1 | null {
  if (!development || typeof requested !== 'string') return null;
  return requested === 'en-US' || requested === 'zh-CN' ? requested : null;
}

/**
 * Fixed authored screen UI only. The active supported-locale translator
 * remains the fallback; never call this on source Saju facts, chat or claims.
 */
export function previewMobileAuthoredUiLabelV1(
  source: string,
  locale: MobilePlannedUiPreviewLocaleV1 | null,
  currentUiTranslate: (source: string) => string,
): string {
  if (locale === null) return currentUiTranslate(source);
  return lookupPlannedMobileStaticUiCopyV1(source, locale) ?? currentUiTranslate(source);
}
