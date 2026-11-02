import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readdirSync} from 'node:fs';

const ADMIN_ORIGIN='https://myeongha-admin.gycha0109.workers.dev';
const ACCESS_ORIGIN='https://noisy-star-3d9a.cloudflareaccess.com';
const PROBES=Object.freeze(['/admin/','/admin/index.html','/api/admin/session']);

// Probe the actual emitted JS/CSS through both asset URL forms. Checking only
// index.html cannot prove that static assets do not bypass the Worker gate.
export function adminStageProbePathsV1(assetNames){
 if(!Array.isArray(assetNames)||!assetNames.some(name=>name.endsWith('.js'))||
    assetNames.some(name=>typeof name!=='string'||!/^[A-Za-z0-9_.-]+\.(?:js|css)$/u.test(name)))
  throw Error('Admin stage build assets unavailable');
 return Object.freeze([...PROBES,'/index.html',...assetNames.flatMap(name=>[
  '/admin/assets/'+name,'/assets/'+name,
 ])]);
}
export function readAdminStageProbePathsV1(){
 return adminStageProbePathsV1(readdirSync(new URL('./dist/assets/',import.meta.url))
  .filter(name=>/\.(?:js|css)$/u.test(name)));
}

/** Anonymous smoke only: no Owner cookie, Authorization, or Member token.
 * Access redirects and explicit denial are acceptable. HTTP 200, missing
 * deployment and unexpected errors are not. It never reads response bodies.
 */
export function assertInactiveAdminHttpDenialV1(response,requestUrl){
 const status=response?.status;
 if(status===401||status===403)return true;
 if([301,302,303,307,308].includes(status)){
  const location=response.headers?.get('location');
  let redirect;
  try{redirect=new URL(location,requestUrl);}catch{throw Error('Unverifiable Admin Access redirect');}
  if(redirect.protocol==='https:'&&
     (redirect.origin===ACCESS_ORIGIN||redirect.origin===ADMIN_ORIGIN)&&
     redirect.pathname.startsWith('/cdn-cgi/access/'))return true;
 }
 throw Error('Admin inactive endpoint is not reliably denied');
}
export async function verifyInactiveAdminHttpDenialV1(fetchImpl=fetch,paths=PROBES){
 for(const path of paths){
  if(!path.startsWith('/')||path.startsWith('//')||/[?#\\]/u.test(path))
   throw Error('Invalid Admin stage probe path');
  const url=ADMIN_ORIGIN+path;
  let response;
  try{response=await fetchImpl(url,{
   method:'GET',redirect:'manual',cache:'no-store',credentials:'omit',
   headers:{Accept:'text/html,application/json'},signal:AbortSignal.timeout(8000),
  });}catch{throw Error('Admin inactive endpoint unavailable');}
  assertInactiveAdminHttpDenialV1(response,url);
 }
 return Object.freeze({origin:'myeongha-admin',anonymousEndpointsDenied:paths.length});
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{console.log(JSON.stringify(await verifyInactiveAdminHttpDenialV1(fetch,readAdminStageProbePathsV1())));}
 catch{console.error('Admin inactive HTTP denial verification failed');process.exitCode=2;}
}
