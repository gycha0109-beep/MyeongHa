import{describe,it,expect}from'vitest';
import{readFileSync}from'node:fs';
import{checkAdmission}from'../scripts/seyeon-openrouter-three-call-n01-admission-v1.mjs';
const id='39400000123',sha='a'.repeat(40),env={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:id,GITHUB_SHA:sha};
const history={total_count:1,workflow_runs:[{id:Number(id),head_sha:sha,head_branch:'main',event:'push',run_attempt:1}]};
const a={number:2366,merged:true,merge_commit_sha:'30aeef27bc59a8044db203abdba3ef0a3df84c31'},b={number:2369,merged:true,merge_commit_sha:'1feaa6a8c8300024b32fa2787614896051397280'};
describe('OpenRouter real N01 three-call owner admission',()=>{
 it('accepts only first immutable main attempt after known merges',()=>{
  expect(checkAdmission(env,history,a,b)).toEqual({runId:id,sha});
  for(const h of [{...history,total_count:2},{...history,workflow_runs:[{...history.workflow_runs[0],run_attempt:2}]}])expect(()=>checkAdmission(env,h,a,b)).toThrow();
  expect(()=>checkAdmission({...env,GITHUB_RUN_ATTEMPT:'2'},history,a,b)).toThrow();
  expect(()=>checkAdmission(env,history,a,{...b,merged:false})).toThrow();
 });
 it('locks model, corpus, stage order, cap, no personal memories, no promotion',()=>{
  const s=readFileSync(new URL('../scripts/run-seyeon-openrouter-three-call-n01-v1.mjs',import.meta.url),'utf8');
  const y=readFileSync(new URL('../.github/workflows/seyeon-openrouter-three-call-n01-v1.yml',import.meta.url),'utf8');
  expect(s).toContain("model='openai/gpt-oss-20b'");
  expect(s).toContain('MAX_CALLS=3,MAX_COMPLETION_TOKENS=1536,PER_CALL_RESERVE_USD=0.01');
  expect(s).toContain("text='안녕, 세연아!'");
  expect(s).toContain('runSeyeonCensusFirstThreeCallShadowV1');
  expect(s).toContain('await log.sync()');
  expect(s).toContain('characterQualityVerified:false,productionPromotionPermitted:false');
  expect(y).toContain('OPENROUTER_API_KEY: $'+'{{ secrets.OPENROUTER_API_KEY }}');
  expect(y).not.toContain('workflow_dispatch:');
 });
});
