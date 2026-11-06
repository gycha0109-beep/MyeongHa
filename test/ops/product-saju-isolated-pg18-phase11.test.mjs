import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { handleCurrentSubjectSajuCalculationRequestV1 } from '../../apps/api/src/current-subject-saju-calculation-http.js';
import { SupabaseMemberIdentityEvidenceVerifierV1 } from '../../apps/api/src/supabase-member-identity-verifier.js';
import { createSajuProductionCalculationHttpAdapterV1 } from '../../apps/api/src/saju-production-calculation-http-adapter.js';
import { measureIsolatedProductWindow } from '../../scripts/operations/measure-isolated-product-window-phase11.mjs';
import { startIsolatedWorkerdProduct } from '../../scripts/operations/start-isolated-workerd-product.mjs';

const pgToolExec = promisify(execFileCallback);
const BIN = process.env.PG_BIN_DIR;
const EXE = process.platform === 'win32' ? '.exe' : '';
const FIXTURE_SQL = "\nCREATE ROLE myeongha_api_executor NOLOGIN NOSUPERUSER NOBYPASSRLS;\nCREATE ROLE myeongha_ops_phase11_login LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;\nGRANT myeongha_api_executor TO myeongha_ops_phase11_login WITH INHERIT FALSE, SET TRUE;\nCREATE TABLE public.ops_phase11_birth(owner_id uuid NOT NULL, profile_id uuid NOT NULL, revision_id uuid NOT NULL);\nINSERT INTO public.ops_phase11_birth VALUES\n ('92000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000011'),\n ('92000000-0000-4000-8000-000000000022','93000000-0000-4000-8000-000000000022','94000000-0000-4000-8000-000000000022');\nALTER TABLE public.ops_phase11_birth ENABLE ROW LEVEL SECURITY;\nALTER TABLE public.ops_phase11_birth FORCE ROW LEVEL SECURITY;\nCREATE POLICY ops_phase11_owner ON public.ops_phase11_birth FOR SELECT TO myeongha_api_executor\nUSING (owner_id = NULLIF(current_setting('myeongha.subject_id',true),'')::uuid);\nREVOKE ALL ON public.ops_phase11_birth FROM PUBLIC;\nGRANT SELECT ON public.ops_phase11_birth TO myeongha_api_executor;\nCREATE FUNCTION public.begin_member_subject_context_v1(auth_user uuid)\nRETURNS TABLE(subject_id uuid,subject_kind text)\nLANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$\nBEGIN\n IF auth_user <> '91000000-0000-4000-8000-000000000011'::uuid THEN\n   RAISE EXCEPTION 'Unresolved synthetic user' USING ERRCODE='28000';\n END IF;\n PERFORM set_config('myeongha.subject_id','92000000-0000-4000-8000-000000000011',true);\n RETURN QUERY SELECT '92000000-0000-4000-8000-000000000011'::uuid,'member'::text;\nEND;\n$$;\nCREATE FUNCTION public.assert_myeongha_subject_context_v1(subject uuid)\nRETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$\nBEGIN\n IF NULLIF(current_setting('myeongha.subject_id',true),'')::uuid IS DISTINCT FROM subject THEN\n   RAISE EXCEPTION 'Synthetic subject mismatch' USING ERRCODE='28000';\n END IF;\nEND;\n$$;\nCREATE FUNCTION public.qry_self_birth_profile_current_v1(subject uuid)\nRETURNS TABLE(subject_id uuid,birth_profile_id uuid,current_revision_id uuid,\n current_revision_no integer,profile_updated_at timestamptz)\nLANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$\n SELECT owner_id,profile_id,revision_id,1,'2026-11-05T00:00:00Z'::timestamptz\n FROM public.ops_phase11_birth WHERE owner_id=subject\n$$;\nCREATE FUNCTION public.qry_birth_profile_current_revision_v1(subject uuid,profile uuid)\nRETURNS TABLE(birth_profile_id uuid,profile_kind text,label text,current_revision_id uuid,\n archived_at timestamptz,current_revision_no integer,current_calendar_type text,\n current_birth_date date,current_birth_time time,current_time_known boolean,\n current_is_leap_month boolean,current_sex text,revision_id uuid,revision_no integer,\n is_current_revision boolean)\nLANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$\nBEGIN\n PERFORM pg_sleep(0.08);\n RETURN QUERY SELECT b.profile_id,'self'::text,NULL::text,b.revision_id,NULL::timestamptz,\n  1,'solar'::text,'2001-07-14'::date,'15:20:00'::time,true,false,'unspecified'::text,\n  b.revision_id,1,true\n FROM public.ops_phase11_birth b WHERE b.owner_id=subject AND b.profile_id=profile;\nEND;\n$$;\nREVOKE ALL ON FUNCTION public.begin_member_subject_context_v1(uuid) FROM PUBLIC;\nREVOKE ALL ON FUNCTION public.assert_myeongha_subject_context_v1(uuid) FROM PUBLIC;\nREVOKE ALL ON FUNCTION public.qry_self_birth_profile_current_v1(uuid) FROM PUBLIC;\nREVOKE ALL ON FUNCTION public.qry_birth_profile_current_revision_v1(uuid,uuid) FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION public.begin_member_subject_context_v1(uuid) TO myeongha_api_executor;\nGRANT EXECUTE ON FUNCTION public.assert_myeongha_subject_context_v1(uuid) TO myeongha_api_executor;\nGRANT EXECUTE ON FUNCTION public.qry_self_birth_profile_current_v1(uuid) TO myeongha_api_executor;\nGRANT EXECUTE ON FUNCTION public.qry_birth_profile_current_revision_v1(uuid,uuid) TO myeongha_api_executor;\n";
async function pgTool(name, args) {
  if (!BIN) throw Error('Temporary PostgreSQL 18 binary path not provided');
  return pgToolExec(join(BIN,name+EXE),args,{
    timeout:30000,maxBuffer:512*1024,windowsHide:true,
    env:{...process.env,PATH:BIN+(process.platform==='win32'?';':':')+(process.env.PATH??'')},
  });
}
async function ephemeralPort() {
  const server=createTcpServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const a=server.address();
  if (!a || typeof a==='string') throw Error('Ephemeral PG port missing');
  await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  return a.port;
}
async function startIsolatedPg18() {
  const dir=await mkdtemp(join(tmpdir(),'myeongha-ops-phase11-product-'));
  const log=join(dir,'postmaster.log');
  let started=false;
  let admin;
  let login;
  try {
    await pgTool('initdb',['-D',dir,'-U','myeongha_ops_phase11_admin',
      '--auth-host=trust','--auth-local=trust','--encoding=UTF8',
      '--no-sync','--no-instructions']);
    const port=await ephemeralPort();
    try {
      await pgTool('pg_ctl',['-D',dir,'-l',log,'-o',
        '-h 127.0.0.1 -p '+port+' -c listen_addresses=127.0.0.1'+
        (process.platform==='win32'?'':' -c unix_socket_directories='+dir),
        '-w','-t','20','start']);
    } catch(e) {
      const lines=(await readFile(log,'utf8').catch(()=>'')).split(/\r?\n/u)
        .filter(x=>/FATAL|ERROR|permission denied|could not bind|could not create/iu.test(x))
        .slice(-5).map(x=>x.replace(/\/tmp\/myeongha-ops-phase11-product-[^\s/]+/gu,
          '[isolated-postgres]'));
      if(lines.length) console.error('ISOLATED_PRODUCT_PG18_STARTUP_CAUSE',lines.join(' | '));
      throw e;
    }
    started=true;
    const base={
      host:'127.0.0.1',port,database:'postgres',ssl:false,
      max:2,connectionTimeoutMillis:125,statement_timeout:1000,
      idleTimeoutMillis:1000,allowExitOnIdle:true,
    };
    admin=new Pool({...base,user:'myeongha_ops_phase11_admin'});
    login=new Pool({...base,user:'myeongha_ops_phase11_login'});
    await admin.query(FIXTURE_SQL);
    const role=await login.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
    expect(role.rows[0]).toMatchObject({rolsuper:false,rolbypassrls:false});
    await expect(login.query('SELECT * FROM public.ops_phase11_birth'))
      .rejects.toMatchObject({code:'42501'});
    return {
      pool:login,
      port,
      // Real disposable GoTrue UUIDs are generated at test runtime and are never written to proofs.
      async bindRealMembers(members) {
        if (!Array.isArray(members) || members.length !== 4 ||
            new Set(members.map(m=>m.id)).size !== 4 ||
            !members.every(m=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu.test(m.id))) {
          throw Error('Exactly four independent synthetic GoTrue identities are required');
        }
        await admin.query('CREATE TABLE public.ops_phase11_real_auth_map(auth_user_id uuid PRIMARY KEY, owner_id uuid UNIQUE NOT NULL)');
        // Fixture inserts run only during initialization; FORCE RLS is restored before requests.
        await admin.query('ALTER TABLE public.ops_phase11_birth NO FORCE ROW LEVEL SECURITY');
        for (let i=0;i<members.length;i++) {
          const digit=String(i+1).padStart(2,'0');
          const owner='92000000-0000-4000-8000-0000000000'+digit;
          const profile='93000000-0000-4000-8000-0000000000'+digit;
          const revision='94000000-0000-4000-8000-0000000000'+digit;
          await admin.query('INSERT INTO public.ops_phase11_real_auth_map VALUES ($1,$2)',
            [members[i].id,owner]);
          // The original fixture already has the first two rows (..0011 and ..0022).
          // Real-GoTrue accounts use different test-only owners to avoid replacing those rows.
          await admin.query('INSERT INTO public.ops_phase11_birth VALUES($1,$2,$3)',
            [owner,profile,revision]);
        }
        await admin.query('ALTER TABLE public.ops_phase11_birth FORCE ROW LEVEL SECURITY');
        const rls = await admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.ops_phase11_birth'::regclass");
        if (!rls.rows[0]?.relrowsecurity || !rls.rows[0]?.relforcerowsecurity)
          throw Error('Synthetic owner RLS was not restored');
        await admin.query(`
CREATE OR REPLACE FUNCTION public.begin_member_subject_context_v1(auth_user uuid)
RETURNS TABLE(subject_id uuid,subject_kind text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $member_context$
DECLARE mapped uuid;
BEGIN
  SELECT m.owner_id INTO mapped FROM public.ops_phase11_real_auth_map m
  WHERE m.auth_user_id=auth_user;
  IF mapped IS NULL THEN
    RAISE EXCEPTION 'Unresolved isolated user' USING ERRCODE='28000';
  END IF;
  PERFORM set_config('myeongha.subject_id',mapped::text,true);
  RETURN QUERY SELECT mapped,'member'::text;
END;
$member_context$;`);
      },
      async close(){
        const pools = await Promise.allSettled([login.end(), admin.end()]);
        await pgTool('pg_ctl',['-D',dir,'-m','immediate','-w','-t','20','stop']);
        await rm(dir,{recursive:true,force:true});
        if (pools.some(pool => pool.status === 'rejected')) throw Error('Isolated database pool cleanup failed');
      },
    };
  } catch(e) {
    await login?.end().catch(()=>undefined);
    await admin?.end().catch(()=>undefined);
    if(started) await pgTool('pg_ctl',['-D',dir,'-m','immediate','-w','-t','20','stop'])
      .catch(()=>undefined);
    await rm(dir,{recursive:true,force:true}).catch(()=>undefined);
    throw e;
  }
}
function createRealDb(pg,state) {
  return {
    async connect() {
      if(state.dbMode==='unavailable') throw Error('synthetic injected DB outage');
      state.dbAcquisitions++;
      const start=performance.now();
      const client=await pg.connect().catch(error => {
        state.dbAcquireFailures = (state.dbAcquireFailures ?? 0) + 1;
        throw error;
      });
      state.dbAcquireMs.push(performance.now()-start);
      state.dbActive++;
      state.dbPeak=Math.max(state.dbPeak,state.dbActive);
      return {
        async query(sql,values) {
          const t=performance.now();
          try { return await client.query(sql,values?[...values]:[]); }
          finally {state.dbQueryMs.push(performance.now()-t);}
        },
        release(error){
          state.dbActive--;
          client.release(error instanceof Error?error:undefined);
        },
      };
    },
  };
}

