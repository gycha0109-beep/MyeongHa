import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
/**
 * Verify the LIVE dedicated Cloudflare Access policy before staging an Admin
 * Worker. Fail closed on missing or broad access. Never logs API tokens,
 * policy owner addresses or remote error bodies.
 */
const HOST='myeongha-admin.gycha0109.workers.dev';
const APP_NAME='MyeongHa Admin Owner Only';
const EXPECTED_ACCOUNT_ID='410d3f82ed3ccc66609a2b698803859b';
const APP_ID='3a376a53-ad4d-4a07-9fa0-cd55cb0cb62f';
const ACCOUNT=/^[a-f0-9]{32}$/iu;
const ID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const AUD=/^[a-f0-9]{64}$/iu;

export async function verifyAdminAccessPolicyV1(input){
 const {accountId,apiToken,audience,ownerEmail,readHyperdriveId,fetchImpl=fetch}=input;
 if(!ACCOUNT.test(accountId??'')||typeof apiToken!=='string'||apiToken.length<10||
    !AUD.test(audience??'')||typeof ownerEmail!=='string'||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(ownerEmail))
   throw Error('Dedicated Admin Access verification configuration unavailable');
 if(accountId!==EXPECTED_ACCOUNT_ID)
   throw Error('Dedicated Admin Access account mismatch');
 const api='https://api.cloudflare.com/client/v4';
 const base=api+'/accounts/'+accountId+'/access/apps';
 // Probe only safe status categories with the SAME deployment credential. This
 // does not reveal a token, response body, owner identity, or resource data.
 async function probe(path,tokenStatus=false){
  try{
   const res=await fetchImpl(path,{method:'GET',redirect:'error',
    headers:{Authorization:'Bearer '+apiToken,Accept:'application/json'},
    signal:AbortSignal.timeout(5000)});
   if(!res.ok)return 'http_'+res.status;
   if(!tokenStatus)return 'http_'+res.status;
   try{
    const data=await res.json();
    const status=data?.success===true?data?.result?.status:null;
    return ['active','disabled','expired'].includes(status)?status:'unverified';
   }catch{return 'invalid_response';}
  }catch{return 'unavailable';}
 }
 async function read(path,stage,asArray=true){
  let res;
  try{res=await fetchImpl(path,{method:'GET',redirect:'error',
   headers:{Authorization:'Bearer '+apiToken,Accept:'application/json'},
   signal:AbortSignal.timeout(8000)});}catch{
   throw Error('Dedicated Admin Access '+stage+' request unavailable');
  }
  // Include only the endpoint category and HTTP status, never remote bodies or credentials.
  if(!res.ok){
   if(stage==='application'&&res.status===403){
    const [user,account,hyperdrive]=await Promise.all([
     probe(api+'/user/tokens/verify',true),
     probe(api+'/accounts/'+accountId+'/tokens/verify',true),
     ACCOUNT.test(readHyperdriveId??'')?
      probe(api+'/accounts/'+accountId+'/hyperdrive/configs/'+readHyperdriveId):
      Promise.resolve('not_checked'),
    ]);
    throw Error('Dedicated Admin Access application HTTP 403; credential diagnostics '+
     'user_verify='+user+', account_verify='+account+', reader_hyperdrive='+hyperdrive);
   }
   throw Error('Dedicated Admin Access '+stage+' HTTP '+res.status);
  }
  let value;
  try{value=await res.json();}catch{throw Error('Invalid Admin Access '+stage+' response');}
  if(value?.success!==true||!(asArray?Array.isArray(value.result):
    value.result!==null&&typeof value.result==='object'&&!Array.isArray(value.result)))
   throw Error('Invalid Admin Access '+stage+' response');
  return value.result;
 }
 // The Access app is provisioned with a known ID. Fetching that exact object avoids
 // interpreting an unrelated/filtered list response as a token-permission failure.
 const app=await read(base+'/'+APP_ID,'application',false);
 if(app.id!==APP_ID||app.name!==APP_NAME||app.domain!==HOST||app.type!=='self_hosted')
   throw Error('Dedicated Admin Access application identity mismatch');
 if(app.aud!==audience)throw Error('Dedicated Admin Access audience mismatch');
 const policies=await read(base+'/'+app.id+'/policies','policies');
 // Report a safe reason when a provisioned Owner identity differs; no email is logged.
 if(policies.length===1&&policies[0]?.include?.length===1&&
    policies[0].include[0]?.email?.email&&
    policies[0].include[0].email.email!==ownerEmail)
   throw Error('Dedicated Admin Access Owner email mismatch');
 if(policies.length!==1||!ID.test(policies[0]?.id??'')||
    policies[0].decision!=='allow'||policies[0].name!=='Owner email only'||
    !Array.isArray(policies[0].include)||policies[0].include.length!==1||
    !policies[0].include[0]?.email||
    Object.keys(policies[0].include[0]).length!==1||
    Object.keys(policies[0].include[0].email).length!==1||
    policies[0].include[0].email.email!==ownerEmail||
    !Array.isArray(policies[0].exclude)||policies[0].exclude.length!==0||
    !Array.isArray(policies[0].require)||policies[0].require.length!==0||
    !Array.isArray(app.policies)||app.policies.length!==1||
    app.policies[0]?.id!==policies[0].id)
   throw Error('Dedicated Admin Access Owner allow policy unavailable');
 return Object.freeze({appVerified:true,ownerOnlyVerified:true});
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const result=await verifyAdminAccessPolicyV1({
   accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
   apiToken:process.env.CLOUDFLARE_API_TOKEN,
   audience:process.env.MYEONGHA_ADMIN_ACCESS_AUD,
   ownerEmail:process.env.MYEONGHA_ADMIN_OWNER_EMAIL,
   readHyperdriveId:process.env.MYEONGHA_ADMIN_READ_HYPERDRIVE_ID,
  });
  console.log(JSON.stringify(result));
 }catch(error){
  const message=String(error?.message??'');
  // Only locally defined, non-sensitive error categories can reach CI logs.
  console.error(/^Dedicated Admin Access|^Invalid Admin Access/u.test(message)
   ?message:'Dedicated Admin Access Owner-policy readback failed');
  process.exitCode=2;
 }
}
