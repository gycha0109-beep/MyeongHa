import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Read-only production-stage readback. Never logs secret values, external
// responses, tokens, or Hyperdrive connection strings.
const ID=/^[a-f0-9]{32}$/iu;
const FALSENAMES=[
 'MYEONGHA_ADMIN_PRIVATE_ENABLED',
 'MYEONGHA_ADMIN_CREDIT_COMMANDS_ENABLED',
 'MYEONGHA_ADMIN_RETENTION_ENABLED',
 'MYEONGHA_ADMIN_ANALYTICS_RETENTION_ENABLED',
];
const HYPERDRIVES=[
 ['ADMIN_READ_HYPERDRIVE','MYEONGHA_ADMIN_READ_HYPERDRIVE_ID'],
 ['ADMIN_AUDIT_HYPERDRIVE','MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID'],
];
export function inspectDisabledAdminWorkerSettingsV1(bindings,expected){
 if(!Array.isArray(bindings))throw Error('Admin Worker settings unavailable');
 const byName=new Map();
 for(const binding of bindings){
  if(!binding||typeof binding.name!=='string'||byName.has(binding.name))
   throw Error('Ambiguous Admin Worker binding');
  byName.set(binding.name,binding);
 }
 for(const name of FALSENAMES){
  const item=byName.get(name);
  if(item?.type!=='plain_text'||item.text!=='false')
   throw Error('Admin Worker is not disabled');
 }
 const policy=byName.get('MYEONGHA_ADMIN_HYPERDRIVE_POLICY');
 if(policy?.type!=='plain_text'||policy.text!=='dedicated-admin-verify-full-v1')
  throw Error('Admin Worker isolation policy unavailable');
 for(const [name,key] of HYPERDRIVES){
  const binding=byName.get(name);
  if(binding?.type!=='hyperdrive'||binding.id!==expected[key])
   throw Error('Admin Worker dedicated Hyperdrive mismatch');
 }
 if(!['secret_text','secret'].includes(byName.get('MYEONGHA_SUPABASE_API_KEY')?.type))
  throw Error('Admin Member verification key unavailable');
 if(byName.get('ASSETS')?.type!=='assets')
  throw Error('Admin Worker protected assets unavailable');
 if(byName.get('ADMIN_RATE_LIMITER')?.type!=='ratelimit')
  throw Error('Admin Worker rate limiting unavailable');
 return Object.freeze({worker:'myeongha-admin',disabled:true,originsVerified:true,memberVerificationKeyInstalled:true});
}
export async function verifyDisabledAdminWorkerStageV1(input){
 const {accountId,apiToken,readHyperdriveId,auditHyperdriveId,fetchImpl=fetch}=input;
 if(!ID.test(accountId??'')||!ID.test(readHyperdriveId??'')||
    !ID.test(auditHyperdriveId??'')||readHyperdriveId===auditHyperdriveId||
    typeof apiToken!=='string'||apiToken.length<10)
  throw Error('Admin stage readback configuration unavailable');
 const path='https://api.cloudflare.com/client/v4/accounts/'+accountId+
  '/workers/scripts/myeongha-admin/settings';
 let response;
 try{
  response=await fetchImpl(path,{method:'GET',redirect:'error',headers:{
   Authorization:'Bearer '+apiToken,Accept:'application/json',
  },signal:AbortSignal.timeout(8000)});
 }catch{throw Error('Admin stage readback request failed');}
 if(!response.ok)throw Error('Admin stage readback unavailable');
 let body;
 try{body=await response.json();}catch{throw Error('Invalid Admin stage readback');}
 if(body?.success!==true)throw Error('Invalid Admin stage readback');
 return inspectDisabledAdminWorkerSettingsV1(body.result?.bindings,{
  MYEONGHA_ADMIN_READ_HYPERDRIVE_ID:readHyperdriveId,
  MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID:auditHyperdriveId,
 });
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const result=await verifyDisabledAdminWorkerStageV1({
   accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
   apiToken:process.env.CLOUDFLARE_API_TOKEN,
   readHyperdriveId:process.env.MYEONGHA_ADMIN_READ_HYPERDRIVE_ID,
   auditHyperdriveId:process.env.MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID,
  });
  console.log(JSON.stringify(result));
 }catch{
  console.error('Admin Worker inactive stage readback failed');
  process.exitCode=2;
 }
}