const SUBJECT = '92000000-0000-4000-8000-000000000011';
const AUTH = '91000000-0000-4000-8000-000000000011';
const PROFILE = '93000000-0000-4000-8000-000000000011';
const REVISION = '94000000-0000-4000-8000-000000000011';
const MEMBER_TOKEN = 'synthetic.member.jwt';
const SAJU_TOKEN = 'synthetic-saju-only-bearer';
const API_KEY = 'synthetic-api-key-transport-material-long-enough';

function quantile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)) * 1000) / 1000;
}
async function listen(handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Loopback listener missing');
  return {
    origin: 'http://127.0.0.1:' + address.port,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    },
  };
}
function responseFixture() {
  const pillar = {
    stem: { value: '갑', hanja: '甲', element: '목', yinYang: '양' },
    branch: { value: '자', hanja: '子', element: '수', yinYang: '양' },
  };
  return {
    responseSchemaVersion: 'myeonghwa-production-calculation-http-v1',
    runtimeVersion: 'myeonghwa-production-calculation-runtime-v1',
    authority: {
      calculationPolicyId: 'myeonghwa-production-civil-midnight-v1',
      authorizationId: 'myeonghwa-production-calculation-default-authorization-v1',
      authorityRecordRef: 'docs/decisions/ADR-0006-production-calculation-default-v1.md',
      policyVersion: 'myeonghwa-production-calculation-policy-v1',
      contentHash: 'synthetic-isolated-only',
    },
    snapshot: {
      snapshotId: 'synthetic-isolated-snapshot',
      schemaVersion: 'canonical-saju-snapshot-v1',
      calculationHash: 'synthetic-isolated-hash',
      createdAt: '2026-11-05T00:00:00.000Z',
      input: {
        calendarType: 'solar', date: { year: 2001, month: 7, day: 14 },
        time: { known: true, hour: 15, minute: 20 },
        sexForTraditionalCalculation: 'unspecified',
      },
      policy: {
        policyId: 'myeonghwa/production/civil-midnight-v1',
        policyVersion: 'myeonghwa-production-calculation-policy-v1',
        dayBoundary: 'midnight',
        trueSolarTime: {
          enabled: false, longitudeSource: 'not-applicable',
          applyEquationOfTime: false, applyHistoricalDst: false,
        },
        timeZonePolicy: { source: 'service-default', timeZone: 'Asia/Seoul' },
        unknownBirthTimePolicy: 'preserve-unknown-and-enumerate-boundaries',
      },
      normalized: {},
      pillars: {
        year: { status: 'resolved', value: pillar },
        month: { status: 'resolved', value: pillar },
        day: { status: 'resolved', value: pillar },
        hour: { status: 'unavailable', reasonCode: 'TEST_HOUR_UNAVAILABLE' },
      },
      derivedFacts: {},
      luckCycle: { status: 'unavailable', reasonCode: 'TEST_LUCK_UNAVAILABLE' },
      completeness: {
        birthTimeKnown: true, fullyResolved: false,
        resolvedPaths: ['pillars.year', 'pillars.month', 'pillars.day'],
        ambiguousPaths: [], unavailablePaths: ['pillars.hour'],
      },
      provenance: {
        engine: {
          name: 'myeonghwa-saju-engine', version: 'engine-v1',
          sourceRepository: 'gycha0109-beep/Saju',
        },
        adapter: { name: 'manseryeok', version: '2.0.0' },
        policy: {
          id: 'myeonghwa/production/civil-midnight-v1',
          version: 'myeonghwa-production-calculation-policy-v1',
        },
        schema: { id: 'canonical-saju-snapshot', version: 'v1' },
        datasets: [],
      },
    },
  };
}
async function measuredBatch(origin, count, concurrency, bearerTokens = [MEMBER_TOKEN]) {
  let index = 0;
  const samples = [];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (index < count) {
      index++;
      const token = bearerTokens[(index - 1) % bearerTokens.length];
      const started = performance.now();
      const status = await requestCalculation(origin, token, bearerTokens);
      samples.push({ status, ms: performance.now() - started });
    }
  }));
  const success = samples.filter(r => r.status === 200).map(r => r.ms);
  return {
    requested: count, concurrency, successful: success.length,
    unavailable: samples.filter(r => r.status === 503).length,
    unexpected: samples.filter(r => r.status !== 200 && r.status !== 503).length,
    p50Ms: quantile(success, 0.5),
    p95Ms: quantile(success, 0.95),
    p99Ms: quantile(success, 0.99),
  };
}

