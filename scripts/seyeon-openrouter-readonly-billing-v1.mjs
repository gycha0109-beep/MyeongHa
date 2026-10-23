import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const repo='gycha0109-beep/MyeongHa';
const workflow='seyeon-openrouter-billing-readonly-v1.yml';
const finiteAmount=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1_000_000 ? x : null;
const micro=x=>x===null?null:Math.round(x*1_000_000);
const statusCode=response=>Number.isInteger(response?.status)?response.status:null;

export function assertOneTimeBillingAuditV1(env,history) {
 if(env.GITHUB_REPOSITORY!==repo||env.GITHUB_EVENT_NAME!=='push'||
    env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_RUN_ATTEMPT!=='1'||
    !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA??'')||
    !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID??'')||
    history?.total_count!==1||history.workflow_runs?.length!==1) throw Error('READONLY_AUDIT_ADMISSION_HOLD');
 const r=history.workflow_runs[0];
 if(r.event!=='push'||r.head_branch!=='main'||r.head_sha!==env.GITHUB_SHA||
    r.run_attempt!==1||String(r.id)!==env.GITHUB_RUN_ID) throw Error('READONLY_AUDIT_DUPLICATE_HOLD');
 return Object.freeze({runId:env.GITHUB_RUN_ID,sha:env.GITHUB_SHA});
}
async function get(url,key,fetchImpl) {
 try {
  const result=await fetchImpl(url,{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),
   headers:{authorization:'Bearer '+key,accept:'application/json'},
  });
  const status=statusCode(result);
  if(status!==200)return {status,payload:null};
  if(!/^application\/json(?:;|$)/i.test(result.headers.get('content-type')??''))return {status:200,payload:null};
  const body=await result.text();
  if(Buffer.byteLength(body,'utf8')>65536)return {status:200,payload:null};
  const payload=JSON.parse(body);
  return {status:200,payload};
 }catch {return {status:null,payload:null};}
}
export async function auditOpenRouterBillingV1(key,fetchImpl=fetch){
 if(typeof key!=='string'||key.trim().length<20)throw Error('AUDIT_KEY_HOLD');
 const current=await get('https://openrouter.ai/api/v1/key',key,fetchImpl);
 const data=current.payload?.data;
 const valid=current.status===200&&data&&typeof data==='object'&&!Array.isArray(data);
 const usage=valid?finiteAmount(data.usage):null;
 if(usage===null)throw Error('OPENROUTER_KEY_USAGE_UNAVAILABLE');
 const credits=await get('https://openrouter.ai/api/v1/credits',key,fetchImpl);
 const creditData=credits.payload?.data;
 return Object.freeze({
  scope:'API_KEY_AGGREGATE_NOT_GENERATION_INVOICE',
  apiKeyUsageStatus:current.status,
  apiKeyAggregateUsageMicroUsd:micro(usage),
  apiKeyDailyUsageMicroUsd:micro(finiteAmount(data.usage_daily)),
  apiKeyWeeklyUsageMicroUsd:micro(finiteAmount(data.usage_weekly)),
  apiKeyMonthlyUsageMicroUsd:micro(finiteAmount(data.usage_monthly)),
  apiKeyIsManagementKey:data.is_management_key===true,
  creditsStatus:credits.status,
  accountPurchasedCreditsMicroUsd:micro(finiteAmount(creditData?.total_credits)),
  accountTotalUsageMicroUsd:micro(finiteAmount(creditData?.total_usage)),
  historicalCallAttributionVerified:false,
  actualPerGenerationBillVerified:false,
  inferenceRequestsSent:0,
 });
}
async function main(){
 const env=process.env;
 if(!env.GH_TOKEN||!env.RUNNER_TEMP)throw Error('CI_ACCESS_HOLD');
 const history=JSON.parse(execFileSync('gh',['api',
  'repos/'+repo+'/actions/workflows/'+workflow+'/runs?event=push&per_page=100'],
  {env,encoding:'utf8',timeout:15000,maxBuffer:2_000_000}));
 const execution=assertOneTimeBillingAuditV1(env,history);
 const audit=await auditOpenRouterBillingV1(env.OPENROUTER_API_KEY);
 const report=Object.freeze({schemaVersion:'openrouter-readonly-billing-v1',
  runId:execution.runId,mainSha:execution.sha,...audit});
 const dir=join(env.RUNNER_TEMP,'seyeon-openrouter-billing-readonly');
 await mkdir(dir,{recursive:true,mode:0o700});
 await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n',
  {flag:'wx',mode:0o600});
 console.log('OPENROUTER_READONLY_BILLING '+JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 main().catch(e=>{console.error(['READONLY_AUDIT_ADMISSION_HOLD','READONLY_AUDIT_DUPLICATE_HOLD','OPENROUTER_KEY_USAGE_UNAVAILABLE','CI_ACCESS_HOLD','AUDIT_KEY_HOLD'].includes(e?.message)?e.message:'READONLY_AUDIT_HOLD');process.exitCode=1;});
}
