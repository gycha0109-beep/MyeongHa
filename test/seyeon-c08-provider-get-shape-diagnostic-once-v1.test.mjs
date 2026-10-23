import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  assertSeyeonC08DiagnosticOnceV1 as admit,
  summarizeSeyeonC08ProviderShapesV1 as summary,
  collectSeyeonC08DiagnosticGetOnlyV1 as collect,
  C08_DIAG_MARKER_V1 as MARKER,
} from '../scripts/seyeon-c08-provider-get-shape-diagnostic-once-v1.mjs';

const sha='a'.repeat(40),model='openai/gpt-oss-120b';
const env={
  GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',GITHUB_EVENT_NAME:'push',
  GITHUB_REF:'refs/heads/main',GITHUB_RUN_ATTEMPT:'1',
  GITHUB_SHA:sha,EXPECTED_HEAD_SHA:sha,GITHUB_RUN_ID:'123456789',
};
const history={total_count:1,workflow_runs:[{
  id:123456789,head_sha:sha,head_branch:'main',event:'push',run_attempt:1,
}]};
const commit={sha,files:[{filename:MARKER,status:'added'}]};
const m=['openai/gpt-oss-120b','qwen/qwen3.5-flash-02-23',
  'google/gemini-3.1-flash-lite'];
const zdrRow={model_id:model,tag:'near/fp8',status:0,
  supported_parameters:['response_format'],pricing:{request:'0'}};
const modelRecord=(id,endpoints=[])=>({id,endpoints});

describe('C08 one-shot actual provider metadata shape-only diagnosis',()=>{
  it('admits exact main once with newly added marker, rejects retries and fake edits',()=>{
    expect(admit(env,history,commit)).toEqual({commitSha:sha,runId:'123456789'});
    for(const c of [
      null,{}, {...commit,sha:'b'.repeat(40)},
      {...commit,files:[]},
      {...commit,files:[{filename:MARKER,status:'modified'}]},
      {...commit,files:[...commit.files,...commit.files]},
    ])expect(()=>admit(env,history,c))
      .toThrow('C08_DIAGNOSTIC_ONCE_ADMISSION_HOLD');
    expect(()=>admit({...env,GITHUB_RUN_ATTEMPT:'2'},history,commit)).toThrow();
    expect(()=>admit(env,{total_count:2,workflow_runs:history.workflow_runs},commit))
      .toThrow('C08_DIAGNOSTIC_ONCE_ADMISSION_HOLD');
    expect(()=>admit(env,{total_count:1,workflow_runs:[
      {...history.workflow_runs[0],event:'workflow_dispatch'}]},commit))
      .toThrow('C08_DIAGNOSTIC_ONCE_REPLAY_HOLD');
  });

  it('distinguishes HTTP 200, root data shape, canonical ID, and tag overlap without raw payload',()=>{
    const rows=[
      {status:200,data:[zdrRow]},
      {status:200,data:modelRecord(model,[{
        tag:'near/fp8',status:0,supported_parameters:['response_format'],
        private:'DO_NOT_COPY',
      }])},
      {status:200,data:modelRecord(m[1],[])},
      {status:200,data:modelRecord(m[2],[])},
    ];
    const r=summary(rows);
    expect(r.completeMetadataRead).toBe(true);
    expect(r.zdrEndpointCount).toBe(1);
    expect(r.models[0]).toMatchObject({
      dataShape:'object',exactId:true,endpointArray:true,
      sharedProviderTags:1,activeResponseFormatPairCount:1,
    });
    expect(r.models[1].zdrModelRows).toBe(0);
    expect(r.inferencePostCount).toBe(0);
    expect(r.paidDispatchAuthorized).toBe(false);
    expect(r.rawBodyRetained).toBe(false);
    expect(JSON.stringify(r)).not.toContain('DO_NOT_COPY');
  });

  it('pinpoints why four 200s can still mean incomplete metadata',()=>{
    const r=summary([
      {status:200,data:[]},
      {status:200,data:[{id:model,endpoints:[]}]},
      {status:200,data:modelRecord('qwen/changed-id',[])},
      {status:200,data:{id:m[2],endpoints:null}},
    ]);
    expect(r.completeMetadataRead).toBe(false);
    expect(r.models[0]).toMatchObject({
      httpStatus:200,dataShape:'array',exactId:false,endpointArray:false,
    });
    expect(r.models[1]).toMatchObject({httpStatus:200,exactId:false});
    expect(r.models[2]).toMatchObject({httpStatus:200,exactId:true,endpointArray:false});
  });

  it('uses exactly four official GETs, never echoes key, skips inference',async()=>{
    const calls=[];
    const fetchImpl=async(url,opts)=>{
      calls.push({url,opts});
      const data=url.endsWith('/endpoints/zdr')?[zdrRow]:
        modelRecord(m.find(x=>url.endsWith(x+'/endpoints'))??'unknown',[]);
      return Response.json({data});
    };
    const r=await collect({apiKey:'test-key-'+ 'x'.repeat(30),fetchImpl});
    expect(calls).toHaveLength(4);
    expect(r.completeMetadataRead).toBe(true);
    expect(r.inferencePostCount).toBe(0);
    for(const c of calls){
      expect(c.opts.method).toBe('GET');
      expect(c.opts.redirect).toBe('error');
      expect(c.opts.body).toBeUndefined();
      expect(c.url).not.toContain('chat/completions');
    }
    expect(JSON.stringify(r)).not.toContain('test-key');
  });

  it('reports malformed JSON and 503 as HOLD without raw response',async()=>{
    let count=0;
    const fake=async()=>{count++;return new Response('down',{status:503});};
    await expect(collect({apiKey:'bad',fetchImpl:fake})).rejects.toThrow();
    expect(count).toBe(0);
    const r=await collect({apiKey:'test-key-'+'x'.repeat(30),fetchImpl:fake});
    expect(count).toBe(4);
    expect(r.completeMetadataRead).toBe(false);
    expect(r.models.every(x=>x.httpStatus===503)).toBe(true);
    expect(r.paidDispatchAuthorized).toBe(false);
  });

  it('workflow cannot auto-run from unrelated main push or perform model POST',()=>{
    const source=readFileSync(
      new URL('../.github/workflows/seyeon-c08-provider-get-shape-diagnostic-once-v1.yml',import.meta.url),
      'utf8',
    );
    expect(source).toContain('push:');
    expect(source).toContain(MARKER);
    expect(source).not.toContain('workflow_dispatch:');
    expect(source).not.toContain('pull_request:');
    expect(source).toContain('contents: read');
    expect(source).toContain('actions: read');
    expect(source).not.toContain('contents: write');
    expect(source).not.toContain('chat/completions');
    expect(source).not.toContain('npx wrangler deploy');
  });
});
