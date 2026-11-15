import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assessSealedProviderMigrationFileLineage } from
  './assess-sealed-provider-migration-file-lineage.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const sourcePacket = {
    schemaVersion:'ops-provider-migration-sealed-source-v1',
    allVersionCount:3,numericVersionCount:3,migrationFrontier:3,
    catalogSha256:'b'.repeat(64),
    entries:[
      {version:'1',name:'one',statements:['select 1']},
      {version:'2',name:'remote_old',statements:['select 2']},
      {version:'3',name:'same_name',statements:null},
    ],
  };
  const sourceBytes = Buffer.from(JSON.stringify(sourcePacket)+'\n');
  return {
    sourcePacket,sourceBytes,
    pairedProof:{
      schemaVersion:'ops-paired-provider-ledger-source-recovery-v1',
      encryptedSourceDecryptionVerified:true,
      originalHistoryPayloadIntegrityVerified:true,
      sourcePacketSha256:hash(sourceBytes),
      migrationCount:3,migrationFrontier:3,
      migrationCatalogSha256:sourcePacket.catalogSha256,
      sourceStatementBodiesMissingCount:1,
      providerMigrationLedgerRestored:false,
      drReady:false,serviceResumptionAllowed:false,
      backupRunId:11,backupSourceSha:'a'.repeat(40),
    },
    baseline:{
      schemaVersion:'ops-remote-only-ledger-disposition-v1',
      latestAppliedMigration:'2',
      summary:{remoteOnlyAppliedVersionCount:1},
      entries:[{version:'2',name:'remote_old'}],
    },
    repositoryPaths:[
      'supabase/migrations/1_one.sql',
      'supabase/migrations/4_same_name.sql',
    ],
    repositoryCommitSha:'c'.repeat(40),
  };
}
test('sealed history identifies exact-version gaps, prior gaps and new source-only IDs',()=>{
  const result=assessSealedProviderMigrationFileLineage(fixture());
  assert.equal(result.sourceVersionCount,3);
  assert.equal(result.currentRepositoryFileCount,2);
  assert.equal(result.commonVersionCount,1);
  assert.deepEqual(result.remoteOnlyVersionIds,['2','3']);
  assert.deepEqual(result.repositoryOnlyVersionIds,['4']);
  assert.deepEqual(result.newRemoteOnlySinceBaselineIds,['3']);
  assert.deepEqual(result.sourceNullStatementVersionIds,['3']);
  assert.deepEqual(result.sameNameDifferentVersionPairs,
    [{remoteVersion:'3',repositoryVersion:'4'}]);
  assert.equal(result.appliedSqlAndCurrentDdlEquivalenceProven,false);
  assert.equal(result.drReady,false);
  assert.equal(JSON.stringify(result).includes('select 1'),false);
});
test('tampered source, old baseline or missing source identity fail closed',()=>{
  const drift=fixture();
  drift.sourceBytes=Buffer.from('tampered');
  assert.throws(()=>assessSealedProviderMigrationFileLineage(drift));
  const missing=fixture();
  missing.baseline.entries[0].version='5';
  assert.throws(()=>assessSealedProviderMigrationFileLineage(missing));
  const mismatch=fixture();
  mismatch.baseline.entries[0].name='wrong';
  assert.throws(()=>assessSealedProviderMigrationFileLineage(mismatch));
  const untrusted=fixture();
  untrusted.pairedProof.originalHistoryPayloadIntegrityVerified=false;
  assert.throws(()=>assessSealedProviderMigrationFileLineage(untrusted));
});
test('malformed repository file, duplicate version or falsely promoted DR fail',()=>{
  const badPath=fixture();
  badPath.repositoryPaths.push('supabase/migrations/invalid.sql');
  assert.throws(()=>assessSealedProviderMigrationFileLineage(badPath));
  const duplicate=fixture();
  duplicate.repositoryPaths.push('supabase/migrations/1_conflict.sql');
  assert.throws(()=>assessSealedProviderMigrationFileLineage(duplicate));
  const unsafe=fixture();
  unsafe.pairedProof.drReady=true;
  assert.throws(()=>assessSealedProviderMigrationFileLineage(unsafe));
});