async function requestCalculation(origin, token, bearerTokens) {
  let response, body;
  try {
    response = await fetch(origin + '/api/me/saju/calculation', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token },
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    body = await response.text();
  } catch {
    return null;
  }
  expect(response.headers.get('cache-control')).toBe('no-store');
  for (const forbidden of [...bearerTokens, SAJU_TOKEN, API_KEY,
    'synthetic private database', 'postgresql://', '127.0.0.1:']) {
    expect(body).not.toContain(forbidden);
  }
  return response.status;
}

function requireLoopbackOrigin(origin) {
  if (!/^http:\/\/127\.0\.0\.1:[0-9]{4,5}$/u.test(origin)) {
    throw new Error('Only the disposable loopback origin is allowed');
  }
  return origin;
}

async function readSajuCgroup(metricsOrigin, cpuCores = 0.5) {
  const response = await fetch(metricsOrigin + '/metrics', {
    redirect: 'error', signal: AbortSignal.timeout(2000),
  });
  expect(response.status).toBe(200);
  const metrics = await response.json();
  expect(metrics).toMatchObject({ cpuCores, memoryLimitBytes: 268435456, swapLimitBytes: 0, oomKills: 0 });
  expect(metrics.memoryPeakBytes).toBeGreaterThan(0);
  expect(metrics.memoryPeakBytes).toBeLessThanOrEqual(metrics.memoryLimitBytes);
  return metrics;
}

