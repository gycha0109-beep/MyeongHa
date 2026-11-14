// Rehydrate verified Provider migration-history rows into a disposable PostgreSQL 17
// target only. Do not execute a single historical migration statement.
// Never publish plaintext source SQL, operator provenance, SQL errors or payloads.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assessSealedProviderMigrationSource } from './assess-production-provider-migration-ledger-source.mjs';

const EXPECTED_BACKUP_RUN_ID=43424903445;
const EXPECTED_SOURCE_SHA='6eab97337811128282f5f5ec6320e4608d5f9c09';
const SHA=/^[a-f0-9]{64}$/u;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

export function assertReplaySource({sourceBytes,paired}) {
  assert.ok(Buffer.isBuffer(sourceBytes)&&sourceBytes.length>0&&
    sourceBytes.length<=64*1024*1024,'Invalid sealed source size');
  assert.equal(paired?.schemaVersion,'ops-paired-provider-ledger-source-recovery-v1');
  assert.equal(paired.backupRunId,EXPECTED_BACKUP_RUN_ID);
  assert.equal(paired.backupSourceSha,EXPECTED_SOURCE_SHA);
  assert.equal(paired.projectRef,'cnsfpcdiyofqvhpcegfc');
  assert.equal(paired.encryptedSourceDecryptionVerified,true);
  assert.equal(paired.originalHistoryPayloadIntegrityVerified,true);
  assert.equal(paired.providerMigrationLedgerRestored,false);
  assert.equal(paired.drReady,false);
  assert.equal(paired.serviceResumptionAllowed,false);
  assert.match(paired.sourcePacketSha256,SHA);
  assert.equal(digest(sourceBytes),paired.sourcePacketSha256);
  assert.match(paired.migrationCatalogSha256,SHA);
  const lines=sourceBytes.toString('utf8').trim().split(/\r?\n/u);
  assert.equal(lines.length,1,'Source packet must remain single-line');
  const packet=JSON.parse(lines[0]);
  const verified=assessSealedProviderMigrationSource(packet,{
    expectedCount:paired.migrationCount,
    expectedFrontier:paired.migrationFrontier,
    expectedCatalogSha256:paired.migrationCatalogSha256,
  });
  assert.equal(verified.sourceLedgerRowsRestored,false);
  return packet;
}

// Recreate the sealed history only as COPY-ed base64 data on the disposable target.
// The server must never receive original SQL text inside the COPY stream: its
// error logger can print malformed JSON and disclose historical statements.
export function buildDisposableLedgerReplaySql(packet) {
  assert.ok(packet?.schemaVersion==='ops-provider-migration-sealed-source-v1' &&
    Array.isArray(packet.entries)&&packet.entries.length>0);
  // All SQL statements are fixed literals; COPY transports only ASCII base64.
  // Deny database error-detail and statement logging before accepting it.
  return [
    'BEGIN;',
    "SET LOCAL statement_timeout='90s';",
    "SET LOCAL lock_timeout='5s';",
    "SET LOCAL log_min_error_statement='panic';",
    "SET LOCAL log_error_verbosity='terse';",
    "SET LOCAL log_statement='none';",
    'DO $privacy_log_guard$ BEGIN',
    "IF current_setting('log_min_error_statement') <> 'panic'",
    "OR current_setting('log_error_verbosity') <> 'terse'",
    "OR current_setting('log_statement') <> 'none' THEN",
    "RAISE EXCEPTION 'DISPOSABLE_LOG_PROTECTION_NOT_ACTIVE'; END IF;",
    'END $privacy_log_guard$;',
    'CREATE SCHEMA IF NOT EXISTS supabase_migrations;',
    'CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (',
    'version text PRIMARY KEY, statements text[], name text, created_by text,',
    'idempotency_key text UNIQUE, "rollback" text[]);',
    'DO $guard$ BEGIN',
    "IF current_user <> 'postgres' THEN RAISE EXCEPTION 'UNSAFE_DISPOSABLE_OWNER'; END IF;",
    'IF (SELECT count(*) FROM pg_attribute',
    " WHERE attrelid='supabase_migrations.schema_migrations'::regclass",
    ' AND attnum>0 AND NOT attisdropped)<>6 THEN',
    " RAISE EXCEPTION 'UNSUPPORTED_DISPOSABLE_LEDGER_COLUMNS'; END IF;",
    'IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations) THEN',
    " RAISE EXCEPTION 'DISPOSABLE_LEDGER_NOT_EMPTY'; END IF;",
    'END $guard$;',
    'CREATE TEMP TABLE ops_private_source_base64(encoded text) ON COMMIT DROP;',
    'COPY ops_private_source_base64(encoded) FROM STDIN WITH (FORMAT text);',
    '/*__SOURCE_PACKET_COPY_DATA__*/',
    'CREATE TEMP TABLE ops_private_source_packet(packet jsonb) ON COMMIT DROP;',
    "INSERT INTO ops_private_source_packet(packet) SELECT",
    "convert_from(decode(encoded,'base64'),'UTF8')::jsonb",
    'FROM ops_private_source_base64;',
    'INSERT INTO supabase_migrations.schema_migrations',
    '(version,name,statements,created_by,idempotency_key,"rollback")',
    'SELECT r.version,r.name,r.statements,r."createdBy",r."idempotencyKey",r."rollbackStatements"',
    'FROM ops_private_source_packet s,',
    'LATERAL jsonb_to_recordset(s.packet->\'entries\') AS r(',
    'version text, name text, statements text[], "createdBy" text,',
    '"idempotencyKey" text, "rollbackStatements" text[]);',
    'WITH actual AS (SELECT count(*)::integer AS n,',
    'max(version::bigint) AS frontier,',
    'jsonb_agg(jsonb_build_object(',
    "'version',version,'name',name,'statements',statements,",
    "'createdBy',created_by,'idempotencyKey',idempotency_key,",
    "'rollbackStatements',\"rollback\") ORDER BY version) AS entries",
    'FROM supabase_migrations.schema_migrations),',
    'validated AS (SELECT a.n,a.frontier,',
    "a.entries=(s.packet->'entries') AS exact_rows,",
    "(s.packet->>'catalogSha256') AS expected_sha,",
    "((s.packet->>'numericVersionCount')::integer) AS expected_count,",
    "((s.packet->>'migrationFrontier')::bigint) AS expected_frontier",
    'FROM actual a CROSS JOIN ops_private_source_packet s)',
    "SELECT jsonb_build_object('count',n,'frontier',frontier,",
    "'allFieldsExact',exact_rows,'countMatch',n=expected_count,",
    "'frontierMatch',frontier=expected_frontier)::text FROM validated;",
    'COMMIT;',
    '',
  ].join('\n');
}

