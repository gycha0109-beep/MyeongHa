import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_COMMERCE_READ_GATE,
  migrationVersionsFromRepository,
  evaluateOfficialReaderMigrationParityV1,
} from './m1-18-migration-parity-gate.mjs';

const all = migrationVersionsFromRepository();

test('same exact repository and installed ledger is review-ready but never a deployment authorization', () => {
  const verdict = evaluateOfficialReaderMigrationParityV1({
    repositoryVersions: all, installedVersions: all,
  });
  assert.equal(verdict.status, 'HISTORY_PARITY_REVIEW_READY');
  assert.equal(verdict.missingCount, 0);
  assert.equal(verdict.untrackedInstalledCount, 0);
  assert.equal(verdict.deployAuthorized, false);
  assert.equal(verdict.privateWriterAuthorized, false);
  assert.equal(verdict.paidReaderAuthorized, false);
});

test('unapplied 1820/1900/1970 prerequisites block production cutover', () => {
  const subset = all.filter(v => !['1820', '1900', '1970'].includes(v));
  const verdict = evaluateOfficialReaderMigrationParityV1({
    repositoryVersions: all, installedVersions: subset,
  });
  assert.equal(verdict.status, 'HOLD_MIGRATION_HISTORY_DRIFT');
  assert.deepEqual(verdict.missingCommerceReadVersions, ['1820','1900','1970']);
  assert.equal(verdict.missingCount, 3);
});

test('live-only migration version without checked-in code requires reconciliation', () => {
  const verdict = evaluateOfficialReaderMigrationParityV1({
    repositoryVersions: all,
    installedVersions: [...all, '20261008090417'],
  });
  assert.equal(verdict.status, 'HOLD_MIGRATION_HISTORY_DRIFT');
  assert.deepEqual(verdict.untrackedInstalledVersions, ['20261008090417']);
  assert.equal(verdict.missingCount, 0);
});

test('the README manifest always corresponds to real migration filenames', () => {
  for (const version of CANONICAL_COMMERCE_READ_GATE) {
    assert.equal(all.includes(version),true,version+' is not a checked-in migration');
  }
});

test('migration history fails closed for malformed or duplicate versions', () => {
  assert.throws(() => evaluateOfficialReaderMigrationParityV1({
    repositoryVersions: all,installedVersions:['1820','1820'],
  }),/duplicate/u);
  assert.throws(() => evaluateOfficialReaderMigrationParityV1({
    repositoryVersions:all,installedVersions:['DROP ROLE postgres'],
  }),/validated/u);
});
