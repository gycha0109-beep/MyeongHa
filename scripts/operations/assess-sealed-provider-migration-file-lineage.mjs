// Compare the already decrypted, hash-verified Provider source history with
// the exact current main migration tree. Never publish original SQL or operators.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareMigrationCatalogs } from './compare-postgres-migration-catalog-readonly.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const SHA = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const MIGRATION = /^supabase\/migrations\/([0-9]+)_(.+)\.sql$/u;

function repositoryCatalog(paths) {
  assert.ok(Array.isArray(paths) && paths.length > 0);
  return paths.map(path => {
    assert.equal(typeof path, 'string');
    const match = MIGRATION.exec(path);
    assert.ok(match, 'Unrecognized migration file in exact repository tree');
    return { version: match[1], name: match[2] };
  });
}

export function assessSealedProviderMigrationFileLineage({
  sourcePacket, sourceBytes, pairedProof, baseline, repositoryPaths,
  repositoryCommitSha,
}) {
  assert.match(repositoryCommitSha, COMMIT);
  assert.ok(Buffer.isBuffer(sourceBytes) && sourceBytes.length > 0 &&
    sourceBytes.length <= 64 * 1024 * 1024);
  assert.equal(sourcePacket?.schemaVersion, 'ops-provider-migration-sealed-source-v1');
  assert.ok(Array.isArray(sourcePacket.entries) && sourcePacket.entries.length > 0);
  assert.equal(sourcePacket.allVersionCount, sourcePacket.entries.length);
  assert.equal(sourcePacket.numericVersionCount, sourcePacket.entries.length);
  assert.match(sourcePacket.catalogSha256, SHA);
  assert.equal(pairedProof?.schemaVersion,
    'ops-paired-provider-ledger-source-recovery-v1');
  assert.equal(pairedProof.encryptedSourceDecryptionVerified, true);
  assert.equal(pairedProof.originalHistoryPayloadIntegrityVerified, true);
  assert.equal(pairedProof.sourcePacketSha256, sha256(sourceBytes));
  assert.equal(pairedProof.migrationCount, sourcePacket.entries.length);
  assert.equal(pairedProof.migrationFrontier, sourcePacket.migrationFrontier);
  assert.equal(pairedProof.migrationCatalogSha256, sourcePacket.catalogSha256);
  assert.equal(pairedProof.providerMigrationLedgerRestored, false);
  assert.equal(pairedProof.drReady, false);
  assert.equal(pairedProof.serviceResumptionAllowed, false);
  assert.ok(Number.isSafeInteger(pairedProof.backupRunId) &&
    pairedProof.backupRunId > 0);
  assert.match(pairedProof.backupSourceSha, COMMIT);

  assert.equal(baseline?.schemaVersion, 'ops-remote-only-ledger-disposition-v1');
  assert.ok(Array.isArray(baseline.entries));
  assert.equal(baseline.summary?.remoteOnlyAppliedVersionCount,
    baseline.entries.length);
  assert.ok(typeof baseline.latestAppliedMigration === 'string' &&
    /^[0-9]+$/u.test(baseline.latestAppliedMigration));

  const sourceEntries = sourcePacket.entries.map(entry => {
    assert.ok(entry && typeof entry.version === 'string' &&
      /^[0-9]+$/u.test(entry.version));
    assert.ok(entry.name === null ||
      (typeof entry.name === 'string' && entry.name.length > 0));
    assert.ok(entry.statements === null ||
      (Array.isArray(entry.statements) &&
        entry.statements.every(text => text === null || typeof text === 'string')));
    return { version: entry.version, name: entry.name };
  });
  const missingBodies = sourcePacket.entries.filter(
    entry => !entry.statements || entry.statements.length === 0).length;
  assert.equal(missingBodies, pairedProof.sourceStatementBodiesMissingCount);

  const mainEntries = repositoryCatalog(repositoryPaths);
  const comparison = compareMigrationCatalogs(
    sourceEntries, mainEntries, repositoryCommitSha);
  assert.equal(comparison.remoteVersionCount, pairedProof.migrationCount);
  assert.equal(comparison.latestRemoteVersion,
    String(pairedProof.migrationFrontier));
  const baselineVersions = new Set();
  const sourceIndex = new Map(sourceEntries.map(e => [e.version, e.name]));
  for (const entry of baseline.entries) {
    assert.ok(entry && typeof entry.version === 'string' &&
      /^[0-9]+$/u.test(entry.version));
    assert.ok(!baselineVersions.has(entry.version));
    baselineVersions.add(entry.version);
    assert.ok(sourceIndex.has(entry.version),
      'Historical remote-only baseline version is absent from sealed source');
    assert.equal(sourceIndex.get(entry.version), entry.name,
      'Historical source migration identity differs from reviewed baseline');
  }

  const remoteOnly = new Set(comparison.remoteOnly);
  const baselineStillRemoteOnly = comparison.remoteOnly.filter(
    version => baselineVersions.has(version));
  const newRemoteOnly = comparison.remoteOnly.filter(
    version => !baselineVersions.has(version));
  const nowInRepository = [...baselineVersions].filter(
    version => !remoteOnly.has(version)).sort();
  assert.equal(baselineStillRemoteOnly.length + nowInRepository.length,
    baselineVersions.size);
  const sourceNullStatements = sourcePacket.entries
    .filter(entry => !entry.statements || entry.statements.length === 0)
    .map(entry => entry.version);
  return {
    schemaVersion: 'ops-sealed-provider-migration-file-lineage-v1',
    sourceBackupRunId: pairedProof.backupRunId,
    sourceBackupCommitSha: pairedProof.backupSourceSha,
    sourcePacketSha256: pairedProof.sourcePacketSha256,
    sourceMigrationCatalogSha256: pairedProof.migrationCatalogSha256,
    sourceMigrationFrontier: pairedProof.migrationFrontier,
    currentRepositoryCommitSha: repositoryCommitSha,
    sourceVersionCount: comparison.remoteVersionCount,
    currentRepositoryFileCount: comparison.repositoryVersionCount,
    commonVersionCount: comparison.remoteVersionCount - comparison.remoteOnly.length,
    remoteOnlyVersionCount: comparison.remoteOnly.length,
    repositoryOnlyVersionCount: comparison.repositoryOnly.length,
    remoteOnlyVersionIds: comparison.remoteOnly,
    repositoryOnlyVersionIds: comparison.repositoryOnly,
    sameVersionNameMismatchIds: comparison.sameVersionNameDiffers,
    sameNameDifferentVersionPairs: comparison.sameNameDifferentVersion,
    priorRemoteOnlyBaselineCount: baselineVersions.size,
    baselineRemoteOnlyStillAbsentCount: baselineStillRemoteOnly.length,
    baselineRemoteOnlyNowInRepositoryIds: nowInRepository,
    newRemoteOnlySinceBaselineIds: newRemoteOnly,
    sourceNullStatementVersionIds: sourceNullStatements,
    sourceNullStatementCount: missingBodies,
    originalSqlBodiesPublished: false,
    operatorProvenancePublished: false,
    sourceLedgerHistoryRowsRestored: false,
    migrationHistoryRepaired: false,
    appliedSqlAndCurrentDdlEquivalenceProven: false,
    hostedProviderRestoreProven: false,
    drReady: false,
    serviceResumptionAllowed: false,
    verdict: 'EXACT_MAIN_MIGRATION_VERSION_GAPS__REVIEW_REQUIRED',
  };
}

