import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectDisabledAdminWorkerSettingsV1} from './inactive-stage-readback.mjs';

const FLAGS=['MYEONGHA_ADMIN_PRIVATE_ENABLED','MYEONGHA_ADMIN_CREDIT_COMMANDS_ENABLED',
  'MYEONGHA_ADMIN_RETENTION_ENABLED','MYEONGHA_ADMIN_ANALYTICS_RETENTION_ENABLED'];
const FORBIDDEN=['ADMIN_COMMAND_HYPERDRIVE','ADMIN_RETENTION_HYPERDRIVE','ADMIN_ANALYTICS_RETENTION_HYPERDRIVE'];
const REQUIRED=['ADMIN_READ_HYPERDRIVE','ADMIN_AUDIT_HYPERDRIVE'];
const ID=/^[a-f0-9]{32}$/iu;

function assertNoWriteOrigins(bindings) {
  if(bindings.some(value=>FORBIDDEN.includes(value?.name??value?.binding)))
    throw Error('Read-only Admin deployment contains a privileged DB binding');
}

/** A deliberate, separate release profile; the default staging generator remains inactive. */
export function prepareAdminReadOnlyReleaseV1(config,mode) {
  if(!['readonly','disabled'].includes(mode)) throw Error('Unknown Admin release mode');
  if(config?.name!=='myeongha-admin'||config.workers_dev!==true||
      config.preview_urls!==false||config.routes!==undefined||config.route!==undefined||
      config.assets?.binding!=='ASSETS'||config.assets?.run_worker_first!==true||
      config.vars?.MYEONGHA_ADMIN_HYPERDRIVE_POLICY!=='dedicated-admin-verify-full-v1')
    throw Error('Admin isolated deployment configuration unavailable');
  if(!Array.isArray(config.hyperdrive)||config.hyperdrive.length!==2||
      REQUIRED.some(name=>config.hyperdrive.filter(b=>b.binding===name&&ID.test(b.id??'')).length!==1))
    throw Error('Admin Reader/Audit origins are not exclusively bound');
  assertNoWriteOrigins(config.hyperdrive);
  if(FLAGS.some(name=>config.vars[name]!=='false'))
    throw Error('Admin release requires an initially disabled configuration');
  if(!Array.isArray(config.ratelimits)||!config.ratelimits.some(b=>b.name==='ADMIN_RATE_LIMITER'))
    throw Error('Admin release missing rate limiter');
  return {...config,vars:{...config.vars,MYEONGHA_ADMIN_PRIVATE_ENABLED:mode==='readonly'?'true':'false'}};
}

/** Live readback requires exactly Reader/Audit and never exposes credential values. */
export function inspectAdminReadOnlyReleaseV1(bindings,expected,mode) {
  if(!['readonly','disabled'].includes(mode)||!Array.isArray(bindings))throw Error('Unknown Admin release readback');
  assertNoWriteOrigins(bindings);
  const privateFlag=bindings.find(b=>b.name==='MYEONGHA_ADMIN_PRIVATE_ENABLED');
  if(privateFlag?.type!=='plain_text'||privateFlag.text!==(mode==='readonly'?'true':'false'))
    throw Error('Admin read-only activation mismatch');
  const normalized=bindings.map(b=>b.name==='MYEONGHA_ADMIN_PRIVATE_ENABLED'?{...b,text:'false'}:b);
  const verified=inspectDisabledAdminWorkerSettingsV1(normalized,expected);
  return Object.freeze({...verified,disabled:mode==='disabled',readOnly:mode==='readonly'});
}

export async function verifyAdminReadOnlyReleaseV1({accountId,apiToken,readHyperdriveId,auditHyperdriveId,mode,fetchImpl=fetch}) {
  if(!ID.test(accountId??'')||!ID.test(readHyperdriveId??'')||!ID.test(auditHyperdriveId??'')||
      readHyperdriveId===auditHyperdriveId||typeof apiToken!=='string'||apiToken.length<10)
    throw Error('Admin deployment readback configuration unavailable');
  const url='https://api.cloudflare.com/client/v4/accounts/'+accountId+'/workers/scripts/myeongha-admin/settings';
  let response;
  try{response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{
    Authorization:'Bearer '+apiToken,Accept:'application/json',
  },signal:AbortSignal.timeout(8000)});}catch{throw Error('Admin release readback request failed');}
  if(!response.ok)throw Error('Admin release readback unavailable');
  let body;
  try{body=await response.json();}catch{throw Error('Invalid Admin release readback');}
  if(body?.success!==true)throw Error('Invalid Admin release readback');
  return inspectAdminReadOnlyReleaseV1(body.result?.bindings,{
    MYEONGHA_ADMIN_READ_HYPERDRIVE_ID:readHyperdriveId,
    MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID:auditHyperdriveId,
  },mode);
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  try{
    const [operation,...args]=process.argv.slice(2);
    if(operation==='prepare') {
      const [inputPath,outputPath,mode]=args;
      if(!inputPath||!outputPath)throw Error('Missing release config');
      const config=prepareAdminReadOnlyReleaseV1(JSON.parse(readFileSync(inputPath,'utf8')),mode);
      writeFileSync(outputPath,JSON.stringify(config,null,2)+'\n',{flag:'wx'});
      console.log(JSON.stringify({worker:config.name,mode,commandConnections:0}));
    }else if(operation==='verify'){
      const [mode]=args;
      console.log(JSON.stringify(await verifyAdminReadOnlyReleaseV1({
        accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
        apiToken:process.env.CLOUDFLARE_API_TOKEN,
        readHyperdriveId:process.env.MYEONGHA_ADMIN_READ_HYPERDRIVE_ID,
        auditHyperdriveId:process.env.MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID,mode,
      })));
    }else throw Error('Invalid Admin release action');
  }catch{
    console.error('Admin read-only release preflight/readback failed');
    process.exitCode=2;
  }
}
