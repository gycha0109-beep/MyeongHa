import { randomUUID } from 'node:crypto';
import type { AdminAuthPortV1 } from './admin-auth-v1.js';
import type { AdminAuditPortV1 } from './admin-read-http-v1.js';
import type { AdminAiFinanceFiltersV1, AdminAiFinanceModeV1, AdminAiFinanceReadPortV1 } from './admin-ai-cost-read-v1.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export function parseAdminAiFinanceFiltersV1(url: URL, now: Date): AdminAiFinanceFiltersV1 {
  if (!url.pathname.startsWith('/api/admin/ai-finance/')) throw new Error('Not an AI finance route');
  const rawMode = url.pathname.slice('/api/admin/ai-finance/'.length);
  if (!['calls','summary','prices'].includes(rawMode)) throw new Error('Unknown finance route');
  const mode = rawMode as AdminAiFinanceModeV1;
  for (const key of url.searchParams.keys()) if (!['from','to','subjectId','model','feature','granularity','groupBy','limit','cursor'].includes(key) || url.searchParams.getAll(key).length !== 1) throw new Error('Invalid finance parameter');
  const from = url.searchParams.get('from') ?? new Date(now.getTime()-29*86_400_000).toISOString().slice(0,10);
  const to = url.searchParams.get('to') ?? now.toISOString().slice(0,10);
  if (url.searchParams.has('from') !== url.searchParams.has('to')) throw new Error('Both finance dates required');
  for (const day of [from,to]) if (!/^\d{4}-\d{2}-\d{2}$/u.test(day) || !Number.isFinite(Date.parse(day+'T00:00:00Z')) || new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day) throw new Error('Invalid finance date');
  const days = (Date.parse(to)-Date.parse(from))/86_400_000;
  if (days < 0 || days > 90) throw new Error('Finance window exceeds 90 days');
  const subjectId = url.searchParams.get('subjectId');
  if (subjectId !== null && !UUID.test(subjectId)) throw new Error('Invalid finance subject');
  const model = url.searchParams.get('model');
  if (model !== null && !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(model)) throw new Error('Invalid finance model');
  const feature = url.searchParams.get('feature');
  if (feature !== null && !['chat','post_turn'].includes(feature)) throw new Error('Invalid finance feature');
  const granularity = url.searchParams.get('granularity') ?? 'day';
  const groupBy = url.searchParams.get('groupBy') ?? 'feature';
  if (!['day','month'].includes(granularity) || !['feature','subject'].includes(groupBy)) throw new Error('Invalid finance grouping');
  if (mode !== 'summary' && (url.searchParams.has('granularity') || url.searchParams.has('groupBy'))) throw new Error('Grouping only applies to finance summaries');
  if (mode === 'prices' && ['from','to','subjectId','feature'].some(key => url.searchParams.has(key))) throw new Error('Price versions do not have an invented effective-time filter');
  const rawLimit = url.searchParams.get('limit') ?? '20';
  const rawOffset = url.searchParams.get('cursor') ?? '0';
  if (!/^[1-9]\d?$/u.test(rawLimit) || Number(rawLimit)>50 || !/^(?:0|[1-9]\d{0,4})$/u.test(rawOffset) || Number(rawOffset)>10_000) throw new Error('Invalid finance page');
  return {mode,from,to,subjectId:subjectId?.toLowerCase() ?? null,model,feature,granularity:granularity as 'day'|'month',groupBy:groupBy as 'feature'|'subject',limit:Number(rawLimit),offset:Number(rawOffset)};
}

export function createAdminAiFinanceHttpHandlerV1(deps: { readonly auth:AdminAuthPortV1; readonly audit:AdminAuditPortV1; readonly reads:AdminAiFinanceReadPortV1; readonly now?:()=>Date }) {
  let window = 0; let count = 0;
  return async (request:Request):Promise<Response> => {
    const requestId = randomUUID(); const now=(deps.now ?? (()=>new Date()))();
    const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','X-Request-Id':requestId}});
    let actor:string|null=null;
    const audit=async(action:string,outcome:'allowed'|'failed'|'denied',targetRef:string|null=null)=>deps.audit.append({requestId,actorAuthUserId:actor,action,outcome,targetRef,at:now.toISOString()});
    try {
      const owner=await deps.auth.verifyOwner(request); actor=owner?.authUserId ?? null;
      if (owner === null) {await audit('read:ai-finance','denied');return reply(403,{error:'ADMIN_FORBIDDEN'});}
      if (request.method!=='GET') {await audit('read:ai-finance','denied');return reply(405,{error:'METHOD_NOT_ALLOWED'});}
      if (now.getTime()-window>=60_000 || now.getTime()<window) {window=now.getTime();count=0;}
      if (++count>60) {await audit('read:ai-finance','denied');const response=reply(429,{error:'ADMIN_RATE_LIMITED'});response.headers.set('Retry-After','60');return response;}
      let filters:AdminAiFinanceFiltersV1;
      try {filters=parseAdminAiFinanceFiltersV1(new URL(request.url),now);} catch {await audit('read:ai-finance','denied');return reply(400,{error:'ADMIN_BAD_REQUEST'});}
      const result=await deps.reads.read(filters);
      await audit('read:ai-finance-'+filters.mode,'allowed',filters.subjectId);
      return reply(200,{kind:'ai-finance-'+filters.mode,...result});
    } catch {
      try {await audit('read:ai-finance','failed');} catch {return reply(503,{error:'ADMIN_AUDIT_UNAVAILABLE'});}
      return reply(503,{error:'ADMIN_AI_FINANCE_UNAVAILABLE'});
    }
  };
}
