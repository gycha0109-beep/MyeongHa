import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const ACCOUNT_ID='410d3f82ed3ccc66609a2b698803859b';
const APP_ID='3a376a53-ad4d-4a07-9fa0-cd55cb0cb62f';
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * Confirm a *real* denied Cloudflare Access login for this app.
 * Cloudflare does not issue an app JWT to a user rejected at the edge.
 * Use authentication logs instead of inventing a "denied user's JWT".
 *
 * Only status/count evidence is returned; do not print user emails, Access
 * sessions, bearer tokens, remote response bodies or request URLs.
 */
export async function verifyInactiveAdminDeniedLoginLogV1({
 accountId,apiToken,ownerEmail,nonOwnerEmail,since,until,
 fetchImpl=fetch,
}){
 if(accountId!==ACCOUNT_ID||typeof apiToken!=='string'||apiToken.length<10||
    typeof ownerEmail!=='string'||!EMAIL.test(ownerEmail)||
    typeof nonOwnerEmail!=='string'||!EMAIL.test(nonOwnerEmail)||
    ownerEmail.toLowerCase()===nonOwnerEmail.toLowerCase())
  throw Error('Real non-Owner Access test inputs unavailable');
 const after=Date.parse(since??''),before=Date.parse(until??'');
 if(!Number.isFinite(after)||!Number.isFinite(before)||
    before<=after||before-after>30*60*1000)
  throw Error('Real non-Owner Access test window unavailable');
 const url=new URL('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT_ID+'/access/logs/access_requests');
 url.searchParams.set('limit','100');
 url.searchParams.set('direction','desc');
 url.searchParams.set('since',new Date(after).toISOString());
 url.searchParams.set('until',new Date(before).toISOString());
 url.searchParams.set('email',nonOwnerEmail);
 url.searchParams.set('emailOp','eq');
 let result;
 try{
  const response=await fetchImpl(url.toString(),{
   method:'GET',redirect:'manual',cache:'no-store',
   headers:{Authorization:'Bearer '+apiToken,Accept:'application/json'},
   signal:AbortSignal.timeout(8000),
  });
  if(!response.ok||response.status>=300&&response.status<400)
   throw Error('Access log not available');
  result=await response.json();
 }catch{throw Error('Admin denied Access login log unavailable');}
 if(result?.success!==true||!Array.isArray(result.result))
  throw Error('Admin denied Access login log unavailable');
 const matches=result.result.filter(event=>{
  const date=Date.parse(event?.created_at??'');
  return event?.app_uid===APP_ID&&event?.action==='login'&&
    typeof event.user_email==='string'&&
    event.user_email.toLowerCase()===nonOwnerEmail.toLowerCase()&&
    Number.isFinite(date)&&date>=after&&date<=before;
 });
 if(matches.some(x=>x.allowed===true))
  throw Error('Admin non-Owner Access unexpectedly allowed');
 if(!matches.some(x=>x.allowed===false))
  throw Error('Real non-Owner Access denial not yet observed');
 return Object.freeze({
  nonOwnerAccessLoginDenied:true,
  deniedLoginEvents:matches.filter(x=>x.allowed===false).length,
  appVerified:true,
  identityVerifiedByCloudflareLogs:true,
  ownerAccessVerified:false,
  memberAuthenticationVerified:false,
  productionReadsVerified:false,
  activationEnabled:false,
 });
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  console.log(JSON.stringify(await verifyInactiveAdminDeniedLoginLogV1({
   accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
   apiToken:process.env.CLOUDFLARE_API_TOKEN,
   ownerEmail:process.env.MYEONGHA_ADMIN_OWNER_EMAIL,
   nonOwnerEmail:process.env.MYEONGHA_ADMIN_STAGE_NONOWNER_EMAIL,
   since:process.env.MYEONGHA_ADMIN_STAGE_NONOWNER_ATTEMPT_SINCE,
   until:process.env.MYEONGHA_ADMIN_STAGE_NONOWNER_ATTEMPT_UNTIL,
  })));
 }catch{
  console.error('Real non-Owner Access denial unverified');
  process.exitCode=2;
 }
}
