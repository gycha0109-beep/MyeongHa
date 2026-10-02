import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PRODUCTION_APP_ID = 'com.myeongha.app';
const MIN_SECRET_BYTES = 32;

export const MOBILE_PUSH_ACTIVATION_BINDINGS_V1 = Object.freeze({
  easProjectIdEnv: 'EXPO_PUBLIC_EAS_PROJECT_ID',
  encryptionSecretEnv: 'MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET',
  fingerprintSecretEnv: 'MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET',
  providerService: 'Expo Push Notifications',
  productionAppId: PRODUCTION_APP_ID,
  minimumSecretBytes: MIN_SECRET_BYTES,
});

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasPlugin(expo, pluginName) {
  if (!Array.isArray(expo?.plugins)) return false;
  return expo.plugins.some((entry) => {
    if (entry === pluginName) return true;
    return Array.isArray(entry) && entry[0] === pluginName;
  });
}

function validateSecret(env, name, blockers, violations) {
  const value = env?.[name];
  if (!nonEmptyString(value)) {
    blockers.push(name);
    return null;
  }
  const normalized = value.trim();
  if (Buffer.byteLength(normalized, 'utf8') < MIN_SECRET_BYTES) {
    violations.push(`${name} must be at least ${MIN_SECRET_BYTES} bytes.`);
  }
  return normalized;
}

export function evaluateMobilePushActivationReadinessV1(
  appJson,
  mobilePackage,
  runtimeEnvironment = {},
) {
  const blockers = [];
  const violations = [];

  const expo = isRecord(appJson?.expo) ? appJson.expo : null;
  if (expo === null) {
    violations.push('apps/mobile/app.json must contain an expo object.');
    return Object.freeze({
      ready: false,
      blockers: Object.freeze(blockers),
      violations: Object.freeze(violations),
    });
  }

  if (!hasPlugin(expo, 'expo-notifications')) {
    violations.push('apps/mobile/app.json must enable the expo-notifications plugin.');
  }

  const dependencies = isRecord(mobilePackage?.dependencies)
    ? mobilePackage.dependencies
    : {};
  if (!nonEmptyString(dependencies['expo-notifications'])) {
    violations.push('apps/mobile/package.json must depend on expo-notifications.');
  }
  if (!nonEmptyString(dependencies['expo-application'])) {
    violations.push('apps/mobile/package.json must depend on expo-application.');
  }

  const ios = isRecord(expo.ios) ? expo.ios : {};
  const android = isRecord(expo.android) ? expo.android : {};
  if (ios.bundleIdentifier !== PRODUCTION_APP_ID) {
    violations.push(
      `expo.ios.bundleIdentifier must remain ${PRODUCTION_APP_ID} for Push activation.`,
    );
  }
  if (android.package !== PRODUCTION_APP_ID) {
    violations.push(
      `expo.android.package must remain ${PRODUCTION_APP_ID} for Push activation.`,
    );
  }

  const easProjectId = runtimeEnvironment?.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!nonEmptyString(easProjectId)) {
    blockers.push('EXPO_PUBLIC_EAS_PROJECT_ID');
  } else if (!UUID_PATTERN.test(easProjectId.trim())) {
    violations.push('EXPO_PUBLIC_EAS_PROJECT_ID must be a UUID.');
  }

  const encryptionSecret = validateSecret(
    runtimeEnvironment,
    'MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET',
    blockers,
    violations,
  );
  const fingerprintSecret = validateSecret(
    runtimeEnvironment,
    'MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET',
    blockers,
    violations,
  );
  if (
    encryptionSecret !== null &&
    fingerprintSecret !== null &&
    encryptionSecret === fingerprintSecret
  ) {
    violations.push(
      'Push token encryption and fingerprint secrets must be independent values.',
    );
  }

  return Object.freeze({
    ready: blockers.length === 0 && violations.length === 0,
    blockers: Object.freeze([...blockers]),
    violations: Object.freeze([...violations]),
  });
}

export async function readMobilePushActivationReadinessV1(
  rootDir,
  runtimeEnvironment = process.env,
) {
  const [appJsonText, mobilePackageText] = await Promise.all([
    readFile(path.join(rootDir, 'apps/mobile/app.json'), 'utf8'),
    readFile(path.join(rootDir, 'apps/mobile/package.json'), 'utf8'),
  ]);
  return evaluateMobilePushActivationReadinessV1(
    JSON.parse(appJsonText),
    JSON.parse(mobilePackageText),
    runtimeEnvironment,
  );
}

function printReport(report) {
  if (report.violations.length > 0) {
    console.error('Mobile Push activation violations:');
    for (const violation of report.violations) console.error(`- ${violation}`);
  }

  if (report.blockers.length > 0) {
    console.error('Mobile Push activation external blockers:');
    for (const blocker of report.blockers) console.error(`- ${blocker}`);
  }

  if (report.ready) {
    console.log('Mobile Push activation readiness: READY');
  } else {
    console.error('Mobile Push activation readiness: BLOCKED');
  }
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedAsScript) {
  const allowBlocked = process.argv.includes('--allow-blocked');
  const report = await readMobilePushActivationReadinessV1(process.cwd());
  printReport(report);

  if (report.violations.length > 0) process.exitCode = 1;
  else if (!report.ready && !allowBlocked) process.exitCode = 1;
}
