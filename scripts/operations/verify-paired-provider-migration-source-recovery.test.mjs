import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assessSealedProviderMigrationSource } from './assess-production-provider-migration-ledger-source.mjs';
import { assessPairedProviderSourceRecovery } from './verify-paired-provider-migration-source-recovery.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePacket = () => {
  const statement = 'select 1;';
  return {
    schemaVersion: 'ops-provider-migration-sealed-source-v1',
    allVersionCount: 1,
    numericVersionCount: 1,
    migrationFrontier: 1,
    catalogSha256: sha('[["1", "one", ["' + sha(statement) + '"]]]'),
    entries: [{
      version: '1', name: 'one', statements: [statement],
      createdBy: null, idempotencyKey: null, rollbackStatements: null,
    }],
  };
};
const fixture = () => {
  const packet = sourcePacket();
  const sourceBytes = Buffer.from(JSON.stringify(packet) + '\n');
  const encryptedBytes = Buffer.from('synthetic-encrypted-only-data');
  const computed = assessSealedProviderMigrationSource(packet, {
    expectedCount: 1, expectedFrontier: 1, expectedCatalogSha256: packet.catalogSha256,
  });
  const backup = {
    schema_version: 'myeongha-postgres-backup-artifact-v1',
    project_ref: 'cnsfpcdiyofqvhpcegfc',
    source_sha: 'a'.repeat(40),
    migration_catalog_version_count: 1,
    migration_frontier: 1,
    migration_catalog_sha256: packet.catalogSha256,
  };
  const sealed = {
    schemaVersion: 'ops-provider-migration-sealed-source-artifact-v1',
    projectRef: backup.project_ref,
    sourceWorkflowCommitSha: backup.source_sha,
    migrationCount: 1, migrationFrontier: 1,
    migrationCatalogSha256: packet.catalogSha256,
    sourcePacketSha256: sha(sourceBytes),
    sourceStatementBodiesMissingCount: 0, createdByFieldPopulatedRows: 0,
    historicalExecutorAuthenticated: false,
    encryptedArchiveSha256: sha(encryptedBytes),
    containsPlaintextMigrationStatements: false,
    sourceStoredInEncryptedArtifactOnly: true,
    providerMigrationLedgerRestored: false,
    hostedProviderRecoveryProven: false, drReady: false,
    serviceResumptionAllowed: false,
    verdict: 'SOURCE_LEDGER_SEALED__HOSTED_DR_HOLD',
  };
  return {
    backup, sealed, sourceBytes, encryptedBytes, backupRunId: 43174606843,
    originalVerification: { ...computed, sourcePacketSha256: sha(sourceBytes) },
  };
};
test('paired source decryptability is non-promoting and bound to the same backup', () => {
  const result = assessPairedProviderSourceRecovery(fixture());
  assert.equal(result.encryptedSourceDecryptionVerified, true);
  assert.equal(result.originalHistoryPayloadIntegrityVerified, true);
  assert.equal(result.sourceLedgerRowsRestored, false);
  assert.equal(result.providerMigrationLedgerRestored, false);
  assert.equal(result.drReady, false);
  assert.equal(result.serviceResumptionAllowed, false);
});
test('rejects ciphertext or source packet drift, including a forged public digest', () => {
  const brokenArchive = fixture();
  brokenArchive.encryptedBytes = Buffer.from('different');
  assert.throws(() => assessPairedProviderSourceRecovery(brokenArchive));
  const brokenSource = fixture();
  brokenSource.sourceBytes = Buffer.from('{"history":"forged"}');
  assert.throws(() => assessPairedProviderSourceRecovery(brokenSource));
  const brokenVerification = fixture();
  brokenVerification.originalVerification.sourceLedgerHistoryCaptured = false;
  assert.throws(() => assessPairedProviderSourceRecovery(brokenVerification));
});
test('rejects another backup identity or an unsafe assertion of target restoration', () => {
  const badSource = fixture();
  badSource.backup.source_sha = 'b'.repeat(40);
  assert.throws(() => assessPairedProviderSourceRecovery(badSource));
  const badCount = fixture();
  badCount.sealed.migrationCount = 2;
  assert.throws(() => assessPairedProviderSourceRecovery(badCount));
  const promoted = fixture();
  promoted.sealed.drReady = true;
  assert.throws(() => assessPairedProviderSourceRecovery(promoted));
  const noArchive = fixture();
  noArchive.sealed.sourceStoredInEncryptedArtifactOnly = false;
  assert.throws(() => assessPairedProviderSourceRecovery(noArchive));
});
