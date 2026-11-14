// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'vitest';
import {
  assertReplaySource, buildDisposableLedgerReplaySql, assessDisposableLedgerReplay,
} from '../../scripts/operations/replay-disposable-provider-migration-ledger.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex');
function jsonbArray(items) {
  return '['+items.map(v=>Array.isArray(v)?jsonbArray(v):JSON.stringify(v)).join(', ')+']';
}
function fixture() {
  const statement="select 'synthetic-secret-sql-canary';";
  const entries=[
    {version:'20261113062454',name:'fixture',
      statements:[statement],createdBy:'synthetic-operator',idempotencyKey:null,rollbackStatements:null},
    {version:'20261113062455',name:null,
      statements:null,createdBy:null,idempotencyKey:'synthetic-key',rollbackStatements:['select 2']},
  ];
  const packet={
    schemaVersion:'ops-provider-migration-sealed-source-v1',
    allVersionCount:entries.length,numericVersionCount:entries.length,
    migrationFrontier:20261113062455,
    catalogSha256:sha(jsonbArray([
      [entries[0].version,entries[0].name,[sha(statement)]],
      [entries[1].version,entries[1].name,[]],
    ])),
    entries,
  };
  const bytes=Buffer.from(JSON.stringify(packet)+'\n');
  const paired={
    schemaVersion:'ops-paired-provider-ledger-source-recovery-v1',
    backupRunId:43424903445,
    backupSourceSha:'6eab97337811128282f5f5ec6320e4608d5f9c09',
    projectRef:'cnsfpcdiyofqvhpcegfc',
    encryptedSourceDecryptionVerified:true,
    originalHistoryPayloadIntegrityVerified:true,
    providerMigrationLedgerRestored:false,
    drReady:false,serviceResumptionAllowed:false,
    migrationCount:2,migrationFrontier:packet.migrationFrontier,
    migrationCatalogSha256:packet.catalogSha256,
    sourcePacketSha256:sha(bytes),
  };
  return {packet,bytes,paired,statement};
}
test('verified paired source can only construct disposable data-only ledger replay',()=>{
  const {packet,bytes,paired,statement}=fixture();
  const verified=assertReplaySource({sourceBytes:bytes,paired});
  assert.deepEqual(verified,packet);
  const sql=buildDisposableLedgerReplaySql(verified);
  assert.match(sql,/^BEGIN;/u);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS supabase_migrations\.schema_migrations/u);
  assert.match(sql,/jsonb_to_recordset/u);
  assert.match(sql,/COPY ops_private_source_base64\(encoded\) FROM STDIN/u);
  assert.match(sql,/log_min_error_statement='panic'/u);
  assert.match(sql,/log_error_verbosity='terse'/u);
  assert.match(sql,/log_statement='none'/u);
  assert.match(sql,/decode\(encoded,'base64'\)/u);
  assert.match(sql,/\/\*__SOURCE_PACKET_COPY_DATA__\*\//u);
  assert.match(sql,/DISPOSABLE_LEDGER_NOT_EMPTY/u);
  assert.match(sql,/^COMMIT;\s*$/mu);
  assert.ok(!sql.includes(statement),'no private SQL text embedded in replay script');
  assert.ok(!sql.includes('synthetic-operator'),'no operator provenance in visible SQL');
  assert.ok(!/EXECUTE\s+.*statements/iu.test(sql));
});
test('unpaired/tampered source and invalid replay receipts always hold',()=>{
  const {bytes,paired}=fixture();
  assert.throws(()=>assertReplaySource({sourceBytes:bytes,paired:{...paired,sourcePacketSha256:'a'.repeat(64)}}));
  assert.throws(()=>assertReplaySource({sourceBytes:bytes,paired:{...paired,backupRunId:43424903446}}));
  const observed={allFieldsExact:true,count:2,countMatch:true,
    frontier:20261113062455,frontierMatch:true};
  const evidence=assessDisposableLedgerReplay({observed,paired});
  assert.equal(evidence.restoredAllSixHistoryFieldsExact,true);
  assert.equal(evidence.fullProviderMigrationLedgerRestored,false);
  assert.equal(evidence.drReady,false);
  assert.equal(evidence.serviceResumptionAllowed,false);
  assert.throws(()=>assessDisposableLedgerReplay({observed:{...observed,allFieldsExact:false},paired}));
  assert.throws(()=>assessDisposableLedgerReplay({observed:{...observed,count:1},paired}));
});
