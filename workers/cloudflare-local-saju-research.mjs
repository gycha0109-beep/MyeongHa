// Loopback-only source-grounded research. No official issue, payment or Grant.
import { approvedCloudflareAuthOriginV1, approvedCloudflareSameOriginPostV1 } from './cloudflare-auth-db-api.mjs';
import { createLocalAuthSubjectPoolV1, isIsolatedLocalAuthRequestV1, localGoTrueMemberFetchV1, parseLocalAuthRuntimeConfigV1 } from '../apps/api/src/local-auth-dev-runtime.ts';
import { createProductionRequestIdentityVerifierV1 } from '../apps/api/src/production-request-identity-verifier.ts';
import { readBoundCurrentBirthProfileV1 } from '../apps/api/src/current-subject-saju-calculation-http.ts';
import { CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1 } from '../apps/api/src/cloudflare-direct-postgres-candidate.ts';

const HEADERS = { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' };
const fail = (status,code) => Response.json({ok:false,error:{code}}, {status,headers:HEADERS});
export async function tryHandleLocalSajuResearchV1(request, bindings, route) {
  if(route?.id!=='api.me.saju.local-research')return null;
  if(!isIsolatedLocalAuthRequestV1(request,bindings))return fail(404,'NOT_FOUND');
  const origin=approvedCloudflareAuthOriginV1(request,bindings);
  if(request.method!=='POST')return new Response(null,{status:405,headers:{...HEADERS,Allow:'POST'}});
  if(new URL(request.url).search||!approvedCloudflareSameOriginPostV1(request,origin))return fail(404,'NOT_FOUND');
  if(bindings.MYEONGHA_LOCAL_SAJU_RESEARCH_ORIGIN!=='http://127.0.0.1:15435'||
    typeof bindings.MYEONGHA_LOCAL_SAJU_RESEARCH_BEARER!=='string'||
    bindings.MYEONGHA_LOCAL_SAJU_RESEARCH_BEARER.length<32)return fail(503,'LOCAL_RESEARCH_UNAVAILABLE');
  let config,pool;
  try{
    config=parseLocalAuthRuntimeConfigV1(bindings);
    const verifier=createProductionRequestIdentityVerifierV1({config:config.userData,memberFetchImpl:localGoTrueMemberFetchV1(config)});
    const identity=await verifier.verifyRequestIdentity(request);
    if(!identity)return fail(401,'AUTH_REQUIRED');
    if(+(request.headers.get('content-length')??0)>2048)return fail(413,'REQUEST_TOO_LARGE');
    const raw=await request.text();
    if(raw.length>2048)return fail(413,'REQUEST_TOO_LARGE');
    let data;
    try{data=JSON.parse(raw)}catch{return fail(400,'INVALID_REQUEST')}
    if(!data||typeof data!=='object'||Array.isArray(data)||
      !['annual_monthly','compatibility'].includes(data.kind)||
      (data.kind==='compatibility'&&(data.consent!==true||!data.targetBirth)))return fail(400,'INVALID_REQUEST');
    pool=createLocalAuthSubjectPoolV1(config,CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1);
    const profile=await readBoundCurrentBirthProfileV1({pool,verifiedEvidence:identity});
    const payload={kind:data.kind,subjectBirth:profile.currentRevision.input,
      ...(data.kind==='compatibility'?{targetBirth:data.targetBirth,consent:true}:{})};
    const upstream=await fetch('http://127.0.0.1:15435/internal/research',{
      method:'POST',headers:{Authorization:'Bearer '+bindings.MYEONGHA_LOCAL_SAJU_RESEARCH_BEARER,'Content-Type':'application/json'},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),
    });
    if(upstream.status!==200)return fail(422,'LOCAL_RESEARCH_INPUT_OR_SOURCE_UNAVAILABLE');
    const result=await upstream.json();
    if(result?.ok!==true||result.lifecycle!=='internal_research_only')return fail(503,'LOCAL_RESEARCH_UNAVAILABLE');
    return Response.json(result,{status:200,headers:HEADERS});
  }catch{return fail(503,'LOCAL_RESEARCH_UNAVAILABLE')}
  finally{try{await pool?.close()}catch{}}
}
