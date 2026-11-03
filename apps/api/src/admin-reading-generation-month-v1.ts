import { randomUUID } from 'node:crypto';
import { ADMIN_READ_DB_ROLE_V1, ADMIN_READ_PRINCIPAL_SQL_V1 } from './admin-postgres-read-v1.js';
import { adminAiBudgetWindowV1, type AdminAiBudgetWindowV1 } from './admin-ai-budget-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { AdminAuthPortV1 } from './admin-auth-v1.js';
import type { AdminAuditPortV1 } from './admin-read-http-v1.js';

const SQL='SELECT * FROM myeongha_admin_ops.qry_reading_ai_cost_month_v1($1::timestamptz,$2::timestamptz)';
const NUM=/^(?:0|[1-9][0-9]{0,15})$/u;
const KEYS=['observedCalls','observedReadings','unknownCostCalls','missingUsageCalls',
  'knownEstimateMicroUsd'] as const;

export interface AdminReadingGenerationMonthV1 {
  readonly version:'admin-reading-generation-month-v1';
  readonly window:AdminAiBudgetWindowV1;
  readonly observedCalls:string;
  readonly observedReadings:string;
  readonly unknownCostCalls:string;
  readonly missingUsageCalls:string;
  readonly knownEstimateMicroUsd:string;
  /** There is no authoritative all-Saju provider-call coverage receipt yet. */
  readonly coverage:'provider_events_only_unverified';
  readonly totalEstimateMicroUsd:null;
  readonly confirmedCostMicroUsd:null;
  readonly estimatedMicroKrw:null;
}

export function createAdminReadingGenerationMonthReadV1(pool:PostgresSubjectPoolV1) {
  return async (window:AdminAiBudgetWindowV1):Promise<AdminReadingGenerationMonthV1>=>{
    const client=await pool.connect();let active=false,discard:unknown;
    try {
      await client.query('BEGIN READ ONLY');active=true;
      const role=await client.query<{currentUser:string}>(ADMIN_READ_PRINCIPAL_SQL_V1);
      if(role.rows.length!==1||role.rows[0]?.currentUser!==ADMIN_READ_DB_ROLE_V1)
        throw Error('Dedicated Reading generation cost reader required');
      const result=await client.query<Record<string,unknown>>(SQL,[window.from,window.toExclusive]);
      if(result.rows.length!==1)throw Error('Missing bounded Reading cost summary');
      const source=result.rows[0]!,values={} as Record<(typeof KEYS)[number],string>;
      for(const key of KEYS){
        const value=source[key];
        if(typeof value!=='string'||!NUM.test(value))
          throw Error('Invalid Reading generation cost summary');
        values[key]=value;
      }
      const calls=BigInt(values.observedCalls);
      if(BigInt(values.unknownCostCalls)>calls||BigInt(values.missingUsageCalls)>calls||
        BigInt(values.observedReadings)>calls||
        (calls===0n && values.knownEstimateMicroUsd!=='0'))
        throw Error('Unbound Reading generation cost summary');
      await client.query('COMMIT');active=false;
      return Object.freeze({
        version:'admin-reading-generation-month-v1',window,...values,
        coverage:'provider_events_only_unverified',totalEstimateMicroUsd:null,
        confirmedCostMicroUsd:null,estimatedMicroKrw:null,
      });
    } catch(error) {
      if(active)try{await client.query('ROLLBACK');}catch(failure){discard=failure;}
      throw error;
    } finally {client.release(discard);}
  };
}

/** Owner and audit are mandatory before any private monthly aggregate is returned.
 * This endpoint does NOT upgrade observed evidence to the complete monthly AI
 * budget, even when recorded calls have zero unknown token costs. */
export function createAdminReadingGenerationMonthHttpV1(input:{
  readonly auth:AdminAuthPortV1;
  readonly audit:AdminAuditPortV1;
  readonly read:ReturnType<typeof createAdminReadingGenerationMonthReadV1>;
  readonly now?:()=>Date;
}){
  return async (request:Request):Promise<Response>=>{
    const requestId=randomUUID(),now=(input.now??(()=>new Date()))();
    let actor:string|null=null;
    const reply=(status:number,data:unknown)=>Response.json(data,{status,headers:{
      'Cache-Control':'no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff',
      'X-Request-Id':requestId}});
    const audit=(outcome:'allowed'|'denied'|'failed')=>
      input.audit.append({requestId,actorAuthUserId:actor,
        action:'read:reading-generation-month',targetRef:null,outcome,at:now.toISOString()});
    try{
      const owner=await input.auth.verifyOwner(request);actor=owner?.authUserId??null;
      if(owner===null){await audit('denied');return reply(403,{error:'ADMIN_FORBIDDEN'});}
      if(request.method!=='GET'){await audit('denied');return reply(405,{error:'METHOD_NOT_ALLOWED'});}
      const url=new URL(request.url);let window;
      try{
        if(url.pathname!=='/api/admin/reading-generation-cost/monthly'||
          [...url.searchParams.keys()].some(key=>key!=='month')||
          url.searchParams.getAll('month').length>1)throw Error('Invalid route');
        window=adminAiBudgetWindowV1(url.searchParams.get('month')??undefined,now);
      }catch{await audit('denied');return reply(400,{error:'ADMIN_BAD_REQUEST'});}
      const result=await input.read(window);await audit('allowed');
      return reply(200,result);
    }catch{
      try{await audit('failed');}catch{return reply(503,{error:'ADMIN_AUDIT_UNAVAILABLE'});}
      return reply(503,{error:'ADMIN_READING_AI_MONTH_UNAVAILABLE'});
    }
  };
}
