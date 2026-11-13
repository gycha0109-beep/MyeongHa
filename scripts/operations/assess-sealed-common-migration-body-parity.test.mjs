import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assessSealedCommonMigrationBodyParity } from
  './assess-sealed-common-migration-body-parity.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const buf = text => Buffer.from(text, 'utf8');

function fixture() {
  const sourcePacket = {
    schemaVersion:'ops-provider-migration-sealed-source-v1',
    allVersionCount:6,numericVersionCount:6,migrationFrontier:150,
    catalogSha256:'f'.repeat(64),
    entries:[
      {version:'100',name:'exact',statements:['select 100;']},
      {version:'110',name:'different',statements:['select 110;']},
      {version:'120',name:'missing',statements:null},
      {version:'130',name:'multiple',statements:['select 1','select 2']},
      {version:'140',name:'source_name',statements:['select 140;']},
      {version:'150',name:'source_only',statements:['select 150;']},
    ],
  };
  const sourceBytes = buf(JSON.stringify(sourcePacket)+'\n');
  const pairedProof = {
    schemaVersion:'ops-paired-provider-ledger-source-recovery-v1',
    backupRunId:43174606843,backupSourceSha:'a'.repeat(40),
    encryptedSourceDecryptionVerified:true,
    originalHistoryPayloadIntegrityVerified:true,
    sourcePacketSha256:hash(sourceBytes),
    migrationCount:6,migrationFrontier:150,
    migrationCatalogSha256:sourcePacket.catalogSha256,
    sourceStatementBodiesMissingCount:1,
    providerMigrationLedgerRestored:false,
    drReady:false,serviceResumptionAllowed:false,
  };
  const repositoryCommitSha = 'c'.repeat(40);
  const lineage = {
    schemaVersion:'ops-sealed-provider-migration-file-lineage-v1',
    currentRepositoryCommitSha:repositoryCommitSha,
    sourceBackupRunId:pairedProof.backupRunId,
    sourcePacketSha256:pairedProof.sourcePacketSha256,
    sourceMigrationCatalogSha256:pairedProof.migrationCatalogSha256,
    sourceMigrationFrontier:pairedProof.migrationFrontier,
    sourceVersionCount:6,currentRepositoryFileCount:8,
    commonVersionCount:5,
    remoteOnlyVersionIds:['150'],
    repositoryOnlyVersionIds:['160','2050','20261001000000'],
    originalSqlBodiesPublished:false,
    sourceLedgerHistoryRowsRestored:false,
    migrationHistoryRepaired:false,
    drReady:false,serviceResumptionAllowed:false,
  };
  const repositoryEntries = [
    {path:'supabase/migrations/100_exact.sql',bytes:buf('select 100;')},
    {path:'supabase/migrations/110_different.sql',bytes:buf('select 111;')},
    {path:'supabase/migrations/120_missing.sql',bytes:buf('select 120;')},
    {path:'supabase/migrations/130_multiple.sql',bytes:buf('select 1;\n\nselect 2;')},
    {path:'supabase/migrations/140_other_name.sql',bytes:buf('select 140;')},
    {path:'supabase/migrations/160_repo_only.sql',bytes:null},
    {path:'supabase/migrations/2050_historical_repo_only.sql',bytes:null},
    {path:'supabase/migrations/20261001000000_later_repo_only.sql',bytes:null},
  ];
  return {sourcePacket,sourceBytes,pairedProof,lineage,
    repositoryEntries,repositoryCommitSha};
}

test('separates byte-exact history from ambiguous and missing source bodies',()=>{
  const report = assessSealedCommonMigrationBodyParity(fixture());
  assert.equal(report.sourceVersionCount,6);
  assert.equal(report.commonVersionCount,5);
  assert.equal(report.repositoryOnlyVersionCount,3);
  assert.equal(report.byteExactSingleStatementCount,1);
  assert.equal(report.notByteExactOrUnprovenCount,4);
  assert.equal(report.classifications.SOURCE_STATEMENTS_ABSENT,1);
  assert.equal(report.classifications.SINGLE_STATEMENT_BYTES_DIFFER,1);
  assert.equal(report.classifications.SAME_VERSION_NAME_MISMATCH,1);
  assert.equal(report.classifications.MULTI_STATEMENT_RECONSTRUCTED_MATCH_UNPROVEN,1);
  assert.equal(report.multipleStatementReconstructionPromotedToExact,false);
  assert.equal(report.drReady,false);
  assert.equal(report.serviceResumptionAllowed,false);
  const text=JSON.stringify(report);
  assert.ok(!text.includes('select 100'));
  assert.ok(!text.includes('select 110'));
  assert.ok(!text.includes('select 2'));
  assert.ok(!text.includes('createdBy'));
});

test('rejects packet drift, lineage mismatch and false DR promotion',()=>{
  const drift=fixture();
  drift.sourceBytes=buf('fake');
  assert.throws(()=>assessSealedCommonMigrationBodyParity(drift));
  const wrongSha=fixture();
  wrongSha.lineage.currentRepositoryCommitSha='d'.repeat(40);
  assert.throws(()=>assessSealedCommonMigrationBodyParity(wrongSha));
  const version=fixture();
  version.lineage.remoteOnlyVersionIds=['999'];
  assert.throws(()=>assessSealedCommonMigrationBodyParity(version));
  const dr=fixture();
  dr.pairedProof.drReady=true;
  assert.throws(()=>assessSealedCommonMigrationBodyParity(dr));
});

test('rejects duplicate main versions, nonempty repo-only SQL and invalid paths',()=>{
  const dup=fixture();
  dup.repositoryEntries[5].path='supabase/migrations/100_duplicate.sql';
  assert.throws(()=>assessSealedCommonMigrationBodyParity(dup));
  const leak=fixture();
  leak.repositoryEntries[5].bytes=buf('select 160;');
  assert.throws(()=>assessSealedCommonMigrationBodyParity(leak));
  const bad=fixture();
  bad.repositoryEntries[0].path='supabase/migrations/../100_exact.sql';
  assert.throws(()=>assessSealedCommonMigrationBodyParity(bad));
  const missing=fixture();
  missing.repositoryEntries[0].bytes=null;
  assert.throws(()=>assessSealedCommonMigrationBodyParity(missing));
});
