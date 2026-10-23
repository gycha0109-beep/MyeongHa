import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertSeyeonLiveDialogueFirstPairV1 as admit} from '../scripts/seyeon-live-dialogue-first-pair-admission-v1.mjs';
const id='39230000001',sha='a'.repeat(40);
const env={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',
 GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',
 GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:id,GITHUB_SHA:sha};
const history={total_count:1,workflow_runs:[{id:Number(id),head_sha:sha,
 event:'push',head_branch:'main',run_attempt:1}]};
const previous={id:39220957680,head_sha:'febe8469aa3a9d33e09e357659b6a0d4faf60473',
 status:'completed',conclusion:'failure',run_attempt:1};
describe('one actually paired KEY2 5-vs-3 first contact',()=>{
 it('pins workflow SHA; does not compare mutable main',()=>{
  expect(admit(env,history,previous)).toEqual({runId:id,mainSha:sha});
  for(const bad of [
   {...env,GITHUB_RUN_ATTEMPT:'2'},{...env,GITHUB_REF:'refs/heads/dev'},
   {...env,GITHUB_EVENT_NAME:'workflow_dispatch'},
  ])expect(()=>admit(bad,history,previous)).toThrow();
  expect(()=>admit(env,{...history,total_count:2},previous)).toThrow();
  expect(()=>admit(env,history,{...previous,conclusion:'success'})).toThrow();
 });
 it('uses KEY2 and a strict 8-model-call, fixed synthetic N01 reserve',()=>{
  const code=readFileSync(new URL('../scripts/run-seyeon-live-dialogue-key2-first-pair-v1.mjs',import.meta.url),'utf8');
  const wf=readFileSync(new URL('../.github/workflows/seyeon-live-dialogue-key2-first-pair-v1.yml',import.meta.url),'utf8');
  expect(code).toContain("filter(x=>x.id==='N01')");
  expect(code).toContain('MAX_CALLS=8, PER_CALL_RESERVE_USD=0.08, MAX_RESERVED_USD=0.64');
  expect(code).toContain('MAX_BODY_BYTES=24576, MAX_OUTPUT_TOKENS=1536');
  expect(code).toContain("process.env.OPENAI_API_KEY2");
  expect(code).toContain("await journalEntry({kind:'reserve'");
  expect(code).toContain('await journal.sync()');
  expect(code).toContain('verifySeyeonDialoguePathStageTopologyV1');
  expect(code).toContain('await writeFile(join(auditDir,\'report.json\')');
  expect(code).not.toContain('SEYEON_DIALOGUE_PATH_PAID_EXECUTION_HOLD');
  expect(code).not.toContain('process.env.OPENAI_EVAL_API_KEY');
  expect(wf).toContain("ref: $"+'{{ github.sha }}');
  expect(wf).toContain('OPENAI_API_KEY2: $'+'{{ secrets.OPENAI_API_KEY2 }}');
  expect(wf).not.toContain('workflow_dispatch:');
 });
});
