import { describe, expect, it } from 'vitest';

import { MOBILE_PRODUCTION_API_ORIGIN_V1 } from '../apps/mobile/src/core/config/mobile-runtime-config.js';
import {
  MOBILE_RELEASE_PRODUCTION_API_ORIGIN_V1,
  evaluateMobileReleaseReadinessV1,
  readMobileReleaseReadinessV1,
  resolveMobileReleaseApiOriginV1,
} from '../scripts/verify-mobile-release-readiness.mjs';

describe('mobile release readiness preflight', () => {
  it('keeps the current repository blocked only on source-owned platform identifiers', async () => {
    const report = await readMobileReleaseReadinessV1(
      new URL('..', import.meta.url).pathname,
      {},
    );

    expect(report.violations).toEqual([]);
    expect(report.blockers).toEqual([
      'ios.bundleIdentifier',
      'android.package',
    ]);
    expect(report.ready).toBe(false);
  });

  it('accepts a complete release identity without changing product semantics', () => {
    const report = evaluateMobileReleaseReadinessV1(
      {
        expo: {
          name: '명하',
          slug: 'myeongha-mobile',
          scheme: 'myeongha',
          version: '0.1.0',
          ios: {
            buildNumber: '1',
            bundleIdentifier: 'com.example.myeongha',
          },
          android: {
            versionCode: 1,
            package: 'com.example.myeongha',
          },
        },
      },
      { version: '0.1.0' },
      {},
    );

    expect(report).toEqual({
      ready: true,
      blockers: [],
      violations: [],
    });
  });

  it('keeps runtime and release canonical Production origins identical', () => {
    expect(MOBILE_PRODUCTION_API_ORIGIN_V1).toBe(
      MOBILE_RELEASE_PRODUCTION_API_ORIGIN_V1,
    );
    expect(resolveMobileReleaseApiOriginV1(undefined)).toBe(
      MOBILE_PRODUCTION_API_ORIGIN_V1,
    );
    expect(resolveMobileReleaseApiOriginV1('https://myeongha.vercel.app/')).toBe(
      MOBILE_PRODUCTION_API_ORIGIN_V1,
    );
  });

  it('rejects non-canonical or local API origins for release', () => {
    for (const configured of [
      'https://staging.example.com',
      'http://127.0.0.1:3000',
      'https://myeongha.vercel.app/path',
      'https://myeongha.vercel.app?preview=1',
    ]) {
      expect(() => resolveMobileReleaseApiOriginV1(configured)).toThrow();
    }
  });

  it('surfaces a release violation when a build-time API origin override is unsafe', () => {
    const report = evaluateMobileReleaseReadinessV1(
      {
        expo: {
          name: '명하',
          slug: 'myeongha-mobile',
          scheme: 'myeongha',
          version: '0.1.0',
          ios: {
            buildNumber: '1',
            bundleIdentifier: 'com.example.myeongha',
          },
          android: {
            versionCode: 1,
            package: 'com.example.myeongha',
          },
        },
      },
      { version: '0.1.0' },
      { EXPO_PUBLIC_MYEONGHA_API_ORIGIN: 'https://staging.example.com' },
    );

    expect(report.ready).toBe(false);
    expect(report.blockers).toEqual([]);
    expect(report.violations).toEqual([
      'EXPO_PUBLIC_MYEONGHA_API_ORIGIN must resolve to canonical Production origin https://myeongha.vercel.app for release.',
    ]);
  });

  it('rejects malformed version and platform release sequencing', () => {
    const report = evaluateMobileReleaseReadinessV1(
      {
        expo: {
          name: '명하',
          slug: 'myeongha-mobile',
          scheme: 'myeongha',
          version: 'v1',
          ios: {
            buildNumber: '0',
            bundleIdentifier: 'invalid',
          },
          android: {
            versionCode: 0,
            package: 'invalid',
          },
        },
      },
      { version: '0.1.0' },
      {},
    );

    expect(report.ready).toBe(false);
    expect(report.blockers).toEqual([]);
    expect(report.violations).toContain('expo.version must be a semantic version.');
    expect(report.violations).toContain('expo.version must match apps/mobile/package.json version.');
    expect(report.violations).toContain('expo.ios.buildNumber must be a positive integer string.');
    expect(report.violations).toContain('expo.android.versionCode must be a positive integer.');
  });
});
