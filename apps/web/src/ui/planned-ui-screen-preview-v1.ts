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

/** Session-scoped QA preference, deliberately separate from production UI locale storage. */
export const DEV_PLANNED_UI_PREVIEW_SESSION_KEY_V1 = 'myeongha.dev.ui-preview.v1';

/**
 * An explicitly supplied URL parameter wins (including invalid parameters,
 * which must fail closed). Session preferences are read only in development.
 */
export function resolveDevPlannedUiPreviewWithSessionV1(
  search: string,
  development: boolean,
  saved: unknown,
): PlannedUiPreviewLocaleV1 | null {
  if (!development) return null;
  if (new URLSearchParams(search).has('ui-preview')) {
    return resolveDevPlannedUiPreviewLocaleV1(search, development);
  }
  return saved === 'en-US' || saved === 'zh-CN' ? saved : null;
}

/** May be invoked only from development entrypoints (not from app/Reader data). */
export function readDevPlannedUiPreviewSessionV1(development: boolean): string | null {
  if (!development || typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(DEV_PLANNED_UI_PREVIEW_SESSION_KEY_V1);
  } catch {
    return null;
  }
}
