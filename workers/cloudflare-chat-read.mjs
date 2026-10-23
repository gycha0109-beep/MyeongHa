// Owner-scoped generic Character Chat open/history API. Security's
// Se-yeon/mixed-thread fence always runs BEFORE this independent admission.
// This adapter never handles chat turns, Provider calls or assistant reveals.
// Watchtower-Track: ops
import {
  approvedCloudflareAuthOriginV1,
  approvedCloudflareStage5HandoffV1,
  approvedCloudflarePostgresTargetV1,
  approvedCloudflareSameOriginPostV1,
  CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1,
} from './cloudflare-auth-db-api.mjs';
import { createProductionChatReadRuntimeV1 } from '../apps/api/src/production-chat-read-runtime.ts';
import { parseProductionUserDataRuntimeConfigV1 } from '../apps/api/src/production-user-data-runtime-config.ts';
import {
  buildProductionNodePostgresPoolConfigV1,
  createNodePostgresSubjectPoolV1,
} from '../apps/api/src/node-postgres-subject-pool.ts';
import { CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1 } from '../apps/api/src/cloudflare-direct-postgres-candidate.ts';

const CHAT_ROUTES = new Set(['rewrite.chat.open','rewrite.chat.thread']);
const HEADERS = CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function denied() { return new Response(null,{status:404,headers:HEADERS}); }
function unavailable() {
  return Response.json({
    ok:false,
    error:{code:'AUTH_UPSTREAM_UNAVAILABLE',messageKey:'auth.auth_upstream_unavailable',retryable:true},
  },{status:503,headers:HEADERS});
}

export function approvedCloudflareGenericChatRouteV1(route,url) {
  if (!CHAT_ROUTES.has(route?.id) || url.hash !== '') return false;
  if (route.id === 'rewrite.chat.open') {
    return url.pathname === '/api/chat' && url.search === '';
  }
  const id = route.params?.threadId;
  if(typeof id !== 'string' || !UUID.test(id) ||
     url.pathname !== '/api/chat/' + id) return false;
  const keys=[...url.searchParams.keys()];
  if(new Set(keys).size!==keys.length ||
     keys.some(x=>x!=='afterSequenceNo'&&x!=='pageSize')) return false;
  if(url.searchParams.has('afterSequenceNo')){
    const n=url.searchParams.get('afterSequenceNo');
    if (!/^(0|[1-9][0-9]*)$/.test(n) || !Number.isSafeInteger(Number(n))) return false;
  }
  if(url.searchParams.has('pageSize')){
    const n=url.searchParams.get('pageSize');
    if (!/^[1-9][0-9]*$/.test(n) || !Number.isSafeInteger(Number(n)) ||
        Number(n)>50) return false;
  }
  return true;
}

export function fenceCloudflareGenericChatResponseV1(candidate) {
  if(!(candidate instanceof Response) ||
     (candidate.status>=300&&candidate.status<400) ||
     candidate.headers.has('location') || candidate.headers.has('set-cookie') ||
     (candidate.status>=200&&candidate.status<300&&candidate.body===null)) return unavailable();
  if(candidate.body!==null){
    const media=candidate.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()??'';
    if(media!=='application/json' &&
       !(media.startsWith('application/')&&media.endsWith('+json'))) return unavailable();
  }
  const headers=new Headers(candidate.headers);
  for(const key of [...headers.keys()]){
    if(key.toLowerCase().startsWith('access-control-')) headers.delete(key);
  }
  for(const [key,value] of Object.entries(HEADERS)) headers.set(key,value);
  return new Response(candidate.body,{
    status:candidate.status,statusText:candidate.statusText,headers,
  });
}

/** null is never an admission token: the Worker security guard has to run first. */
export async function tryHandleCloudflareGenericChatReadV1(request,bindings,route) {
  if(!CHAT_ROUTES.has(route?.id)) return null;
  const origin=approvedCloudflareAuthOriginV1(request,bindings);
  if(origin===null || !approvedCloudflareStage5HandoffV1(bindings,origin,false)) return null;
  if(!approvedCloudflareGenericChatRouteV1(route,new URL(request.url))) return denied();
  const open=route.id==='rewrite.chat.open';
  const expectedMethod=open?'POST':'GET';
  if(request.method!==expectedMethod){
    return new Response(null,{status:405,headers:{...HEADERS,Allow:expectedMethod}});
  }
  if(open && !approvedCloudflareSameOriginPostV1(request,origin)) return denied();
  let config;
  try {
    config=parseProductionUserDataRuntimeConfigV1(bindings);
    if(!approvedCloudflarePostgresTargetV1(config,bindings)) return unavailable();
    const tls=buildProductionNodePostgresPoolConfigV1(
      config,CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1,
    );
    if(tls.max!==1 || typeof tls.ssl!=='object'||tls.ssl===null||
       tls.ssl.rejectUnauthorized!==true) return unavailable();
  } catch { return unavailable(); }
  let pool,runtime,result;
  try {
    pool=createNodePostgresSubjectPoolV1(config,CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1);
    runtime=createProductionChatReadRuntimeV1({env:bindings,pool});
    result=await runtime.handleRequest({
      request,requestId:crypto.randomUUID(),serverTime:new Date().toISOString(),
    });
  }catch{result=unavailable();}
  let closed=true;
  try{await runtime?.close();}catch{closed=false;}
  try{await pool?.close();}catch{closed=false;}
  return closed?fenceCloudflareGenericChatResponseV1(result):unavailable();
}
