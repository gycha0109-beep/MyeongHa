// Compare sealed source public catalog metadata with the disposable local
// Supabase migration ledger; nonpromoting even when fingerprints match.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_BACKUP_RUN_ID=42752268638;
const SOURCE_SHA='4de4e050e1e9393850a34eb68f8fa60973dc9f63';
const SOURCE_CIPHERTEXT_SHA='5396ceec4eca37f23c519c7e006fe0d8af27ad7f53ae7f54938fd9fc14f3a2d1';
const SHA256=/^[a-f0-9]{64}$/u;
const keys=(v,expected,label)=>{
  assert.ok(v && typeof v==='object' && !Array.isArray(v),label);
  assert.deepEqual(Object.keys(v).sort(),[...expected].sort(),label);
};
export function assessDisposableProviderLedger({sourceManifest,targetSnapshot,replay,authProof}){
  const s=sourceManifest,t=targetSnapshot;
  assert.equal(s?.schema_version,'myeongha-postgres-backup-artifact-v1');
  assert.equal(s.project_ref,'cnsfpcdiyofqvhpcegfc');
  assert.equal(s.source_sha,SOURCE_SHA);
  assert.equal(s.encrypted_sha256,SOURCE_CIPHERTEXT_SHA);
  assert.equal(s.migration_catalog_version_count,242);
  assert.equal(s.migration_frontier,20261109071019);
  assert.match(s.migration_catalog_sha256,SHA256);
  keys(t,['schemaVersion','target','migrationTablePresent','requiredColumnsPresent','allVersionCount',
    'numericVersionCount','migrationFrontier','catalogSha256',
    'migrationStatementOrUserPayloadOutput'],'targetSnapshot');
  assert.equal(t.schemaVersion,'ops-disposable-supabase-migration-catalog-v1');
  assert.equal(t.target,'disposable-supabase-cli-3.1.0-postgresql17');
  assert.equal(typeof t.migrationTablePresent,'boolean');
  assert.equal(typeof t.requiredColumnsPresent,'boolean');
  assert.equal(t.migrationStatementOrUserPayloadOutput,false);
  if (!t.migrationTablePresent || !t.requiredColumnsPresent) {
    // A fresh CLI instance may not have created the migration ledger.
    // Record absence as HOLD; never initialize or fabricate its history.
    if (!t.migrationTablePresent) assert.equal(t.requiredColumnsPresent,false);
    for(const n of [t.allVersionCount,t.numericVersionCount,
      t.migrationFrontier,t.catalogSha256]) assert.equal(n,null);
  } else {
    for(const n of [t.allVersionCount,t.numericVersionCount]){
      assert.ok(Number.isSafeInteger(n)&&n>=0,'Invalid local migration count');
    }
    assert.ok(t.numericVersionCount<=t.allVersionCount);
    assert.ok(t.migrationFrontier===null ||
      (Number.isSafeInteger(t.migrationFrontier)&&t.migrationFrontier>=0));
    assert.match(t.catalogSha256,SHA256);
  }
  assert.equal(replay?.schemaVersion,'ops-provider-sealed-copy-isolated-row-restore-v1');
  assert.equal(replay.sourceBackupRunId,SOURCE_BACKUP_RUN_ID);
  assert.equal(replay.copiedSourceRows,93);
  assert.equal(replay.isolatedTargetRowDelta,93);
  assert.equal(replay.rowsCountVerified,true);
  assert.equal(replay.drReady,false);
  assert.equal(replay.serviceResumptionAllowed,false);
  assert.equal(authProof?.schemaVersion,'ops-provider-sealed-local-auth-reference-integrity-v1');
  assert.equal(authProof.sourceBackupRunId,SOURCE_BACKUP_RUN_ID);
  assert.equal(authProof.localAuthReferenceIntegrityObserved,true);
  assert.equal(authProof.orphanCount,0);
  assert.equal(authProof.drReady,false);
  assert.equal(authProof.serviceResumptionAllowed,false);

  const comparable=t.migrationTablePresent&&t.requiredColumnsPresent;
  const versionCountMatch=comparable&&t.numericVersionCount===s.migration_catalog_version_count;
  const frontierMatch=comparable&&t.migrationFrontier===s.migration_frontier;
  const hashMatch=comparable&&t.catalogSha256===s.migration_catalog_sha256;
  const fullCatalogFingerprintMatch=versionCountMatch&&frontierMatch&&hashMatch&&
    t.allVersionCount===t.numericVersionCount;
  return {
    schemaVersion:'ops-provider-migration-ledger-disposable-parity-observation-v1',
    sourceBackupRunId:SOURCE_BACKUP_RUN_ID,
    sourceBackupMigrationCount:s.migration_catalog_version_count,
    sourceBackupMigrationFrontier:s.migration_frontier,
    sourceBackupMigrationCatalogSha256:s.migration_catalog_sha256,
    target:'disposable-supabase-cli-3.1.0-postgresql17',
    localMigrationTablePresent:t.migrationTablePresent,
    localMigrationRequiredColumnsPresent:t.requiredColumnsPresent,
    localMigrationTotalCount:t.allVersionCount,
    localMigrationNumericCount:t.numericVersionCount,
    localMigrationFrontier:t.migrationFrontier,
    localMigrationCatalogSha256:t.catalogSha256,
    migrationCountMatch:versionCountMatch,
    migrationFrontierMatch:frontierMatch,
    migrationCatalogFingerprintMatch:hashMatch,
    allMetadataFingerprintsMatch:fullCatalogFingerprintMatch,
    recoveredProviderCopyRows:93,
    localAuthReferenceIntegrityObserved:true,
    migrationStatementPayloadPublished:false,
    productionMigrationRepairPerformed:false,
    applicationSchemaFullyRestored:false,
    providerMigrationLedgerRestored:false,
    hostedProviderRecoveryProven:false,
    independentPrivacyContinuityProven:false,
    wholeServiceRpoRtoProven:false,
    drReady:false,serviceResumptionAllowed:false,
    gate:'BLOCKED',
    verdict:!t.migrationTablePresent
      ? 'HOLD_DISPOSABLE_PROVIDER_MIGRATION_LEDGER_TABLE_ABSENT'
      : !t.requiredColumnsPresent
        ? 'HOLD_DISPOSABLE_PROVIDER_MIGRATION_LEDGER_COLUMNS_INCOMPLETE'
        : fullCatalogFingerprintMatch
          ? 'LOCAL_LEDGER_FINGERPRINT_MATCH_ONLY__HOSTED_DR_HOLD'
          : 'HOLD_ISOLATED_PROVIDER_MIGRATION_LEDGER_DIFFERENCE',
  };
}
async function main(){
  assert.equal(process.env.GITHUB_ACTIONS,'true');
  assert.equal(process.env.GITHUB_REF,'refs/heads/main');
  assert.equal(process.env.MH_OPS_PROVIDER_DATA_REPLAY,'true');
  const args=process.argv.slice(2);
  const file=flag=>{
    const index=args.indexOf(flag);
    assert.ok(index>=0&&args[index+1]&&!args[index+1].startsWith('--'));
    const path=resolve(args[index+1]);
    const root=resolve(process.env.RUNNER_TEMP??'.');
    assert.notEqual(root,resolve('.'));
    assert.ok(path.startsWith(root+'/')||path.startsWith(root+'\\'));
    return path;
  };
  const snapshotFile=await readFile(file('--target'),'utf8');
  const lines=snapshotFile.trim().split(/\r?\n/u);
  assert.equal(lines.length,1);
  const report=assessDisposableProviderLedger({
    sourceManifest:JSON.parse(await readFile(file('--manifest'),'utf8')),
    targetSnapshot:JSON.parse(lines[0]),
    replay:JSON.parse(await readFile(file('--replay'),'utf8')),
    authProof:JSON.parse(await readFile(file('--auth'),'utf8')),
  });
  await writeFile(file('--output'),JSON.stringify(report,null,2)+'\n',
    {flag:'wx',mode:0o600});
  console.log('DISPOSABLE_PROVIDER_MIGRATION_LEDGER '+report.verdict+
    ' source_count='+report.sourceBackupMigrationCount+
    ' local_count='+report.localMigrationNumericCount+' DR_BLOCKED');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(()=>{console.error('HOLD_PROVIDER_MIGRATION_LEDGER_METADATA_INVALID');process.exitCode=1;});
}
