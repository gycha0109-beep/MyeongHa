import {randomUUID} from 'node:crypto';
import type {AdminAuthPortV1} from './admin-auth-v1.js';
import {ADMIN_READ_DB_ROLE_V1,ADMIN_READ_PRINCIPAL_SQL_V1} from './admin-postgres-read-v1.js';
import type {AdminAuditPortV1} from './admin-read-http-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PATH=/^\/api\/admin\/readings\/([0-9a-f-]{36})\/generation-cost$/iu;
const READ_SQL='SELECT * FROM myeongha_admin_ops.qry_reading_ai_cost_calls_v1($1::uuid,$2::integer,$3::integer)';
const COLUMNS=['callId','readingId','executionAttemptId','observedAt','provider','model','outcome','source',
 'inputTokens','outputTokens','cachedInputTokens','reasoningTokens','priceVersion','estimatedMicroUsd','costStatus'] as const;
type CostRow=Readonly<Record<(typeof COLUMNS)[number],string|null>>;
function project(raw:Record<string,unknown>,readingId:string):CostRow{
  const out={} as Record<(typeof COLUMNS)[number],string|null>;
  for(const key of COLUMNS){
    const v=raw[key];
    if(v!==null&& (typeof v!=='string'||v.length===0||v.length>256))throw Error('Unbound Reading generation cost source');
    out[key]=v;
  }
  if(!UUID.test(out.callId??'')||out.readingId!==readingId||
    !UUID.test(out.executionAttemptId??'')||
    !Number.isFinite(Date.parse(out.observedAt??''))||
    !['provider_response_usage','provider_attempt_without_usage'].includes(out.source??'')||
    !['estimated','usage_unknown','price_unknown'].includes(out.costStatus??'')||
    !/^[A-Za-z0-9_.:/-]{1,128}$/u.test(out.provider??'')||
    !/^[A-Za-z0-9_.:/-]{1,128}$/u.test(out.model??'')||
    (out.estimatedMicroUsd!==null&&!/^(?:0|[1-9]\d{0,15})$/u.test(out.estimatedMicroUsd))||
    (out.costStatus==='estimated')!==(out.estimatedMicroUsd!==null))
    throw Error('Unbound Reading generation cost source');
  for(const key of ['inputTokens','outputTokens','cachedInputTokens','reasoningTokens'] as const){
    const value=out[key];
    if(value!==null&&!/^(?:0|[1-9]\d{0,15})$/u.test(value))
      throw Error('Unbound Reading generation cost usage');
  }
  return Object.freeze(out);
}

/** Owner-only private read. A provider-generated Reading call is NOT a Character
 * AI call that happened to consume Reading grounding. Missing events are not
 * evidence of zero cost or complete Saju provider coverage. */
export function createAdminReadingGenerationCostReadV1(pool:PostgresSubjectPoolV1){
  return async(readingId:string,limit:number,offset:number)=>{
    if(!UUID.test(readingId)||!Number.isSafeInteger(limit)||limit<1||limit>50||
      !Number.isSafeInteger(offset)||offset<0||offset>10000)throw Error('Invalid Reading generation cost read');
    const id=readingId.toLowerCase();
    const client=await pool.connect();let active=false,discard:unknown;
    try{
      await client.query('BEGIN READ ONLY');active=true;
      const role=await client.query<{currentUser:string}>(ADMIN_READ_PRINCIPAL_SQL_V1);
      if(role.rows.length!==1||role.rows[0]?.currentUser!==ADMIN_READ_DB_ROLE_V1)
        throw Error('Dedicated Reading cost reader required');
      const result=await client.query<Record<string,unknown>>(READ_SQL,[id,limit+1,offset]);
      if(result.rows.length>limit+1)throw Error('Unbounded Reading generation cost results');
      await client.query('COMMIT');active=false;
      const rows=result.rows.slice(0,limit).map(row=>project(row,id));
      return Object.freeze({rows,nextCursor:result.rows.length>limit&&offset+limit<=10000?
        String(offset+limit):null,coverage:'provider_events_only' as const});
    }catch(e){if(active)try{await client.query('ROLLBACK');}catch(failure){discard=failure;}throw e;}
    finally{client.release(discard);}
  };
}

export function createAdminReadingGenerationCostHttpV1(input:{
  readonly auth:AdminAuthPortV1;
  readonly audit:AdminAuditPortV1;
  readonly read:ReturnType<typeof createAdminReadingGenerationCostReadV1>;
  readonly now?:()=>Date;
}){
  return async(request:Request):Promise<Response>=>{
    const requestId=randomUUID(),now=(input.now??(()=>new Date()))();
    let actor:string|null=null;
    const reply=(status:number,data:unknown)=>Response.json(data,{status,headers:{
      'Cache-Control':'no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff','X-Request-Id':requestId}});
    const audit=(outcome:'allowed'|'denied'|'failed',targetRef:string|null)=>
      input.audit.append({requestId,actorAuthUserId:actor,action:'read:reading-generation-cost',
        outcome,targetRef,at:now.toISOString()});
    try{
      const owner=await input.auth.verifyOwner(request);
      actor=owner?.authUserId??null;
      if(owner===null){await audit('denied',null);return reply(403,{error:'ADMIN_FORBIDDEN'});}
      if(request.method!=='GET'){await audit('denied',null);return reply(405,{error:'METHOD_NOT_ALLOWED'});}
      const url=new URL(request.url),match=PATH.exec(url.pathname);
      const rawLimit=url.searchParams.get('limit')??'20';
      const rawCursor=url.searchParams.get('cursor')??'0';
      if(!match||!UUID.test(match[1]??'')||
        [...url.searchParams.keys()].some(key=>!['limit','cursor'].includes(key)||url.searchParams.getAll(key).length!==1)||
        !/^[1-9]\d?$/u.test(rawLimit)||Number(rawLimit)>50||
        !/^(?:0|[1-9]\d{0,4})$/u.test(rawCursor)||Number(rawCursor)>10000){
        await audit('denied',null);return reply(400,{error:'ADMIN_BAD_REQUEST'});
      }
      const readingId=match[1]!.toLowerCase();
      const result=await input.read(readingId,Number(rawLimit),Number(rawCursor));
      await audit('allowed',readingId);
      return reply(200,{kind:'reading-generation-ai-cost',readingId,...result});
    }catch{
      try{await audit('failed',null);}catch{return reply(503,{error:'ADMIN_AUDIT_UNAVAILABLE'});}
      return reply(503,{error:'ADMIN_READING_AI_COST_UNAVAILABLE'});
    }
  };
}
