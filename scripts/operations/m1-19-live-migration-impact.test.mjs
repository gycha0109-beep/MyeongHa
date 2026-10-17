import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HISTORICAL_BUNDLE,
  MIGRATION_IMPACT_GROUPS,
  auditLiveMigrationImpactV1,
  identifyHistoricalBundle,
  inspectMigrationSql,
} from './m1-19-live-migration-impact.mjs';

const snapshot = JSON.parse(readFileSync(
  'scripts/operations/fixtures/m1-19-20261017-live-migration-history.snapshot.json','utf8',
));
const report = auditLiveMigrationImpactV1(snapshot);

test('identifies existing production bundle by exact persisted SQL metadata but never treats it as Owner approval', () => {
  assert.equal(identifyHistoricalBundle(snapshot),
    'IDENTIFIED_EXISTING_SEYEON_RESTORE_UNRECONCILED');
  assert.equal(snapshot.historicalBundle.version, HISTORICAL_BUNDLE.version);
  assert.equal(snapshot.historicalBundle.md5, HISTORICAL_BUNDLE.md5);
  assert.equal(snapshot.historicalBundle.bytes, 104021);
  assert.equal(report.verdict, 'HOLD_CLASSIFIED_PRODUCTION_SCHEMA_DRIFT');
  assert.equal(report.deployAuthorized, false);
  assert.equal(report.migrationHistoryRepairAuthorized, false);
  assert.equal(report.privateIssuerAuthorized, false);
});

test('classifies exactly 45 unapplied SQL migrations; nothing silently ignored', () => {
  assert.equal(report.repositoryMigrationCount, 217);
  assert.equal(report.installedMigrationCount, 173);
  assert.equal(report.missingSourceCount, 45);
  assert.equal(report.unmatchedRemoteCount, 1);
  assert.deepEqual(report.unmatchedRemoteVersions, [HISTORICAL_BUNDLE.version]);
  assert.deepEqual(report.unreviewedSourceVersions, []);
  assert.equal(report.migrationInventory.length, 45);
  assert.equal(new Set(report.migrationInventory.map(x => x.version)).size, 45);
  assert.equal(report.migrationInventory.every(x =>
    x.approvedForLiveApply === false && x.sha256.length === 64), true);
  assert.deepEqual(
    report.groups.map(g => [g.id,g.missingVersions.length]),
    [
      ['P1_ACCOUNT_DELETION',1],
      ['P2_READER_ARTIFACT_AND_SAJU_PROOF',2],
      ['P3_SEYEON_AI_GOVERNANCE_AND_COST',15],
      ['P4_SEYEON_PIN_AND_SCOPED_READER_QUERY',3],
      ['P5_PRIVATE_READER_LOCK_AND_FIRST_ISSUE',9],
      ['P6_CANCEL_AND_REVOKE_EFFECTS',6],
      ['P7_PRIVATE_WRITER_ACL_CLOSURE',2],
      ['P8_CANCEL_DURABLE_WORKER_AND_REVIEW',6],
      ['P9_APPROVED_MINIMAL_RECOVERY_READ',1],
    ],
  );
  assert.equal(MIGRATION_IMPACT_GROUPS.reduce(
    (total, group) => total + group.versions.length,0),45);
});

test('reads actual source SQL, including high-risk definer, roles and data DDL', () => {
  const byVersion = new Map(report.migrationInventory.map(x => [x.version,x]));
  assert.equal(byVersion.get('1520')?.securityDefiner,true);
  assert.equal(byVersion.get('1530')?.tableDdl,true);
  assert.equal(byVersion.get('1540')?.rlsPolicy,true);
  assert.equal(byVersion.get('1550')?.securityDefiner,true);
  assert.equal(byVersion.get('1630')?.roleDdl,true);
  assert.equal(byVersion.get('1710')?.tableDdl,true);
  assert.equal(byVersion.get('1820')?.functionDefinitions.includes(
    'public.internal_apply_official_reader_unified_receipt_v1'),true);
  assert.equal(byVersion.get('1880')?.tableDdl,true);
  assert.equal(byVersion.get('1900')?.privileges,true);
  assert.equal(byVersion.get('1920')?.tableDdl,true);
  assert.equal(byVersion.get('1970')?.securityDefiner,true);
  assert.equal(byVersion.get('1970')?.privileges,true);
  assert.equal(byVersion.get('1970')?.approvedForLiveApply,false);
  assert.equal(byVersion.get('1970')?.scope,undefined);
});

test('tampered historical MD5 is HOLD even if all missing migrations are known', () => {
  const changed = {
    ...snapshot,
    historicalBundle: {...snapshot.historicalBundle,md5:'0'.repeat(32)},
  };
  assert.equal(
    identifyHistoricalBundle(changed),
    'HOLD_HISTORICAL_BUNDLE_FINGERPRINT_DRIFT',
  );
  const result=auditLiveMigrationImpactV1(changed);
  assert.equal(result.verdict,'HOLD_UNRECONCILED_REMOTE_PROVENANCE');
  assert.equal(result.deployAuthorized,false);
});

test('an extra remote-only version cannot be treated as known history', () => {
  const changed={...snapshot,installedVersions:[...snapshot.installedVersions,'20261019010101']};
  const result=auditLiveMigrationImpactV1(changed);
  assert.deepEqual(result.unmatchedRemoteVersions.sort(),[
    '20261008090417','20261019010101',
  ]);
  assert.equal(result.verdict,'HOLD_UNRECONCILED_REMOTE_PROVENANCE');
});

test('even a history-compatible database is not approved for production SQL writes', () => {
  const known=snapshot.installedVersions;
  const missing=report.migrationInventory.map(x=>x.version);
  const result=auditLiveMigrationImpactV1({
    ...snapshot,installedVersions:[...known,...missing],
  });
  assert.equal(result.missingSourceCount,0);
  assert.equal(result.verdict,'HOLD_OWNER_RELEASE_EVIDENCE_REQUIRED');
  assert.equal(result.deployAuthorized,false);
  assert.equal(result.migrationHistoryRepairAuthorized,false);
  assert.equal(result.privateIssuerAuthorized,false);
  assert.equal(result.providerPaymentAuthorized,false);
  assert.equal(result.paidReaderAuthorized,false);
});

test('mixed duplicate or malformed history fails with no soft fallback',()=>{
  assert.throws(()=>auditLiveMigrationImpactV1({
    ...snapshot,installedVersions:[...snapshot.installedVersions,'1460'],
  }),/duplicated/u);
  assert.throws(()=>auditLiveMigrationImpactV1({
    ...snapshot,installedVersions:['DROP TABLE public.commerce_receipts'],
  }),/invalid/u);
  assert.equal(inspectMigrationSql('create function public.x() returns int security definer').securityDefiner,true);
});