export function assessDisposableLedgerReplay({observed,paired}) {
  assert.ok(observed&&typeof observed==='object'&&!Array.isArray(observed));
  assert.deepEqual(Object.keys(observed).sort(),[
    'allFieldsExact','count','countMatch','frontier','frontierMatch'].sort());
  assert.equal(observed.allFieldsExact,true);
  assert.equal(observed.countMatch,true);
  assert.equal(observed.frontierMatch,true);
  assert.equal(observed.count,paired.migrationCount);
  assert.equal(Number(observed.frontier),paired.migrationFrontier);
  return Object.freeze({
    schemaVersion:'ops-disposable-provider-migration-history-replay-v1',
    backupRunId:EXPECTED_BACKUP_RUN_ID,
    backupSourceSha:EXPECTED_SOURCE_SHA,
    originalMigrationCount:paired.migrationCount,
    originalFrontier:paired.migrationFrontier,
    originalCatalogSha256:paired.migrationCatalogSha256,
    restoredHistoryRowCount:observed.count,
    restoredAllSixHistoryFieldsExact:true,
    restoredSourceHistoryWithoutExecutingMigrationSql:true,
    restoredTo:'isolated-loopback-postgresql17',
    productionDatabaseChanged:false,
    historicalSqlExecuted:false,
    sourceSqlStatementsPublished:false,
    historicalExecutorProven:false,
    providerHostedRuntimeCompatibilityProven:false,
    providerManagedDataFullRestore:false,
    fullProviderMigrationLedgerRestored:false,
    hostedAuthStorageRecovered:false,
    independentPrivacyContinuityProven:false,
    drReady:false,serviceResumptionAllowed:false,
    verdict:'DISPOSABLE_HISTORY_ROWS_RESTORED_EXACT__HOSTED_PROVIDER_DR_HOLD',
  });
}

async function main(){
  assert.equal(process.env.GITHUB_ACTIONS,'true');
  assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');
  assert.equal(process.env.GITHUB_REF,'refs/heads/main');
  assert.equal(process.env.GITHUB_REPOSITORY,'gycha0109-beep/MyeongHa');
  assert.equal(process.env.MH_OPS_DISPOSABLE_LEDGER_REPLAY,'true');
  assert.equal(process.env.BACKUP_RUN_ID,String(EXPECTED_BACKUP_RUN_ID));
  assert.equal(process.env.PGHOST,'127.0.0.1');
  assert.equal(process.env.PGPORT,'5432');
  assert.equal(process.env.PGUSER,'postgres');
  assert.equal(process.env.PGDATABASE,'postgres');
  const tmp=resolve(process.env.RUNNER_TEMP??'.');
  assert.notEqual(tmp,resolve('.'));
  const args=process.argv.slice(2);
  assert.equal(args.length,6);
  const path=(flag)=>{
    const index=args.indexOf(flag);
    assert.ok(index>=0&&index+1<args.length);
    const p=resolve(args[index+1]);
    assert.ok(p.startsWith(tmp+sep));
    return p;
  };
  const [sourceBytes,paired]=await Promise.all([
    readFile(path('--source')),
    readFile(path('--paired-proof'),'utf8').then(JSON.parse),
  ]);
  const packet=assertReplaySource({sourceBytes,paired});
  const run=spawnSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-f','-'],{
    // Transport canonical JSON as ASCII base64, not raw JSON. Even a COPY
    // failure therefore cannot print original SQL or operator provenance.
    input:buildDisposableLedgerReplaySql(packet).replace(
      '/*__SOURCE_PACKET_COPY_DATA__*/',
      Buffer.from(JSON.stringify(packet),'utf8').toString('base64')+'\n\\.\n'
    ),
    encoding:'utf8',timeout:110000,maxBuffer:1024*1024,
    env:process.env,windowsHide:true,
  });
  // All psql diagnostics are private, and never copied to CI stdout/stderr.
  assert.equal(run.status,0,'Isolated history replay failed');
  assert.ok(typeof run.stdout==='string');
  const lines=run.stdout.trim().split(/\r?\n/u);
  assert.equal(lines.length,1,'Unexpected SQL output');
  const evidence=assessDisposableLedgerReplay({observed:JSON.parse(lines[0]),paired});
  await writeFile(path('--output'),JSON.stringify(evidence,null,2)+'\n',{
    flag:'wx',mode:0o600,
  });
  process.stdout.write('DISPOSABLE_PROVIDER_HISTORY_REPLAY_EXACT HOSTED_DR_HOLD\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(()=>{
    process.stderr.write('HOLD_DISPOSABLE_PROVIDER_HISTORY_REPLAY\n');
    process.exitCode=1;
  });
}
