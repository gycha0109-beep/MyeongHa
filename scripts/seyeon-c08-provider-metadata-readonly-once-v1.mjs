/**
 * C08 §7.3-6: single authorized GET-only provider snapshot, no inference.
 * First-ever manual or marker-push workflow on protected main only.
 * A marker-push requires a NEW exact trigger file in the GH commit diff.
 * This CLI has no
 * chat-completions POST path, no retry and no model/production routing changes.
 */
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {inspectSeyeonC08ProviderMetadataReadOnlyV1} from
  './seyeon-c08-exact-provider-metadata-offline-v1.mjs';

export const C08_PROVIDER_INVENTORY_REPO_V1='gycha0109-beep/MyeongHa';
export const C08_PROVIDER_INVENTORY_WORKFLOW_V1=
  'seyeon-c08-provider-metadata-readonly-once-v1.yml';
export const C08_PROVIDER_ONCE_TRIGGER_MARKER_V1=
  '.github/seyeon-c08-provider-metadata-readonly-once.trigger';
const commitRe=/^[a-f0-9]{40}$/u;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function assertSeyeonC08ProviderInventoryOnceV1(env,history,commit=null){
  const event=env?.GITHUB_EVENT_NAME;
  const push=event==='push',manual=event==='workflow_dispatch';
  if(!push&&!manual)throw new TypeError('C08_PROVIDER_ONCE_ADMISSION_HOLD');
  // A new file can only enter main through this reviewed merge; a later
  // modification or a different main push is not an authorization.
  if(push&&(!isObject(commit)||commit.sha!==env.GITHUB_SHA||
    !Array.isArray(commit.files)||
    commit.files.filter(f=>isObject(f)&&
      f.filename===C08_PROVIDER_ONCE_TRIGGER_MARKER_V1&&
      f.status==='added').length!==1)){
    throw new TypeError('C08_PROVIDER_ONCE_MARKER_HOLD');
  }
  if(env?.GITHUB_REPOSITORY!==C08_PROVIDER_INVENTORY_REPO_V1||
          env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_RUN_ATTEMPT!=='1'||
     !commitRe.test(env.GITHUB_SHA??'')||
     env.EXPECTED_HEAD_SHA!==env.GITHUB_SHA||
     !/^[1-9][0-9]*$/u.test(env.GITHUB_RUN_ID??'')||
     !isObject(history)||history.total_count!==1||
     !Array.isArray(history.workflow_runs)||history.workflow_runs.length!==1){
    throw new TypeError('C08_PROVIDER_ONCE_ADMISSION_HOLD');
  }
  const r=history.workflow_runs[0];
  if(!isObject(r)||String(r.id)!==env.GITHUB_RUN_ID||
     r.head_sha!==env.GITHUB_SHA||r.head_branch!=='main'||
     r.event!==event||r.run_attempt!==1){
    throw new TypeError('C08_PROVIDER_ONCE_REPLAY_HOLD');
  }
  return Object.freeze({commitSha:env.GITHUB_SHA,workflowRunId:env.GITHUB_RUN_ID});
}

