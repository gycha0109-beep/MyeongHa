import { describe, expect, it } from 'vitest';

import {
  resolveMobileApiOriginV1,
  resolveMobileEasProjectIdV1,
} from '../apps/mobile/src/core/config/mobile-runtime-config.js';

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

  it('uses the embedded EAS project identity when the public env is absent', () => {
    expect(
      resolveMobileEasProjectIdV1(
        undefined,
        '5c20243c-60a8-44f3-9d8c-ca06ccc8bebe',
      ),
    ).toBe('5c20243c-60a8-44f3-9d8c-ca06ccc8bebe');
  });

  it('prefers an explicit EAS project env over the embedded identity', () => {
    expect(
      resolveMobileEasProjectIdV1(
        '7d9e6a40-9fcb-4f84-a1f2-324e7a143d0b',
        '5c20243c-60a8-44f3-9d8c-ca06ccc8bebe',
      ),
    ).toBe('7d9e6a40-9fcb-4f84-a1f2-324e7a143d0b');
  });

  it('rejects a malformed embedded EAS project identity', () => {
    expect(() => resolveMobileEasProjectIdV1(undefined, 'not-a-uuid')).toThrow(
      'expo.extra.eas.projectId must be a UUID when configured.',
    );
  });
});
