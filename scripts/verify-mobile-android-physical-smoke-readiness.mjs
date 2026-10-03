import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const MOBILE_ANDROID_PHYSICAL_SMOKE_V1 = Object.freeze({
  easProjectId: '5c20243c-60a8-44f3-9d8c-ca06ccc8bebe',
  androidPackage: 'com.myeongha.app',
  profile: 'physical-smoke',
  environment: 'production',
  gradleCommand: ':app:assembleDebug',
  withoutCredentials: true,
});

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function evaluateMobileAndroidPhysicalSmokeReadinessV1(
  appJson,
  easJson,
) {
  const violations = [];
  const expo = isRecord(appJson?.expo) ? appJson.expo : {};
  const embeddedProjectId = expo?.extra?.eas?.projectId;

  if (embeddedProjectId !== MOBILE_ANDROID_PHYSICAL_SMOKE_V1.easProjectId) {
    violations.push(
      'expo.extra.eas.projectId must match the activated MyeongHa EAS project UUID.',
    );
  }

  if (expo?.android?.package !== MOBILE_ANDROID_PHYSICAL_SMOKE_V1.androidPackage) {
    violations.push(
      `expo.android.package must remain ${MOBILE_ANDROID_PHYSICAL_SMOKE_V1.androidPackage}.`,
    );
  }

  const profile = easJson?.build?.[MOBILE_ANDROID_PHYSICAL_SMOKE_V1.profile];
  if (!isRecord(profile)) {
    violations.push('eas.json must define build.physical-smoke.');
  } else {
    if (profile.environment !== MOBILE_ANDROID_PHYSICAL_SMOKE_V1.environment) {
      violations.push('physical-smoke must use the EAS production environment.');
    }
    if (profile.distribution !== undefined) {
      violations.push('physical-smoke must not configure a distribution channel.');
    }
    const android = isRecord(profile.android) ? profile.android : {};
    if (android.withoutCredentials !== true) {
      violations.push('physical-smoke Android build must set withoutCredentials=true.');
    }
    if (android.gradleCommand !== MOBILE_ANDROID_PHYSICAL_SMOKE_V1.gradleCommand) {
      violations.push(
        `physical-smoke Android build must use ${MOBILE_ANDROID_PHYSICAL_SMOKE_V1.gradleCommand}.`,
      );
    }
  }

  if (easJson?.submit !== undefined) {
    violations.push('physical-smoke eas.json must not define submit authority.');
  }

  return Object.freeze({
    ready: violations.length === 0,
    violations: Object.freeze([...violations]),
  });
}

export async function readMobileAndroidPhysicalSmokeReadinessV1(rootDir) {
  const [appJsonText, easJsonText] = await Promise.all([
    readFile(path.join(rootDir, 'apps/mobile/app.json'), 'utf8'),
    readFile(path.join(rootDir, 'apps/mobile/eas.json'), 'utf8'),
  ]);
  return evaluateMobileAndroidPhysicalSmokeReadinessV1(
    JSON.parse(appJsonText),
    JSON.parse(easJsonText),
  );
}

function printReport(report) {
  if (report.violations.length > 0) {
    console.error('Mobile Android physical smoke build violations:');
    for (const violation of report.violations) console.error(`- ${violation}`);
  }
  if (report.ready) {
    console.log('Mobile Android physical smoke build readiness: READY');
  } else {
    console.error('Mobile Android physical smoke build readiness: BLOCKED');
  }
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedAsScript) {
  const report = await readMobileAndroidPhysicalSmokeReadinessV1(process.cwd());
  printReport(report);
  if (!report.ready) process.exitCode = 1;
}
