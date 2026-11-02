import { createCloudflareSubjectPoolV1 } from './cloudflare-hyperdrive-subject-pool.mjs';
// Cloudflare owner-scoped records API adapter. Reuses the Vercel authority
// and its subject/RLS enforcement; never opens Chat/AI or a Vercel proxy.
// Watchtower-Track: ops
import {
  approvedCloudflareAuthOriginV1,
  approvedCloudflareStage5HandoffV1,
  approvedCloudflarePostgresTargetV1,
  approvedCloudflareSameOriginPostV1,
  CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1,
} from './cloudflare-auth-db-api.mjs';
import {
  createProductionLifeRecordReadRuntimeV1,
  createProductionReadingHistoryReadRuntimeV1,
  createProductionMemoryItemsReadRuntimeV1,
} from '../apps/api/src/production-records-read-runtime.ts';
import { parseProductionUserDataRuntimeConfigV1 } from '../apps/api/src/production-user-data-runtime-config.ts';
import { createProductionRequestIdentityVerifierV1 } from '../apps/api/src/production-request-identity-verifier.ts';
import { handleSeyeonMemberMemoryGrantStatusRequestV1 } from '../apps/api/src/seyeon-member-memory-grant-status-http-v1.ts';
import {
  buildProductionNodePostgresPoolConfigV1,
} from '../apps/api/src/node-postgres-subject-pool.ts';
import { CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1 } from '../apps/api/src/cloudflare-direct-postgres-candidate.ts';

const SECURITY_HEADERS=CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1;
const RECORD_IDS=new Set(['rewrite.life-record','rewrite.readings','rewrite.memories',
  'rewrite.seyeon.memory.grant.status']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function denied() {
  return new Response(null,{status:404,headers:SECURITY_HEADERS});
}
function unavailable() {
  return Response.json({
    ok:false,
    error:{code:'AUTH_UPSTREAM_UNAVAILABLE',messageKey:'auth.auth_upstream_unavailable',retryable:true},
  },{status:503,headers:SECURITY_HEADERS});
}

export function allowedCloudflareRecordsReadQueryV1(route,url) {
  if (!RECORD_IDS.has(route?.id)) return false;
  if (url.hash!=='') return false;
  // The current-grant query accepts only the exact original Memory URL.
  // It never accepts an owner/Grant selector or a Vercel rewrite marker.
  if (route.id==='rewrite.seyeon.memory.grant.status') return url.search==='';
  if (url.search==='') return true;
  const keys=[...url.searchParams.keys()];
  if (new Set(keys).size!==keys.length || keys.some(key=>
    !['cursor','pageSize',...(route.id==='rewrite.readings'?['readingId']:[])].includes(key))) return false;
  const values=[...url.searchParams.values()];
  if (values.some(value=>value.length===0||value.length>2048)) return false;
  const recordId=url.searchParams.get('readingId');
  if (recordId!==null) return keys.length===1 && UUID.test(recordId);
  const pageSize=url.searchParams.get('pageSize');
  if (pageSize!==null &&
      (!/^[1-9][0-9]*$/.test(pageSize)||Number(pageSize)>50)) return false;
  // The existing collection runtime remains authoritative for opaque cursor
  // decoding, owner scope, expiry and precise error mapping.
  return true;
}

export function fenceCloudflareRecordsResponseV1(candidate) {
  if (!(candidate instanceof Response) || candidate.status>=300 && candidate.status<400 ||
      candidate.headers.has('location') || candidate.headers.has('set-cookie')) return unavailable();
  if (candidate.body===null && candidate.status>=200 && candidate.status<300) return unavailable();
  if(candidate.body!==null){
    const type=candidate.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()??'';
    if(type!=='application/json' && !(type.startsWith('application/')&&type.endsWith('+json'))) return unavailable();
  }
  const headers=new Headers(candidate.headers);
  for(const key of [...headers.keys()]) if(key.toLowerCase().startsWith('access-control-')) headers.delete(key);
  for(const [k,v] of Object.entries(SECURITY_HEADERS)) headers.set(k,v);
  return new Response(candidate.body,{status:candidate.status,statusText:candidate.statusText,headers});
}

/** null retains the original deny-first 404 while Auth/DB is unadmitted. */
export async function tryHandleCloudflareApprovedRecordsV1(request,bindings,route) {
  if(!RECORD_IDS.has(route?.id)) return null;
  const origin=approvedCloudflareAuthOriginV1(request,bindings);
  if(origin===null) return null;
  if(!approvedCloudflareStage5HandoffV1(bindings,origin,false)) return null;
  if(!allowedCloudflareRecordsReadQueryV1(route,new URL(request.url))) return denied();
  const readings=route.id==='rewrite.readings';
  const expected=readings?'GET, POST':'GET';
  if (request.method!=='GET' && (!readings || request.method!=='POST')) {
    return new Response(null,{status:405,headers:{...SECURITY_HEADERS,Allow:expected}});
  }
  if(request.method==='POST' && !approvedCloudflareSameOriginPostV1(request,origin)) return denied();
  let config;
  try{
    config=parseProductionUserDataRuntimeConfigV1(bindings);
    if(!approvedCloudflarePostgresTargetV1(config,bindings)) return unavailable();
    const tls=buildProductionNodePostgresPoolConfigV1(
      config,CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1,
    );
    if(tls.max!==1||!tls.ssl||typeof tls.ssl!=='object'||
       tls.ssl.rejectUnauthorized!==true) return unavailable();
  }catch{return unavailable();}
  let pool,runtime,result;
  try{
    const grantStatus=route.id==='rewrite.seyeon.memory.grant.status';
    const verifier=grantStatus
      ?createProductionRequestIdentityVerifierV1({config})
      :null;
    pool=createCloudflareSubjectPoolV1(config,bindings, CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1);
    const requestInput={request,requestId:crypto.randomUUID(),serverTime:new Date().toISOString()};
    if(grantStatus){
      result=await handleSeyeonMemberMemoryGrantStatusRequestV1({
        ...requestInput,identityEvidenceVerifier:verifier,pool,
      });
    }else{
      runtime=route.id==='rewrite.life-record'
        ?createProductionLifeRecordReadRuntimeV1({env:bindings,pool})
        :readings
          ?createProductionReadingHistoryReadRuntimeV1({env:bindings,pool})
          :createProductionMemoryItemsReadRuntimeV1({env:bindings,pool});
      result=await runtime.handleRequest(requestInput);
    }
  }catch{result=unavailable();}
  let closed=true;
  try{await runtime?.close();}catch{closed=false;}
  try{await pool?.close();}catch{closed=false;}
  if(!closed)return unavailable();
  return fenceCloudflareRecordsResponseV1(result);
}
