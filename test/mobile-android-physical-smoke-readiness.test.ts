import { describe, expect, it } from 'vitest';

import {
  MOBILE_ANDROID_PHYSICAL_SMOKE_V1,
  evaluateMobileAndroidPhysicalSmokeReadinessV1,
  readMobileAndroidPhysicalSmokeReadinessV1,
} from '../scripts/verify-mobile-android-physical-smoke-readiness.mjs';

const validApp = {
  expo: {
    extra: {
      eas: {
        projectId: '5c20243c-60a8-44f3-9d8c-ca06ccc8bebe',
      },
    },
    android: {
      package: 'com.myeongha.app',
    },
  },
};

const validEas = {
  build: {
    'physical-smoke': {
      node: '24.14.0',
      environment: 'production',
      android: {
        withoutCredentials: true,
        gradleCommand: ':app:assembleDebug',
      },
    },
  },
};

describe('Mobile Android physical smoke build readiness', () => {
  it('reports the current repository as ready for a no-credential debug APK build', async () => {
    const report = await readMobileAndroidPhysicalSmokeReadinessV1(
      new URL('..', import.meta.url).pathname,
    );
    expect(report).toEqual({
      ready: true,
      violations: [],
    });
  });

  it('pins the activated EAS project and no-credential debug build boundary', () => {
    expect(MOBILE_ANDROID_PHYSICAL_SMOKE_V1).toEqual({
      easProjectId: '5c20243c-60a8-44f3-9d8c-ca06ccc8bebe',
      androidPackage: 'com.myeongha.app',
      profile: 'physical-smoke',
      node: '24.14.0',
      environment: 'production',
      gradleCommand: ':app:assembleDebug',
      withoutCredentials: true,
    });
  });

  it('rejects runtime drift, credential-backed builds, or distribution-enabled smoke builds', () => {
    const report = evaluateMobileAndroidPhysicalSmokeReadinessV1(validApp, {
      ...validEas,
      build: {
        'physical-smoke': {
          node: '22.23.1',
          environment: 'production',
          distribution: 'internal',
          android: {
            withoutCredentials: false,
            gradleCommand: ':app:bundleRelease',
          },
        },
      },
    });

    expect(report.ready).toBe(false);
    expect(report.violations).toContain(
      'physical-smoke must pin Node 24.14.0 to match repository runtime authority.',
    );
    expect(report.violations).toContain(
      'physical-smoke must not configure a distribution channel.',
    );
    expect(report.violations).toContain(
      'physical-smoke Android build must set withoutCredentials=true.',
    );
    expect(report.violations).toContain(
      'physical-smoke Android build must use :app:assembleDebug.',
    );
  });

  it('rejects project identity drift and submit authority', () => {
    const report = evaluateMobileAndroidPhysicalSmokeReadinessV1(
      {
        expo: {
          extra: { eas: { projectId: '7d9e6a40-9fcb-4f84-a1f2-324e7a143d0b' } },
          android: { package: 'com.example.other' },
        },
      },
      {
        ...validEas,
        submit: { production: {} },
      },
    );

    expect(report.ready).toBe(false);
    expect(report.violations).toContain(
      'expo.extra.eas.projectId must match the activated MyeongHa EAS project UUID.',
    );
    expect(report.violations).toContain(
      'expo.android.package must remain com.myeongha.app.',
    );
    expect(report.violations).toContain(
      'physical-smoke eas.json must not define submit authority.',
    );
  });
});
