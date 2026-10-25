// Watchtower-Track: security
// Explicit opt-in ONLY: real native model + disposable DB, never CI by default.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NodePostgresSubjectPoolV1, type NodePostgresDriverPoolV1 } from '../apps/api/src/node-postgres-subject-pool.js';
import { SeyeonGovernedNodePostgresPoolV1 } from '../apps/api/src/seyeon-governed-postgres-pool-v1.js';
import { createProductionSeyeonChatRuntimeV1 } from '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import { createSeyeonProductionChatGovernorsV1 } from '../apps/api/src/seyeon-production-governor-factory-v1.js';
import type { SeyeonCostGovernorModelPolicyV1 } from '../apps/api/src/seyeon-cost-governor-server-policy-v1.js';
import { SEYEON_PRODUCTION_PROVIDER_ROUTING_V1 } from '../apps/api/src/production-seyeon-turn-send-runtime-v1.js';
import { handleSeyeonFirstPositiveMemoryDirectNodeHttpV1 } from '../apps/api/src/seyeon-first-positive-memory-node-http-ingress-v1.js';
import {handleSeyeonFirstPositiveMemoryFetchV1,handleSeyeonPositiveReplyReceiptV1} from '../apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.js';
import { executePostgresSubjectTransactionV1, type PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import { revokeSeyeonOriginalMemoryGrantAndAckV1 } from '../apps/api/src/seyeon-original-grant-revoke-ack-v1.js';
import { MYEONGHA_PRODUCTION_SUPABASE_ORIGIN } from '../apps/api/src/production-user-data-runtime-config.js';

const enabled = process.env.SEYEON_SECURITY_S0_LIVE_MODEL === '1';
const model = SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.directDefaultModel;
const summary = '사용자가 "이번 토요일 아침 한강에서 노란색 모자를 쓰고 산책할까 해"라고 말한 대화 기억이다.';
const question = '내가 이번 토요일 산책 얘기하면서 어디랑 무슨 색 모자를 말했지?';
const prefix = (part: number, n: number) => `b9${part}0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const baseline = readFileSync(new URL('./db/seyeon_first_zero_locked_reveal_disposable_pg17.sql', import.meta.url), 'utf8')
  .replace(/\r\n/gu, '\n').replace(/^\\set.*$/gmu, '');
const seedEnd = baseline.indexOf("BEGIN;\nset local myeongha.subject_id=");
if (seedEnd < 0) throw Error('Existing real Chat empty-thread seed unavailable.');

describe.skipIf(!enabled)('S0 live native model on real server execution and disposable PostgreSQL', () => {
  let admin: Pool;
  let ordinaryDriver: Pool;
  let governedDriver: Pool;
  let ordinary: NodePostgresSubjectPoolV1;
  let governed: SeyeonGovernedNodePostgresPoolV1;
  let apiKey: string;
  const nativeFetch = globalThis.fetch;
  const network: Record<string, unknown>[] = [];
  const outcomes: Record<string, unknown>[] = [];
  let activeSubject: string | undefined;
  let activeCase = '';
  let requestCount = 0;
  const purposes = {
    preflight: ['integrity_classification', 'disclosure_classification'],
    interpreter: ['turn_interpretation'], renderer: ['dialogue_render'], reviewer: ['semantic_review'],
  } as const;
  // Official model page checked 2026-10-24. Local test policy, NOT Production approval.
  const policy = (allowedPurposes: SeyeonCostGovernorModelPolicyV1['allowedPurposes']): SeyeonCostGovernorModelPolicyV1 => ({
    policyVersion: 's0-live-test-20261024', providerKey: 'openai-responses', modelKey: model,
    allowedPurposes, contextWindowTokens: 1050000, maximumInputTokens: 48000,
    maximumOutputTokens: 4096, maximumSerializedRequestBytes: 524288,
    priceQuote: { priceVersion: 'openai-terra-20261024', providerKey: 'openai-responses', modelKey: model,
      inputMicroUsdPerMillion: 2000000, cachedInputMicroUsdPerMillion: 200000,
      outputMicroUsdPerMillion: 12000000 },
  });
  beforeAll(async () => {
    if (process.env.PGHOST !== '127.0.0.1' || process.env.PGDATABASE !== 'myeongha_seyeon_security_s0_test') {
      throw Error('Real-model E2E requires the exact disposable loopback DB.');
    }
    const keyFile = process.env.SEYEON_S0_LIVE_KEY_FILE;
    if (!keyFile) throw Error('Explicit local credential file required.');
    apiKey = parseEnv(readFileSync(keyFile, 'utf8')).OPENAI_API_KEY ?? '';
    if (apiKey.length < 20) throw Error('Existing native model credential unavailable.');
    const db = { host: '127.0.0.1', port: Number(process.env.PGPORT),
      database: 'myeongha_seyeon_security_s0_test', ssl: false as const, max: 4 };
    admin = new Pool({ ...db, user: 'postgres' });
    const { rows: [target] } = await admin.query('select current_database() as db, current_user as role, version()');
    expect(target.db).toBe(db.database);
    expect(target.role).toBe('postgres');
    console.info('LIVE_MODEL_RUNTIME ' + JSON.stringify({ model, postgres: target.version }));
    await admin.query(`do $roles$ begin
      if not exists(select 1 from pg_roles where rolname='myeongha_s0_live_ordinary') then
        create role myeongha_s0_live_ordinary login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
      end if;
      if not exists(select 1 from pg_roles where rolname='myeongha_seyeon_governed_login') then
        create role myeongha_seyeon_governed_login login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
      end if;
      end $roles$;
      grant myeongha_api_executor to myeongha_s0_live_ordinary;
      grant myeongha_seyeon_governed_executor to myeongha_seyeon_governed_login;
      insert into public.seyeon_positive_source_type_registry_v1
        values('memory','conversation_recall','v1','seyeon-conversation-recall-projector-v1',true,true);
      grant execute on function public.cmd_mark_seyeon_positive_context_ready_pinned_v1(
        uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text) to myeongha_api_executor;
      grant execute on function public.cmd_commit_seyeon_positive_chat_turn_v1(
        uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text) to myeongha_api_executor;
      grant execute on function public.qry_seyeon_positive_first_memory_locked_reveal_v3(
        uuid,uuid,uuid,uuid,uuid,uuid,uuid,text) to myeongha_api_executor;
      grant execute on function public.cmd_issue_seyeon_positive_first_reply_v1(
        uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea),
        seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text),
        seyeon_private.cmd_request_seyeon_memory_revoke_v1(uuid,uuid) to myeongha_api_executor;`);
    const p = policy(Object.values(purposes).flat());
    await admin.query(`insert into public.seyeon_ai_governor_model_policies_v1(
      provider_key,model_key,policy_version,price_version,allowed_purposes,context_window_tokens,
      maximum_input_tokens,maximum_output_tokens,maximum_serialized_request_bytes,
      input_micro_usd_per_million,cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)`, [p.providerKey, model, p.policyVersion,
      p.priceQuote.priceVersion, p.allowedPurposes, p.contextWindowTokens, p.maximumInputTokens,
      p.maximumOutputTokens, p.maximumSerializedRequestBytes, p.priceQuote.inputMicroUsdPerMillion,
      p.priceQuote.cachedInputMicroUsdPerMillion, p.priceQuote.outputMicroUsdPerMillion]);
    await admin.query(`insert into public.seyeon_ai_governor_daily_budgets_v1(
      bucket_utc_date,global_limit_micro_usd,subject_limit_micro_usd)
      values((clock_timestamp() at time zone 'UTC')::date,1000000,500000)`);
    ordinaryDriver = new Pool({ ...db, user: 'myeongha_s0_live_ordinary' });
    governedDriver = new Pool({ ...db, user: 'myeongha_seyeon_governed_login' });
    ordinary = new NodePostgresSubjectPoolV1(ordinaryDriver as unknown as NodePostgresDriverPoolV1, 'myeongha_s0_live_ordinary');
    governed = new SeyeonGovernedNodePostgresPoolV1(governedDriver as unknown as NodePostgresDriverPoolV1, 'myeongha_seyeon_governed_login');
    // Passive observation only. All model/count requests and responses pass
    // unchanged to the native endpoint; no fake response or schema repair.
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith('https://api.openai.com/v1/responses')) return nativeFetch(input, init);
      const bytes = typeof init?.body === 'string' ? init.body : '';
      const body = JSON.parse(bytes);
      const packet = JSON.parse(body.input?.[0]?.content?.[0]?.text ?? '{}') as unknown;
      const strings: string[] = [];
      const collect = (value: unknown): void => {
        if (typeof value === 'string') strings.push(value);
        else if (value !== null && typeof value === 'object') Object.values(value).forEach(collect);
      };
      collect(packet);
      const countOnly = url.endsWith('/input_tokens');
      if (!countOnly && ++requestCount > 16) throw Error('Bounded live test request limit reached.');
      const { rows: [pin] } = await admin.query(`select count(*)::int as n
        from public.chat_turn_attempts where subject_id=$1 and seyeon_personal_source_pinned_at is not null`, [activeSubject]);
      expect(pin.n).toBeGreaterThan(0);
      const entry: Record<string, unknown> = { case: activeCase, countOnly,
        schema: body.text?.format?.name ?? null, requestSha256: createHash('sha256').update(bytes).digest('hex'),
        containsVirtualMemory: strings.includes(summary), containsVirtualPlace: strings.some(value => value.includes('한강')),
        promptCacheOptions:body.prompt_cache_options??null,
        pinPersistedBeforeDispatch: true, store: body.store, maxOutputTokens: body.max_output_tokens ?? null };
      network.push(entry);
      const response = await nativeFetch(input, init);
      entry.status = response.status;
      // Record only fixed metadata, never headers/credential or raw error body.
      const payload = await response.clone().json() as Record<string, unknown>;
      entry.responseId = typeof payload.id === 'string' ? payload.id : null;
      entry.usage = payload.usage ?? null;
      console.info('LIVE_MODEL_CALL ' + JSON.stringify(entry));
      if (response.ok && !countOnly && Array.isArray(payload.output)) {
        entry.outputText = payload.output.flatMap((item: { content?: { type?: string; text?: string }[] }) =>
          item.content?.filter(c => c.type === 'output_text').map(c => c.text) ?? []).join('\n');
      }
      return response;
    };
  }, 30000);
  afterAll(async () => {
    globalThis.fetch = nativeFetch;
    if (admin) {
      const { rows } = await admin.query(`select cost_status,count(*)::int as count,
        sum(estimated_cost_micro_usd)::text as estimated_micro_usd
        from public.seyeon_ai_call_cost_events group by cost_status`).catch(() => ({ rows: [] }));
      console.info('LIVE_MODEL_COST_LEDGER ' + JSON.stringify(rows));
    }
    const report = process.env.SEYEON_S0_LIVE_REPORT;
    if (report) writeFileSync(report, JSON.stringify({ model, syntheticMemory: summary,
      question, network, outcomes, realProductionChatRuntime: true, productionDeployment: false,
      identity: 'synthetic-member', transport: 'loopback-node-http', database: 'isolated-pg18' }, null, 2));
    await Promise.all([ordinaryDriver?.end(), governedDriver?.end(), admin?.end()]);
    apiKey = '';
  });

  async function seed(n: number) {
    const sql = baseline.slice(0, seedEnd).replaceAll('a8', 'b9')
      .replaceAll('000000000001', String(n).padStart(12, '0'))
      .replaceAll('first-zero-test-v1', 's0-live-' + n)
      .replaceAll('first-zero-test-release', 's0-live-release-' + n)
      .replaceAll("repeat('a',64)", "repeat('" + n.toString(16) + "',64)");
    await admin.query(sql);
    const auth = prefix(10, n), subject = prefix(11, n), thread = prefix(14, n), memory = prefix(24, n);
    await admin.query(`insert into public.memory_items(id,subject_id,memory_type,schema_version,
      content_jsonb,source_kind,created_by_character_id,created_at)
      values($1,$2,'conversation_recall','v1',$3::jsonb,'user_approved','seyeon',clock_timestamp())`,
    [memory, subject, JSON.stringify({ summary })]);
    await admin.query(`insert into public.record_access_grants(id,subject_id,memory_item_id,
      grantee_character_id,grant_reason,granted_at) values($1,$2,$3,'seyeon','user_choice',clock_timestamp())`,
    [prefix(25, n), subject, memory]);
    const evidence = { kind: 'member' as const, verifiedAuthUserId: auth };
    const revoke = () => revokeSeyeonOriginalMemoryGrantAndAckV1({ pool: ordinary,
      verifiedEvidence: evidence, memoryItemId: memory, dbCommand: 'private_candidate' });
    return { n, subject, thread, memory, evidence, revoke };
  }

  async function send(f: Awaited<ReturnType<typeof seed>>, revokeAfterCommit = false, revokeBeforePin = false, receiptHttp = false) {
    activeSubject = f.subject;
    activeCase = receiptHttp?'real-model-http-receipt':revokeBeforePin ? 'revoked-before-model-pin' : revokeAfterCommit ? 'revoked-before-first-reveal' : 'approved-real-model';
    let revokedBeforePin = false;
    const runtimePool: PostgresSubjectPoolV1 = !revokeBeforePin ? ordinary : {
      async connect() {
        const client = await ordinary.connect();
        return {
          async query<T>(sql: string, values?: readonly unknown[]) {
            // Real second DB session revokes after source retrieval but
            // before the actual G1 command. The production command is intact.
            if (!revokedBeforePin && !sql.includes('to_regprocedure') &&
                sql.includes('public.cmd_mark_seyeon_positive_context_ready_pinned_v1(')) {
              await f.revoke();
              revokedBeforePin = true;
            }
            return client.query<T>(sql, values);
          },
          release(error?: unknown) { client.release(error); },
        };
      },
    };
    const base = { apiKey, model, timeoutMs: 120000,
      ...(receiptHttp?{disablePromptCaching:true as const}:{}) };
    const setup = createSeyeonProductionChatGovernorsV1({ baseProviderConfig: base,
      approval: { policies: { preflight: policy(purposes.preflight), interpreter: policy(purposes.interpreter),
        renderer: policy(purposes.renderer), reviewer: policy(purposes.reviewer) },
      reservedHeadroomTokens: 128, timeoutMs: 30000 } });
    const runtime = createProductionSeyeonChatRuntimeV1({
      databaseConfig: { databaseUrl: 'postgresql://myeongha_s0_live_ordinary:local-only@127.0.0.1/local',
        databasePrincipal: 'myeongha_s0_live_ordinary', databaseExecutionRole: 'myeongha_api_executor',
        supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN, supabaseApiKey: 'synthetic-member-only',
        guestFingerprintSecret: 'synthetic-local-member-only-no-guest' },
      pool: runtimePool, governedCostPool: governed, governorMode: 'ENFORCE',
      providerConfig: base, roleProviderConfigs: setup.roleProviderConfigs,
      costGovernorForRole: setup.costGovernorForRole, approvedPersonalRecordModelUse: () => true,
    });
    if(receiptHttp){
      try{
        const response=await handleSeyeonFirstPositiveMemoryFetchV1({
          request:new Request(`https://local-fetch.test/api/chat/${f.thread}/turns`,{method:'POST',
            headers:{'Content-Type':'application/json','x-myeongha-delivery-receipt':'v1'},
            body:JSON.stringify({clientTurnId:prefix(30,f.n),text:question})}),
          requestId:'live-receipt-e2e',serverTime:new Date().toISOString(),pool:ordinary,
          identityEvidenceVerifier:{verifyRequestIdentity:async()=>f.evidence},runtime});
        expect(response.status).toBe(200);expect(response.bodyUsed).toBe(false);
        const pending=await executePostgresSubjectTransactionV1({pool:ordinary,verifiedEvidence:f.evidence,
          execute:({client})=>client.query<{result:{status:string}}>(`select
            seyeon_private.cmd_request_seyeon_memory_revoke_v1($1,$2) as result`,[f.subject,f.memory])});
        expect(pending.rows[0]?.result.status).toBe('pending');
        const payload=await response.json();
        const receipt=payload.data.deliveryReceipt;
        const ack=await handleSeyeonPositiveReplyReceiptV1({request:new Request(
          `https://local-fetch.test/api/chat/delivery-receipts/${receipt.attemptId}`,{method:'POST',
            headers:{'Content-Type':'application/json'},body:JSON.stringify({proof:createHash('sha256').update('seyeon-positive-http-receipt-v1\n'+Buffer.byteLength(payload.data.assistantText,'utf8')+':'+payload.data.assistantText+':'+createHash('sha256').update(receipt.challenge).digest('hex')).digest('hex')})}),
          requestId:'live-receipt-ack',pool:ordinary});
        expect(ack.status).toBe(200);
        const {rows:[grant]}=await admin.query('select revoked_at from public.record_access_grants where memory_item_id=$1',[f.memory]);
        expect(grant.revoked_at).not.toBeNull();
        delete payload.data.deliveryReceipt;
        return {status:response.status,cache:response.headers.get('Cache-Control'),body:JSON.stringify(payload),
          revokedBeforePin:false,failureConstraint:undefined};
      }finally{await runtime.close();}
    }
    let complete!: () => void;
    const handled = new Promise<void>(resolve => { complete = resolve; });
    let failure: unknown;
    const server = createServer((incoming, response) => {
      void handleSeyeonFirstPositiveMemoryDirectNodeHttpV1({ incoming, response, pool: ordinary,
        identityEvidenceVerifier: { verifyRequestIdentity: async () => f.evidence },
        runtime: { run: async request => {
          try {
            const result = await runtime.run(request);
            if (revokeAfterCommit) await f.revoke();
            return result;
          } catch (error) { failure = error; throw error; }
        } },
      }).finally(complete);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat/${f.thread}/turns`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientTurnId: prefix(30, f.n), text: question }),
        signal: AbortSignal.timeout(240000),
      }).catch(() => null);
      const body = response === null ? '' : await response.text();
      await handled;
      if (failure) {
        const e = failure as { name?: string; message?: string; code?: string; constraint?: string; cause?: { message?: string } };
        console.info('LIVE_MODEL_FAILURE ' + JSON.stringify({ name: e.name, message: e.message,
          code: e.code, constraint: e.constraint, cause: e.cause?.message }));
      }
      return { status: response?.status ?? 0, cache: response?.headers.get('Cache-Control') ?? null, body,
        revokedBeforePin, failureConstraint: (failure as { constraint?: string } | undefined)?.constraint };
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await runtime.close();
    }
  }

  it('uses real inference with disabled prompt caching and completes pending withdrawal only after the HTTP receipt',async()=>{
    const f=await seed(13);const response=await send(f,false,false,true);
    expect(response.status).toBe(200);
    const reply=JSON.parse(response.body).data.assistantText as string;
    expect(reply).toContain('한강');expect(reply).toMatch(/노란|노랑/u);
    const calls=network.filter(r=>r.case===activeCase&&r.countOnly===false);
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(calls.every(r=>(r.promptCacheOptions as {mode?:string})?.mode==='explicit')).toBe(true);
    outcomes.push({case:activeCase,status:200,reply,pendingBeforeConsumption:true,
      exactReceiptAccepted:true,withdrawalCompletedAfterReceipt:true,realModelCalls:calls.length});
    console.info('LIVE_MODEL_RECEIPT_REPLY '+JSON.stringify({status:200,reply,realModelCalls:calls.length}));
  },260000);

  it('uses real inference and real generated/validated/Commit rows to reveal a remembered activity', async () => {
    const f = await seed(10);
    const response = await send(f);
    expect(response.status).toBe(200);
    const reply = JSON.parse(response.body).data.assistantText as string;
    expect(reply).toContain('한강');
    expect(reply).toMatch(/노란|노랑/u);
    expect(response.cache).toBe('no-store');
    const calls = network.filter(r => r.case === activeCase && r.countOnly === false);
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(calls.some(r => r.containsVirtualMemory)).toBe(true);
    const { rows: [stored] } = await admin.query(`select body_text from public.conversation_messages
      where subject_id=$1 and sender_type='character'`, [f.subject]);
    expect(stored.body_text).toBe(reply);
    outcomes.push({ case: activeCase, status: response.status, reply, realModelCalls: calls.length });
    console.info('LIVE_MODEL_REPLY ' + JSON.stringify({ status: response.status, reply }));
    await f.revoke();
    const records = await executePostgresSubjectTransactionV1({ pool: ordinary, verifiedEvidence: f.evidence,
      execute: ({ client }) => client.query(`select * from public.qry_seyeon_production_personal_record_context_v1($1,'seyeon')`, [f.subject]) });
    expect(records.rows).toHaveLength(0);
  }, 260000);

  it('blocks first HTTP Reveal after real-model Commit when the original Grant is revoked', async () => {
    const f = await seed(11);
    const response = await send(f, true);
    expect(response.status).toBe(503);
    expect(response.cache).toBe('no-store');
    expect(response.body).not.toContain('한강');
    expect(response.body).not.toContain('노란');
    const { rows: [committed] } = await admin.query(`select count(*)::int as n from public.conversation_messages
      where subject_id=$1 and sender_type='character'`, [f.subject]);
    expect(committed.n).toBe(1);
    outcomes.push({ case: activeCase, status: response.status, committed: true, privateBodyExposed: false });
  }, 260000);

  it('makes no model or token-count request when the original Grant is revoked between source retrieval and actual G1', async () => {
    const f = await seed(12);
    const response = await send(f, false, true);
    expect(response.revokedBeforePin).toBe(true);
    expect(response.failureConstraint).toBe('seyeon_source_lock_original_grant_required');
    expect(response.status).toBe(0); // Candidate deliberately closes the socket on G1 failure.
    expect(response.body).toBe('');
    expect(network.filter(r => r.case === activeCase)).toHaveLength(0);
    outcomes.push({ case: activeCase, revokedBeforePin: true, modelAndCountRequests: 0,
      failureConstraint: response.failureConstraint, privateBodyExposed: false });
  }, 30000);
});
