import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { runSajuAdmissionAttackE2E } from './lib/saju-admission-attack-e2e.mjs';
import { PostgresSajuAbuseAdmissionPortV1 } from '../dist/apps/api/src/postgres-saju-abuse-admission.js';
import { fingerprintSajuAbuseClientV1 } from '../dist/apps/api/src/saju-abuse-observability.js';
import { fingerprintProductionGuestBearerTokenV1 } from '../dist/apps/api/src/production-request-identity-verifier.js';
import { handleCurrentSubjectSajuCalculationRequestV1 } from '../dist/apps/api/src/current-subject-saju-calculation-http.js';
import { handleCurrentSubjectSajuPreviewReadingRequestV1 } from '../dist/apps/api/src/current-subject-saju-preview-reading-http.js';
import { createProductionCurrentSubjectSajuCalculationRuntimeV1 } from '../dist/apps/api/src/production-current-subject-saju-calculation-runtime.js';
import { createProductionCurrentSubjectSajuPreviewReadingRuntimeV1 } from '../dist/apps/api/src/production-current-subject-saju-preview-reading-runtime.js';

// Explicitly guarded disposable database; no production credentials, data or remote hosts.
const url = new URL(process.env.MYEONGHA_SAJU_ADMISSION_TEST_DATABASE_URL ?? '');
assert.equal(url.protocol, 'postgresql:');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
const isolatedCi = process.env.GITHUB_ACTIONS === 'true' && process.env.DB_SUITE === 'postgres17'
  && process.env.PGHOST === 'localhost' && /^myeongha_ci_case_\d+$/u.test(process.env.PGDATABASE ?? '')
  && url.pathname === `/${process.env.PGDATABASE}` && url.port === '5432';
assert.ok(isolatedCi || (url.pathname === '/myeongha_saju_admission_isolated_test'
  && Number(url.port) >= 49152 && Number(url.port) <= 65535));
