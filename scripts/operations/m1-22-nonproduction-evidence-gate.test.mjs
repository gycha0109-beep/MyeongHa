import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  auditM122NonproductionGate, REQUIRED_RECOVERY_EVIDENCE_V1,
} from './m1-22-nonproduction-evidence-gate.mjs';

const read = path => JSON.parse(readFileSync(path,'utf8'));
const live = read('scripts/operations/fixtures/m1-19-20261017-live-migration-history.snapshot.json');
const owners = read('scripts/operations/fixtures/m1-22-owner-release-evidence.HOLD.json');

// Synthetic *test* candidate only. Real catalog observation comes from the
// disposable PG17 database via test/db/official_reader_m1_22_pg17_capture.sql.
const isolate = Object.freeze({
  fixtureKind: 'SOURCE_TREE_PG17_DISPOSABLE',
  postgresVersionNum: 170006,
  executorIsSuperuser: true,
  migrationLedgerTablePresent: false,
  issuerPresent: true,
  binderPresent: true,
  minimalReadPresent: true,
  onlyApiCanExecuteMinimalRead: true,
  allPrivateWritersClosedToRuntime: true,
  apiSourceSelectDenied: true,
  historicalRestoreBundleReplayed: false,
  liveDataRestored: false,
  sourceReplayCompleted: true,
  managed0860MigrationSkipped: true,
});

test('45 absent-from-live and one remote-only restore stay distinct from CI full-source replay',()=>{
  const g=auditM122NonproductionGate(live,isolate,owners);
  assert.equal(g.verdict,'HOLD_M1_22_LIVE_PARITY_RESTORE_AND_OWNERS');
  assert.equal(g.liveVsDisposableIsolate.repositorySourceVersions,217);
  assert.equal(g.liveVsDisposableIsolate.liveRecordedVersions,173);
  assert.equal(g.liveVsDisposableIsolate.missingFromLiveVersions.length,45);
  assert.equal(g.liveVsDisposableIsolate.liveOnlyRestoreVersion,'20261008090417');
  assert.deepEqual(g.liveVsDisposableIsolate.otherRemoteOnlyVersions,[]);
  assert.equal(g.liveVsDisposableIsolate.observedLiveCatalogGate,'HOLD_MISSING_PRIVATE_D2_BASELINE');
  assert.equal(g.liveVsDisposableIsolate.disposableCatalogGateAfterReplay,
    'CATALOG_READY_MIGRATION_HISTORY_STILL_REQUIRED');
  assert.equal(g.liveVsDisposableIsolate.isolateHistoryLedgerPresent,false);
  assert.equal(g.snapshotIsHistoricalNotFresh,true);
  assert.equal(g.deployAuthorized,false);
});

test('15 independent responsibility groups remain PENDING, no accidental release',()=>{
  const g=auditM122NonproductionGate(live,isolate,owners);
  assert.equal(g.releaseEvidence.domainOwners.length,9);
  assert.equal(g.releaseEvidence.recovery.length,6);
  assert.equal(g.releaseEvidence.minimumOwnerDecisionCount,15);
  assert.equal(REQUIRED_RECOVERY_EVIDENCE_V1.length,6);
  assert.equal(g.releaseEvidence.missingOrPendingEvidence.length,15);
  assert.equal(g.releaseEvidence.ownerClaimsRequiringHumanVerification.length,0);
  assert.equal(g.releaseEvidence.ownerEvidenceSchemaValid,true);
  assert.equal(g.releaseEvidence.independentReleaseAttestationPresent,false);
  for(const key of ['historyRepairAuthorized','safeToApplyMigrations',
    'privateIssuerAuthorized','paymentOrRefundAuthorized','paidReaderAuthorized',
    'deployAuthorized']) assert.equal(g[key],false,key);
});

test('ALL 15 forged approval claims and fake references remain non-authorizing',()=>{
  const forged=structuredClone(owners);
  for(const rows of [forged.domainOwners,forged.recovery]) {
    for(const val of Object.values(rows)) {
      val.status='CLAIMED_APPROVED_UNVERIFIED';
      val.evidenceRefs=['https://example.invalid/untrusted-approval'];
    }
  }
  const g=auditM122NonproductionGate(live,isolate,forged);
  assert.equal(g.verdict,'HOLD_M1_22_UNVERIFIED_APPROVAL_CLAIMS');
  assert.equal(g.releaseEvidence.ownerClaimsRequiringHumanVerification.length,15);
  assert.equal(g.releaseEvidence.independentReleaseAttestationPresent,false);
  assert.equal(g.deployAuthorized,false);
});

