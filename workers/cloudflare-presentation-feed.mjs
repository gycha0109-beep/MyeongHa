import { approvedCloudflareAuthOriginV1, approvedCloudflarePostgresTargetV1 } from './cloudflare-auth-db-api.mjs';
import { parseProductionUserDataRuntimeConfigV1 } from '../apps/api/src/production-user-data-runtime-config.ts';
import { createCloudflareSubjectPoolV1 } from './cloudflare-hyperdrive-subject-pool.mjs';
import { createPublicPresentationReaderV1 } from '../apps/api/src/admin-presentation-public-v1.ts';

export const PUBLIC_PRESENTATION_PATH_V1='/.well-known/myeongha/presentations';
export async function handleCloudflarePresentationFeedV1(request,env,options={}) {
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  const reply=(status,body)=>Response.json(body,{status,headers});
  const url=new URL(request.url);
  if(url.pathname!==PUBLIC_PRESENTATION_PATH_V1||env.MYEONGHA_PUBLIC_PRESENTATIONS_ENABLED!=='true')return reply(404,{error:'NOT_FOUND'});
  if(request.method!=='GET'||url.search)return reply(400,{error:'BAD_REQUEST'});
  let pool;
  try{
    if(approvedCloudflareAuthOriginV1(request,env)===null)return reply(403,{error:'ORIGIN_REQUIRED'});
    const config=parseProductionUserDataRuntimeConfigV1(env);
    if(!approvedCloudflarePostgresTargetV1(config,env))throw Error('DB target unavailable');
    pool=(options.createPool??createCloudflareSubjectPoolV1)(config,env,{maxConnectionsPerRuntime:1});
    const entries=await createPublicPresentationReaderV1(pool)();
    return reply(200,{version:'public-presentations-v1',entries});
  }catch{return reply(503,{error:'PRESENTATIONS_UNAVAILABLE'});}
  finally{try{await pool?.end?.();}catch{/* Closing an optional feed cannot disrupt the application. */}}
}