assert.equal(url.search, '');
const admin = new pg.Pool({ connectionString: url.href, ssl: false, max: 1 });
const loginUrl = new URL(url);
loginUrl.username = 'myeongha_saju_admission_test_login';
loginUrl.password = randomUUID();
const pool = new pg.Pool({ connectionString: loginUrl.href, ssl: false, max: 12 });
const results = {};
let stage = 'fresh-database';
const secret = 'isolated-only-saju-admission-secret-not-a-production-secret';
const authId = '10000000-0000-4000-8000-000000000001';
const memberId = '20000000-0000-4000-8000-000000000001';
const guestId = '20000000-0000-4000-8000-000000000002';
const rawGuest = 'synthetic-guest-bearer-for-isolated-admission-only';
const guestHash = fingerprintProductionGuestBearerTokenV1({ rawBearerToken: rawGuest, secret });
const member = { kind: 'member', verifiedAuthUserId: authId };
const guest = { kind: 'guest', verifiedGuestTokenHash: guestHash };
const routes = ['api.me.saju.calculation', 'api.me.saju.preview-reading'];
const port = new PostgresSajuAbuseAdmissionPortV1(pool);
const input = (evidence = member, routeId = routes[0], keySecret = secret) => ({
  routeId, evidence, clientKey: fingerprintSajuAbuseClientV1({ evidence, secret: keySecret }),
});
const buckets = 'public.saju_abuse_admission_buckets_v1';
const policies = 'public.saju_abuse_admission_policies_v1';
const command = 'public.cmd_admit_saju_request_v1(text,bytea,text,uuid,text)';
const migrations = [
  '0010_auth_owner.sql', '0030_birth_records.sql', '0470_birth_profile_current_revision_query.sql',
  '0780_self_birth_profile_current_query.sql', '0790_subject_execution_context.sql',
  '0830_birth_profile_read_runtime_authority.sql', '0890_self_birth_profile_runtime_acl.sql',
];
async function deniedRole(role, sql) {
  const connection = await admin.connect();
  try {
    await connection.query('BEGIN');
    await connection.query(`SET LOCAL ROLE ${role}`); // Static test role allowlist below.
    await assert.rejects(connection.query(sql), (error) => error.code === '42501');
  } finally { await connection.query('ROLLBACK'); connection.release(); }
}
async function registerPolicy(version = 'isolated-v1', requestLimit = 3) {
  for (const route of routes) {
    await admin.query(`INSERT INTO ${policies}
      (route_id,policy_version,window_seconds,request_limit,blocked_count_saturation,retry_after_maximum_seconds,
       cleanup_retention_seconds,approval_ref,approved_at,enabled)
      VALUES ($1,$2,60,$3,$3+1,60,60,'isolated-fixture-only-never-production',clock_timestamp(),true)`, [route, version, requestLimit]);
  }
}
try {
  const initial = (await admin.query("SELECT current_database() AS database, current_setting('server_version_num')::int AS version, to_regclass('public.subjects') AS subjects")).rows[0];
  assert.equal(initial.database, url.pathname.slice(1));
  assert.ok(initial.version >= 170000 && initial.version < 180000, 'Requires PostgreSQL 17');
  assert.equal(initial.subjects, null, 'Requires a fresh disposable database');
  results.postgresMajor = 17;
  stage = 'migration';
  await admin.query('BEGIN');
  try {
    await admin.query(await readFile('test/db/bootstrap_supabase_auth_stub.sql', 'utf8'));
    for (const name of migrations) await admin.query(await readFile(`supabase/migrations/${name}`, 'utf8'));
    // Exact prerequisite from 0870_guest_promotion_runtime_authority.sql; do not load unrelated promotion writers.
    await admin.query('ALTER TABLE public.guest_sessions ENABLE ROW LEVEL SECURITY');
    // Simulate platform default grants; the new migration must explicitly remove them.
    await admin.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role');
    await admin.query(await readFile('supabase/proposals/20261024065948_saju_abuse_admission_runtime_authority.sql', 'utf8'));
    await admin.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='myeongha_saju_admission_test_login') THEN CREATE ROLE myeongha_saju_admission_test_login LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF; END $$");
    await admin.query('GRANT myeongha_api_executor TO myeongha_saju_admission_test_login');
    const passwordCommand = (await admin.query("SELECT format('ALTER ROLE myeongha_saju_admission_test_login PASSWORD %L', $1::text) AS command", [loginUrl.password])).rows[0].command;
    await admin.query(passwordCommand);
    await admin.query('COMMIT');
  } catch (error) { await admin.query('ROLLBACK'); throw error; }
  assert.equal((await admin.query(`SELECT count(*)::int AS count FROM ${policies}`)).rows[0].count, 0);
  const catalog = (await admin.query(`SELECT relpersistence,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass`, [buckets])).rows[0];
  assert.deepEqual(catalog, { relpersistence: 'u', relrowsecurity: true, relforcerowsecurity: true });
  for (const role of ['anon', 'authenticated', 'service_role', 'myeongha_api_executor']) {
    for (const table of [buckets, policies]) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        assert.equal((await admin.query('SELECT has_table_privilege($1,$2,$3) AS granted', [role, table, privilege])).rows[0].granted, false);
      }
      await deniedRole(role, `SELECT * FROM ${table}`);
    }
    if (role !== 'myeongha_api_executor') await deniedRole(role,
      "SELECT * FROM public.cmd_admit_saju_request_v1('api.me.saju.calculation',decode(repeat('ab',32),'hex'),'member','10000000-0000-4000-8000-000000000001',null)");
  }
  const functionCatalog = (await admin.query("SELECT p.prosecdef, p.proconfig, r.rolname, r.rolcanlogin, r.rolbypassrls FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=$1::regprocedure", [command])).rows[0];
  assert.equal(functionCatalog.prosecdef, true);
  assert.equal(functionCatalog.rolname, 'myeongha_saju_admission_owner');
  assert.equal(functionCatalog.rolcanlogin, false);
  assert.equal(functionCatalog.rolbypassrls, false);
  assert.equal((await admin.query("SELECT pg_has_role('myeongha_saju_admission_test_login','myeongha_saju_admission_owner','MEMBER') AS member")).rows[0].member, false);
  results.migrationEmptyPoliciesAndLeastPrivilege = true;

  stage = 'synthetic-fixtures';
  await admin.query('INSERT INTO auth.users(id) VALUES ($1)', [authId]);
  await admin.query("INSERT INTO public.subjects(id,kind,auth_user_id,status,created_at,updated_at) VALUES ($1,'member',$2,'active',now(),now()),($3,'guest',null,'active',now(),now())", [memberId, authId, guestId]);
  await admin.query('INSERT INTO public.guest_sessions(id,subject_id,token_hash,expires_at,created_at) VALUES ($1,$2,$3,now()+interval \'1 hour\',now())', [randomUUID(), guestId, guestHash]);
  for (const subjectId of [memberId, guestId]) {
    const profileId = randomUUID(); const revisionId = randomUUID();
    await admin.query("INSERT INTO public.birth_profiles(id,subject_id,profile_kind,created_at,updated_at) VALUES($1,$2,'self',now(),now())", [profileId, subjectId]);
    await admin.query("INSERT INTO public.birth_profile_revisions(id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at) VALUES($1,$2,$3,1,'solar','2001-07-14','15:20',true,false,'female','isolated-only',now())", [revisionId, profileId, subjectId]);
    await admin.query('UPDATE public.birth_profiles SET current_revision_id=$1 WHERE id=$2', [revisionId, profileId]);
  }
  await assert.rejects(port.admit(input()), (error) => error.code === '55000');
  const noPolicyResponse = await handleCurrentSubjectSajuCalculationRequestV1({
    request: new Request('https://isolated.test/api/me/saju/calculation', { method: 'POST' }),
    requestId: randomUUID(), serverTime: new Date().toISOString(), identityEvidenceVerifier: { verifyRequestIdentity: () => member },
    pool, sajuAbuseAdmission: { admissionPort: port, secret },
    sajuAdapter: { calculate: async () => { throw new Error('must not reach upstream without policy'); } },
  });
  assert.equal(noPolicyResponse.status, 503);
  assert.equal((await noPolicyResponse.json()).error.code, 'SAJU_ADMISSION_UNAVAILABLE');
  assert.equal((await admin.query(`SELECT count(*)::int AS count FROM ${buckets}`)).rows[0].count, 0);
  results.missingPolicyFailsClosedWithoutCounter = true;
  await registerPolicy();

  stage = 'normal-http-member-guest';
  let upstreamCalls = 0;
  for (const evidence of [member, guest]) for (const routeId of routes) {
    const common = {
      request: new Request(`https://isolated.test/${routeId.replace(/^api\.me\.saju\./u, 'api/me/saju/')}`, { method: 'POST', ...(routeId.endsWith('preview-reading') ? { body: JSON.stringify({ readingText: '전체 사주' }) } : {}) }),
      requestId: randomUUID(), serverTime: new Date().toISOString(), identityEvidenceVerifier: { verifyRequestIdentity: () => evidence },
      pool, sajuAbuseAdmission: { admissionPort: port, secret },
    };
    const response = routeId.endsWith('calculation')
      ? await handleCurrentSubjectSajuCalculationRequestV1({ ...common, sajuAdapter: { calculate: async () => { upstreamCalls++; return { schemaVersion: 'myeongha-saju-production-calculation-ingress-v1', kind: 'saju_calculation_evidence', semanticAuthority: 'calculation_only', interpretationAuthorized: false }; } } })
      : await handleCurrentSubjectSajuPreviewReadingRequestV1({ ...common, sajuAdapter: { requestReading: async () => { upstreamCalls++; return { state: 'delivered' }; } } });
    const responseBody = await response.json();
    assert.equal(response.status, 200, `HTTP ${routeId}/${evidence.kind} must remain usable; code=${responseBody.error?.code ?? 'none'}`);
  }
  assert.equal(upstreamCalls, 4);
  results.realDatabaseNormalMemberGuestBothRoutes = true;

  stage = 'concurrency-reset-cleanup';
  await admin.query(`DELETE FROM ${buckets}`);
  const concurrent = await Promise.all(Array.from({ length: 12 }, () => port.admit(input())));
  assert.equal(concurrent.filter((result) => result?.allowed).length, 3);
  assert.equal(concurrent.filter((result) => result?.allowed === false).length, 9);
  assert.equal((await port.admit(input())).requestCount, 4);
  assert.equal((await port.admit(input(member, routes[1]))).requestCount, 1);
  assert.equal((await port.admit(input(guest))).requestCount, 1);
  results.concurrentAllowed = 3; results.concurrentDenied = 9;
  results.routeAndIdentityBucketsIndependent = true;
  const key = Buffer.from(input().clientKey, 'hex');
  await admin.query(`UPDATE ${buckets} SET window_started_at=now()-interval '61 seconds',reset_at=now()-interval '1 second' WHERE client_fingerprint=$1 AND route_id=$2`, [key, routes[0]]);
  assert.equal((await port.admit(input())).requestCount, 1);
  await admin.query(`INSERT INTO ${buckets}(route_id,policy_version,client_fingerprint,window_started_at,reset_at,request_count,updated_at)
    SELECT $1,'isolated-v1',sha256(convert_to('stale-'||n::text,'UTF8')),now()-interval '4 minutes',now()-interval '3 minutes',1,now() FROM generate_series(1,10) AS n`, [routes[0]]);
  await port.admit(input());
  assert.equal((await admin.query(`SELECT count(*)::int AS count FROM ${buckets} WHERE reset_at<now()-interval '60 seconds'`)).rows[0].count, 2);
  results.resetAndBoundedCleanup = true;

  stage = 'invalid-guest-no-allocation';
  const beforeInvalid = (await admin.query(`SELECT count(*)::int AS count FROM ${buckets}`)).rows[0].count;
  assert.equal(await port.admit(input({ kind: 'guest', verifiedGuestTokenHash: 'unregistered-guest' })), null);
  for (const mutation of ["expires_at=now()-interval '1 second'", 'consumed_at=now()', 'claimed_by_subject_id=\'' + memberId + "'"]) {
    await admin.query(`UPDATE public.guest_sessions SET ${mutation} WHERE subject_id=$1`, [guestId]);
    assert.equal(await port.admit(input(guest)), null);
    await admin.query("UPDATE public.guest_sessions SET expires_at=now()+interval '1 hour',consumed_at=null,claimed_by_subject_id=null WHERE subject_id=$1", [guestId]);
  }
  assert.equal((await admin.query(`SELECT count(*)::int AS count FROM ${buckets}`)).rows[0].count, beforeInvalid);
  results.invalidExpiredConsumedClaimedGuestNoAllocation = true;

  stage = 'policy-immutability-version-isolation';
  await assert.rejects(admin.query(`UPDATE ${policies} SET request_limit=4 WHERE route_id=$1`, [routes[0]]), (error) => error.code === '23514');
  const oldHash = (await port.admit(input())).policy.policyHash;
  await admin.query(`UPDATE ${policies} SET enabled=false`);
  await registerPolicy('isolated-v2', 5);
  const next = await port.admit(input());
  assert.equal(next.requestCount, 1); assert.equal(next.policy.policyVersion, 'isolated-v2');
  assert.notEqual(next.policy.policyHash, oldHash);
  results.immutablePolicyAndNewVersionFreshBucket = true;

  stage = 'rollback-after-admission';
  const rollbackInput = input(member, routes[0], secret + '-rollback');
  const rollbackPort = new PostgresSajuAbuseAdmissionPortV1({ connect: async () => {
    const connection = await pool.connect();
    return { query: (sql, values) => sql === 'COMMIT' ? Promise.reject(new Error('synthetic-commit-failure-before-send')) : connection.query(sql, values), release: (error) => connection.release(error) };
  } });
  await assert.rejects(rollbackPort.admit(rollbackInput));
  assert.equal((await admin.query(`SELECT count(*)::int AS count FROM ${buckets} WHERE client_fingerprint=$1`, [Buffer.from(rollbackInput.clientKey, 'hex')])).rows[0].count, 0);
  results.transactionRollbackPreventsLeakedCounter = true;

  stage = 'production-composition-real-adapter';
  // Configuration-shape fixture only: the injected loopback pool owns every DB call.
  // Generate the unused password in memory instead of committing credential-shaped text.
  const syntheticDatabaseUrl = new URL('postgresql://aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require');
  syntheticDatabaseUrl.username = 'myeongha_runtime.cnsfpcdiyofqvhpcegfc';
  syntheticDatabaseUrl.password = randomUUID();
  const env = {
    MYEONGHA_DATABASE_URL: syntheticDatabaseUrl.href,
    MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_runtime', MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
    MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM: '-----BEGIN CERTIFICATE-----\\ntest-only\\n-----END CERTIFICATE-----',
    MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co', MYEONGHA_SUPABASE_API_KEY: 'sb_publishable_isolated_only_for_admission_test',
    MYEONGHA_GUEST_FINGERPRINT_SECRET: secret, MYEONGHA_SAJU_SERVICE_ORIGIN: 'https://isolated-saju.test', MYEONGHA_SAJU_SERVICE_BEARER: 'isolated-saju-bearer',
  };
  for (const evidence of [member, guest]) for (const routeId of routes) {
    for (let i = 0; i < 6; i++) await port.admit(input(evidence, routeId));
    let fetched = 0;
    const runtimeInput = { env, pool, sajuAbuseAdmissionEnabled: true,
      memberFetchImpl: async () => Response.json({ id: authId }),
      sajuFetchImpl: async () => { fetched++; throw new Error('must not call upstream'); },
      sajuAbuseObservationWriter: () => undefined, sajuAbuseOutcomeWriter: () => undefined };
    const runtime = routeId.endsWith('calculation') ? createProductionCurrentSubjectSajuCalculationRuntimeV1(runtimeInput) : createProductionCurrentSubjectSajuPreviewReadingRuntimeV1(runtimeInput);
    const req = new Request(`https://isolated.test/${routeId.replace(/^api\.me\.saju\./u, 'api/me/saju/')}`, {
      method: 'POST', headers: { Authorization: `Bearer ${evidence.kind === 'member' ? 'synthetic.jwt.token' : rawGuest}` },
      ...(routeId.endsWith('preview-reading') ? { body: JSON.stringify({ readingText: '전체 사주' }) } : {}),
    });
    try {
      const response = await runtime.handleRequest({ request: req, requestId: randomUUID(), serverTime: new Date().toISOString() });
      assert.equal(response.status, 429); assert.ok(Number(response.headers.get('Retry-After')) > 0); assert.equal(fetched, 0);
    } finally { await runtime.close(); }
  }
  results.productionCompositionMemberGuestBothRoutesDeniedBeforeUpstream = true;
  stage = 'loopback-http-attack-e2e';
  results.attackE2E = await runSajuAdmissionAttackE2E({ admin, pool, env, secret, authId, memberId, guestId, rawGuest });
  console.log(JSON.stringify({ schemaVersion: 'myeongha-saju-admission-isolated-verification-v1', status: 'PASS', results,
    scope: 'synthetic fresh loopback PostgreSQL 17; actual SQL/adapter/HTTP; hosted Auth and upstream Saju mocked; no Production mutation' }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL', expected: 'all isolated admission checks pass', observed: error.message,
    runtime: 'PostgreSQL 17 / Node', failureStage: stage, classification: error.code ?? 'ASSERTION_OR_RUNTIME',
    reproductionCommand: 'npm run build && node scripts/verify-saju-abuse-admission-postgres.mjs (guarded loopback test URL required)' }));
  process.exitCode = 1;
} finally { await pool.end(); await admin.end(); }
