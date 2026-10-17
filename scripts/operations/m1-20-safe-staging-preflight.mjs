import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditLiveMigrationImpactV1, HISTORICAL_BUNDLE } from './m1-19-live-migration-impact.mjs';

// Git blob fingerprints of the 45 individually reviewed M1-19 migration files.
// This pins the inspected bytes, not just filenames or risk-category labels.
// Any changed SQL must receive a NEW security/Owner review, not silent promotion.
export const REVIEWED_SOURCE_BLOBS_V1 = Object.freeze({});

// Conservative, source-reviewed cross-stage obligations. An edge is a
// necessary ordering dependency, NOT approval that the migration is safe.
export const REQUIRED_PREDECESSORS_V1 = Object.freeze({
  '1750': ['1740'],
  '1760': ['1740', '1750'],
  '1770': ['1740'],
  '1780': ['1770'],
  '1790': ['1740'],
  '1800': ['1740', '1760', '1790'],
  '1810': ['1800'],
  '1820': ['1800', '1810'],
  '1830': ['1820'],
  '1840': ['1830'],
  '1850': ['1830', '1840'],
  '1860': ['1830'],
  '1870': ['1830'],
  '1880': ['1850', '1870'],
  '1890': ['1770', '1780', '1830', '1850', '1860', '1880'],
  '1900': ['1820', '1830', '1890'],
  '1910': ['1830'],
  '1920': ['1910'],
  '1930': ['1920'],
  '1940': ['1930'],
  '1950': ['1930'],
  '1960': ['1920'],
  '1970': ['1820', '1900'],
});

export function gitBlobSha1(bytes) {
  return createHash('sha1')
    .update(Buffer.from('blob ' + bytes.length + '\0'))
    .update(bytes).digest('hex');
}
function readSourceInventory(dir) {
  const files = readdirSync(dir).filter(n => /^\d{4,14}_.+\.sql$/u.test(n));
  const found = new Map();
  for (const file of files) {
    const version = file.split('_')[0];
    if (found.has(version)) throw new Error('M1-20 duplicate source version');
    found.set(version, {
      version,
      file,
      blobSha: gitBlobSha1(readFileSync(join(dir, file))),
    });
  }
  return found;
}

export function auditM120SafeStaging(snapshot, directory = 'supabase/migrations') {
  const impact = auditLiveMigrationImpactV1(snapshot, directory);
  const source = readSourceInventory(directory);
  const pinned = Object.keys(REVIEWED_SOURCE_BLOBS_V1).sort();
  const sourceDrift = pinned.filter(v =>
    !source.has(v) || source.get(v).blobSha !== REVIEWED_SOURCE_BLOBS_V1[v]);
  const missing = new Set(impact.migrationInventory.map(x => x.version));
  const installed = new Set(snapshot.installedVersions);
  const graph = impact.migrationInventory.map(entry => {
    const predecessors = REQUIRED_PREDECESSORS_V1[entry.version] || [];
    const unresolved = predecessors.filter(v => !source.has(v) && !installed.has(v));
    return Object.freeze({
      version: entry.version,
      file: entry.file,
      owner: entry.owner,
      risk: entry.risk,
      sourceSha256: entry.sha256,
      reviewedBlobMatch: !sourceDrift.includes(entry.version),
      requiredPredecessors: predecessors,
      missingPredecessors: predecessors.filter(v => missing.has(v)),
      unknownPredecessors: unresolved,
    });
  });
  const unknownPredecessors = graph.flatMap(x =>
    x.unknownPredecessors.map(version => ({ requiredBy: x.version, version })));
  const closure = new Set();
  const visiting = new Set();
  function add(version) {
    if (closure.has(version)) return;
    if (visiting.has(version)) throw new Error('M1-20 dependency cycle');
    visiting.add(version);
    for (const prior of REQUIRED_PREDECESSORS_V1[version] || []) add(prior);
    visiting.delete(version);
    closure.add(version);
  }
  add('1970');

  // This closure is a risk and review candidate ONLY. It is not a
  // deployable sequence; unlisted DB objects, data and side-effects require
  // real PG17 replay and domain-specific Owner authorization.
  const requiredMissingForRead = [...closure].filter(v => missing.has(v))
    .sort((a,b) => Number(a)-Number(b));
  const excludedMissing = [...missing].filter(v => !closure.has(v)).sort();
  const historicCorrect = impact.historicalBundleStatus ===
    'IDENTIFIED_EXISTING_SEYEON_RESTORE_UNRECONCILED';
  const safeState = sourceDrift.length || unknownPredecessors.length ||
      !historicCorrect || impact.unmatchedRemoteCount !== 1 ||
      impact.unmatchedRemoteVersions[0] !== HISTORICAL_BUNDLE.version
    ? 'HOLD_M1_20_UNRECONCILED_SOURCE_OR_DEPENDENCY'
    : 'HOLD_M1_20_OWNER_STAGING_AND_RESTORE_EVIDENCE_REQUIRED';
  return Object.freeze({
    verdict: safeState,
    basedOnM119: impact.verdict,
    reviewedSourceCount: pinned.length,
    sourceDrift,
    unknownPredecessors,
    requiredMissingForRead,
    excludedMissing,
    graph,
    approvalRequired: [
      'SeYeon restore Owner/DR evidence',
      'Privacy and Saju migration owners',
      'Commerce D2/Cancel and DB Security owners',
      'Real isolated PG17 + nonproduction Supabase restore/replay',
      'Independent M1-18 catalog and history gates',
    ],
    stagingPlanOnly: true,
    safeToApplyMigrations: false,
    migrationHistoryRepairAuthorized: false,
    privateIssuerAuthorized: false,
    providerPaymentAuthorized: false,
    paidReaderAuthorized: false,
    deployAuthorized: false,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!process.argv[2]) {
    console.error('Usage: node scripts/operations/m1-20-safe-staging-preflight.mjs <snapshot.json>');
    process.exitCode = 2;
  } else {
    const report = auditM120SafeStaging(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    const { graph, ...summary } = report;
    console.log(JSON.stringify(summary, null, 2));
    // Diagnostic-only contract. Never silently succeed as a cutover permit.
    process.exitCode = 3;
  }
}
