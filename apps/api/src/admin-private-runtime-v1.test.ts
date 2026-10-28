import { describe, expect, it } from 'vitest';
import { createAdminPrivateRuntimeV1 } from './admin-private-runtime-v1.js';
import { MYEONGHA_PRODUCTION_SUPABASE_ORIGIN } from './production-user-data-runtime-config.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const OWNER = '123e4567-e89b-42d3-a456-426614174000';
const OTHER = '123e4567-e89b-42d3-a456-426614174001';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature';
const env = {
  MYEONGHA_ADMIN_PRIVATE_ENABLED: 'true',
  MYEONGHA_ADMIN_OWNER_AUTH_USER_ID: OWNER,
  MYEONGHA_ADMIN_OWNER_EMAIL: "owner@example.test",
  MYEONGHA_ADMIN_SUPABASE_ORIGIN: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
  MYEONGHA_SUPABASE_API_KEY: 'synthetic-public-anon-key-test-only',
};
function mockPool(role: string) {
  const seen: string[] = [];
  const pool: PostgresSubjectPoolV1 = {
    async connect() {
      return {
        async query<Row = Record<string, unknown>>(text: string) {
          seen.push(text);
          return { rows: text.startsWith('SELECT current_user')
            ? [{ currentUser: role }] as unknown as Row[] : [] as Row[] };
        },
        release() {},
      };
    },
  };
  return { pool, seen };
}
describe('isolated private Administrator runtime', () => {
  it('rejects expired upstream sessions without issuing any domain read', async () => {
    const r = mockPool('myeongha_admin_reader');
    const a = mockPool('myeongha_admin_audit_writer');
    const runtime = createAdminPrivateRuntimeV1({ env, readPool: r.pool, auditPool: a.pool,
      memberFetchImpl: async () => Response.json({ error: 'jwt_expired' }, { status: 401 }),
    });
    const response = await runtime.handleRequest(new Request('https://admin.example/api/admin/users/' + OWNER, {
      headers: { Authorization: 'Bearer ' + JWT },
    }));
    expect(response.status).toBe(403);
    expect(r.seen).toHaveLength(0);
    expect(a.seen.some(sql => sql.startsWith('INSERT'))).toBe(true);
  });
  it('refuses disabled and mismatched authority environments', () => {
    const r = mockPool('myeongha_admin_reader');
    const a = mockPool('myeongha_admin_audit_writer');
    expect(() => createAdminPrivateRuntimeV1({
      env: {}, readPool: r.pool, auditPool: a.pool,
    })).toThrow();
    expect(() => createAdminPrivateRuntimeV1({
      env: { ...env, MYEONGHA_ADMIN_SUPABASE_ORIGIN: 'https://wrong.example' },
      readPool: r.pool, auditPool: a.pool,
    })).toThrow();
  });
  it('requires Owner evidence, dedicated read role and audit write role', async () => {
    const r = mockPool('myeongha_admin_reader');
    const a = mockPool('myeongha_admin_audit_writer');
    const runtime = createAdminPrivateRuntimeV1({
      env, readPool: r.pool, auditPool: a.pool,
      memberFetchImpl: async () => Response.json({ id: OWNER,email:"owner@example.test" }),
    });
    const response = await runtime.handleRequest(new Request('https://admin.example/api/admin/users', {
      headers: { Authorization: 'Bearer ' + JWT },
    }));
    expect(response.status).toBe(200);
    expect(r.seen.some(s => s.includes('FROM public.subjects'))).toBe(true);
    expect(a.seen.some(s => s.includes('INSERT INTO myeongha_admin_ops.admin_audit_events_v1'))).toBe(true);
  });
  it('accepts server-only billing and FX sources without enabling them by default', async () => {
    let exactBillLookups = 0, monthlyBillLookups = 0, fxLookups = 0;
    const billCallId = '123e4567-e89b-42d3-a456-426614174004';
    const readPool:PostgresSubjectPoolV1 = { async connect() { return {
      async query<Row = Record<string,unknown>>(sql:string) {
        if (sql.startsWith('SELECT current_user')) return {rows:[{currentUser:'myeongha_admin_reader'}] as unknown as Row[]};
        if (sql.includes('qry_ai_finance_calls_v1')) return {rows:[{
          callId:billCallId,subjectId:OWNER,attemptId:billCallId,turnId:billCallId,
          createdAt:'2026-10-28T00:00:00Z',priceAppliedAt:'2026-10-28T00:00:00Z',
          feature:'chat',provider:'synthetic-provider',model:'synthetic-model',
          outcome:'response_received',priceVersion:null,recordedEstimateMicroUsd:null,
          inputTokens:null,outputTokens:null,cachedInputTokens:null,reasoningTokens:null,
          appliedInputRate:null,
        }] as unknown as Row[]};
        return {rows:[] as Row[]};
      },release(){}};
    }};
    const runtime=createAdminPrivateRuntimeV1({
      env,readPool,auditPool:mockPool('myeongha_admin_audit_writer').pool,
      memberFetchImpl:async()=>Response.json({id:OWNER,email:'owner@example.test'}),
      aiFinanceEvidence:{
        billing:{async lookup(ids){exactBillLookups++;expect(ids).toEqual([billCallId]);return [{
          callId:billCallId,provider:'synthetic-provider',model:'synthetic-model',currency:'USD',
          amountMicroUsd:900,match:'exact_call',source:'provider_billing_export',
          evidenceSha256:'a'.repeat(64),billedFrom:'2026-10-01T00:00:00Z',billedTo:'2026-11-01T00:00:00Z',
        }];}},
        fx:{currency:'USD/KRW',rateNumerator:1400,rateDenominator:1,
          effectiveFrom:'2026-10-27T00:00:00Z',effectiveTo:'2026-10-29T00:00:00Z',sourceSha256:'b'.repeat(64)},
      },
      aiBudgetEvidence:{
        billing:async()=>{monthlyBillLookups++;return undefined;},
        fx:async()=>{fxLookups++;return undefined;},
      },
    });
    const headers={Authorization:'Bearer '+JWT};
    const calls=await runtime.handleRequest(new Request('https://admin.example/api/admin/ai-finance/calls?from=2026-10-27&to=2026-10-28',{headers}));
    expect(calls.status).toBe(200);
    const body=await calls.json() as {rows:Array<Record<string,unknown>>};
    expect(body.rows[0]).toMatchObject({costClass:'provider_confirmed',confirmedMicroUsd:'900',confirmedMicroKrw:'1260000'});
    expect(exactBillLookups).toBe(1);
    const budget=await runtime.handleRequest(new Request('https://admin.example/api/admin/ai-budget?month=2026-10',{headers}));
    expect(budget.status).toBe(200);
    expect(monthlyBillLookups).toBe(1);
    expect(fxLookups).toBe(1);
    expect((await budget.json() as {confirmedMicroKrw:unknown}).confirmedMicroKrw).toBeNull();
  });
  it('does not query user data for another authenticated Member', async () => {
    const r = mockPool('myeongha_admin_reader');
    const a = mockPool('myeongha_admin_audit_writer');
    const runtime = createAdminPrivateRuntimeV1({
      env, readPool: r.pool, auditPool: a.pool,
      memberFetchImpl: async () => Response.json({ id: OTHER,email:"owner@example.test" }),
    });
    expect((await runtime.handleRequest(new Request('https://admin.example/api/admin/users', {
      headers: { Authorization: 'Bearer ' + JWT },
    }))).status).toBe(403);
    expect(r.seen).toHaveLength(0);
  });
  it('fails closed for ordinary user DB role', async () => {
    const r = mockPool('myeongha_api_executor');
    const a = mockPool('myeongha_admin_audit_writer');
    const runtime = createAdminPrivateRuntimeV1({
      env, readPool: r.pool, auditPool: a.pool,
      memberFetchImpl: async () => Response.json({ id: OWNER,email:"owner@example.test" }),
    });
    expect((await runtime.handleRequest(new Request('https://admin.example/api/admin/users', {
      headers: { Authorization: 'Bearer ' + JWT },
    }))).status).toBe(503);
  });
});
