// Watchtower-Track: security
// Installs source SQL ONLY in the named disposable local/CI database.
// This file deliberately has no Production admission or remote URL option.
import { Client } from 'pg';
import { SEYEON_SECURITY_S0_SQL_SOURCES } from './plan.mjs';
import {buildSeyeonSecurityS0InstallationBundle} from './bundle.mjs';

const host = process.env.PGHOST;
const database = process.env.PGDATABASE;
const ci = process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true' &&
  process.env.DB_SUITE === 'postgres17';
if (!['localhost', '127.0.0.1', '::1'].includes(host) ||
    !(database === 'myeongha_seyeon_security_s0_test' ||
      (ci && /^myeongha_ci_case_[0-9]+$/u.test(database ?? ''))) ||
    process.env.PGUSER !== 'postgres') {
  throw Error('S0 SQL installation requires the exact disposable loopback database.');
}

const client = new Client({
  host, database, user: 'postgres',
  port: Number(process.env.PGPORT ?? 5432),
  password: process.env.PGPASSWORD,
  ssl: false,
  connectionTimeoutMillis: 5000,
});
await client.connect();
try {
  const { rows: [target] } = await client.query(`select current_database() as db,
    current_user as role, current_setting('server_version_num')::int as version`);
  if (target.db !== database || target.role !== 'postgres' ||
      (ci ? target.version < 170000 || target.version >= 180000 :
        target.version < 170000 || target.version >= 190000)) {
    throw Error('S0 SQL installation target/version mismatch.');
  }
  await client.query('BEGIN');
  await client.query((await buildSeyeonSecurityS0InstallationBundle()).sql);
  // Restricted postgres has ADMIN but no inherited owner privileges. Borrow
  // owner authority only to inspect the empty registry, then drop it in this TX.
  await client.query('grant myeongha_seyeon_chat_runtime_owner to current_user');
  const { rows: [acl] } = await client.query(`select
    not has_function_privilege('myeongha_api_executor',
      'public.cmd_mark_seyeon_positive_context_ready_pinned_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text)', 'EXECUTE')
    and not has_function_privilege('myeongha_api_executor',
      'public.cmd_commit_seyeon_positive_chat_turn_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text)', 'EXECUTE')
    and not has_function_privilege('myeongha_api_executor',
      'public.qry_seyeon_positive_first_memory_locked_reveal_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text)', 'EXECUTE')
    and not exists(select 1 from public.seyeon_positive_source_type_registry_v1)
    and not has_function_privilege('myeongha_api_executor',
      'public.cmd_issue_seyeon_positive_first_reply_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)','EXECUTE')
    and not has_function_privilege('myeongha_api_executor',
      'seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)','EXECUTE')
    and not has_function_privilege('myeongha_api_executor',
      'seyeon_private.cmd_request_seyeon_memory_revoke_v1(uuid,uuid)','EXECUTE')
    and not has_table_privilege('myeongha_api_executor','public.memory_items','UPDATE')
    and not has_table_privilege('myeongha_api_executor','public.record_access_grants','UPDATE')
    and not has_table_privilege('myeongha_api_executor','public.record_access_grants','INSERT')
    and not has_table_privilege('myeongha_api_executor',
      'seyeon_private.planner_memory_proposal_sources_v1','INSERT')
    and not has_table_privilege('myeongha_api_executor',
      'seyeon_private.planner_memory_proposal_sources_v1','SELECT')
    and not has_function_privilege('myeongha_api_executor',
      'seyeon_private.qry_seyeon_pending_planner_memory_decision_v1(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('myeongha_api_executor',
      'seyeon_private.cmd_create_pending_seyeon_planner_memory_v1(uuid,uuid,uuid,uuid,uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('myeongha_api_executor',
      'seyeon_private.cmd_resolve_pending_seyeon_planner_non_durable_v1(uuid,uuid,text)', 'EXECUTE')
    and not has_function_privilege('myeongha_api_executor',
      'seyeon_private.cmd_expire_pending_planner_memory_batch_v1(timestamptz,integer)', 'EXECUTE')
    and not has_function_privilege('myeongha_api_executor',
      'seyeon_private.lock_memory_subject_v1(uuid)', 'EXECUTE')
    and not has_function_privilege('myeongha_api_executor',
      'public.cmd_grant_seyeon_owned_conversation_recall_v1(uuid,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('myeongha_api_executor',
      'seyeon_private.lock_accepted_original_memory_for_grant_v1(uuid,uuid)', 'EXECUTE')
    as closed`);
  if (acl.closed !== true) throw Error('S0 installation unexpectedly enabled model use or Reveal.');
  await client.query('revoke myeongha_seyeon_chat_runtime_owner from current_user');
  await client.query('COMMIT');
  for(const source of SEYEON_SECURITY_S0_SQL_SOURCES)process.stdout.write(`S0_INSTALLED ${source}\n`);
  process.stdout.write(`S0_DEFAULT_CLOSED PostgreSQL ${target.version}\n`);
} catch(error){
  await client.query('ROLLBACK').catch(()=>undefined);
  throw error;
} finally {
  await client.end();
}