async function measureRealSustainedWindow(profile, origin, tokens, metricsOrigin, state, cpuCores = 0.5) {
  const before = await readSajuCgroup(metricsOrigin, cpuCores);
  const offset = Object.fromEntries(['dbAcquireMs', 'dbQueryMs', 'authHeaderMs', 'sajuMs']
    .map(key => [key, state[key].length]));
  const failedAcquisitionsBefore = state.dbAcquireFailures ?? 0;
  state.apiPeak = 0;
  state.apiFourWayAdmissions = 0;
  const { samples, ...window } = await measureIsolatedProductWindow(profile, (slot) =>
    requestCalculation(origin, tokens[profile === 'baseline' ? 0 : slot % tokens.length], tokens));
  const after = await readSajuCgroup(metricsOrigin, cpuCores);
  const successes = samples.filter(sample => sample.status === 200).map(sample => sample.elapsedMs);
  const unavailable = samples.filter(sample => sample.status === 503).length;
  const transportFailures = samples.filter(sample => sample.status === null).length;
  expect(successes.length).toBeGreaterThan(0);
  expect(successes.length + unavailable + transportFailures + window.skipped).toBe(window.scheduled);
  expect(state.dbActive).toBe(0);
  expect(state.apiActive).toBe(0);
  expect(after.cpuUsageUsec).toBeGreaterThanOrEqual(before.cpuUsageUsec);
  expect(after.cpuThrottledPeriods).toBeGreaterThanOrEqual(before.cpuThrottledPeriods);
  return {
    ...window, successful: successes.length, unavailable, transportFailures,
    p50Ms: quantile(successes, 0.50), p95Ms: quantile(successes, 0.95), p99Ms: quantile(successes, 0.99),
    dbAcquireFailures: (state.dbAcquireFailures ?? 0) - failedAcquisitionsBefore,
    dbAcquireP95Ms: quantile(state.dbAcquireMs.slice(offset.dbAcquireMs), 0.95),
    dbQueryP95Ms: quantile(state.dbQueryMs.slice(offset.dbQueryMs), 0.95),
    authHeadersP95Ms: quantile(state.authHeaderMs.slice(offset.authHeaderMs), 0.95),
    sajuP95Ms: quantile(state.sajuMs.slice(offset.sajuMs), 0.95),
    saju: {
      cpuCores: after.cpuCores, cpuUsageUsec: after.cpuUsageUsec - before.cpuUsageUsec,
      cpuThrottledPeriods: after.cpuThrottledPeriods - before.cpuThrottledPeriods,
      memoryLimitBytes: after.memoryLimitBytes, memoryPeakBytes: after.memoryPeakBytes, oomKills: after.oomKills,
    },
    ...((profile === 'overlap' || profile === 'cpu') && { waveSize: 4, apiPeak: state.apiPeak,
      apiFourWayAdmissions: state.apiFourWayAdmissions }),
  };
}