test('Owner status cannot be missing, invented, or set to operational release',()=>{
  const bad=structuredClone(owners);
  delete bad.domainOwners.P5_PRIVATE_READER_LOCK_AND_FIRST_ISSUE;
  assert.equal(auditM122NonproductionGate(live,isolate,bad).verdict,
    'HOLD_M1_22_OWNER_EVIDENCE_SCHEMA_OR_RELEASE_DRIFT');
  const bad2=structuredClone(owners);
  bad2.releaseAuthorization=true;
  assert.equal(auditM122NonproductionGate(live,isolate,bad2).deployAuthorized,false);
  assert.equal(auditM122NonproductionGate(live,isolate,bad2).verdict,
    'HOLD_M1_22_OWNER_EVIDENCE_SCHEMA_OR_RELEASE_DRIFT');
  const bad3=structuredClone(owners);
  bad3.recovery.SEYEON_RESTORE_LINEAGE.status='APPROVED';
  assert.equal(auditM122NonproductionGate(live,isolate,bad3).verdict,
    'HOLD_M1_22_OWNER_EVIDENCE_SCHEMA_OR_RELEASE_DRIFT');
});

test('source/history drift overrides any staged catalog success',()=>{
  const drift=structuredClone(live);
  drift.historicalBundle.md5='0'.repeat(32);
  assert.equal(auditM122NonproductionGate(drift,isolate,owners).verdict,
    'HOLD_M1_22_LIVE_OR_SOURCE_DRIFT');
  const newRemote=structuredClone(live);
  newRemote.installedVersions.push('20261019999999');
  const report=auditM122NonproductionGate(newRemote,isolate,owners);
  assert.equal(report.verdict,'HOLD_M1_22_LIVE_OR_SOURCE_DRIFT');
  assert.equal(report.liveVsDisposableIsolate.repositorySourceVersions,217);
  assert.deepEqual(report.liveVsDisposableIsolate.otherRemoteOnlyVersions,
    ['20261019999999']);
});

test('any missing or broadened candidate read/Writer privilege fails closed',()=>{
  for(const prop of ['issuerPresent','binderPresent','minimalReadPresent',
    'onlyApiCanExecuteMinimalRead','allPrivateWritersClosedToRuntime',
    'apiSourceSelectDenied','sourceReplayCompleted']) {
    const g=auditM122NonproductionGate(live,{...isolate,[prop]:false},owners);
    assert.equal(g.verdict,'HOLD_M1_22_ISOLATED_PG17_CATALOG_INCOMPLETE',prop);
    assert.equal(g.deployAuthorized,false,prop);
  }
});

test('production-equivalent recovery cannot be fabricated with CI flags',()=>{
  const variations=[
    {executorIsSuperuser:false},
    {migrationLedgerTablePresent:true},
    {historicalRestoreBundleReplayed:true},
    {liveDataRestored:true},
    {managed0860MigrationSkipped:false},
    {postgresVersionNum:150000},
    {fixtureKind:'LIVE_SUPABASE'},
  ];
  for(const v of variations) {
    const g=auditM122NonproductionGate(live,{...isolate,...v},owners);
    assert.equal(g.verdict,'HOLD_M1_22_ISOLATED_PG17_CATALOG_INCOMPLETE',JSON.stringify(v));
    assert.equal(g.privateIssuerAuthorized,false);
  }
});

test('missing complete owner proof input does not fall back to assumed approval',()=>{
  assert.equal(auditM122NonproductionGate(live,isolate,null).verdict,
    'HOLD_M1_22_OWNER_EVIDENCE_SCHEMA_OR_RELEASE_DRIFT');
  assert.equal(auditM122NonproductionGate(live,isolate,{}).deployAuthorized,false);
  const claims=structuredClone(owners);
  claims.recovery.INTERRUPTED_REPLAY_AND_DR={
    status:'EVIDENCE_SUBMITTED_UNVERIFIED',evidenceRefs:[]};
  assert.equal(auditM122NonproductionGate(live,isolate,claims).verdict,
    'HOLD_M1_22_OWNER_EVIDENCE_SCHEMA_OR_RELEASE_DRIFT');
});
