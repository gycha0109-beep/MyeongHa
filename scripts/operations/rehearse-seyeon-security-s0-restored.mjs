// Watchtower-Track: security
// No remote DB option. Reads the already-restored local Actions service only.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Client} from 'pg';
import {buildSeyeonSecurityS0InstallationPlan} from './seyeon-security-s0/plan.mjs';

const target='myeongha_seyeon_security_s0_test';
const installPrincipalAuthority=JSON.parse(await readFile(new URL(
  './seyeon-security-s0/install-principal-authority-20261025.json',import.meta.url),'utf8'));
if(installPrincipalAuthority.projectRef!=='cnsfpcdiyofqvhpcegfc'||
   installPrincipalAuthority.postgresSuperuser!==false||
   JSON.stringify(installPrincipalAuthority.membership)!==JSON.stringify({
     role:'myeongha_seyeon_chat_runtime_owner',member:'postgres',grantor:'supabase_admin',
     adminOption:true,inheritOption:false,setOption:false})){throw Error('Install principal source authority mismatch.');}

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
  // The portable backup intentionally excludes the provider-managed postgres
  // membership edges. Reproduce the separately read CURRENT install-principal
  // edge, never pretend this edge was restored from the encrypted backup.
  // Application roles and source SQL are unchanged; postgres stays NOSUPERUSER.
  await admin.query(`grant myeongha_seyeon_chat_runtime_owner to postgres
    with admin true, inherit false, set false`);
  const {rows:[principal]}=await admin.query(`select not p.rolsuper as restricted,
    m.admin_option and not m.inherit_option and not m.set_option as exact_edge
    from pg_roles p join pg_auth_members m on m.member=p.oid
    join pg_roles granted on granted.oid=m.roleid
    where p.rolname='postgres' and granted.rolname='myeongha_seyeon_chat_runtime_owner'
      and pg_get_userbyid(m.grantor)='supabase_admin'`);
  if(principal?.restricted!==true||principal?.exact_edge!==true){
    throw Error('Isolated install principal differs from the read-only Production snapshot.');
  }
  // A pg_dump database restore does not imply the cloned database has
  // the hosted pg_database_owner/public schema privileges. Production's
  // postgres has both USAGE and CREATE on public. Mirror ONLY that exact
  // install-principal privilege inside this throwaway clone, not on source.
  const isolatedSchemaAdmin=new Client({...db,user:'supabase_admin',database:target});
  await isolatedSchemaAdmin.connect();
  try{
    const {rows:[scope]}=await isolatedSchemaAdmin.query(`select
      current_database()=$1 as target_db,
      current_user='supabase_admin' as isolated_admin,
      (select pg_get_userbyid(nspowner)='pg_database_owner'
       from pg_namespace where nspname='public') as public_owner,
      has_schema_privilege('postgres','public','USAGE') as postgres_usage,
      has_schema_privilege('postgres','public','CREATE') as postgres_create`,[target]);
    if(scope?.target_db!==true||scope.isolated_admin!==true||
       scope.public_owner!==true)throw Error('Disposable public schema owner mismatch.');
    if(scope.postgres_usage!==true||scope.postgres_create!==true){
      await isolatedSchemaAdmin.query('grant usage, create on schema public to postgres');
    }
    const {rows:[confirmedSchema]}=await isolatedSchemaAdmin.query(`select
      has_schema_privilege('postgres','public','USAGE') as usage_ok,
      has_schema_privilege('postgres','public','CREATE') as create_ok`);
    if(confirmedSchema?.usage_ok!==true||confirmedSchema.create_ok!==true){
      throw Error('Isolated postgres public-schema entitlement mismatch.');
    }
  }finally{await isolatedSchemaAdmin.end();}
  const local=new Client({...db,user:'postgres',database:target});
  await local.connect();
  // The encrypted Production backup already contains earlier S0 objects;
  // the full source bundle is intentionally not idempotent. Never drop or
  // overwrite those objects just to force a fresh-install rehearsal.
  let rehearsalInstallMode='fresh-baseline';
  let restoredIncrementalSourceFiles=[];
  try{
    const {rows:[preflight]}=await local.query(`select
      to_regnamespace('seyeon_private') is null as absent,
      not exists(select 1 from auth.users where id::text like 'a8100000-0000-4000-8000-%') as fixtures_absent,
      to_regprocedure('seyeon_private.lock_memory_subject_v1(uuid)') is not null
        and to_regprocedure('public.cmd_mark_seyeon_positive_context_ready_pinned_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text)') is not null
        and to_regprocedure('seyeon_private.assert_current_original_member_user_message_v1(uuid,uuid,uuid)') is not null
        as upstream_installed,
      to_regprocedure('seyeon_private.lock_accepted_original_memory_for_grant_v1(uuid,uuid)') is null
        and to_regprocedure('public.cmd_grant_seyeon_owned_conversation_recall_v1(uuid,uuid,uuid)') is null
        and to_regprocedure('seyeon_private.pin_model_recent_sources_v1(uuid,uuid,uuid,uuid,uuid,jsonb,text)') is null
        and to_regprocedure('public.cmd_pin_seyeon_positive_model_context_sources_v1(uuid,uuid,uuid,uuid,uuid,jsonb,text,uuid,uuid,text,text,text,text,text,text,text)') is null
        as supplementary_absent`);
    if(preflight.fixtures_absent!==true)throw Error('S0 synthetic fixture collision; no overwrite.');
    if(preflight.absent!==true){
      // An empty S0 baseline may have no Source Registry relation at all.
      // Check its rows only on the preinstalled-schema branch.
      const {rows:[registry]}=await local.query(`select
        (select count(*)=1 and bool_and(not enabled and not writable_enabled)
         from public.seyeon_positive_source_type_registry_v1
         where record_kind='memory' and record_type='conversation_recall'
           and schema_version='v1' and projector_version='seyeon-conversation-recall-projector-v1')
         as single_closed_registry,
        (select count(*)=1 from public.seyeon_positive_source_type_registry_v1)
         as registry_count_exact`);
      // Only the exact already-reviewed missing S0 sources are allowed into
      // this disposable CLONE. The original restored database stays untouched.
      if(preflight.upstream_installed!==true||preflight.supplementary_absent!==true||
         registry.single_closed_registry!==true||registry.registry_count_exact!==true){
        throw Error('S0 restored baseline diverged; refuse duplicate source install.');
      }
      const sources=['09-owned-original-memory-grant.sql',
        '16-g1-model-recent-source-pin.sql','17-g1-positive-combined-model-source-pin.sql'];
      const owner='myeongha_seyeon_chat_runtime_owner';
      const grant='grant '+owner+' to current_user;';
      const revoke='revoke '+owner+' from current_user;';
      const sections=[];
      for(const name of sources){
        const sql=(await readFile(new URL('./seyeon-security-s0/'+name,import.meta.url),'utf8')).replace(/\r\n/gu,'\n');
        if((sql.match(/^begin;$/gmu)??[]).length!==1||
           (sql.match(/^commit;$/gmu)??[]).length!==1||
           sql.split(grant).length!==2||sql.split(revoke).length!==2){
          throw Error('S0 supplemental SQL envelope changed: '+name);
        }
        sections.push(sql.replace(/^begin;\n/mu,'').replace(/\ncommit;\s*$/u,'')
          .replace(grant,'-- Owner membership is held by the atomic clone installer')
          .replace(revoke,'-- Owner membership restored by the atomic clone installer'));
      }
      await local.query('begin');
      try{
        await local.query(`set local lock_timeout='5s'; set local statement_timeout='60s'`);
        await local.query(`grant myeongha_seyeon_chat_runtime_owner
          to current_user with admin false, inherit false, set true`);
        for(const sql of sections)await local.query(sql);
        await local.query(`grant myeongha_seyeon_chat_runtime_owner
          to current_user with admin false, inherit false, set false`);
        const {rows:[installed]}=await local.query(`select
          to_regprocedure('public.cmd_grant_seyeon_owned_conversation_recall_v1(uuid,uuid,uuid)') is not null
            and to_regprocedure('seyeon_private.lock_accepted_original_memory_for_grant_v1(uuid,uuid)') is not null
            and to_regprocedure('seyeon_private.pin_model_recent_sources_v1(uuid,uuid,uuid,uuid,uuid,jsonb,text)') is not null
            and to_regprocedure('public.cmd_pin_seyeon_positive_model_context_sources_v1(uuid,uuid,uuid,uuid,uuid,jsonb,text,uuid,uuid,text,text,text,text,text,text,text)') is not null
            as complete,
          not has_function_privilege('myeongha_api_executor',
            'public.cmd_pin_seyeon_positive_model_context_sources_v1(uuid,uuid,uuid,uuid,uuid,jsonb,text,uuid,uuid,text,text,text,text,text,text,text)','EXECUTE')
            and not has_function_privilege('anon',
            'public.cmd_pin_seyeon_positive_model_context_sources_v1(uuid,uuid,uuid,uuid,uuid,jsonb,text,uuid,uuid,text,text,text,text,text,text,text)','EXECUTE')
            as default_closed,
          not pg_has_role('postgres','myeongha_seyeon_chat_runtime_owner','SET') as owner_set_restored,
          (select count(*)=1 and bool_and(not enabled and not writable_enabled)
           from public.seyeon_positive_source_type_registry_v1) as source_still_off`);
        if(installed.complete!==true||installed.default_closed!==true||
          installed.owner_set_restored!==true||installed.source_still_off!==true){
          throw Error('S0 incremental disposable clone postflight failed');
        }
        await local.query('commit');
      }catch(error){await local.query('rollback').catch(()=>undefined);throw error;}
      rehearsalInstallMode='restored-baseline-supplement';
      restoredIncrementalSourceFiles=sources;
    }
  }finally{await local.end();}
  // Fixture administration is separate from restricted SQL installation and
  // actual ordinary API execution. No superuser connection handles an API TX.
  const fixtureRole='myeongha_s0_receipt_test_login';
  if((await admin.query('select 1 from pg_roles where rolname=$1',[fixtureRole])).rows.length){
    throw Error('Isolated ordinary fixture role collision');
  }
  const fixtureDdl=(await admin.query(`select format(
    'create role myeongha_s0_receipt_test_login login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password %L',$1::text) as sql`,[db.password])).rows[0].sql;
  await admin.query(fixtureDdl);
  await admin.query('grant myeongha_api_executor to myeongha_s0_receipt_test_login with inherit false,set true');
  const env={...process.env,PGHOST:'127.0.0.1',PGPORT:'5432',PGUSER:'postgres',
    PGPASSWORD:'restore-drill',PGDATABASE:target,PGSSLMODE:'disable',DB_SUITE:'postgres17',
    SEYEON_SECURITY_S0_REAL_PG:'1',SEYEON_S0_TEST_ADMIN_USER:'supabase_admin',
    SEYEON_S0_TEST_ORDINARY_USER:fixtureRole};
  if(rehearsalInstallMode==='fresh-baseline'){
    execFileSync(process.execPath,['scripts/operations/seyeon-security-s0/install-isolated.mjs'],
      {env,stdio:'inherit',timeout:60_000});
  }
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
    rehearsalInstallMode,restoredIncrementalSourceFiles,
    originalRestoredDatabaseUnmodified:true,
    installationPrincipal:'postgres-nosuperuser',fixtureAdmin:'supabase_admin-loopback-only',
    apiExecutionPrincipal:fixtureRole,
    testsPassed:result.numPassedTests,testsFailed:0,
    installationPlan:await buildSeyeonSecurityS0InstallationPlan(),
    installPrincipalAuthority,installPrincipalEdgeRestoredFromBackup:false,
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