const isolated = BIN ? describe : describe.skip;
isolated('Phase 10/11 actual isolated PostgreSQL 18 + Auth/Saju loopback product path', () => {
  it('distinguishes normal/contended/failed dependencies and leaves health available', async () => {
    const state = {
      dbActive: 0, dbPeak: 0, dbAcquisitions: 0,
      dbMode: 'healthy', authMode: 'healthy', sajuMode: 'healthy',
      dbAcquireMs: [], dbQueryMs: [],
      authCalls: 0, sajuCalls: 0,
    };
    const servers = [];
    let database;
    try {
      database = await startIsolatedPg18();
      const auth = await listen((req, res) => {
        state.authCalls++;
        if (req.method !== 'GET' || req.url !== '/auth/v1/user' ||
            req.headers.authorization !== 'Bearer ' + MEMBER_TOKEN ||
            req.headers.apikey !== API_KEY) {
          res.writeHead(401).end('{}');
          return;
        }
        res.writeHead(state.authMode === 'healthy' ? 200 : 503,
          { 'content-type': 'application/json' });
        res.end(state.authMode === 'healthy' ? JSON.stringify({ id: AUTH }) : '{}');
      });
      servers.push(auth);
      const saju = await listen((req, res) => {
        state.sajuCalls++;
        if (req.method !== 'POST' || req.url !== '/api/calculations' ||
            req.headers.authorization !== 'Bearer ' + SAJU_TOKEN) {
          res.writeHead(401).end('{}');
          return;
        }
        if (state.sajuMode === 'slow') {
          setTimeout(() => {
            if (!res.destroyed) {
              res.writeHead(503, { 'content-type': 'application/json' });
              res.end('{}');
            }
          }, 350);
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(responseFixture()));
      });
      servers.push(saju);
      const identityEvidenceVerifier = new SupabaseMemberIdentityEvidenceVerifierV1({
        supabaseOrigin: 'https://synthetic.invalid', supabaseApiKey: API_KEY,
        fetchImpl: (_url, init) => fetch(auth.origin + '/auth/v1/user', init),
        timeoutMs: 500,
      });
      const sajuAdapter = createSajuProductionCalculationHttpAdapterV1({
        baseUrl: saju.origin, bearerToken: SAJU_TOKEN, timeoutMs: 120,
      });
      const db = createRealDb(database.pool,state);
      const api = await listen(async (req, res) => {
        if (req.url === '/api/health' && req.method === 'GET') {
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end('{"status":"ok"}');
          return;
        }
        if (req.url !== '/api/me/saju/calculation' || req.method !== 'POST') {
          res.writeHead(404).end();
          return;
        }
        try {
          const result = await handleCurrentSubjectSajuCalculationRequestV1({
            request: new Request('https://myeongha.synthetic/api/me/saju/calculation', {
              method: 'POST', headers: { authorization: req.headers.authorization ?? '' },
            }),
            requestId: 'b0000000-0000-4000-8000-000000000001',
            serverTime: '2026-11-05T00:00:00.000Z',
            identityEvidenceVerifier, pool: db, sajuAdapter,
          });
          res.writeHead(result.status, {
            'content-type': result.headers.get('content-type') ?? 'application/json',
            'cache-control': 'no-store',
          });
          res.end(Buffer.from(await result.arrayBuffer()));
        } catch {
          res.writeHead(503, {
            'content-type': 'application/json', 'cache-control': 'no-store',
          });
          res.end('{"ok":false,"error":{"code":"DEPENDENCY_UNAVAILABLE"}}');
        }
      });
      servers.push(api);

      const baseline = await measuredBatch(api.origin, 12, 1);
      expect(baseline).toMatchObject({ requested: 12, successful: 12, unavailable: 0, unexpected: 0 });
      const contended = await measuredBatch(api.origin, 32, 8);
      expect(contended.unexpected).toBe(0);
      expect(contended.unavailable).toBeGreaterThan(0);
      expect(contended.successful).toBeGreaterThan(0);
      expect(state.dbPeak).toBeLessThanOrEqual(2);

      const beforeSajuTimeout = state.sajuCalls;
      state.sajuMode = 'slow';
      const slowSaju = await measuredBatch(api.origin, 1, 1);
      expect(slowSaju.unavailable).toBe(1);
      expect(state.sajuCalls - beforeSajuTimeout).toBe(1);
      state.sajuMode = 'healthy';

      const beforeAuthFailureSaju = state.sajuCalls;
      state.authMode = 'unavailable';
      const authUnavailable = await measuredBatch(api.origin, 1, 1);
      expect(authUnavailable.unavailable).toBe(1);
      expect(state.sajuCalls).toBe(beforeAuthFailureSaju);
      state.authMode = 'healthy';

      state.dbMode = 'unavailable';
      const beforeDbFailureSaju = state.sajuCalls;
      const dbUnavailable = await measuredBatch(api.origin, 1, 1);
      expect(dbUnavailable.unavailable).toBe(1);
      expect(state.sajuCalls).toBe(beforeDbFailureSaju);

      const health = await fetch(api.origin + '/api/health');
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: 'ok' });
      expect(state.dbActive).toBe(0);
      expect(state.sajuCalls).toBe(baseline.successful + contended.successful + 1);

      const proof = {
        schema: 'myeongha-isolated-pg18-product-path-phase10-phase11-v1',
        result: 'PASS', target: 'isolated PostgreSQL18 and loopback Auth/Saju HTTP product handler',
        baseline, contended,
        sajuTimeoutUnavailable: slowSaju.unavailable,
        authUnavailable: authUnavailable.unavailable,
        dbUnavailable: dbUnavailable.unavailable,
        healthUnaffected: health.status === 200,
        authHttpRequests: state.authCalls, sajuHttpRequests: state.sajuCalls,
        dbPeak: state.dbPeak, dbBudget: 2, dbAcquisitionAttempts: state.dbAcquisitions,
        dbAcquireP95Ms: quantile(state.dbAcquireMs,0.95),
        dbQueryP95Ms: quantile(state.dbQueryMs,0.95),
        actualAuthHttp: true, actualSajuHttp: true,
        databaseTransport: 'actual_ephemeral_postgres18_rls',
        sajuEngineTransport: 'synthetic_response_not_real_engine',
        productionCapacityProven: false, productionScalingThresholdApproved: false,
        drReady: false, serviceResumptionAllowed: false, outputContainsIdentifiers: false,
      };
      const proofFile = process.env.MH_OPS_ISOLATED_PRODUCT_PROOF_PATH;
      if (proofFile) {
        await writeFile(proofFile, JSON.stringify(proof), { flag: 'wx', mode: 0o600 });
      }
      console.log('MYEONGHA_REAL_PG18_PRODUCT_PATH_PHASE10_11_PASS ' + JSON.stringify(proof));
    } finally {
      for (const server of servers.reverse()) await server.close().catch(() => undefined);
      await database?.close();
    }
  }, 90000);
});


