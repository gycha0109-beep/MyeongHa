import { describe, expect, it } from 'vitest';

import { resolveMobileApiOriginV1 } from '../apps/mobile/src/core/config/mobile-runtime-config.js';

describe('mobile runtime config', () => {
  it('defaults to the repository canonical Production origin', () => {
    expect(resolveMobileApiOriginV1(undefined)).toBe('https://myeongha.vercel.app');
  });

  it('accepts a governed HTTPS override and strips the root slash', () => {
    expect(resolveMobileApiOriginV1('https://mobile-api.example.com/')).toBe(
      'https://mobile-api.example.com',
    );
  });

  it('permits HTTP only for local development networks', () => {
    expect(resolveMobileApiOriginV1('http://127.0.0.1:3000')).toBe(
      'http://127.0.0.1:3000',
    );
    expect(() => resolveMobileApiOriginV1('http://example.com')).toThrow();
  });
});