/** Whitelist only public provider metadata and uncertainty booleans. */
export function sanitizeSeyeonC08ProviderReadbackV1({admitted,snapshot}={}){
  if(!isObject(admitted)||!commitRe.test(admitted.commitSha??'')||
     !/^[1-9][0-9]*$/u.test(admitted.workflowRunId??'')||
     !isObject(snapshot)||snapshot.inferencePostCount!==0||
     snapshot.metadataGetCount!==4||!Array.isArray(snapshot.models)||
     snapshot.models.length!==3||!Array.isArray(snapshot.modelStatuses)||
     snapshot.modelStatuses.length!==3){
    throw new TypeError('C08_PROVIDER_READBACK_INVALID_HOLD');
  }
  const models=snapshot.models.map(m=>{
    if(!isObject(m)||typeof m.model!=='string'||
       !Array.isArray(m.providers)||typeof m.disposition!=='string'||
       !Number.isSafeInteger(m.matchedEndpointCount)||
       m.matchedEndpointCount!==m.providers.length)
      throw new TypeError('C08_PROVIDER_READBACK_INVALID_HOLD');
    return Object.freeze({
      model:m.model,
      disposition:m.disposition,
      matchedEndpointCount:m.matchedEndpointCount,
      providers:m.providers.map(p=>{
        if(!isObject(p)||typeof p.providerTag!=='string'||
           typeof p.disposition!=='string'||
           typeof p.inputUsdPerMillion!=='number'||
           typeof p.outputUsdPerMillion!=='number')
          throw new TypeError('C08_PROVIDER_READBACK_INVALID_HOLD');
        return Object.freeze({
          providerTag:p.providerTag,
          inputUsdPerMillion:p.inputUsdPerMillion,
          outputUsdPerMillion:p.outputUsdPerMillion,
          reservedScenarioMicroUsd:p.reservedScenarioMicroUsd,
          disposition:p.disposition,
          paidInferenceAuthorized:false,
          productionRouteAuthorized:false,
        });
      }),
    });
  });
  return Object.freeze({
    schema:'seyeon-c08-provider-metadata-once-v1',
    scope:'PUBLIC_PROVIDER_METADATA_ONLY_NOT_INFERENCE',
    commitSha:admitted.commitSha,
    workflowRunId:admitted.workflowRunId,
    metadataGetCount:4,inferencePostCount:0,
    completeMetadataRead:snapshot.completeMetadataRead===true,
    zdrStatus:snapshot.zdrStatus,
    modelStatuses:snapshot.modelStatuses.map(m=>Object.freeze({
      model:m.model,status:m.status,
    })),
    models,
    strictJsonSchemaRuntimeVerified:false,
    requestLevelZdrAndDenyRuntimeVerified:false,
    hardTurnBillingCapVerified:false,
    guardedFiveSecondLatencyVerified:false,
    c07GoldAndCanonParityVerified:false,
    paidInferenceAuthorized:false,
    productionRouteAuthorized:false,
  });
}

async function main(){
  const env=process.env;
  if(!env.GH_TOKEN||!env.RUNNER_TEMP||!env.OPENROUTER_API_KEY)
    throw new TypeError('C08_PROVIDER_ONCE_RUNTIME_AUTH_HOLD');
  const call=route=>JSON.parse(execFileSync('gh',['api',route],
    {encoding:'utf8',env,timeout:15000,maxBuffer:2000000}));
  const history=call(
    'repos/'+C08_PROVIDER_INVENTORY_REPO_V1+
    '/actions/workflows/'+C08_PROVIDER_INVENTORY_WORKFLOW_V1+
    '/runs?per_page=100');
  const commit=env.GITHUB_EVENT_NAME==='push'?call(
    'repos/'+C08_PROVIDER_INVENTORY_REPO_V1+'/commits/'+env.GITHUB_SHA
  ):null;
  const admitted=assertSeyeonC08ProviderInventoryOnceV1(env,history,commit);
  const snapshot=await inspectSeyeonC08ProviderMetadataReadOnlyV1({
    apiKey:env.OPENROUTER_API_KEY,fetchImpl:fetch,
  });
  const report=sanitizeSeyeonC08ProviderReadbackV1({admitted,snapshot});
  const dir=join(env.RUNNER_TEMP,'seyeon-c08-provider-metadata-readback');
  await mkdir(dir,{recursive:true,mode:0o700});
  await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n',
    {flag:'wx',mode:0o600});
  // Print only the outcome status, not the provider catalogue or secrets.
  console.log('C08_PROVIDER_METADATA_ONCE '+JSON.stringify({
    schema:report.schema,completeMetadataRead:report.completeMetadataRead,
    metadataGetCount:report.metadataGetCount,inferencePostCount:0,
    matchedEndpointCount:report.models.map(m=>m.matchedEndpointCount),
    paidInferenceAuthorized:false,productionRouteAuthorized:false,
  }));
  if(!report.completeMetadataRead)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
  main().catch(()=>{console.error('C08_PROVIDER_METADATA_ONCE_HOLD');process.exitCode=1;});
