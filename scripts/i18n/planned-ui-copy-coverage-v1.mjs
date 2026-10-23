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

/**
 * Only explicitly staged authored labels are reviewed UI-owned; identity and
 * source atoms are protected. Everything else requires manual owner review.
 * Conversation, private and official-reading bodies are outside this inventory.
 */
export const CHARACTER_OWNED_STATIC_UI_KEYS_V1 = Object.freeze(["명하","7명의 신의 연결자가","세연","백헌","여울","서린","라현","미라","태겸","윤호","도윤","세연의 따뜻한 오후빛 대화 공간","백헌의 야간 기록실","여울의 회보라 기록 공간","서린의 조용한 기록 서고","라현의 낮은 조도 응접 공간","미라의 담백한 현대 생활 공간","태겸의 절제된 회색 공간","윤호의 따뜻한 목재 서재","도윤의 자유롭고 비공식적인 공간","MEET SEYEON · 세연"]);
export const SOURCE_OWNED_STATIC_UI_KEYS_V1 = Object.freeze(["갑","을","병","정","무","기","경","신","임","계"]);

export function classifyPlannedUiCopyOwnershipV1(authoredKeys, plannedKeys) {
  const planned = new Set(plannedKeys);
  const character = new Set(CHARACTER_OWNED_STATIC_UI_KEYS_V1);
  const source = new Set(SOURCE_OWNED_STATIC_UI_KEYS_V1);
  const reviewedUiOwnedKeys = [], characterOwnedKeys = [], sourceOwnedKeys = [], pendingOwnerReviewKeys = [];
  for (const key of new Set(authoredKeys)) {
    if (character.has(key)) characterOwnedKeys.push(key);
    else if (source.has(key)) sourceOwnedKeys.push(key);
    else if (planned.has(key)) reviewedUiOwnedKeys.push(key);
    else pendingOwnerReviewKeys.push(key);
  }
  return Object.freeze({
    reviewedUiOwnedKeys: Object.freeze(reviewedUiOwnedKeys),
    characterOwnedKeys: Object.freeze(characterOwnedKeys),
    sourceOwnedKeys: Object.freeze(sourceOwnedKeys),
    pendingOwnerReviewKeys: Object.freeze(pendingOwnerReviewKeys),
    privateDynamicDataInspected: false,
    readyForRelease: false,
  });
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
    ownership: classifyPlannedUiCopyOwnershipV1(required, plannedKeys),
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
    reviewedUiOwnedCount: audit.ownership.reviewedUiOwnedKeys.length,
    characterOwnedCount: audit.ownership.characterOwnedKeys.length,
    sourceOwnedCount: audit.ownership.sourceOwnedKeys.length,
    pendingOwnerReviewCount: audit.ownership.pendingOwnerReviewKeys.length,
    privateDynamicDataInspected: audit.ownership.privateDynamicDataInspected,
    readyForRelease: audit.readyForRelease,
  }, null, 2) + '\n');
}
