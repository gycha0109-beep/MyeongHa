import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export const REPO='gycha0109-beep/MyeongHa';
export const WORKFLOW='seyeon-openrouter-zdr-json-catalog-v1.yml';
export const SHORTLIST=Object.freeze([
  'nvidia/nemotron-3.5-lightning',
  'qwen/qwen3.5-flash-02-23',
  'z-ai/glm-5.3-flash',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'nvidia/nemotron-3-super-120b-a12b:free',
]);
const API='https://openrouter.ai';
const AUTH_RE=/^[a-f0-9]{40}$/;
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const money=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1000000?Math.round(x*1000000):null;
const price=x=>{
  const n=typeof x==='string'&&x.trim()!==''?Number(x):typeof x==='number'?x:NaN;
  return Number.isFinite(n)&&n>=0&&n<=1?Math.round(n*1e12)/1e6:null;
};
// OpenRouter pricing: endpoint.pricing.prompt/completion are USD PER TOKEN.
// Price in USD per million tokens, preserving six decimal places.
export function assertInventoryAdmissionV1(env,history){
 if(env?.GITHUB_REPOSITORY!==REPO||env.GITHUB_EVENT_NAME!=='push'||
    env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_RUN_ATTEMPT!=='1'||
    !AUTH_RE.test(env.GITHUB_SHA??'')||!/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID??'')||
    history?.total_count!==1||history.workflow_runs?.length!==1)throw Error('INVENTORY_ADMISSION_HOLD');
 const r=history.workflow_runs[0];
 if(String(r.id)!==env.GITHUB_RUN_ID||r.head_sha!==env.GITHUB_SHA||
    r.event!=='push'||r.head_branch!=='main'||r.run_attempt!==1)throw Error('INVENTORY_REPLAY_HOLD');
 return Object.freeze({sha:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID});
}
export function admitInventoryV1(env=process.env,exec=execFileSync){
 if(!env.GH_TOKEN)throw Error('INVENTORY_AUTH_HOLD');
 const data=JSON.parse(exec('gh',['api','repos/'+REPO+'/actions/workflows/'+WORKFLOW+'/runs?event=push&per_page=100'],
  {env,encoding:'utf8',timeout:15000,maxBuffer:2000000}));
 return assertInventoryAdmissionV1(env,data);
}
const allowedPath=path=>path==='/api/v1/endpoints/zdr'||path==='/api/v1/key'||
  path==='/api/v1/credits'||SHORTLIST.some(id=>path==='/api/v1/models/'+id+'/endpoints');
