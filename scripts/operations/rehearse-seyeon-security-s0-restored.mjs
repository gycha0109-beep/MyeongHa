// Watchtower-Track: security
// No remote DB option. Reads the already-restored local Actions service only.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Client} from 'pg';
import {buildSeyeonSecurityS0InstallationPlan} from './seyeon-security-s0/plan.mjs';

const target='myeongha_seyeon_security_s0_test';
if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||
   process.env.GITHUB_WORKFLOW!=='PostgreSQL Isolated Restore Drill'||
   process.env.GITHUB_REF!=='refs/heads/main'||
   process.env.EXPECTED_PROJECT_REF!=='cnsfpcdiyofqvhpcegfc'||!process.env.RUNNER_TEMP){
  throw Error('S0 restored-backup rehearsal requires the exact main Actions restore job.');
}
const restore=JSON.parse(await readFile(process.env.RESTORE_EVIDENCE_PATH,'utf8'));
if(restore.project_ref!==process.env.EXPECTED_PROJECT_REF||
   restore.restore_target!=='github-actions-loopback-supabase-postgres'||
   restore.restore_server_version!=='17.6'||restore.archive_integrity!=='pass'||
   restore.application_owner_restore!=='pass'||!restore.backup_workflow_run_id){
  throw Error('Authoritative completed restore evidence required.');
}
const db={host:'127.0.0.1',port:5432,password:'restore-drill',ssl:false,
  connectionTimeoutMillis:5000};
const admin=new Client({...db,user:'supabase_admin',database:'template1'});
await admin.connect();
let created=false;
let sourceConnectionsPaused=false;
try{
  const {rows:[server]}=await admin.query(`select current_user as role,
    current_setting('server_version_num')::int as version,
    inet_server_addr()::text as address,
    -- The GitHub runner connects through a loopback-published Docker port;
    -- PostgreSQL itself listens on the private Docker bridge interface.
    (inet_server_addr() <<= inet '172.16.0.0/12' and
     inet_client_addr() <<= inet '172.16.0.0/12') as docker_bridge`);
  if(server.role!=='supabase_admin'||server.version<170000||server.version>=180000||
     (server.address!=='127.0.0.1'&&server.docker_bridge!==true)){
    throw Error('Local managed PG17 target mismatch.');
  }
  if((await admin.query('select 1 from pg_database where datname=$1',[target])).rows.length){
    throw Error('Disposable rehearsal target already exists; never overwrite it.');
  }
  // This is an ephemeral GitHub Actions PostgreSQL 17 service, never the hosted
  // database. Supabase background clients can still use the restored 'postgres'
  // database and would otherwise make CREATE DATABASE ... TEMPLATE fail.
  // Temporarily reject reconnects, wait for existing local sessions to end,
  // clone the fixed database, then immediately restore admission.
  await admin.query('alter database postgres with allow_connections false');
  sourceConnectionsPaused=true;
  const active=await admin.query(`select pg_terminate_backend(pid,5000) as ended
    from pg_stat_activity where datname='postgres' and pid<>pg_backend_pid()`);
  if(active.rows.some(row=>row.ended!==true)){
    throw Error('Disposable restored database still has active sessions.');
  }
  await admin.query('create database myeongha_seyeon_security_s0_test owner postgres template postgres');
  created=true;
  await admin.query('alter database postgres with allow_connections true');
  sourceConnectionsPaused=false;
  const local=new Client({...db,user:'postgres',database:target});
  await local.connect();
  try{
    const {rows:[preflight]}=await local.query(`select
      to_regnamespace('seyeon_private') is null as absent,
      not exists(select 1 from auth.users where id::text like 'a8100000-0000-4000-8000-%') as fixtures_absent`);
    if(preflight.absent!==true||preflight.fixtures_absent!==true)throw Error('S0 installation/fixture collision; no overwrite.');
  }finally{await local.end();}
  const env={...process.env,PGHOST:'127.0.0.1',PGPORT:'5432',PGUSER:'postgres',
    PGPASSWORD:'restore-drill',PGDATABASE:target,PGSSLMODE:'disable',DB_SUITE:'postgres17',
    SEYEON_SECURITY_S0_REAL_PG:'1'};
  execFileSync(process.execPath,['scripts/operations/seyeon-security-s0/install-isolated.mjs'],
    {env,stdio:'inherit',timeout:60_000});
  const output=join(process.env.RUNNER_TEMP,'seyeon-security-s0-rehearsal','vitest.json');
  await mkdir(dirname(output),{recursive:true});
  execFileSync(process.execPath,['node_modules/vitest/vitest.mjs','run',
    'test/seyeon-security-s0-postgres.e2e.test.ts','--maxWorkers=1',
    '--reporter=json',`--outputFile=${output}`],{env,stdio:'inherit',timeout:120_000});
  const result=JSON.parse(await readFile(output,'utf8'));
  if(result.success!==true||result.numFailedTests!==0||result.numPendingTests!==0||result.numPassedTests<1){
    throw Error('S0 restored-backup tests did not complete successfully.');
  }
  const evidence={schemaVersion:'seyeon-security-s0-restored-rehearsal-v1',
    workflowRunId:process.env.GITHUB_RUN_ID,sourceSha:process.env.GITHUB_SHA,
    backupRunId:restore.backup_workflow_run_id,backupSourceSha:restore.source_sha,
    backupMigrationFrontier:restore.backup_migration_frontier,
    target:'loopback-disposable-clone-of-restored-postgres',productionMutation:false,
    nativeProviderCalls:0,installedDefaultClosed:true,
    testsPassed:result.numPassedTests,testsFailed:0,
    installationPlan:await buildSeyeonSecurityS0InstallationPlan(),
    fullProviderDisasterRecoveryReady:false};
  await writeFile(process.env.SEYEON_S0_REHEARSAL_EVIDENCE_PATH,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
  console.log('S0_RESTORED_BACKUP_REHEARSAL_PASS');
}finally{
  // Re-enable the original restored database even if cloning or later tests
  // fail. Preserve both cleanup obligations; neither targets Production.
  try{
    if(sourceConnectionsPaused){
      await admin.query('alter database postgres with allow_connections true');
      sourceConnectionsPaused=false;
    }
  }finally{
    try{
      if(created)await admin.query('drop database myeongha_seyeon_security_s0_test with (force)');
    }finally{await admin.end();}
  }
}
