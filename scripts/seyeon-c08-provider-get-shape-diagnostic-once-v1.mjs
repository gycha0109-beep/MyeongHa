/**
 * C08 provider GET shape diagnosis after first snapshot #39998680318:
 * 4 HTTP 200 but completeMetadataRead=false. Re-read ONLY four official GETs,
 * reveal only data shape and aggregate counts. Never store upstream JSON.
 * New one-shot protected-main marker; no model inference or retry.
 */
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {SEYEON_C08_PROVIDER_MODELS_V1 as MODELS}
  from './seyeon-c08-exact-provider-metadata-offline-v1.mjs';

export const C08_DIAG_REPO_V1='gycha0109-beep/MyeongHa';
export const C08_DIAG_WORKFLOW_V1='seyeon-c08-provider-get-shape-diagnostic-once-v1.yml';
export const C08_DIAG_MARKER_V1='.github/seyeon-c08-provider-get-shape-diagnostic-once.trigger';
const shaPattern=/^[a-f0-9]{40}$/u;
const isObject=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const shape=x=>Array.isArray(x)?'array':isObject(x)?'object':x===null?'null':typeof x;

/** This is a new workflow. Original readback is never re-run. */
export function assertSeyeonC08DiagnosticOnceV1(env,history,commit){
  if(env?.GITHUB_REPOSITORY!==C08_DIAG_REPO_V1||
    env.GITHUB_EVENT_NAME!=='push'||
    env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_RUN_ATTEMPT!=='1'||
    !shaPattern.test(env.GITHUB_SHA??'')||
    env.EXPECTED_HEAD_SHA!==env.GITHUB_SHA||
    !/^[1-9][0-9]*$/u.test(env.GITHUB_RUN_ID??'')||
    !isObject(history)||history.total_count!==1||
    !Array.isArray(history.workflow_runs)||
    history.workflow_runs.length!==1||
    !isObject(commit)||commit.sha!==env.GITHUB_SHA||
    !Array.isArray(commit.files)||
    commit.files.filter(f=>isObject(f)&&
      f.filename===C08_DIAG_MARKER_V1&&f.status==='added').length!==1)
      throw new TypeError('C08_DIAGNOSTIC_ONCE_ADMISSION_HOLD');
  const r=history.workflow_runs[0];
  if(!isObject(r)||String(r.id)!==env.GITHUB_RUN_ID||
    r.head_sha!==env.GITHUB_SHA||r.head_branch!=='main'||
    r.event!=='push'||r.run_attempt!==1)
      throw new TypeError('C08_DIAGNOSTIC_ONCE_REPLAY_HOLD');
  return Object.freeze({commitSha:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID});
}

export function summarizeSeyeonC08ProviderShapesV1(rows){
  if(!Array.isArray(rows)||rows.length!==4||
     rows.some(r=>!isObject(r)||r.status===undefined))
    throw new TypeError('C08_DIAGNOSTIC_SHAPE_INPUT_HOLD');
  const catalog=rows[0].data;
  const zdr=Array.isArray(catalog)?catalog:[];
  const modelRows=MODELS.map((model,i)=>{
    const data=rows[i+1].data;
    const exactId=isObject(data)&&data.id===model;
    const endpoints=isObject(data)&&Array.isArray(data.endpoints)?data.endpoints:[];
    const matchingZdr=zdr.filter(e=>isObject(e)&&e.model_id===model);
    const tags=new Set(matchingZdr.map(e=>e.tag).filter(x=>typeof x==='string'));
    const matches=endpoints.filter(e=>isObject(e)&&tags.has(e.tag));
    const requireParams=e=>Array.isArray(e.supported_parameters)&&
      e.supported_parameters.includes('response_format');
    return Object.freeze({
      model,
      httpStatus:rows[i+1].status,
      dataShape:shape(data),
      exactId,
      endpointArray:Array.isArray(data?.endpoints),
      endpointCount:endpoints.length,
      zdrModelRows:matchingZdr.length,
      sharedProviderTags:matches.length,
      activeResponseFormatPairCount:matches.filter(e=>
        e.status===0&&requireParams(e)&&matchingZdr.some(z=>
          z.tag===e.tag&&z.status===0&&requireParams(z))).length,
      // These do not assert account-level ZDR or strict JSON runtime.
      modelLookupComplete:
        rows[i+1].status===200&&exactId&&Array.isArray(data.endpoints),
    });
  });
  return Object.freeze({
    schema:'seyeon-c08-provider-get-shape-diagnostic-once-v1',
    scope:'FOUR_OFFICIAL_GET_RESPONSES_AGGREGATES_ONLY',
    metadataGetCount:4,inferencePostCount:0,
    zdrStatus:rows[0].status,zdrDataShape:shape(catalog),
    zdrEndpointCount:zdr.length,
    completeMetadataRead:rows[0].status===200&&Array.isArray(catalog)&&
      modelRows.every(r=>r.modelLookupComplete),
    models:Object.freeze(modelRows),
    rawBodyRetained:false,apiKeyRetained:false,
    requestLevelZdrVerified:false,strictJsonRuntimeVerified:false,
    hardInvoiceCapVerified:false,paidDispatchAuthorized:false,
    productionRouteAuthorized:false,
  });
}

