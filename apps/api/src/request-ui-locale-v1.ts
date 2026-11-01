/**
 * Ingress-only UI presentation preference. It is not an authorization,
 * Reading translation or stored profile mutation. An explicit accepted
 * selection may choose the language of a NEW AI chat reply only.
 *
 * Korean wins whenever there was no explicit supported UI selection. The
 * browser's Accept-Language and historical profile.locale never select
 * any non-Korean language implicitly.
 */
export const REQUEST_UI_LOCALE_HEADER_V1 = 'X-MyeongHa-UI-Locale' as const;
export type RequestUiLocaleV1 = 'ko-KR' | 'ja-JP' | 'zh-TW' | 'en-US' | 'zh-CN';
export type RequestUiLocaleSourceV1 = 'explicit-ui' | 'korean-default' | 'invalid-fallback';

export interface ResolvedRequestUiLocaleV1 {
  readonly locale: RequestUiLocaleV1;
  readonly source: RequestUiLocaleSourceV1;
}

export function resolveRequestUiLocaleV1(request: Request): ResolvedRequestUiLocaleV1 {
  const selected = request.headers.get(REQUEST_UI_LOCALE_HEADER_V1);
  if (selected === null) return Object.freeze({ locale: 'ko-KR', source: 'korean-default' });
  if (selected === 'ko-KR' || selected === 'ja-JP' || selected === 'zh-TW' ||
      selected === 'en-US' || selected === 'zh-CN') {
    return Object.freeze({ locale: selected, source: 'explicit-ui' });
  }
  return Object.freeze({ locale: 'ko-KR', source: 'invalid-fallback' });
}

export function canonicalizeRequestUiLocaleHeadersV1(request: Request): Headers {
  const headers = new Headers(request.headers);
  headers.set(REQUEST_UI_LOCALE_HEADER_V1, resolveRequestUiLocaleV1(request).locale);
  return headers;
}
