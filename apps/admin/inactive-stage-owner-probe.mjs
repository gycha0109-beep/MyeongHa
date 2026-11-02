import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertInactiveAdminHttpDenialV1,readAdminStageProbePathsV1} from './inactive-stage-http-probe.mjs';

const ORIGIN='https://myeongha-admin.gycha0109.workers.dev';
function token(value){
 return typeof value==='string'&&value.length<=16384&&
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value);
}
/** Ephemeral real Access sessions supplied only through the process environment.
 * This verifies the inactive Access boundary, never Member auth or DB access.
 * It is deliberately separate from unattended deployment: no stored Owner session
 * is created and a synthetic JWT cannot substitute for a real Access login. */
export async function verifyInactiveAdminOwnerBoundaryV1({ownerAccessJwt,deniedAccessJwt,paths,fetchImpl=fetch}){
 if(!token(ownerAccessJwt)||!token(deniedAccessJwt)||ownerAccessJwt===deniedAccessJwt||
    !Array.isArray(paths)||paths.length===0)throw Error('Admin Access sessions unavailable');
 for(const path of paths){
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||/[?#\\]/u.test(path))
   throw Error('Invalid Admin stage probe path');
  const url=ORIGIN+path;
  for(const [owner,jwt]of [[true,ownerAccessJwt],[false,deniedAccessJwt]]){
   let response;
   try{response=await fetchImpl(url,{method:'GET',redirect:'manual',cache:'no-store',credentials:'omit',
    headers:{Accept:'application/json','cf-access-jwt-assertion':jwt,Cookie:'CF_Authorization='+jwt},
    signal:AbortSignal.timeout(8000)});}catch{throw Error('Admin Access boundary unavailable');}
   if(!owner){assertInactiveAdminHttpDenialV1(response,url);continue;}
   // Generic 503s, HTML, or successful assets are not evidence of verified Owner access.
   if(response.status!==503||response.headers.get('cache-control')!=='no-store'||
      !response.headers.get('content-type')?.startsWith('application/json'))
    throw Error('Admin Owner inactive boundary unverified');
   const reader=response.body?.getReader();if(!reader)throw Error('Admin Owner inactive boundary unverified');
   let length=0;const chunks=[];
   try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;
    if(length>512){await reader.cancel();throw Error('Admin Owner inactive boundary unverified');}chunks.push(part.value);}}
   finally{reader.releaseLock();}
   let body;
   try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Admin Owner inactive boundary unverified');}
   if(body?.error!=='ADMIN_PRIVATE_DISABLED'||Object.keys(body).length!==1)
    throw Error('Admin Owner inactive boundary unverified');
  }
 }
 return Object.freeze({ownerAccessVerified:true,nonOwnerAccessDenied:true,endpointsVerified:paths.length,
  memberAuthenticationVerified:false,productionReadsVerified:false,activationEnabled:false});
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{console.log(JSON.stringify(await verifyInactiveAdminOwnerBoundaryV1({
  ownerAccessJwt:process.env.MYEONGHA_ADMIN_STAGE_OWNER_ACCESS_JWT,
  deniedAccessJwt:process.env.MYEONGHA_ADMIN_STAGE_DENIED_ACCESS_JWT,
  paths:readAdminStageProbePathsV1(),
 })));}catch{console.error('Admin inactive Owner boundary verification failed');process.exitCode=2;}
}
