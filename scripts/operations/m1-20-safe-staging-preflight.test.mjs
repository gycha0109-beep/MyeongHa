import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, cpSync, mkdtempSync, appendFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  auditM120SafeStaging,
  REVIEWED_SOURCE_BLOBS_V1,
  REQUIRED_PREDECESSORS_V1,
} from './m1-20-safe-staging-preflight.mjs';

const original = JSON.parse(readFileSync(
  'scripts/operations/fixtures/m1-19-20261017-live-migration-history.snapshot.json', 'utf8'));
const report = auditM120SafeStaging(original);

test('reviewed source blob registry covers the 45 actual uninstalled SQL files without drift', () => {
  assert.equal(Object.keys(REVIEWED_SOURCE_BLOBS_V1).length, 45);
  assert.equal(report.reviewedSourceCount, 45);
  assert.deepEqual(report.sourceDrift, []);
  assert.equal(report.graph.length, 45);
  assert.equal(report.graph.every(x => x.reviewedBlobMatch && x.sourceSha256.length === 64), true);
  assert.equal(report.basedOnM119, 'HOLD_CLASSIFIED_PRODUCTION_SCHEMA_DRIFT');
});

test('no minimal read shortcut past original D2 and full writer/cancellation fences', () => {
  assert.deepEqual(REQUIRED_PREDECESSORS_V1['1970'], ['1820', '1900']);
  assert.ok(report.requiredMissingForRead.includes('1820'));
  assert.ok(report.requiredMissingForRead.includes('1890'));
  assert.ok(report.requiredMissingForRead.includes('1900'));
  assert.ok(report.requiredMissingForRead.includes('1970'));
  assert.ok(report.requiredMissingForRead.includes('1880'));
  assert.ok(report.excludedMissing.includes('1520'));
  assert.ok(report.excludedMissing.includes('1550'));
  assert.equal(report.requiredMissingForRead.length + report.excludedMissing.length, 45);
  assert.equal(report.unknownPredecessors.length, 0);
});

test('all investigated production-facing actions are explicitly false', () => {
  assert.equal(report.verdict, 'HOLD_M1_20_OWNER_STAGING_AND_RESTORE_EVIDENCE_REQUIRED');
  for (const key of ['safeToApplyMigrations','deployAuthorized',
    'migrationHistoryRepairAuthorized','privateIssuerAuthorized',
    'providerPaymentAuthorized','paidReaderAuthorized']) {
    assert.equal(report[key], false, key);
  }
  assert.equal(report.stagingPlanOnly, true);
});

test('silent mutation of any pinned SQL is a HOLD, not merely a new checksum', () => {
  const dir = mkdtempSync(join(tmpdir(), 'm1-20-sql-'));
  try {
    cpSync('supabase/migrations', dir, { recursive: true });
    appendFileSync(join(dir, '1970_official_reader_unknown_commit_minimal_read_v1.sql'),
      '\n-- unreviewed proposed source edit\n');
    const tampered = auditM120SafeStaging(original, dir);
    assert.deepEqual(tampered.sourceDrift, ['1970']);
    assert.equal(tampered.verdict, 'HOLD_M1_20_UNRECONCILED_SOURCE_OR_DEPENDENCY');
    assert.equal(tampered.deployAuthorized, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unreviewed new live history blocks the staging evidence despite pinned source', () => {
  const out = auditM120SafeStaging({
    ...original, installedVersions: [...original.installedVersions, '20261019090909'],
  });
  assert.equal(out.verdict, 'HOLD_M1_20_UNRECONCILED_SOURCE_OR_DEPENDENCY');
  assert.equal(out.safeToApplyMigrations, false);
});

test('unreviewed restore SQL fingerprint blocks any promotion', () => {
  const out = auditM120SafeStaging({
    ...original, historicalBundle: {...original.historicalBundle, md5: '0'.repeat(32)},
  });
  assert.equal(out.verdict, 'HOLD_M1_20_UNRECONCILED_SOURCE_OR_DEPENDENCY');
  assert.equal(out.migrationHistoryRepairAuthorized, false);
});

test('new unreviewed repository SQL cannot inherit old source-pin acceptance', () => {
  const dir = mkdtempSync(join(tmpdir(), 'm1-20-new-sql-'));
  try {
    cpSync('supabase/migrations', dir, { recursive: true });
    writeFileSync(join(dir, '1980_unreviewed_runtime_write.sql'),
      'create function public.unreviewed_writer() returns int language sql as $$ select 1 $$;');
    const out = auditM120SafeStaging(original, dir);
    assert.deepEqual(out.unreviewedSourceVersions, ['1980']);
    assert.equal(out.verdict, 'HOLD_M1_20_UNRECONCILED_SOURCE_OR_DEPENDENCY');
    assert.equal(out.safeToApplyMigrations, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