async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  const sha = process.env.GITHUB_SHA;
  assert.match(sha, COMMIT);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8', stdio: ['ignore','pipe','pipe'],
  }).trim();
  assert.equal(head, sha);
  const paths = execFileSync('git', [
    'ls-tree','-r','--name-only',sha,'--','supabase/migrations',
  ], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], maxBuffer: 4*1024*1024 })
    .trim().split(/\r?\n/u).filter(path => path.endsWith('.sql'));
  const root = resolve(process.env.RUNNER_TEMP ?? '.');
  assert.notEqual(root, resolve('.'));
  const args = process.argv.slice(2);
  function file(flag) {
    const i = args.indexOf(flag);
    assert.ok(i >= 0 && args[i+1] && !args[i+1].startsWith('--'));
    const path = resolve(args[i+1]);
    assert.ok(path.startsWith(root+sep));
    return path;
  }
  const sourceBytes = await readFile(file('--source'));
  const sourcePacket = JSON.parse(sourceBytes.toString('utf8'));
  const [pairedProof, baseline] = await Promise.all([
    readFile(file('--paired-proof'), 'utf8').then(JSON.parse),
    readFile('docs/operations/POSTGRES_REMOTE_ONLY_MIGRATION_DISPOSITION_20261107.json',
      'utf8').then(JSON.parse),
  ]);
  const result = assessSealedProviderMigrationFileLineage({
    sourcePacket,sourceBytes,pairedProof,baseline,
    repositoryPaths:paths,repositoryCommitSha:sha,
  });
  await writeFile(file('--output'),JSON.stringify(result,null,2)+'\n',
    {flag:'wx',mode:0o600});
  process.stdout.write('SEALED_PROVIDER_MAIN_VERSION_LINEAGE_OBSERVED DR_HOLD\n');
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    process.stderr.write('HOLD_SEALED_PROVIDER_MAIN_VERSION_LINEAGE\n');
    process.exitCode=1;
  });
}
