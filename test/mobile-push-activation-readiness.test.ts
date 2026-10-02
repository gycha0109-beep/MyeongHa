import { describe, expect, it } from 'vitest';
import {
  MOBILE_PUSH_ACTIVATION_BINDINGS_V1,
  evaluateMobilePushActivationReadinessV1,
  readMobilePushActivationReadinessV1,
} from '../scripts/verify-mobile-push-activation-readiness.mjs';

const validApp = {
  expo: {
    plugins: ['expo-router', 'expo-secure-store', 'expo-notifications'],
    ios: { bundleIdentifier: 'com.myeongha.app' },
    android: { package: 'com.myeongha.app' },
  },
};

const validPackage = {
  dependencies: {
    'expo-notifications': '~57.0.21',
    'expo-application': '~57.0.3',
  },
};

const completeEnv = {
  EXPO_PUBLIC_EAS_PROJECT_ID: '7d9e6a40-9fcb-4f84-a1f2-324e7a143d0b',
  MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET: 'e'.repeat(48),
  MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET: 'f'.repeat(48),
};

describe('Mobile Push activation readiness preflight', () => {
  it('reports the current repository as structurally valid but externally blocked without operator values', async () => {
    const report = await readMobilePushActivationReadinessV1(
      new URL('..', import.meta.url).pathname,
      {},
    );

    expect(report.violations).toEqual([]);
    expect(report.blockers).toEqual([
      'EXPO_PUBLIC_EAS_PROJECT_ID',
      'MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET',
      'MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET',
    ]);
    expect(report.ready).toBe(false);
  });

  it('becomes ready only when all approved external activation bindings are supplied', () => {
    expect(
      evaluateMobilePushActivationReadinessV1(
        validApp,
        validPackage,
        completeEnv,
      ),
    ).toEqual({
      ready: true,
      blockers: [],
      violations: [],
    });
  });

  it('rejects malformed EAS identity and weak server secrets', () => {
    const report = evaluateMobilePushActivationReadinessV1(
      validApp,
      validPackage,
      {
        EXPO_PUBLIC_EAS_PROJECT_ID: 'not-a-project-id',
        MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET: 'short',
        MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET: 'also-short',
      },
    );

    expect(report.ready).toBe(false);
    expect(report.blockers).toEqual([]);
    expect(report.violations).toEqual([
      'EXPO_PUBLIC_EAS_PROJECT_ID must be a UUID.',
      'MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET must be at least 32 bytes.',
      'MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET must be at least 32 bytes.',
    ]);
  });

  it('rejects reuse of one secret for encryption and fingerprinting', () => {
    const sharedSecret = 's'.repeat(48);
    const report = evaluateMobilePushActivationReadinessV1(
      validApp,
      validPackage,
      {
        EXPO_PUBLIC_EAS_PROJECT_ID:
          '7d9e6a40-9fcb-4f84-a1f2-324e7a143d0b',
        MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET: sharedSecret,
        MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET: sharedSecret,
      },
    );

    expect(report.ready).toBe(false);
    expect(report.blockers).toEqual([]);
    expect(report.violations).toContain(
      'Push token encryption and fingerprint secrets must be independent values.',
    );
  });

  it('rejects structural drift from the approved Mobile Push client boundary', () => {
    const report = evaluateMobilePushActivationReadinessV1(
      {
        expo: {
          plugins: ['expo-router'],
          ios: { bundleIdentifier: 'com.example.other' },
          android: { package: 'com.example.other' },
        },
      },
      { dependencies: {} },
      completeEnv,
    );

    expect(report.ready).toBe(false);
    expect(report.violations).toContain(
      'apps/mobile/app.json must enable the expo-notifications plugin.',
    );
    expect(report.violations).toContain(
      'apps/mobile/package.json must depend on expo-notifications.',
    );
    expect(report.violations).toContain(
      'apps/mobile/package.json must depend on expo-application.',
    );
    expect(report.violations).toContain(
      'expo.ios.bundleIdentifier must remain com.myeongha.app for Push activation.',
    );
    expect(report.violations).toContain(
      'expo.android.package must remain com.myeongha.app for Push activation.',
    );
  });

  it('pins the approved activation authority names without authorizing sending', () => {
    expect(MOBILE_PUSH_ACTIVATION_BINDINGS_V1).toEqual({
      easProjectIdEnv: 'EXPO_PUBLIC_EAS_PROJECT_ID',
      encryptionSecretEnv: 'MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET',
      fingerprintSecretEnv: 'MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET',
      providerService: 'Expo Push Notifications',
      productionAppId: 'com.myeongha.app',
      minimumSecretBytes: 32,
    });
  });
});
