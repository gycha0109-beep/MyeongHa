import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = new URL(process.env.MYEONGHA_SAJU_ADMISSION_TEST_DATABASE_URL ?? '');
const ci = process.env.GITHUB_ACTIONS === 'true' && process.env.DB_SUITE === 'postgres17'
  && process.env.PGHOST === 'localhost' && /^myeongha_ci_case_\d+$/u.test(process.env.PGDATABASE ?? '')
  && url.pathname === `/${process.env.PGDATABASE}` && url.port === '5432';
assert.equal(url.protocol, 'postgresql:');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.ok(ci || (url.pathname === '/myeongha_saju_admission_isolated_test' && Number(url.port) >= 49152));
assert.equal(url.search, '');
const pool = new pg.Pool({ connectionString: url.href, ssl: false, max: 1 });
try {
  assert.equal(Math.floor(Number((await pool.query('SHOW server_version_num')).rows[0].server_version_num) / 10000), 17);
  await pool.query('DELETE FROM public.saju_abuse_admission_buckets_v1');
  await pool.query('DELETE FROM public.saju_abuse_admission_policies_v1');
  await pool.query(await readFile('supabase/migrations/20261024134610_saju_abuse_admission_production_policy_v1.sql', 'utf8'));
  await pool.query(await readFile('supabase/migrations/20261024141330_saju_abuse_admission_policy_approval_clock_v2.sql', 'utf8'));
  const rows = (await pool.query('SELECT route_id,policy_version,request_limit,enabled,cleanup_retention_seconds FROM public.saju_abuse_admission_policies_v1 ORDER BY policy_version,route_id')).rows;
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.filter(r => r.enabled).map(r => r.request_limit), [2, 2]);
  assert.deepEqual(rows.filter(r => r.policy_version === 'production-20261024-v2').map(r => r.request_limit), [60, 20]);
  assert.ok(rows.filter(r => r.policy_version.endsWith('-v1')).every(r => !r.enabled));
  assert.ok(rows.every(r => r.cleanup_retention_seconds === 3600));
  await pool.query(`INSERT INTO public.saju_abuse_admission_buckets_v1
    (route_id,policy_version,client_fingerprint,window_started_at,reset_at,request_count,updated_at)
    SELECT 'api.me.saju.calculation','canary-20261024-v2',sha256(convert_to(n::text,'UTF8')),
      now()-interval '3 hours',now()-interval '2 hours',1,now() FROM generate_series(1,5002) AS n`);
  await pool.query(`INSERT INTO public.saju_abuse_admission_buckets_v1
    (route_id,policy_version,client_fingerprint,window_started_at,reset_at,request_count,updated_at)
    VALUES ('api.me.saju.calculation','canary-20261024-v2',sha256('live'::bytea),now(),now()+interval '1 minute',1,now())`);
  await pool.query('BEGIN');
  await pool.query('SET LOCAL ROLE myeongha_api_executor');
  assert.equal((await pool.query('SELECT public.cmd_cleanup_saju_abuse_admission_buckets_v1() AS count')).rows[0].count, 5000);
  await pool.query('COMMIT');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.saju_abuse_admission_buckets_v1')).rows[0].n, 3);
  await pool.query('BEGIN');
  await pool.query('SET LOCAL ROLE myeongha_api_executor');
  assert.equal((await pool.query('SELECT public.cmd_cleanup_saju_abuse_admission_buckets_v1() AS count')).rows[0].count, 2);
  await pool.query('COMMIT');
  for (const role of ['anon', 'authenticated', 'service_role']) assert.equal((await pool.query("SELECT has_function_privilege($1,'public.cmd_cleanup_saju_abuse_admission_buckets_v1()','EXECUTE') AS granted", [role])).rows[0].granted, false);
  // Same atomic activation/rollback operation used by the approved operator.
  await pool.query('BEGIN');
  await pool.query('UPDATE public.saju_abuse_admission_policies_v1 SET enabled=false');
  await pool.query("UPDATE public.saju_abuse_admission_policies_v1 SET enabled=true WHERE policy_version='production-20261024-v2'");
  await pool.query('COMMIT');
  assert.deepEqual((await pool.query('SELECT request_limit FROM public.saju_abuse_admission_policies_v1 WHERE enabled ORDER BY route_id')).rows.map(r => r.request_limit), [60, 20]);
  console.log(JSON.stringify({ status: 'PASS', productionLimits: [60, 20], canaryLimits: [2, 2], retentionSeconds: 3600,
    cleanupFirstBatch: 5000, cleanupSecondBatch: 2, liveCounterPreserved: true, browserAndServiceRoleExecutionDenied: true,
    atomicPolicyActivation: true, scope: 'guarded loopback PG17 synthetic fixture only' }));
} finally { await pool.end(); }
