import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { handleCurrentSubjectSajuCalculationRequestV1 } from '../../apps/api/src/current-subject-saju-calculation-http.js';
import { SupabaseMemberIdentityEvidenceVerifierV1 } from '../../apps/api/src/supabase-member-identity-verifier.js';
import { createSajuProductionCalculationHttpAdapterV1 } from '../../apps/api/src/saju-production-calculation-http-adapter.js';

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
      async close(){
        await login.end().catch(()=>undefined);
        await admin.end().catch(()=>undefined);
        if(started) await pgTool('pg_ctl',['-D',dir,'-m','immediate','-w','-t','20','stop'])
          .catch(()=>undefined);
        await rm(dir,{recursive:true,force:true}).catch(()=>undefined);
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
      const client=await pg.connect();
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
async function measuredBatch(origin, count, concurrency) {
  let index = 0;
  const samples = [];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (index < count) {
      index++;
      const started = performance.now();
      const response = await fetch(origin + '/api/me/saju/calculation', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + MEMBER_TOKEN },
        signal: AbortSignal.timeout(3000),
      });
      const body = await response.text();
      expect(response.headers.get('cache-control')).toBe('no-store');
      for (const forbidden of [MEMBER_TOKEN, SAJU_TOKEN, API_KEY,
        'synthetic private database', 'postgresql://', '127.0.0.1:']) {
        expect(body).not.toContain(forbidden);
      }
      samples.push({ status: response.status, ms: performance.now() - started });
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

      console.log('MYEONGHA_REAL_PG18_PRODUCT_PATH_PHASE10_11_PASS ' + JSON.stringify({
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
      }));
    } finally {
      for (const server of servers.reverse()) await server.close().catch(() => undefined);
      await database?.close();
    }
  }, 90000);
});
