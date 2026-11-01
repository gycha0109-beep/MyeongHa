import { describe, expect, it, vi } from 'vitest';
import {
  REQUEST_UI_LOCALE_HEADER_V1,
  resolveRequestUiLocaleV1,
  canonicalizeRequestUiLocaleHeadersV1,
} from '../apps/api/src/request-ui-locale-v1.js';
import {
  UI_LOCALE_REQUEST_HEADER_V1,
  getUiLocaleRequestHeadersV1,
} from '../apps/web/ui-i18n.js';
import { toCanonicalMeRequestForTestV1 } from '../api/me.js';

const request = (header?: string, acceptLanguage = 'ja-JP') => new Request('https://myeongha.vercel.app/api/me', {
  headers: {
    'Accept-Language': acceptLanguage,
    ...(header === undefined ? {} : { [REQUEST_UI_LOCALE_HEADER_V1]: header }),
    Authorization: 'Bearer existing-session',
  },
});

describe('Korean-first UI locale request contract', () => {
  it('defaults to Korean despite Accept-Language when no explicit UI choice exists', () => {
    expect(resolveRequestUiLocaleV1(request())).toEqual({ locale: 'ko-KR', source: 'korean-default' });
    expect(resolveRequestUiLocaleV1(request(undefined, 'zh-TW'))).toEqual({ locale: 'ko-KR', source: 'korean-default' });
    expect(resolveRequestUiLocaleV1(request('ko-KR'))).toEqual({ locale: 'ko-KR', source: 'explicit-ui' });
  });

  it('accepts only exact user-selected locale codes, failing closed to Korean', () => {
    expect(resolveRequestUiLocaleV1(request('ja-JP')).locale).toBe('ja-JP');
    expect(resolveRequestUiLocaleV1(request('zh-TW')).locale).toBe('zh-TW');
    expect(resolveRequestUiLocaleV1(request('en-US')).locale).toBe('en-US');
    expect(resolveRequestUiLocaleV1(request('zh-CN')).locale).toBe('zh-CN');
    for (const unsupported of ['ja', 'zh', 'en', 'ja-JP,ko-KR', '', ' JA-JP ', 'JA-jp']) {
      expect(resolveRequestUiLocaleV1(request(unsupported))).toEqual({ locale: 'ko-KR', source: 'invalid-fallback' });
    }
  });

  it('normalizes at the live /api/me dispatcher boundary without changing bearer or route', () => {
    const original = request('zh-TW');
    const forwarded = toCanonicalMeRequestForTestV1(original);
    expect(forwarded.url).toBe('https://myeongha.internal/api/me');
    expect(forwarded.method).toBe('GET');
    expect(forwarded.headers.get(REQUEST_UI_LOCALE_HEADER_V1)).toBe('zh-TW');
    expect(forwarded.headers.get('Authorization')).toBe('Bearer existing-session');
    expect(forwarded.headers.get('Accept-Language')).toBe('ja-JP');
    expect(original.headers.get(REQUEST_UI_LOCALE_HEADER_V1)).toBe('zh-TW');
    expect(toCanonicalMeRequestForTestV1(request('zh-CN')).headers.get(REQUEST_UI_LOCALE_HEADER_V1)).toBe('zh-CN');
    expect(canonicalizeRequestUiLocaleHeadersV1(request()).get(REQUEST_UI_LOCALE_HEADER_V1)).toBe('ko-KR');
  });

  it('makes a Korean default header and preserves explicitly selected UI locale on the web', () => {
    expect(UI_LOCALE_REQUEST_HEADER_V1).toBe(REQUEST_UI_LOCALE_HEADER_V1);
    vi.stubGlobal('window', { localStorage: { getItem: () => null } });
    expect(getUiLocaleRequestHeadersV1()).toEqual({ 'X-MyeongHa-UI-Locale': 'ko-KR' });
    vi.stubGlobal('window', { localStorage: { getItem: () => 'ja-JP' } });
    expect(getUiLocaleRequestHeadersV1()).toEqual({ 'X-MyeongHa-UI-Locale': 'ja-JP' });
    vi.stubGlobal('window', { localStorage: { getItem: () => 'zh-TW' } });
    expect(getUiLocaleRequestHeadersV1()).toEqual({ 'X-MyeongHa-UI-Locale': 'zh-TW' });
    vi.stubGlobal('window', { localStorage: { getItem: () => 'en-US' } });
    expect(getUiLocaleRequestHeadersV1()).toEqual({ 'X-MyeongHa-UI-Locale': 'en-US' });
    vi.stubGlobal('window', { localStorage: { getItem: () => 'zh-CN' } });
    expect(getUiLocaleRequestHeadersV1()).toEqual({ 'X-MyeongHa-UI-Locale': 'zh-CN' });
    vi.unstubAllGlobals();
  });
});
