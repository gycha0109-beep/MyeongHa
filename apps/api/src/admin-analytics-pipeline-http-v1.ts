import { randomUUID } from 'node:crypto';
import type { AdminAuthPortV1 } from './admin-auth-v1.js';
import type { AdminAuditPortV1 } from './admin-read-http-v1.js';
import { parseAdminAnalyticsPeriodV1 } from './admin-analytics-pipeline-v1.js';
import type { AdminAnalyticsDashboardReadPortV1 } from './admin-analytics-pipeline-postgres-v1.js';

export function createAdminAnalyticsDashboardHttpHandlerV1(input:{
  readonly auth:AdminAuthPortV1;readonly audit:AdminAuditPortV1;readonly reads:AdminAnalyticsDashboardReadPortV1;
}) {
  return async(request:Request):Promise<Response>=>{
    const requestId=randomUUID();const at=new Date().toISOString();
    const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Request-Id':requestId,'X-Content-Type-Options':'nosniff','Vary':'Authorization'}});
    let actor:string|null=null;
    const audit=(outcome:'allowed'|'denied'|'failed')=>input.audit.append({requestId,actorAuthUserId:actor,targetRef:null,action:'analytics:dashboard',outcome,at});
    try {
      const owner=await input.auth.verifyOwner(request);actor=owner?.authUserId??null;
      if(actor===null){await audit('denied');return reply(403,{error:'ADMIN_FORBIDDEN'});}
      const url=new URL(request.url);
      if(url.pathname!=='/api/admin/analytics-dashboard'||request.method!=='GET'){await audit('denied');return reply(405,{error:'METHOD_NOT_ALLOWED'});}
      let period;try{period=parseAdminAnalyticsPeriodV1(url);}catch{await audit('denied');return reply(400,{error:'ADMIN_BAD_REQUEST'});}
      const result=await input.reads.read(period);await audit('allowed');return reply(200,result);
    }catch{try{await audit('failed');}catch{return reply(503,{error:'ADMIN_AUDIT_UNAVAILABLE'});}return reply(503,{error:'ADMIN_ANALYTICS_UNAVAILABLE'});}
  };
}