async function onlyGet(path,key,fetchImpl){
 if(!allowedPath(path))throw Error('DISALLOWED_ENDPOINT_PATH');
 try {
  const resp=await fetchImpl(API+path,{method:'GET',redirect:'error',
    signal:AbortSignal.timeout(15000),
    headers:{authorization:'Bearer '+key,accept:'application/json'}});
  if(resp.status!==200)return {status:resp.status,data:null};
  if(!/^application\/json(?:;|$)/i.test(resp.headers.get('content-type')??''))return {status:200,data:null};
  if(Number(resp.headers.get('content-length')??0)>4000000)return {status:200,data:null};
  const raw=await resp.text();
  if(Buffer.byteLength(raw,'utf8')>4000000)return {status:200,data:null};
  const parsed=JSON.parse(raw);
  return {status:200,data:obj(parsed)?parsed.data:null};
 }catch{return {status:null,data:null};}
}
export function findMatchedZdrJsonEndpointsV1(zdr,modelDetails){
 if(!Array.isArray(zdr))return [];
 const byId=new Map();
 for(const model of modelDetails){
  if(!obj(model)||!SHORTLIST.includes(model.id)||!Array.isArray(model.endpoints))continue;
  byId.set(model.id,model.endpoints);
 }
 const matched=[];
 const seen=new Set();
 for(const row of zdr){
  if(!obj(row)||typeof row.model_id!=='string'||!byId.has(row.model_id)||
     !Array.isArray(row.supported_parameters)||!row.supported_parameters.includes('response_format')||
     typeof row.tag!=='string'||row.tag.length<1||row.tag.length>128)continue;
  const endpoints=byId.get(row.model_id);
  for(const ep of endpoints){
   if(!obj(ep)||ep.tag!==row.tag||!Array.isArray(ep.supported_parameters)||
      !ep.supported_parameters.includes('response_format'))continue;
   const k=row.model_id+'|'+row.tag;
   if(seen.has(k))continue;
   seen.add(k);
   const inputCostPerMillionUsd=price(ep.pricing?.prompt);
   const outputCostPerMillionUsd=price(ep.pricing?.completion);
   const completionLimit=Number.isSafeInteger(ep.max_completion_tokens)?ep.max_completion_tokens:null;
   const context=Number.isSafeInteger(ep.context_length)?ep.context_length:null;
   matched.push({
    modelId:row.model_id,providerTag:row.tag,
    supportedResponseFormatBothSources:true,
    zdrInOfficialZdrList:true,
    inputCostPerMillionUsd,outputCostPerMillionUsd,
    contextTokens:context,maxCompletionTokens:completionLimit,
    requestLevelDenyUnverified:true,
    strictJsonSchemaUnverified:true,
    accountRouteUnverified:true,
   });
  }
 }
 return matched.sort((a,b)=>((a.inputCostPerMillionUsd??Infinity)*0.7+(a.outputCostPerMillionUsd??Infinity)*0.3)-
                          ((b.inputCostPerMillionUsd??Infinity)*0.7+(b.outputCostPerMillionUsd??Infinity)*0.3));
}
export async function inspectOpenRouterZdrJsonV1(key,fetchImpl=fetch){
 if(typeof key!=='string'||key.trim().length<20)throw Error('INVALID_INVENTORY_KEY');
 const requests=['/api/v1/endpoints/zdr','/api/v1/key','/api/v1/credits',
   ...SHORTLIST.map(id=>'/api/v1/models/'+id+'/endpoints')];
 const received=await Promise.all(requests.map(p=>onlyGet(p,key.trim(),fetchImpl)));
 const [zdr,keyResult,credits,...modelResult]=received;
 const modelDetails=modelResult.map(x=>obj(x.data)?x.data:null);
 const matched=findMatchedZdrJsonEndpointsV1(zdr.data,modelDetails);
 const catalog=Array.isArray(zdr.data)?zdr.data:[];
 const freemodels=catalog.filter(x=>obj(x)&&typeof x.model_id==='string'&&x.model_id.endsWith(':free')&&
    Array.isArray(x.supported_parameters)&&x.supported_parameters.includes('response_format'));
 const keyRow=obj(keyResult.data)?keyResult.data:null;
 const creditRow=obj(credits.data)?credits.data:null;
 return Object.freeze({
  scope:'GET_ONLY_NOT_A_ROUTE_TEST',
  metadataRequestCount:requests.length,inferenceRequestCount:0,
  zdrListStatus:zdr.status,zdrEndpointsListed:Array.isArray(zdr.data)?zdr.data.length:null,
  freeZdrResponseFormatCandidates:freemodels.map(x=>x.model_id).filter((x,i,a)=>a.indexOf(x)===i).slice(0,30),
  keyStatus:keyResult.status,keyFreeTier:typeof keyRow?.is_free_tier==='boolean'?keyRow.is_free_tier:null,
  keyUsageMicroUsd:money(keyRow?.usage),
  creditStatus:credits.status,purchasedCreditsMicroUsd:money(creditRow?.total_credits),
  accountUsageMicroUsd:money(creditRow?.total_usage),
  shortlistStatuses:SHORTLIST.map((id,i)=>({id,status:modelResult[i].status,
    providerCount:Array.isArray(modelDetails[i]?.endpoints)?modelDetails[i].endpoints.length:null})),
  intersectionCount:matched.length,eligibleByMetadata:matched.slice(0,20),
  routeSupportsDenyNotProven:true,accountCanPurchaseNotProven:true,
  actualJsonSchemaCompatibilityNotProven:true,
  zeroDataRetentionForSelectedRouteMustBeEnforcedOnRequest:true,
  noPreviousFailedModelRetried:true,productionModelUntouched:true,
 });
}
async function main(){
 const env=process.env;
 if(!env.RUNNER_TEMP)throw Error('RUNNER_TEMP_REQUIRED_HOLD');
 const admitted=admitInventoryV1();
 const snapshot=await inspectOpenRouterZdrJsonV1(env.OPENROUTER_API_KEY);
 const report={schema:'openrouter-zdr-json-inventory-v1',...admitted,...snapshot};
 const dir=join(env.RUNNER_TEMP,'seyeon-openrouter-zdr-json-inventory');
 await mkdir(dir,{recursive:true,mode:0o700});
 await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('OPENROUTER_ZDR_JSON_INVENTORY '+JSON.stringify(report));
 if(snapshot.zdrListStatus!==200||snapshot.keyStatus!==200||snapshot.creditStatus!==200)
  process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(()=>{console.error('OPENROUTER_ZDR_JSON_INVENTORY_HOLD');process.exitCode=1;});
