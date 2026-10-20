import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const REPO='gycha0109-beep/MyeongHa',WF='seyeon-openrouter-429-readonly-diagnosis-v1.yml';
const paths=['/api/v1/key','/api/v1/credits','/api/v1/models/openai/gpt-oss-20b/endpoints','/api/v1/models/openai/gpt-oss-120b/endpoints'];
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const micro=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1e6?Math.round(x*1e6):null;
export function assert429AdmissionV1(env,h,prior) {
 if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='push'||env.GITHUB_RUN_ATTEMPT!=='1'||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||!/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID??'')||h?.total_count!==1||h.workflow_runs?.length!==1||prior?.id!==39384719879||prior?.conclusion!=='failure'||prior?.head_sha!=='afd500c5f8638517ea24b430be736057c7a0aa6e'||prior?.run_attempt!==1) throw Error('AUDIT_ADMISSION_HOLD');
 const r=h.workflow_runs[0];
 if(String(r.id)!==env.GITHUB_RUN_ID||r.head_sha!==env.GITHUB_SHA||r.head_branch!=='main'||r.event!=='push'||r.run_attempt!==1)throw Error('AUDIT_DUPLICATE_HOLD');
 return {runId:env.GITHUB_RUN_ID,sha:env.GITHUB_SHA};
}
function admit(env=process.env,exec=execFileSync) {
 const get=p=>JSON.parse(exec('gh',['api',p],{env,encoding:'utf8',timeout:15000,maxBuffer:2000000}));
 if(!env.GH_TOKEN)throw Error('AUDIT_TOKEN_HOLD');
 return assert429AdmissionV1(env,get('repos/'+REPO+'/actions/workflows/'+WF+'/runs?event=push&per_page=100'),get('repos/'+REPO+'/actions/runs/39384719879'));
}
async function get(path,key,fetchImpl){
 if(!paths.includes(path))throw Error('ROUTE_DENIED');
 try {
  const r=await fetchImpl('https://openrouter.ai'+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers:{authorization:'Bearer '+key,accept:'application/json'}});
  if(r.status!==200)return {status:r.status,data:null};
  if(!/^application\/json(?:\s*;|$)/iu.test(r.headers.get('content-type')??''))return {status:r.status,data:null};
  const size=Number(r.headers.get('content-length'));
  if(size>256000)return {status:r.status,data:null};
  const text=await r.text();
  if(Buffer.byteLength(text)>256000)return {status:r.status,data:null};
  const parsed=JSON.parse(text);
  return {status:r.status,data:obj(parsed)?parsed.data:null};
 }catch {return {status:null,data:null};}
}
export async function diagnose429V1(key,fetchImpl=fetch) {
 if(typeof key!=='string'||key.trim().length<20)throw Error('AUDIT_KEY_HOLD');
 const [k,c,a,b]=await Promise.all(paths.map(x=>get(x,key.trim(),fetchImpl)));
 const kd=obj(k.data)?k.data:null,cd=obj(c.data)?c.data:null;
 const model=(r,id)=>{
  const d=obj(r.data)&&r.data.id===id?r.data:null;
  const ep=d&&Array.isArray(d.endpoints)?d.endpoints:null;
  return {status:r.status,modelFound:d!==null,endpoints:ep?.length??null,
   responseFormatAdvertised:ep===null?null:ep.filter(x=>obj(x)&&Array.isArray(x.supported_parameters)&&x.supported_parameters.includes('response_format')).length,
   accountEligibilityConfirmed:false};
 };
 return {
  scope:'ACCOUNT_AND_PROVIDER_METADATA_ONLY',inferenceRequests:0,
  keyStatus:k.status,isFreeTier:typeof kd?.is_free_tier==='boolean'?kd.is_free_tier:null,
  isManagementKey:typeof kd?.is_management_key==='boolean'?kd.is_management_key:null,
  keyLimitMicroUsd:micro(kd?.limit),keyRemainingMicroUsd:micro(kd?.limit_remaining),
  keyUsageMicroUsd:micro(kd?.usage),dailyUsageMicroUsd:micro(kd?.usage_daily),
  creditsStatus:c.status,purchasedCreditsMicroUsd:micro(cd?.total_credits),
  accountUsageMicroUsd:micro(cd?.total_usage),
  gptOss20b:model(a,'openai/gpt-oss-20b'),gptOss120b:model(b,'openai/gpt-oss-120b'),
  historical429RootCauseProven:false,invoiceReconciled:false,
  sourceFailureRunId:39384719879,
 };
}
async function main(){
 if(!process.env.RUNNER_TEMP)throw Error('AUDIT_RUNNER_HOLD');
 const execution=admit(),details=await diagnose429V1(process.env.OPENROUTER_API_KEY);
 const report={version:'openrouter-429-readonly-v1',...execution,...details};
 const dir=join(process.env.RUNNER_TEMP,'seyeon-openrouter-429-readonly');
 await mkdir(dir,{recursive:true,mode:0o700});
 await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('OPENROUTER_429_READONLY '+JSON.stringify(report));
 if(report.keyStatus!==200||report.creditsStatus!==200)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)main().catch(()=>{console.error('OPENROUTER_429_DIAGNOSTIC_HOLD');process.exitCode=1;});
