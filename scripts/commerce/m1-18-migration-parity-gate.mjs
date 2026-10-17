import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CANONICAL_COMMERCE_READ_GATE = Object.freeze([
  '1050', '1070', '1130', '1220', '1720', '1740',
  '1820', '1890', '1900', '1970',
]);

export function migrationVersionsFromRepository(directory = 'supabase/migrations') {
  return readdirSync(directory)
    .filter(name => /^[0-9]{4,14}_.+\.sql$/u.test(name))
    .map(name => name.split('_')[0])
    .sort();
}

/**
 * Read-only parity verdict. Exact migration history is an independent
 * dependency of the PG catalog gate, not a reason to apply DDL blindly.
 */
export function evaluateOfficialReaderMigrationParityV1(input) {
  const { repositoryVersions, installedVersions } = input ?? {};
  if (!Array.isArray(repositoryVersions) || !Array.isArray(installedVersions) ||
      !repositoryVersions.every(x => typeof x === 'string' && /^\d{4,14}$/u.test(x)) ||
      !installedVersions.every(x => typeof x === 'string' && /^\d{4,14}$/u.test(x))) {
    throw new Error('M1-18: validated migration-version arrays required');
  }
  const repo = new Set(repositoryVersions);
  const installed = new Set(installedVersions);
  if (repo.size !== repositoryVersions.length ||
      installed.size !== installedVersions.length) {
    throw new Error('M1-18: ambiguous duplicate migration versions');
  }
  const missing = [...repo].filter(version => !installed.has(version)).sort();
  const untrackedInstalled = [...installed].filter(version => !repo.has(version)).sort();
  const missingCommerce = CANONICAL_COMMERCE_READ_GATE
    .filter(version => !installed.has(version));
  return Object.freeze({
    status: missing.length === 0 && untrackedInstalled.length === 0 &&
      missingCommerce.length === 0 ? 'HISTORY_PARITY_REVIEW_READY' :
      'HOLD_MIGRATION_HISTORY_DRIFT',
    repositoryCount: repo.size,
    installedCount: installed.size,
    missingCount: missing.length,
    untrackedInstalledCount: untrackedInstalled.length,
    missingVersions: Object.freeze(missing),
    untrackedInstalledVersions: Object.freeze(untrackedInstalled),
    missingCommerceReadVersions: Object.freeze(missingCommerce),
    deployAuthorized: false,
    privateWriterAuthorized: false,
    paidReaderAuthorized: false,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const filename = process.argv[2];
  if (!filename) {
    console.error('Usage: node scripts/commerce/m1-18-migration-parity-gate.mjs <version-array-json-file>');
    process.exitCode = 2;
  } else {
    const input = JSON.parse(readFileSync(filename, 'utf8'));
    const verdict = evaluateOfficialReaderMigrationParityV1({
      repositoryVersions: migrationVersionsFromRepository(),
      installedVersions: input.versions,
    });
    console.log(JSON.stringify(verdict, null, 2));
    if (verdict.status !== 'HISTORY_PARITY_REVIEW_READY') process.exitCode = 3;
  }
}
