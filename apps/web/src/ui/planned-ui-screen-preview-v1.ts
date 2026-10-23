import { lookupPlannedStaticUiCopyV1 } from '../../ui-i18n-planned-copy-v1.js';

export type PlannedUiPreviewLocaleV1 = 'en-US' | 'zh-CN';

/**
 * Developer-only screen rehearsal. Never uses persisted UI preference,
 * Accept-Language, request headers or Reader/official output locales.
 */
export function resolveDevPlannedUiPreviewLocaleV1(
  search: string,
  development: boolean,
): PlannedUiPreviewLocaleV1 | null {
  if (!development) return null;
  const params = new URLSearchParams(search);
  const values = params.getAll('ui-preview');
  if (values.length !== 1) return null;
  return values[0] === 'en-US' || values[0] === 'zh-CN' ? values[0] : null;
}

/** Only call on a verified, literal authored UI label in React JSX. */
export function previewReviewedUiTextV1(
  source: string,
  locale: PlannedUiPreviewLocaleV1 | null = null,
): string {
  return locale === null ? source : lookupPlannedStaticUiCopyV1(source, locale) ?? source;
}
