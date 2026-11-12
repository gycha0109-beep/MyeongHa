// Verify that a paired, encrypted source migration ledger is recoverable,
// without applying historical SQL or manufacturing a target migration ledger.
// The private packet contains SQL; never publish its contents or errors.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assessSealedProviderMigrationSource } from './assess-production-provider-migration-ledger-source.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const shaPattern = /^[0-9a-f]{64}$/u;

export function assessPairedProviderSourceRecovery({
  backup, sealed, originalVerification, sourceBytes, encryptedBytes, backupRunId,
}) {
  assert.ok(Number.isSafeInteger(backupRunId) && backupRunId > 0);
  assert.equal(backup?.schema_version, 'myeongha-postgres-backup-artifact-v1');
  assert.equal(sealed?.schemaVersion, 'ops-provider-migration-sealed-source-artifact-v1');
  assert.equal(backup.project_ref, 'cnsfpcdiyofqvhpcegfc');
  assert.equal(sealed.projectRef, backup.project_ref);
  assert.match(backup.source_sha, /^[a-f0-9]{40}$/u);
  assert.equal(sealed.sourceWorkflowCommitSha, backup.source_sha);
  assert.ok(Number.isSafeInteger(backup.migration_catalog_version_count) &&
    backup.migration_catalog_version_count > 0);
  assert.equal(sealed.migrationCount, backup.migration_catalog_version_count);
  assert.equal(sealed.migrationFrontier, backup.migration_frontier);
  assert.match(backup.migration_catalog_sha256, shaPattern);
  assert.equal(sealed.migrationCatalogSha256, backup.migration_catalog_sha256);
  assert.equal(sealed.containsPlaintextMigrationStatements, false);
  assert.equal(sealed.sourceStoredInEncryptedArtifactOnly, true);
  assert.equal(sealed.historicalExecutorAuthenticated, false);
  assert.equal(sealed.providerMigrationLedgerRestored, false);
  assert.equal(sealed.hostedProviderRecoveryProven, false);
  assert.equal(sealed.drReady, false);
  assert.equal(sealed.serviceResumptionAllowed, false);
  assert.equal(sealed.verdict, 'SOURCE_LEDGER_SEALED__HOSTED_DR_HOLD');
  assert.match(sealed.sourcePacketSha256, shaPattern);
  assert.match(sealed.encryptedArchiveSha256, shaPattern);
  assert.ok(Buffer.isBuffer(sourceBytes) && sourceBytes.length > 0 &&
    sourceBytes.length <= 64 * 1024 * 1024);
  assert.ok(Buffer.isBuffer(encryptedBytes) && encryptedBytes.length > 0);
  const actualSourceSha = hash(sourceBytes);
  const actualEncryptedSha = hash(encryptedBytes);
  assert.equal(actualSourceSha, sealed.sourcePacketSha256);
  assert.equal(actualEncryptedSha, sealed.encryptedArchiveSha256);
  const packet = JSON.parse(sourceBytes.toString('utf8'));
  const computed = assessSealedProviderMigrationSource(packet, {
    expectedCount: sealed.migrationCount,
    expectedFrontier: sealed.migrationFrontier,
    expectedCatalogSha256: sealed.migrationCatalogSha256,
  });
  assert.deepEqual(originalVerification, {
    ...computed, sourcePacketSha256: actualSourceSha,
  });
  assert.equal(computed.sourceStatementBodiesMissingCount,
    sealed.sourceStatementBodiesMissingCount);
  assert.equal(computed.createdByFieldPopulatedRows,
    sealed.createdByFieldPopulatedRows);
  assert.equal(computed.sourceLedgerRowsRestored, false);
  assert.equal(computed.providerMigrationLedgerRestored, false);
  return {
    schemaVersion: 'ops-paired-provider-ledger-source-recovery-v1',
    backupRunId,
    backupSourceSha: backup.source_sha,
    projectRef: backup.project_ref,
    encryptedLedgerSha256: actualEncryptedSha,
    sourcePacketSha256: actualSourceSha,
    migrationCount: computed.migrationCount,
    migrationFrontier: computed.migrationFrontier,
    migrationCatalogSha256: computed.migrationCatalogSha256,
    sourceStatementBodiesMissingCount: computed.sourceStatementBodiesMissingCount,
    createdByFieldPopulatedRows: computed.createdByFieldPopulatedRows,
    encryptedSourceDecryptionVerified: true,
    originalHistoryPayloadIntegrityVerified: true,
    historicalExecutorAuthenticated: false,
    sourceSqlBodiesComplete: computed.sourceStatementBodiesComplete,
    sourceLedgerRowsRestored: false,
    providerMigrationLedgerRestored: false,
    hostedProviderRecoveryProven: false,
    drReady: false,
    serviceResumptionAllowed: false,
    verdict: 'SOURCE_LEDGER_DECRYPTED__TARGET_PROVIDER_LEDGER_HOLD',
  };
}

async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  const runner = resolve(process.env.RUNNER_TEMP ?? '.');
  assert.notEqual(runner, resolve('.'));
  const args = process.argv.slice(2);
  const value = key => {
    const i = args.indexOf(key);
    assert.ok(i >= 0 && args[i + 1] && !args[i + 1].startsWith('--'));
    return args[i + 1];
  };
  const pathArg = key => {
    const result = resolve(value(key));
    assert.ok(result.startsWith(runner + sep));
    return result;
  };
  const backupRunId = Number(value('--backup-run-id'));
  const [backup, sealed, originalVerification, sourceBytes, encryptedBytes] =
    await Promise.all([
      readFile(pathArg('--backup-manifest'), 'utf8').then(JSON.parse),
      readFile(pathArg('--sealed-manifest'), 'utf8').then(JSON.parse),
      readFile(pathArg('--original-verification'), 'utf8').then(JSON.parse),
      readFile(pathArg('--source-packet')),
      readFile(pathArg('--encrypted-archive')),
    ]);
  const result = assessPairedProviderSourceRecovery({
    backup, sealed, originalVerification, sourceBytes, encryptedBytes, backupRunId,
  });
  await writeFile(pathArg('--output'), JSON.stringify(result, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
  process.stdout.write('PAIRED_PROVIDER_SOURCE_DECRYPTION_VERIFIED TARGET_LEDGER_HOLD\n');
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    process.stderr.write('HOLD_PAIRED_PROVIDER_SOURCE_RECOVERY\n');
    process.exitCode = 1;
  });
}
