import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Verify the Cloudflare Hyperdrive configurations actually used by Admin.
// The PostgreSQL login preflight alone does not bind a configured URL to a
// Worker Hyperdrive ID. Never log origins, credentials or API response bodies.
const PROJECT = 'cnsfpcdiyofqvhpcegfc';
const CA_ID = 'd25c14bc-d654-46b8-89cf-5c4baf931771';
const POOLER = 'aws-0-ap-southeast-1.pooler.supabase.com';
const DIRECT = 'db.'+PROJECT+'.supabase.co';
const ID = /^[a-f0-9]{32}$/iu;

export function inspectAdminHyperdriveOriginV1(config,role,id){
 if(config?.id!==id||typeof config.name!=='string'||
    !config.name.startsWith('myeongha-admin-')||
    config.caching?.disabled!==true||
    config.mtls?.sslmode!=='verify-full'||
    config.mtls?.ca_certificate_id!==CA_ID||
    (config.integration!==undefined&&config.integration!==null)){
  throw Error('Dedicated Admin Hyperdrive configuration mismatch');
 }
 const origin=config.origin;
 if(origin?.host!==POOLER&&origin?.host!==DIRECT)
  throw Error('Dedicated Admin origin host mismatch');
 const user=origin.host===POOLER?role+'.'+PROJECT:role;
 if(origin.user!==user||origin.database!=='postgres'||
    origin.port!==5432||!['postgres','postgresql'].includes(origin.scheme))
  throw Error('Dedicated Admin origin principal mismatch');
 return Object.freeze({role,verified:true});
}

export async function verifyAdminHyperdriveOriginsV1(input){
 const {accountId,apiToken,readId,auditId,fetchImpl=fetch}=input;
 if(!ID.test(accountId??'')||!ID.test(readId??'')||
    !ID.test(auditId??'')||readId===auditId||
    typeof apiToken!=='string'||apiToken.length<10)
  throw Error('Dedicated Admin Hyperdrive verification configuration unavailable');
 const expected=[['myeongha_admin_reader',readId],['myeongha_admin_audit_writer',auditId]];
 const roles=[];
 for(const [role,id] of expected){
  let response;
  try{
   response=await fetchImpl('https://api.cloudflare.com/client/v4/accounts/'+
    accountId+'/hyperdrive/configs/'+id,{method:'GET',redirect:'error',
    headers:{Authorization:'Bearer '+apiToken,Accept:'application/json'},
    signal:AbortSignal.timeout(8000)});
  }catch{throw Error('Dedicated Admin Hyperdrive readback unavailable');}
  if(!response.ok)throw Error('Dedicated Admin Hyperdrive readback unavailable');
  let body;
  try{body=await response.json();}catch{
   throw Error('Invalid dedicated Admin Hyperdrive readback');
  }
  if(body?.success!==true)throw Error('Invalid dedicated Admin Hyperdrive readback');
  roles.push(inspectAdminHyperdriveOriginV1(body.result,role,id));
 }
 return Object.freeze({dedicatedHyperdrivesVerified:true,roles});
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const result=await verifyAdminHyperdriveOriginsV1({
   accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
   apiToken:process.env.CLOUDFLARE_API_TOKEN,
   readId:process.env.MYEONGHA_ADMIN_READ_HYPERDRIVE_ID,
   auditId:process.env.MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID,
  });
  console.log(JSON.stringify(result));
 }catch{
  console.error('Dedicated Admin Hyperdrive origin verification failed');
  process.exitCode=2;
 }
}
