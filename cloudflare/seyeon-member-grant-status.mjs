// Watchtower-Track: security
// Read-only Cloudflare GET of the current original Memory Grant. No
// Vercel proxy, no Memory content read, and no positive grant mutation.
import {
  approvedCloudflareAuthOriginV1,
  approvedCloudflareStage5HandoffV1,
  approvedCloudflarePostgresTargetV1,
  CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1,
} from '../workers/cloudflare-auth-db-api.mjs';
import { createCloudflareSubjectPoolV1 } from '../workers/cloudflare-hyperdrive-subject-pool.mjs';
import { fenceCloudflareRecordsResponseV1 } from '../workers/cloudflare-records-api.mjs';
import { handleSeyeonMemberMemoryGrantStatusRequestV1 } from '../apps/api/src/seyeon-member-memory-grant-status-http-v1.ts';
import { createProductionRequestIdentityVerifierV1 } from '../apps/api/src/production-request-identity-verifier.ts';
import { parseProductionUserDataRuntimeConfigV1 } from '../apps/api/src/production-user-data-runtime-config.ts';
import { buildProductionNodePostgresPoolConfigV1 } from '../apps/api/src/node-postgres-subject-pool.ts';
import { CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1 } from '../apps/api/src/cloudflare-direct-postgres-candidate.ts';

const HEADERS=CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PATH=/^\/api\/memories\/([^/]+)\/grants\/seyeon$/u;

function unavailable(){
  return Response.json({ok:false,error:{code:'GRANT_STATUS_UNAVAILABLE',retryable:false}},
    {status:503,headers:HEADERS});
}
function denied(){
  return new Response(null,{status:404,headers:HEADERS});
}

export async function handleCloudflareSeyeonMemberGrantStatusV1(request,env){
  const url=new URL(request.url);
  const match=PATH.exec(url.pathname);
  if(request.method!=='GET'||url.search!==''||url.hash!==''||
      match===null||!UUID.test(match[1]??'')) return denied();
  const origin=approvedCloudflareAuthOriginV1(request,env);
  if(origin===null||!approvedCloudflareStage5HandoffV1(env,origin,false)) return denied();

  let config;
  try{
    config=parseProductionUserDataRuntimeConfigV1(env);
    if(!approvedCloudflarePostgresTargetV1(config,env)) return unavailable();
    const tls=buildProductionNodePostgresPoolConfigV1(
      config,CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1);
    if(tls.max!==1||!tls.ssl||typeof tls.ssl!=='object'||
       tls.ssl.rejectUnauthorized!==true) return unavailable();
  }catch{return unavailable();}

  let pool;
  let response;
  try{
    pool=createCloudflareSubjectPoolV1(config,env,CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1);
    const identityEvidenceVerifier=createProductionRequestIdentityVerifierV1({config});
    response=await handleSeyeonMemberMemoryGrantStatusRequestV1({
      request,requestId:crypto.randomUUID(),serverTime:new Date().toISOString(),
      identityEvidenceVerifier,pool,
    });
  }catch{response=unavailable();}
  try{await pool?.close();}catch{return unavailable();}
  return fenceCloudflareRecordsResponseV1(response);
}
