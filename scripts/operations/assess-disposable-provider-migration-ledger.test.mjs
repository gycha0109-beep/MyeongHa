import { test } from 'vitest';
import assert from 'node:assert/strict';
import { assessDisposableProviderLedger } from './assess-disposable-provider-migration-ledger.mjs';

const source=()=>({
  schema_version:'myeongha-postgres-backup-artifact-v1',
  project_ref:'cnsfpcdiyofqvhpcegfc',
  source_sha:'4de4e050e1e9393850a34eb68f8fa60973dc9f63',
  encrypted_sha256:'5396ceec4eca37f23c519c7e006fe0d8af27ad7f53ae7f54938fd9fc14f3a2d1',
  migration_catalog_version_count:242,
  migration_frontier:20261109071019,
  migration_catalog_sha256:'91f24b544486d2cd9af2ef8694278c80e9a2a40a7e93a3aeedf14250d08e3a47',
});
const target=()=>({
  schemaVersion:'ops-disposable-supabase-migration-catalog-v1',
  target:'disposable-supabase-cli-3.1.0-postgresql17',
  migrationTablePresent:true,requiredColumnsPresent:true,
  allVersionCount:0,numericVersionCount:0,
  migrationFrontier:null,
  catalogSha256:'4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  migrationStatementOrUserPayloadOutput:false,
});
const replay={schemaVersion:'ops-provider-sealed-copy-isolated-row-restore-v1',
  sourceBackupRunId:42752268638,copiedSourceRows:93,isolatedTargetRowDelta:93,
  rowsCountVerified:true,drReady:false,serviceResumptionAllowed:false};
const auth={schemaVersion:'ops-provider-sealed-local-auth-reference-integrity-v1',
  sourceBackupRunId:42752268638,localAuthReferenceIntegrityObserved:true,orphanCount:0,
  drReady:false,serviceResumptionAllowed:false};
const run=(s=source(),t=target(),r=replay,a=auth)=>
  assessDisposableProviderLedger({sourceManifest:s,targetSnapshot:t,replay:r,authProof:a});
test('fresh local Provider ledger mismatch preserves DR block',()=>{
  const out=run();
  assert.equal(out.allMetadataFingerprintsMatch,false);
  assert.equal(out.sourceBackupMigrationCount,242);
  assert.equal(out.localMigrationNumericCount,0);
  assert.equal(out.providerMigrationLedgerRestored,false);
  assert.equal(out.drReady,false);
  assert.equal(out.serviceResumptionAllowed,false);
});
test('matching public fingerprint is still not Hosted restoration',()=>{
  const t=target();
  t.allVersionCount=t.numericVersionCount=242;
  t.migrationFrontier=20261109071019;
  t.catalogSha256=source().migration_catalog_sha256;
  const out=run(source(),t);
  assert.equal(out.allMetadataFingerprintsMatch,true);
  assert.equal(out.hostedProviderRecoveryProven,false);
  assert.equal(out.providerMigrationLedgerRestored,false);
});
test('non-numeric rows cannot silently hide behind matching digest',()=>{
  const t=target();t.allVersionCount=243;t.numericVersionCount=242;
  t.migrationFrontier=20261109071019;t.catalogSha256=source().migration_catalog_sha256;
  assert.equal(run(source(),t).allMetadataFingerprintsMatch,false);
});
test('falsified source backup provenance rejects report',()=>{
  assert.throws(()=>run({...source(),source_sha:'0'.repeat(40)}));
});
test('invalid local digest rejects report',()=>{
  assert.throws(()=>run(source(),{...target(),catalogSha256:'not-a-sha'}));
});
test('leaked columns and identifier fields are rejected',()=>{
  assert.throws(()=>run(source(),{...target(),sourceUserId:'unexpected'}));
});
test('row-replay or Auth proof readiness promotion is rejected',()=>{
  assert.throws(()=>run(source(),target(),{...replay,drReady:true}));
  assert.throws(()=>run(source(),target(),replay,{...auth,localAuthReferenceIntegrityObserved:false}));
});

test('missing disposable CLI migration table is evidence, not a repaired zero-row ledger',()=>{
  const t={...target(),migrationTablePresent:false,requiredColumnsPresent:false,
    allVersionCount:null,numericVersionCount:null,migrationFrontier:null,
    catalogSha256:null};
  const out=run(source(),t);
  assert.equal(out.localMigrationTablePresent,false);
  assert.equal(out.localMigrationNumericCount,null);
  assert.equal(out.allMetadataFingerprintsMatch,false);
  assert.equal(out.verdict,'HOLD_DISPOSABLE_PROVIDER_MIGRATION_LEDGER_TABLE_ABSENT');
  assert.equal(out.drReady,false);
});
test('migration table with missing required columns remains a HOLD',()=>{
  const t={...target(),migrationTablePresent:true,requiredColumnsPresent:false,
    allVersionCount:null,numericVersionCount:null,migrationFrontier:null,
    catalogSha256:null};
  const out=run(source(),t);
  assert.equal(out.localMigrationRequiredColumnsPresent,false);
  assert.equal(out.verdict,'HOLD_DISPOSABLE_PROVIDER_MIGRATION_LEDGER_COLUMNS_INCOMPLETE');
  assert.equal(out.providerMigrationLedgerRestored,false);
});
test('missing local migration table cannot fabricate zero-valued fingerprint',()=>{
  const t={...target(),migrationTablePresent:false,requiredColumnsPresent:false};
  assert.throws(()=>run(source(),t));
});
test('migration table presence requires existing column evidence',()=>{
  assert.throws(()=>run(source(),{...target(),requiredColumnsPresent:null}));
});