async function registerDisposableGoTrueMembers(origin) {
  if (!/^http:\/\/127\.0\.0\.1:[0-9]{2,5}$/u.test(origin)) {
    throw Error('Only the private GoTrue loopback origin is allowed');
  }
  const members=[];
  for (let i=0;i<4;i++) {
    const email='phase11-'+randomBytes(12).toString('hex')+'@example.invalid';
    const password=randomBytes(30).toString('base64url');
    const signup=await fetch(origin+'/signup',{
      method:'POST', headers:{'content-type':'application/json'},redirect:'manual',
      body:JSON.stringify({email,password}),signal:AbortSignal.timeout(12000),
    });
    if(signup.status!==200)throw Error('Disposable GoTrue signup rejected');
    const created=await signup.json();
    const id=created?.user?.id;
    if(typeof id!=='string')throw Error('Actual GoTrue UUID not issued');
    let token=created.access_token;
    if(typeof token!=='string') {
      const login=await fetch(origin+'/token?grant_type=password',{
        method:'POST',headers:{'content-type':'application/json'},redirect:'manual',
        body:JSON.stringify({email,password}),signal:AbortSignal.timeout(12000),
      });
      if(!login.ok)throw Error('Actual GoTrue password grant rejected');
      token=(await login.json()).access_token;
    }
    if(typeof token!=='string'||token.split('.').length!==3)
      throw Error('Actual signed GoTrue JWT missing');
    const verified=await fetch(origin+'/user',{
      headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(12000),
      redirect:'manual',
    });
    if(!verified.ok||(await verified.json()).id!==id)
      throw Error('Actual GoTrue JWT and user identity did not match');
    members.push({id,token});
  }
  return members;
}
async function launchActualSajuHost(sourceDirectory, port = 0) {
  if(typeof sourceDirectory!=='string' ||
    !sourceDirectory.endsWith('/_isolated_saju') ||
    !sourceDirectory.startsWith(process.cwd()+'/')) {
    throw Error('Expected only pinned GitHub checkout of Saju');
  }
  const {createMyeonghwaProductionCalculationHostServer}=await import(
    pathToFileURL(join(sourceDirectory,'dist','production-calculation-host.js')).href);
  if(typeof createMyeonghwaProductionCalculationHostServer!=='function')
    throw Error('Real pinned Saju calculation server export is missing');
  const server=createMyeonghwaProductionCalculationHostServer({serviceBearer:SAJU_TOKEN});
  server.listen(port,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  if(!address||typeof address==='string')throw Error('Real Saju listener unavailable');
  return {
    origin:'http://127.0.0.1:'+address.port,
    async close(){
      server.closeAllConnections();
      await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    },
  };
}

const actualChainEnabled = Boolean(BIN && process.env.MH_OPS_REAL_GOTRUE_LOCAL_ORIGIN &&
  process.env.MH_OPS_REAL_SAJU_CHECKOUT && process.env.MH_OPS_REAL_PRODUCT_PROOF_PATH);
const overlapExperiment = process.env.MH_OPS_REAL_PRODUCT_EXPERIMENT === 'overlap';
const sustainedExperiment = overlapExperiment || process.env.MH_OPS_REAL_PRODUCT_EXPERIMENT === 'sustained';
const cpuExperiment = process.env.MH_OPS_REAL_PRODUCT_EXPERIMENT === 'saju_cpu';
const constrainedSajuExperiment = sustainedExperiment || cpuExperiment;
const workerdOverlapExperiment = process.env.MH_OPS_REAL_PRODUCT_EXPERIMENT === 'workerd_overlap';
const workerdExperiment = workerdOverlapExperiment ||
  process.env.MH_OPS_REAL_PRODUCT_EXPERIMENT === 'workerd';
isolated('Phase 11 disposable real GoTrue + PostgreSQL18 + pinned actual Saju calculation',()=>{
  it.skipIf(!actualChainEnabled)('measures four authenticated synthetic members through the real calculation path',async()=>{
    if(process.env.GITHUB_EVENT_NAME!=='workflow_dispatch' ||
       process.env.GITHUB_REF!=='refs/heads/main')
      throw Error('Actual multi-service test is manual-main-only');
    // Phase names are a fixed allowlist: no synthetic JWT, auth UUID or SQL error
    // details may escape the private Vitest log when this actual Linux job fails.
    let phase='member_signup';
    let database, saju;
    const servers=[];
    try {
      const members=await registerDisposableGoTrueMembers(
        process.env.MH_OPS_REAL_GOTRUE_LOCAL_ORIGIN);
      phase='isolated_pg18_start';
      database=await startIsolatedPg18();
      phase='subject_rls_map';
      await database.bindRealMembers(members);
      phase='real_saju_start';
      let metricsOrigin;
      if (constrainedSajuExperiment) {
        saju={ origin: requireLoopbackOrigin(process.env.MH_OPS_REAL_SAJU_ORIGIN) };
        metricsOrigin=requireLoopbackOrigin(process.env.MH_OPS_REAL_SAJU_METRICS_ORIGIN);
        await readSajuCgroup(metricsOrigin);
      } else {
        saju=await launchActualSajuHost(process.env.MH_OPS_REAL_SAJU_CHECKOUT);
      }
      phase='api_setup';
      if (workerdExperiment) {
        phase='workerd_runtime';
        const worker=await startIsolatedWorkerdProduct({
          repoRoot:process.cwd(), wranglerEntry:process.env.MH_OPS_WORKERD_WRANGLER_ENTRY,
          authOrigin:process.env.MH_OPS_REAL_GOTRUE_LOCAL_ORIGIN, sajuOrigin:saju.origin, pgPort:database.port,
        });
        servers.push(worker);
        phase='workerd_requests';
        const tokens=members.map(member=>member.token);
        const baseline=await measuredBatch(worker.origin,12,1,tokens);
        expect(baseline).toMatchObject({requested:12,successful:12,unavailable:0,unexpected:0});
        let workerdWindow;
        if (workerdOverlapExperiment) {
          // Fixed 900 x four-request local-only waves; the in-flight count is a
          // client-side observation, NOT Worker-side admission or Hosted pooling.
          phase='workerd_sustained_overlap';
          const {samples,...window}=await measureIsolatedProductWindow('overlap',slot=>
            requestCalculation(worker.origin,tokens[slot % tokens.length],tokens));
          const successfulSamples=samples.filter(s=>s.status===200).map(s=>s.elapsedMs);
          const unavailable=samples.filter(s=>s.status===503).length;
          const transportFailures=samples.filter(s=>s.status===null).length;
          const unexpected=samples.filter(s=>s.status!==200 && s.status!==503 && s.status!==null).length;
          expect(window).toMatchObject({
            durationSeconds:900,requestsPerSecond:4,concurrency:4,scheduled:3600,peak:4,
          });
          expect(window.elapsedMs).toBeGreaterThanOrEqual(900000);
          // Do not accept a purported 900-wave experiment if the runner
          // silently dropped any scheduled four-request wave.
          expect(window.skipped).toBe(0);
          expect(successfulSamples.length).toBeGreaterThan(0);
          expect(unexpected).toBe(0);
          expect(successfulSamples.length+unavailable+transportFailures+unexpected+window.skipped).toBe(3600);
          workerdWindow={
            ...window,waveSize:4,clientPendingPeak:window.peak,
            clientPendingOnlyNotWorkerAdmission:true,
            successful:successfulSamples.length,unavailable,transportFailures,unexpected,
            p50Ms:quantile(successfulSamples,.5),
            p95Ms:quantile(successfulSamples,.95),
            p99Ms:quantile(successfulSamples,.99),
            sajuResourceCgroupConstrained:false,
          };
        }
        const denied=await fetch(worker.origin+'/api/me/saju/calculation',{
          method:'POST',redirect:'error',signal:AbortSignal.timeout(3000),
        });
        expect(denied.status).toBe(401);
        expect(denied.headers.get('cache-control')).toBe('no-store');
        const health=await fetch(worker.origin+'/health',{redirect:'error',signal:AbortSignal.timeout(3000)});
        expect(health.status).toBe(200);
        await denied.arrayBuffer();
        await health.arrayBuffer();

        phase='workerd_saju_outage';
        const sajuPort=Number(new URL(saju.origin).port);
        await saju.close();
        saju=undefined;
        const calculationStatus=await requestCalculation(worker.origin,tokens[0],tokens);
        expect(calculationStatus).toBe(503);
        const outageHealth=await fetch(worker.origin+'/health',{
          redirect:'error',signal:AbortSignal.timeout(3000),
        });
        const healthStatus=outageHealth.status;
        await outageHealth.arrayBuffer();
        expect(healthStatus).toBe(200);

        phase='workerd_saju_recovery';
        saju=await launchActualSajuHost(process.env.MH_OPS_REAL_SAJU_CHECKOUT,sajuPort);
        const recovery=await measuredBatch(worker.origin,4,4,tokens);
        expect(recovery).toMatchObject({requested:4,successful:4,unavailable:0,unexpected:0});
        phase='runtime_cleanup';
        await worker.close();
        servers.pop();
        await saju.close();
        saju=undefined;
        await database.close();
        database=undefined;
        phase='proof_write';
        await writeFile(process.env.MH_OPS_REAL_PRODUCT_PROOF_PATH,JSON.stringify({
          schema:'myeongha-ops-workerd-local-product-phase11-v1', status:'OBSERVED_ISOLATED_WORKERD_PRODUCT',
          scope:'wrangler-local-loopback-go-true-pg18-and-pinned-saju',
          wranglerVersion:worker.wranglerVersion, workerdVersion:worker.workerdVersion,
          sajuSourceSha:'9807ce89c08afc61b587560d515a475efd819032',
          memberCount:4, baseline, ...(workerdWindow && {workerdWindow}),
          actualGoTrueJwtVerified:true, actualPostgres18Rls:true,
          actualPinnedSajuProductionEngine:true, localWorkerdProductPathMeasured:true,
          sajuOutage:{calculationStatus,healthStatus,recovery},
          anonymousDenied:true, healthUnaffected:true, runtimeCleanupVerified:true,
          productionWorkerAdmissionMeasured:false, hostedHyperdriveMeasured:false,
          productionCapacityProven:false, productionScalingThresholdApproved:false,
          drReady:false, serviceResumptionAllowed:false, outputContainsIdentifiers:false,
        }),{flag:'wx',mode:0o600});
        phase='complete';
        return;
      }
      const state={
        dbActive:0,dbPeak:0,dbAcquisitions:0,
        dbAcquireFailures:0,apiActive:0,apiPeak:0,apiFourWayAdmissions:0,
        dbMode:'healthy',dbAcquireMs:[],dbQueryMs:[],authCalls:0,sajuCalls:0,authHeaderMs:[],sajuMs:[],
      };
      const authOrigin=process.env.MH_OPS_REAL_GOTRUE_LOCAL_ORIGIN;
      const identityEvidenceVerifier=new SupabaseMemberIdentityEvidenceVerifierV1({
        supabaseOrigin:'https://synthetic.invalid',supabaseApiKey:API_KEY,
        fetchImpl:async (_url,init)=>{
          state.authCalls++;
          const started=performance.now();
          try { return await fetch(authOrigin+'/user',init); }
          finally { state.authHeaderMs.push(performance.now()-started); }
        },
        timeoutMs:2000,
      });
      const createSajuAdapter=baseUrl=>createSajuProductionCalculationHttpAdapterV1({
        baseUrl,bearerToken:SAJU_TOKEN,timeoutMs:3000,
      });
      const referenceAdapter=createSajuAdapter(saju.origin);
      let activeAdapter=referenceAdapter;
      const countedAdapter={
        async calculate(binding){
          state.sajuCalls++;
          const started=performance.now();
          try { return await activeAdapter.calculate(binding); }
          finally { state.sajuMs.push(performance.now()-started); }
        },
      };
      const db=createRealDb(database.pool,state);
      const api=await listen(async(req,res)=>{
        if(req.url==='/api/health'&&req.method==='GET'){
          res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'})
            .end('{"status":"ok"}');
          return;
        }
        if(req.url!=='/api/me/saju/calculation'||req.method!=='POST'){
          res.writeHead(404).end();
          return;
        }
        state.apiActive++;
        state.apiPeak=Math.max(state.apiPeak,state.apiActive);
        if(state.apiActive===4)state.apiFourWayAdmissions++;
        try{
          const result=await handleCurrentSubjectSajuCalculationRequestV1({
            request:new Request('https://myeongha.synthetic/api/me/saju/calculation',{
              method:'POST',headers:{authorization:req.headers.authorization??''},
            }),
            requestId:'b0000000-0000-4000-8000-000000000011',
            serverTime:'2026-11-05T00:00:00.000Z',
            identityEvidenceVerifier,pool:db,sajuAdapter:countedAdapter,
          });
          res.writeHead(result.status,{
            'content-type':result.headers.get('content-type')??'application/json',
            'cache-control':'no-store',
          });
          res.end(Buffer.from(await result.arrayBuffer()));
        }catch{
          res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'})
            .end('{"ok":false,"error":{"code":"DEPENDENCY_UNAVAILABLE"}}');
        }finally{
          state.apiActive--;
        }
      });
      servers.push(api);
      phase='baseline_requests';
      const tokens=members.map(m=>m.token);
      const baseline=await measuredBatch(api.origin,12,1,tokens);
      expect(baseline).toMatchObject({requested:12,successful:12,unavailable:0,unexpected:0});
      const shortDbAcquireFailures=[state.dbAcquireFailures];
      phase='contended_requests';
      const ramp=[];
      if (sustainedExperiment) {
        for (const concurrency of [2, 4]) {
          const failedBefore=state.dbAcquireFailures;
          const result = await measuredBatch(api.origin, 24, concurrency, tokens);
          expect(result.unexpected).toBe(0);
          expect(result.successful).toBeGreaterThan(0);
          ramp.push(result);
          shortDbAcquireFailures.push(state.dbAcquireFailures-failedBefore);
        }
      }
      const failedBeforeContended=state.dbAcquireFailures;
      const contended=await measuredBatch(api.origin,32,8,tokens);
      shortDbAcquireFailures.push(state.dbAcquireFailures-failedBeforeContended);
      expect(contended.unexpected).toBe(0);
      expect(contended.successful+contended.unavailable).toBe(32);
      expect(contended.successful).toBeGreaterThan(0);
      expect(state.dbPeak).toBeLessThanOrEqual(2);
      phase='anonymous_and_health';
      const noCredentials=await fetch(api.origin+'/api/me/saju/calculation',{method:'POST'});
      expect(noCredentials.status).toBe(401);
      const health=await fetch(api.origin+'/api/health');
      expect(health.status).toBe(200);
      expect(state.dbActive).toBe(0);
      expect(state.sajuCalls).toBeGreaterThanOrEqual(baseline.successful+contended.successful);
      let sustained, cpuComparison;
      if (cpuExperiment) {
        const pressureMetricsOrigin=requireLoopbackOrigin(process.env.MH_OPS_PRESSURE_SAJU_METRICS_ORIGIN);
        const pressureAdapter=createSajuAdapter(requireLoopbackOrigin(process.env.MH_OPS_PRESSURE_SAJU_ORIGIN));
        phase='cpu_pressure';
        activeAdapter=pressureAdapter;
        const warmup=await measuredBatch(api.origin,4,1,tokens);
        expect(warmup.unexpected).toBe(0);
        expect(warmup.successful).toBeGreaterThan(0);
        phase='cpu_reference';
        activeAdapter=referenceAdapter;
        const reference=await measureRealSustainedWindow('cpu',api.origin,tokens,metricsOrigin,state);
        phase='cpu_pressure';
        activeAdapter=pressureAdapter;
        const pressure=await measureRealSustainedWindow('cpu',api.origin,tokens,pressureMetricsOrigin,state,0.01);
        expect(reference).toMatchObject({peak:4,apiPeak:4});
        expect(pressure).toMatchObject({peak:4,apiPeak:4});
        phase='post_pressure_recovery';
        activeAdapter=referenceAdapter;
        const recovery=await measuredBatch(api.origin,4,1,tokens);
        expect(recovery).toMatchObject({successful:4,unavailable:0,unexpected:0});
        cpuComparison={reference,pressure,recoverySucceeded:true};
      } else if (sustainedExperiment) {
        const windows=[];
        for (const profile of overlapExperiment ? ['overlap'] : ['baseline', 'concurrent']) {
          phase='sustained_'+profile;
          windows.push(await measureRealSustainedWindow(profile,api.origin,tokens,metricsOrigin,state));
        }
        if (overlapExperiment) expect(windows[0]).toMatchObject({peak:4,apiPeak:4});
        phase='post_pressure_recovery';
        state.dbMode='unavailable';
        const unavailable=await measuredBatch(api.origin,1,1,tokens);
        expect(unavailable).toMatchObject({successful:0,unavailable:1,unexpected:0});
        state.dbMode='healthy';
        const recovery=await measuredBatch(api.origin,4,1,tokens);
        expect(recovery).toMatchObject({successful:4,unavailable:0,unexpected:0});
        sustained={ ramp, windows, injectedDbUnavailable:1, recoverySucceeded:true,
          ...(overlapExperiment && { shortDbAcquireFailures }) };
      }
      phase='runtime_cleanup';
      const apiServer=servers.pop();
      const cleanup=await Promise.allSettled([apiServer.close(), saju.close?.(), database.close()]);
      database=undefined;
      saju=undefined;
      if (cleanup.some(result => result.status === 'rejected')) throw Error('Disposable runtime cleanup failed');
      phase='proof_write';
      const proof={
        schema:'myeongha-ops-real-gotrue-pg18-saju-product-phase11-v1',
        status:'OBSERVED_ISOLATED_REAL_CHAIN',
        scope:'disposable-main-only-local-gotrue-postgres18-and-pinned-saju',
        memberCount:4,actualGoTrueJwtVerified:true,realGoTrueHttp:true,
        actualPostgres18Rls:true,actualPinnedSajuProductionEngine:true,
        sajuSourceSha:'9807ce89c08afc61b587560d515a475efd819032',
        cloudflareWorkerRuntimeMeasured:false,
        databasePoolMax:2,dbPeak:state.dbPeak,
        baseline,contended,
        dbAcquireP95Ms:quantile(state.dbAcquireMs,.95),
        dbQueryP95Ms:quantile(state.dbQueryMs,.95),
        authHttpCalls:state.authCalls,sajuCalculationCalls:state.sajuCalls,
        anonymousDenied:noCredentials.status===401,
        healthUnaffected:health.status===200,
        runtimeCleanupVerified:true,
        actualSajuResourceCgroupConstrained:constrainedSajuExperiment,
        ...(sustained && { sustained }),
        ...(cpuComparison && { cpuComparison }),
        productionCapacityProven:false,productionScalingThresholdApproved:false,
        drReady:false,serviceResumptionAllowed:false,outputContainsIdentifiers:false,
      };
      await writeFile(process.env.MH_OPS_REAL_PRODUCT_PROOF_PATH,JSON.stringify(proof),{
        flag:'wx',mode:0o600,
      });
      phase='complete';
      console.log('MYEONGHA_REAL_GOTRUE_PG18_SAJU_CHAIN_PHASE11_PASS');
    }catch(error){
      // The original failure stays in the runner's private scratch file;
      // the shell reveals only this fixed stage, never raw Vitest output.
      console.error('MYEONGHA_REAL_CHAIN_FAILURE_STAGE: '+phase);
      throw error;
    }finally{
      for(const server of servers.reverse())await server.close().catch(()=>undefined);
      await saju?.close?.().catch(()=>undefined);
      await database?.close();
    }
  },sustainedExperiment || workerdOverlapExperiment ? 1320000 : cpuExperiment ? 240000 : 120000);
});
