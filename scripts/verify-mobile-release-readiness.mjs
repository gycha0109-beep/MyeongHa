import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REVERSE_DNS_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+$/u;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function positiveIntegerString(value) {
  return typeof value === 'string' && /^[1-9][0-9]*$/u.test(value);
}

export function evaluateMobileReleaseReadinessV1(appJson, mobilePackage) {
  const blockers = [];
  const violations = [];

  const expo = isRecord(appJson?.expo) ? appJson.expo : null;
  if (expo === null) {
    violations.push('apps/mobile/app.json must contain an expo object.');
    return Object.freeze({ ready: false, blockers: Object.freeze(blockers), violations: Object.freeze(violations) });
  }

  if (!nonEmptyString(expo.name)) violations.push('expo.name must be a non-empty string.');
  if (!nonEmptyString(expo.slug)) violations.push('expo.slug must be a non-empty string.');
  if (!nonEmptyString(expo.scheme)) violations.push('expo.scheme must be a non-empty string.');
  if (!nonEmptyString(expo.version) || !SEMVER_PATTERN.test(expo.version)) {
    violations.push('expo.version must be a semantic version.');
  }

  const packageVersion = mobilePackage?.version;
  if (!nonEmptyString(packageVersion) || !SEMVER_PATTERN.test(packageVersion)) {
    violations.push('apps/mobile/package.json version must be a semantic version.');
  } else if (expo.version !== packageVersion) {
    violations.push('expo.version must match apps/mobile/package.json version.');
  }

  const ios = isRecord(expo.ios) ? expo.ios : {};
  if (!positiveIntegerString(ios.buildNumber)) {
    violations.push('expo.ios.buildNumber must be a positive integer string.');
  }
  if (!nonEmptyString(ios.bundleIdentifier)) {
    blockers.push('ios.bundleIdentifier');
  } else if (!REVERSE_DNS_PATTERN.test(ios.bundleIdentifier)) {
    violations.push('expo.ios.bundleIdentifier must be a reverse-DNS identifier.');
  }

  const android = isRecord(expo.android) ? expo.android : {};
  if (!positiveInteger(android.versionCode)) {
    violations.push('expo.android.versionCode must be a positive integer.');
  }
  if (!nonEmptyString(android.package)) {
    blockers.push('android.package');
  } else if (!REVERSE_DNS_PATTERN.test(android.package)) {
    violations.push('expo.android.package must be a reverse-DNS identifier.');
  }

  return Object.freeze({
    ready: blockers.length === 0 && violations.length === 0,
    blockers: Object.freeze([...blockers]),
    violations: Object.freeze([...violations]),
  });
}

export async function readMobileReleaseReadinessV1(rootDir) {
  const appJson = JSON.parse(
    await readFile(path.join(rootDir, 'apps/mobile/app.json'), 'utf8'),
  );
  const mobilePackage = JSON.parse(
    await readFile(path.join(rootDir, 'apps/mobile/package.json'), 'utf8'),
  );
  return evaluateMobileReleaseReadinessV1(appJson, mobilePackage);
}

function printReport(report) {
  if (report.violations.length > 0) {
    console.error('Mobile release readiness violations:');
    for (const violation of report.violations) console.error(`- ${violation}`);
  }

  if (report.blockers.length > 0) {
    console.error('Mobile release readiness authority blockers:');
    for (const blocker of report.blockers) console.error(`- ${blocker}`);
  }

  if (report.ready) {
    console.log('Mobile release readiness: READY');
  } else {
    console.error('Mobile release readiness: BLOCKED');
  }
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedAsScript) {
  const rootDir = process.cwd();
  const allowBlocked = process.argv.includes('--allow-blocked');
  const report = await readMobileReleaseReadinessV1(rootDir);
  printReport(report);

  if (report.violations.length > 0) process.exitCode = 1;
  else if (!report.ready && !allowBlocked) process.exitCode = 1;
}
