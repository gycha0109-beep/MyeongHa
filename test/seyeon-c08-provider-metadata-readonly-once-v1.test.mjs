import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  assertSeyeonC08ProviderInventoryOnceV1 as admit,
  sanitizeSeyeonC08ProviderReadbackV1 as sanitize,
  C08_PROVIDER_INVENTORY_WORKFLOW_V1 as WORKFLOW,
} from '../scripts/seyeon-c08-provider-metadata-readonly-once-v1.mjs';

const sha='a'.repeat(40);
const env=Object.freeze({
  GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',
  GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_REF:'refs/heads/main',
  GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:sha,EXPECTED_HEAD_SHA:sha,
  GITHUB_RUN_ID:'39999999001',
});
const history={
  total_count:1,
  workflow_runs:[{
    id:39999999001,head_sha:sha,head_branch:'main',
    event:'workflow_dispatch',run_attempt:1,
  }],
};
const provider={providerTag:'secure/fp4',inputUsdPerMillion:0.03,
  outputUsdPerMillion:0.17,reservedScenarioMicroUsd:1751,
  disposition:'METADATA_MATH_ONLY_HOLD',apiKey:'DO_NOT_LEAK'};
const snapshot={
  metadataGetCount:4,inferencePostCount:0,completeMetadataRead:true,
  zdrStatus:200,
  modelStatuses:[
    {model:'openai/gpt-oss-120b',status:200},
    {model:'qwen/qwen3.5-flash-02-23',status:200},
    {model:'google/gemini-3.1-flash-lite',status:200},
  ],
  models:[
    {model:'openai/gpt-oss-120b',disposition:'PROVIDER_METADATA_ONLY_HOLD',
     matchedEndpointCount:1,providers:[provider]},
    {model:'qwen/qwen3.5-flash-02-23',
     disposition:'NO_EXACT_ACTIVE_ZDR_RESPONSE_FORMAT_PRICE_MATCH_HOLD',
     matchedEndpointCount:0,providers:[]},
    {model:'google/gemini-3.1-flash-lite',
     disposition:'NO_EXACT_ACTIVE_ZDR_RESPONSE_FORMAT_PRICE_MATCH_HOLD',
     matchedEndpointCount:0,providers:[]},
  ],
};

describe('C08 exact main SHA GET-only provider inventory admission',()=>{
  it('admits just the first exact-SHA main workflow_dispatch',()=>{
    expect(admit(env,history)).toEqual({
      commitSha:sha,workflowRunId:'39999999001',
    });
  });
  it.each([
    [{...env,GITHUB_EVENT_NAME:'push'},history],
    [{...env,GITHUB_REF:'refs/heads/feature'},history],
    [{...env,GITHUB_RUN_ATTEMPT:'2'},history],
    [{...env,EXPECTED_HEAD_SHA:'b'.repeat(40)},history],
    [{...env,GITHUB_SHA:'invalid'},history],
    [{...env,GITHUB_RUN_ID:'0'},history],
    [env,{total_count:2,workflow_runs:history.workflow_runs}],
    [env,{total_count:1,workflow_runs:[]}],
    [env,{total_count:1,workflow_runs:[{...history.workflow_runs[0],head_sha:'b'.repeat(40)}]}],
    [env,{total_count:1,workflow_runs:[{...history.workflow_runs[0],run_attempt:2}]}],
    [env,{total_count:1,workflow_runs:[{...history.workflow_runs[0],event:'push'}]}],
  ])('rejects stale, replay, wrong ref, wrong workflow or duplicate run', (e,h)=>{
    expect(()=>admit(e,h)).toThrow(/C08_PROVIDER_ONCE_.*_HOLD/);
  });
  it('whitelists public price/tag only, never copies input secret or upgrades metadata',()=>{
    const o=sanitize({admitted:admit(env,history),snapshot});
    expect(o).toMatchObject({
      schema:'seyeon-c08-provider-metadata-once-v1',
      completeMetadataRead:true,
      metadataGetCount:4,inferencePostCount:0,
      strictJsonSchemaRuntimeVerified:false,
      requestLevelZdrAndDenyRuntimeVerified:false,
      hardTurnBillingCapVerified:false,
      guardedFiveSecondLatencyVerified:false,
      paidInferenceAuthorized:false,productionRouteAuthorized:false,
    });
    expect(o.models[0].providers[0].providerTag).toBe('secure/fp4');
    expect(o.models[0].providers[0].inputUsdPerMillion).toBe(0.03);
    expect(JSON.stringify(o)).not.toContain('DO_NOT_LEAK');
    expect(JSON.stringify(o)).not.toContain('apiKey');
  });
  it('rejects missing or tampered metadata/inference count',()=>{
    for(const s of [
      {...snapshot,inferencePostCount:1},
      {...snapshot,metadataGetCount:5},
      {...snapshot,models:[]},
      {...snapshot,models:[{...snapshot.models[0],matchedEndpointCount:2},...snapshot.models.slice(1)]},
      {...snapshot,models:[{...snapshot.models[0],providers:[{...provider,inputUsdPerMillion:null}]},...snapshot.models.slice(1)]},
    ]){
      expect(()=>sanitize({admitted:admit(env,history),snapshot:s}))
        .toThrow('C08_PROVIDER_READBACK_INVALID_HOLD');
    }
  });
  it('has no automatic trigger, no inference POST, no write permission, and one-run guard',()=>{
    const text=readFileSync(new URL('../.github/workflows/'+WORKFLOW,import.meta.url),'utf8');
    expect(text).toContain('workflow_dispatch:');
    expect(text).not.toMatch(/\n\s*push:/u);
    expect(text).not.toContain('pull_request:');
    expect(text).toContain('expected_head_sha');
    expect(text).toContain('environment: production');
    expect(text).toContain('contents: read');
    expect(text).toContain('actions: read');
    expect(text).not.toContain('contents: write');
    expect(text).not.toContain('npx wrangler deploy');
    expect(text).not.toContain('chat/completions');
  });
});
