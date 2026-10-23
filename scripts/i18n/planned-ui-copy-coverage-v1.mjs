import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { PLANNED_STATIC_UI_COPY_V1 } from '../../apps/web/ui-i18n-planned-copy-v1.js';

/**
 * I18N-07 EN/CN authoring-gap inventory, not an authorization to release.
 * Read ONLY the two literal Korean-authored UI arrays; no user/Reader/official
 * records are loaded. Includes Character presentation and other labels that
 * require separate owner decisions before being localized, so raw coverage
 * is NOT a release-readiness percentage.
 */
export function extractStaticUiSourceKeysV1(content, arrayAnchor, arrayEnd) {
  const startAnchor = content.indexOf(arrayAnchor);
  if (startAnchor < 0) throw new Error('Missing authored UI table start: ' + arrayAnchor);
  const start = content.indexOf('[[', startAnchor + arrayAnchor.length);
  const end = content.indexOf(arrayEnd, start);
  if (start < 0 || end <= start) throw new Error('Missing authored UI table boundary');
  const data = JSON.parse(content.slice(start, end + 2));
  if (!Array.isArray(data) || data.some((row) =>
    !Array.isArray(row) || row.length !== 3 || row.some((value) => typeof value !== 'string')
  )) {
    throw new Error('Unexpected authored UI row structure');
  }
  return [...new Set(data.map((row) => row[0]))];
}

export function auditPlannedUiCopyKeysV1(webKeys, mobileNativeKeys, plannedKeys) {
  const required = [...new Set([...webKeys, ...mobileNativeKeys])];
  const staged = new Set(plannedKeys);
  const covered = required.filter((key) => staged.has(key));
  const missing = required.filter((key) => !staged.has(key));
  return Object.freeze({
    authoredKeys: required.length,
    stagedKeysWithinAuthoredCatalog: covered.length,
    unclassifiedOrUnauthoredKeys: Object.freeze(missing),
    // A staged key may be an identity/source-bound text that is deliberately
    // NOT eligible for translation. Release admission must be reviewed separately.
    readyForRelease: false,
  });
}

export async function auditCurrentPlannedUiCopyV1(repoRoot) {
  const [web, native] = await Promise.all([
    readFile(resolve(repoRoot, 'apps/web/ui-i18n.js'), 'utf8'),
    readFile(resolve(repoRoot, 'apps/mobile/src/ui/mobile-ui-native-copy.ts'), 'utf8'),
  ]);
  const webKeys = extractStaticUiSourceKeysV1(
    web, 'const COPY = new Map(', ']].map(([source, japanese, traditionalChinese])',
  );
  const nativeKeys = extractStaticUiSourceKeysV1(
    native, 'MOBILE_UI_NATIVE_COPY = new Map', ']] as Array<readonly [string,string,string]>',
  );
  return auditPlannedUiCopyKeysV1(webKeys, nativeKeys, PLANNED_STATIC_UI_COPY_V1.keys());
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const audit = await auditCurrentPlannedUiCopyV1(repoRoot);
  process.stdout.write(JSON.stringify({
    authoredKeys: audit.authoredKeys,
    stagedKeysWithinAuthoredCatalog: audit.stagedKeysWithinAuthoredCatalog,
    unclassifiedOrUnauthoredCount: audit.unclassifiedOrUnauthoredKeys.length,
    sampleUnclassifiedKeys: audit.unclassifiedOrUnauthoredKeys.slice(0, 15),
    readyForRelease: audit.readyForRelease,
  }, null, 2) + '\n');
}
