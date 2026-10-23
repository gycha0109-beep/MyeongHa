import type { PlannedUiPreviewLocaleV1 } from './planned-ui-screen-preview-v1.js';
import { DEV_PLANNED_UI_PREVIEW_SESSION_KEY_V1 } from './planned-ui-screen-preview-v1.js';

type Choice = PlannedUiPreviewLocaleV1 | null;

/**
 * Development-only visual QA switch: stores a tab-scoped, transient preference.
 * Does not write production UI locale, send HTTP headers or translate Reader data.
 */
export function WebPlannedUiQaSwitcherV1({
  previewLocale,
  development,
}: {
  previewLocale: Choice;
  development: boolean;
}) {
  if (!development) return null;
  const options = [
    { locale: null, label: 'Current UI' },
    { locale: 'en-US', label: 'English' },
    { locale: 'zh-CN', label: '简体中文' },
  ] as const;

  function choose(locale: Choice) {
    if (!development || typeof window === 'undefined') return;
    try {
      if (locale === null) {
        window.sessionStorage.removeItem(DEV_PLANNED_UI_PREVIEW_SESSION_KEY_V1);
      } else {
        window.sessionStorage.setItem(DEV_PLANNED_UI_PREVIEW_SESSION_KEY_V1, locale);
      }
    } catch {
      // URL-only preview still works if session storage is unavailable.
    }
    const url = new URL(window.location.href);
    if (locale === null) url.searchParams.delete('ui-preview');
    else url.searchParams.set('ui-preview', locale);
    window.location.assign(url.href);
  }

  return (
    <nav
      aria-label="Developer UI copy preview"
      data-dev-planned-ui-qa="true"
      style={{ padding: '9px 12px', margin: '8px 0 16px', border: '1px dashed #B08A52',
        borderRadius: 10, background: '#FBF7EF', color: '#102A46', fontSize: 12 }}
    >
      <span style={{ marginRight: 10, fontWeight: 700 }}>DEV · UI COPY</span>
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          aria-pressed={option.locale === previewLocale}
          onClick={() => choose(option.locale)}
          style={{ padding: '6px 9px', margin: '3px', cursor: 'pointer', borderRadius: 6,
            border: '1px solid #B08A52', background: option.locale === previewLocale ? '#102A46' : '#FBF7EF',
            color: option.locale === previewLocale ? '#FFF' : '#102A46' }}
        >
          {option.label}
        </button>
      ))}
      <small style={{ display: 'block', marginTop: 4 }}>
        UI labels only · browser-tab QA preference · no translated readings
      </small>
    </nav>
  );
}
