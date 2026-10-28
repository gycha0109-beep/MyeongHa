import {randomUUID}from'node:crypto';
import {ADMIN_READ_PRINCIPAL_SQL_V1}from'./admin-postgres-read-v1.js';
import type{PostgresSubjectPoolV1}from'./postgres-subject-execution.js';
import type{AdminAuthPortV1}from'./admin-auth-v1.js';
import type{AdminAuditPortV1}from'./admin-read-http-v1.js';
import type{AdminAiFxEvidenceV1}from'./admin-ai-cost-finance-v1.js';
import type{OpenAiCostsObservationV1}from'./admin-openai-costs-source-v1.js';
import {adminAiBudgetWindowV1,evaluateAdminAiBudgetV1,type AdminAiBudgetBillingV1,type AdminAiBudgetWindowV1,type AdminAiBudgetBucketV1}from'./admin-ai-budget-v1.js';
export function createAdminAiBudgetReadV1(input:{readonly pool:PostgresSubjectPoolV1;readonly billing?:(window:AdminAiBudgetWindowV1)=>Promise<AdminAiBudgetBillingV1|undefined>;readonly fx?:(window:AdminAiBudgetWindowV1)=>Promise<AdminAiFxEvidenceV1|undefined>;
 readonly openAiCosts?:(window:AdminAiBudgetWindowV1)=>Promise<OpenAiCostsObservationV1|undefined>;}) {
 return async(window:AdminAiBudgetWindowV1)=>{
  const client=await input.pool.connect();let active=false,discard:unknown;
  try{
   await client.query('BEGIN READ ONLY');active=true;
   const principal=await client.query<{currentUser:string}>(ADMIN_READ_PRINCIPAL_SQL_V1);
   if(principal.rows.length!==1||principal.rows[0]?.currentUser!=='myeongha_admin_reader')throw Error('Dedicated budget reader required');
   const result=await client.query<{bucket:unknown}>('SELECT bucket FROM myeongha_admin_ops.qry_ai_monthly_budget_v1($1::timestamptz,$2::timestamptz)',[window.from,window.toExclusive]);
   if(result.rows.length>501)throw Error('Unbounded budget projection');
   const buckets=result.rows.slice(0,500).map(({bucket})=>{if(!bucket||typeof bucket!=='object'||Array.isArray(bucket))throw Error('Invalid budget projection');const r=bucket as Record<string,unknown>;
    if(r.workload!=='character_chat'||typeof r.feature!=='string'||typeof r.provider!=='string'||typeof r.model!=='string'||typeof r.estimateMicroUsd!=='string')throw Error('Invalid cost source');
    return{workload:r.workload,feature:r.feature,provider:r.provider,model:r.model,calls:Number(r.calls),unknownCostCalls:Number(r.unknownCostCalls),estimateMicroUsd:r.estimateMicroUsd}as AdminAiBudgetBucketV1;
   });
   await client.query('COMMIT');active=false;
   const [billing,fx,openAiCosts]=await Promise.all([
     input.billing?.(window),input.fx?.(window),input.openAiCosts?.(window),
   ]);
   if(openAiCosts!==undefined && (openAiCosts.version!=='openai-organization-costs-observation-v1'||
     openAiCosts.invoiceConfirmed!==false||openAiCosts.billingStatus!=='provider_reported_not_final_invoice'||
     openAiCosts.queriedFrom!==window.from||
     Date.parse(openAiCosts.queriedToExclusive)>Date.parse(window.observedThrough)||
     !/^(?:0|[1-9]\\d{0,29})$/u.test(openAiCosts.observedMicroUsd)))
     throw Error('Unbound OpenAI provider observation');
   const budget=evaluateAdminAiBudgetV1({
     window,buckets,workloadCoverage:['character_chat'],truncated:result.rows.length>500,
     ...(billing?{billing}:{}),...(fx?{fx}:{}),
   });
   // A provider API observation is not an invoice and can include other
   // organization/project charges, so never add it to confirmed AI totals.
   return Object.freeze({...budget,openAiCosts:openAiCosts??null});
  }catch(e){if(active)try{await client.query('ROLLBACK');}catch(error){discard=error;}throw e;}finally{client.release(discard);}
 };
}
export function createAdminAiBudgetHttpV1(input:{readonly auth:AdminAuthPortV1;readonly audit:AdminAuditPortV1;readonly read:ReturnType<typeof createAdminAiBudgetReadV1>;readonly now?:()=>Date;}) {
 return async(request:Request)=>{
  const id=randomUUID(),now=(input.now??(()=>new Date()))();let actor:string|null=null;
  const reply=(status:number,data:unknown)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff','X-Request-Id':id}});
  const audit=(outcome:'allowed'|'denied'|'failed')=>input.audit.append({requestId:id,actorAuthUserId:actor,targetRef:null,action:'read:ai-budget',outcome,at:now.toISOString()});
  try{const owner=await input.auth.verifyOwner(request);actor=owner?.authUserId??null;if(!owner){await audit('denied');return reply(403,{error:'ADMIN_FORBIDDEN'});}
   const url=new URL(request.url);let window;
   try{if(url.pathname!=='/api/admin/ai-budget'||request.method!=='GET'||[...url.searchParams.keys()].some(k=>k!=='month')||url.searchParams.getAll('month').length>1)throw Error('Invalid route');window=adminAiBudgetWindowV1(url.searchParams.get('month')??undefined,now);}catch{await audit('denied');return reply(400,{error:'ADMIN_BUDGET_BAD_REQUEST'});}
   const result=await input.read(window);await audit('allowed');return reply(200,result);
  }catch{try{await audit('failed');}catch{return reply(503,{error:'ADMIN_AUDIT_UNAVAILABLE'});}return reply(503,{error:'ADMIN_BUDGET_UNAVAILABLE'});}
 };
}
