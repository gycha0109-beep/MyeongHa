import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertSeyeonLiveDialoguePairRecoveryV2 as admit} from '../scripts/seyeon-live-dialogue-pair-recovery-admission-v2.mjs';
const id='39240000001',sha='a'.repeat(40);
const env={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',
 GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',
 GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:id,GITHUB_SHA:sha};
const history={total_count:1,workflow_runs:[{id:Number(id),head_sha:sha,
 event:'push',head_branch:'main',run_attempt:1}]};
const previous={id:39225780485,head_sha:'118ff5de5b913bcda8d147ebe325436bdb4b1ed3',
 status:'completed',conclusion:'failure',run_attempt:1};
describe('zero-dispatch recovery: one pinned real 5-vs-3 pair',()=>{
 it('accepts pinned first new run, rejects duplicates or altered previous evidence',()=>{
  expect(admit(env,history,previous)).toEqual({runId:id,mainSha:sha});
  expect(()=>admit({...env,GITHUB_RUN_ATTEMPT:'2'},history,previous)).toThrow();
  expect(()=>admit(env,{...history,total_count:2},previous)).toThrow();
  expect(()=>admit(env,history,{...previous,conclusion:'success'})).toThrow();
 });
 it('preserves one synthetic N01 and 8 call / 1600 won reservation ceiling',()=>{
  const code=readFileSync(new URL('../scripts/run-seyeon-live-dialogue-key2-first-pair-v1.mjs',import.meta.url),'utf8');
  const wf=readFileSync(new URL('../.github/workflows/seyeon-live-dialogue-key2-first-pair-recovery-v2.yml',import.meta.url),'utf8');
  expect(code).toContain("filter(x=>x.id==='N01')");
  expect(code).toContain('MAX_CALLS=8, PER_CALL_RESERVE_USD=0.08, MAX_RESERVED_USD=0.64');
  expect(code).toContain('process.env.OPENAI_API_KEY2');
  expect(code).toContain("await journalEntry({kind:'reserve'");
  expect(code).toContain('const reportedPurpose =');
  expect(code).not.toContain('const purpose = allowed.find');
  expect(wf).toContain('node --check scripts/run-seyeon-live-dialogue-key2-first-pair-v1.mjs');
  expect(wf).toContain('OPENAI_API_KEY2: $'+'{{ secrets.OPENAI_API_KEY2 }}');
  expect(wf).not.toContain('workflow_dispatch:');
 });
});
