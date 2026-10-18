import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  M119_IMPACT_WAVES,
  auditM119LiveHistory,
} from './m1-19-live-migration-impact-audit.mjs';

const snapshot=JSON.parse(readFileSync(
  'docs/architecture/evidence/M1_19_LIVE_MIGRATION_HISTORY_20261018.json',
  'utf8',
));

test('exact 45 live-missing migrations are owned in non-overlapping, independently blocked waves', () => {
  const report=auditM119LiveHistory({snapshot});
  assert.equal(report.status,'HOLD_LIVE_REPAIR_OVERLAY_AND_45_CROSS_TRACK_MIGRATIONS');
  assert.deepEqual(report.waves.map(x=>x.count),[1,1,1,16,2,9,8,6,1]);
  assert.equal(report.missingMigrations.length,45);
  assert.equal(report.parity.repoCount,217);
  assert.equal(report.parity.installedCount,173);
  assert.equal(report.parity.liveOnlyCount,1);
  assert.equal(report.parity.missingCount,45);
  assert.equal(new Set(report.missingMigrations.map(x=>x.version)).size,45);
  assert.ok(report.missingMigrations.every(x=>x.deploymentAuthorized===false));
  assert.ok(report.missingMigrations.every(x=>x.owningReview && x.requiredReleaseGate));
  assert.equal(M119_IMPACT_WAVES.length,9);
  assert.equal(report.deploymentAuthorized,false);
  assert.equal(report.readFunctionProductionGrantAuthorized,false);
  assert.equal(report.privateIssuerEnabled,false);
  assert.equal(report.publicPaidReaderEnabled,false);
});

test('observed live-only SQL is a 104KB SeYeon runtime ACL/owner recovery overlay, not an unexplained source file', () => {
  const result=auditM119LiveHistory({snapshot}).liveOnlyRecoverySql;
  assert.equal(result.version,'20261008090417');
  assert.equal(result.name,'seyeon_runtime_1460_1510_acl_before_owner_recovery');
  assert.equal(result.statementCount,1);
  assert.equal(result.statementLength,104021);
  assert.equal(result.statementMd5,'f70776d8c0f6369f6f13484ba9fa2271');
  assert.equal(result.original1460To1510HistoryPresent,true);
  assert.equal(result.functionDefinitions,19);
  assert.equal(result.functionOwnerChanges,18);
  assert.equal(result.policiesCreated,19);
  assert.equal(result.exactSemanticEquivalenceToSourceCertified,false);
  assert.equal(result.deploymentActorIdentified,false);
});

test('privacy DELETE finalizer, persistent table DDL, private issuer and executable ACL guard are not conflated', () => {
  const all=auditM119LiveHistory({snapshot}).missingMigrations;
  const find=version=>all.find(x=>x.version===version);
  assert.equal(find('1520').wave,'P0_PRIVACY_DELETION_FINALIZER');
  assert.equal(find('1520').readOnlySqlIndicators.changeExistingFunction,true);
  assert.equal(find('1520').readOnlySqlIndicators.routineMayMutateRows,true);
  assert.equal(find('1530').readOnlySqlIndicators.createTable,true);
  assert.equal(find('1540').wave,'P2_SAJU_NONCE_PROOF');
  assert.equal(find('1550').readOnlySqlIndicators.createTable,true);
  assert.equal(find('1660').wave,'P4_DORMANT_READER_DISCOVERY');
  assert.equal(find('1720').wave,'P4_DORMANT_READER_DISCOVERY');
  assert.equal(find('1820').wave,'P5_PRIVATE_READER_LOCKS_AND_D2');
  assert.equal(find('1820').readOnlySqlIndicators.defineFunction,true);
  assert.equal(find('1900').wave,'P6_PRIVATE_CANCEL_AND_WRITER_ACL');
  assert.equal(find('1970').wave,'P8_MINIMAL_APPROVED_READ');
  assert.equal(find('1970').readOnlySqlIndicators.securityDefiner,true);
  assert.equal(find('1970').readOnlySqlIndicators.grant,true);
});

test('missing, duplicate, changed or previously unknown ledger data require new inspection, not a green release', () => {
  const modified={...snapshot,ledgerVersions:snapshot.ledgerVersions.filter(x=>x!=='1510')};
  assert.throws(()=>auditM119LiveHistory({snapshot:modified}),/M1-19:/u);
  assert.throws(()=>auditM119LiveHistory({
    snapshot:{...snapshot,recoveredLiveOnly:{
      ...snapshot.recoveredLiveOnly,md5:'unknown',version:'20990101000000',
    }},
  }),/M1-19:/u);
  assert.throws(()=>auditM119LiveHistory({
    snapshot:{...snapshot,ledgerVersions:[...snapshot.ledgerVersions,'1970']},
  }),/M1-19:/u);
});

test('lexical DDL signals are evidence for human review, not runtime execution proofs or cutover permission', () => {
  const report=auditM119LiveHistory({snapshot});
  assert.ok(report.waves.some(x=>x.id==='P3_SEYEON_AI_COST_GOVERNOR' && x.count===16));
  assert.ok(report.waves.some(x=>x.id==='P6_PRIVATE_CANCEL_AND_WRITER_ACL' && x.count===8));
  assert.ok(report.waves.some(x=>x.id==='P7_PRIVATE_CANCEL_OPERATIONS' && x.count===6));
  assert.ok(report.missingMigrations.every(x=>x.readOnlySqlIndicators &&
    typeof x.readOnlySqlIndicators.defineFunction==='boolean'));
  assert.ok(report.cutoverSequence.some(x=>x.includes('recheck')||x.includes('Recheck')));
  assert.equal(report.readFunctionProductionGrantAuthorized,false);
});
