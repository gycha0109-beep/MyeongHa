import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertSeyeonLiveDialogueOwnerKeyV1 as admit} from '../scripts/seyeon-live-dialogue-owner-key-admission-v1.mjs';
const id='39360000001',sha='a'.repeat(40);
const env={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',
 GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',
 GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:id,GITHUB_SHA:sha};
const history={total_count:1,workflow_runs:[{id:Number(id),head_sha:sha,
 event:'push',head_branch:'main',run_attempt:1}]};
const previous={id:39350184578,head_sha:'f839491e6f4e33eccd9511040ae858b91a881e6f',
 status:'completed',conclusion:'failure',run_attempt:1};
describe('approved owner-key one-time paired real E2E',()=>{
 it('pins run SHA without mutable main and rejects reruns or altered history',()=>{
  expect(admit(env,history,previous)).toEqual({runId:id,mainSha:sha});
  for(const e of [{...env,GITHUB_RUN_ATTEMPT:'2'},
   {...env,GITHUB_EVENT_NAME:'workflow_dispatch'}, {...env,GITHUB_REF:'refs/heads/dev'}])
   expect(()=>admit(e,history,previous)).toThrow();
  expect(()=>admit(env,{...history,total_count:2},previous)).toThrow();
  expect(()=>admit(env,history,{...previous,conclusion:'success'})).toThrow();
 });
 it('uses only owner API key on one public N01, at most 8 calls and 5000 KRW cumulative',()=>{
  const src=readFileSync(new URL('../scripts/run-seyeon-live-dialogue-owner-key-first-pair-v1.mjs',import.meta.url),'utf8');
  const wf=readFileSync(new URL('../.github/workflows/seyeon-live-dialogue-owner-key-first-pair-v1.yml',import.meta.url),'utf8');
  expect(src).toContain("filter(x=>x.id==='N01')");
  expect(src).toContain('MAX_CALLS=8, PER_CALL_RESERVE_USD=0.08, MAX_RESERVED_USD=0.64');
  expect(src).toContain('HISTORICAL_RESERVED_USD=(6554+160000)/1000000');
  expect(src).toContain('ADDITIONAL_OWNER_CAP_KRW=5000');
  expect(src).toContain('const key = process.env.OPENAI_API_KEY?.trim()');
  expect(src).not.toContain('OPENAI_API_KEY2');
  expect(src).toContain("await journalEntry({kind:'reserve'");
  expect(src).toContain('await journal.sync()');
  expect(src).toContain('verifySeyeonDialoguePathStageTopologyV1');
  expect(src).toContain('productionPromotionPermitted:false');
  expect(wf).toContain("ref: $"+'{{ github.sha }}');
  expect(wf).toContain('OPENAI_API_KEY: $'+'{{ secrets.OPENAI_API_KEY }}');
  expect(wf).not.toContain('OPENAI_API_KEY2');
  expect(wf).toContain('node --check scripts/run-seyeon-live-dialogue-owner-key-first-pair-v1.mjs');
  expect(wf).not.toContain('workflow_dispatch:');
  expect(wf).toContain("'.github/seyeon-live-dialogue-owner-key-first-pair.trigger'");
 });
});