export async function collectSeyeonC08DiagnosticGetOnlyV1({
  apiKey,fetchImpl,timeoutMs=15000,
}={}){
  if(typeof apiKey!=='string'||apiKey.trim().length<20||
    typeof fetchImpl!=='function'||!Number.isSafeInteger(timeoutMs)||
    timeoutMs<1||timeoutMs>15000)
    throw new TypeError('C08_DIAGNOSTIC_GET_ADMISSION_HOLD');
  const paths=[
    '/api/v1/endpoints/zdr',
    ...MODELS.map(model=>'/api/v1/models/'+model+'/endpoints'),
  ];
  const rows=[];
  for(const path of paths){
    try{
      const response=await fetchImpl('https://openrouter.ai'+path,{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs),
        headers:{authorization:'Bearer '+apiKey.trim(),accept:'application/json'},
      });
      const contentType=response.headers?.get('content-type')??'';
      const contentLength=Number(response.headers?.get('content-length')??'0');
      if(response.status!==200||
        !/^application\/json(?:\s*;|$)/iu.test(contentType)||
        !Number.isFinite(contentLength)||contentLength>1000000){
        rows.push({status:response.status,data:null});continue;
      }
      const raw=await response.text();
      if(Buffer.byteLength(raw,'utf8')>1000000){
        rows.push({status:response.status,data:null});continue;
      }
      const parsed=JSON.parse(raw);
      rows.push({status:response.status,
        data:isObject(parsed)?(parsed.data??null):null});
    }catch{
      rows.push({status:null,data:null});
    }
  }
  return summarizeSeyeonC08ProviderShapesV1(rows);
}

async function main(){
  const env=process.env;
  if(!env.GH_TOKEN||!env.OPENROUTER_API_KEY||!env.RUNNER_TEMP)
    throw new TypeError('C08_DIAGNOSTIC_RUNTIME_AUTH_HOLD');
  const api=p=>JSON.parse(execFileSync('gh',['api',p],{
    encoding:'utf8',timeout:15000,maxBuffer:2000000,env,
  }));
  const history=api('repos/'+C08_DIAG_REPO_V1+'/actions/workflows/'+
    C08_DIAG_WORKFLOW_V1+'/runs?per_page=100');
  const commit=api('repos/'+C08_DIAG_REPO_V1+'/commits/'+env.GITHUB_SHA);
  const admitted=assertSeyeonC08DiagnosticOnceV1(env,history,commit);
  const result=await collectSeyeonC08DiagnosticGetOnlyV1({
    apiKey:env.OPENROUTER_API_KEY,fetchImpl:fetch,
  });
  const report={...result,commitSha:admitted.commitSha,runId:admitted.runId};
  const dir=join(env.RUNNER_TEMP,'c08-provider-get-shape-diagnostic-once');
  await mkdir(dir,{recursive:true,mode:0o700});
  await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n',
    {flag:'wx',mode:0o600});
  console.log('C08_PROVIDER_GET_SHAPE_DIAG '+JSON.stringify({
    completeMetadataRead:result.completeMetadataRead,
    modelShape:result.models.map(m=>({
      model:m.model,httpStatus:m.httpStatus,dataShape:m.dataShape,
      exactId:m.exactId,endpointArray:m.endpointArray,
      zdrModelRows:m.zdrModelRows,sharedProviderTags:m.sharedProviderTags,
    })),
    inferencePostCount:0,paidDispatchAuthorized:false,
  }));
  if(!result.completeMetadataRead)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(()=>{console.error('C08_PROVIDER_GET_SHAPE_DIAG_HOLD');process.exitCode=1;});
