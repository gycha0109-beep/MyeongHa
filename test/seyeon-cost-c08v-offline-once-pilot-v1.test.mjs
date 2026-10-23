import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 assertSeyeonC08VFirstManualRunV1 as admit,
 runSeyeonC08VOfflineMockBatchV1 as run,
} from '../scripts/seyeon-cost-c08v-offline-once-pilot-v1.mjs';
import {SEYEON_C08T_FIRST_PAID_PILOT_POLICY_V1 as POLICY} from
 '../scripts/seyeon-cost-c08t-owner-budget-pilot-v1.mjs';

const sha='5f9f9d7f26a6c9054582e812344b7e385573a1b9';
const ctx={repository:'gycha0109-beep/MyeongHa',ref:'refs/heads/main',
 event:'workflow_dispatch',head:sha,runId:'800',attempt:'1'};
const hist={total_count:1,workflow_runs:[{id:800,event:'workflow_dispatch',
 head_branch:'main',head_sha:sha,run_attempt:1}]};
const provider=async x=>({outcome:'response_received',inputTokens:1100,
 outputTokens:100,topicKey:x.expectedTopic,claimKinds:[...x.expectedKinds]});
const ids=()=>{let n=0;return ()=>'00000000-0000-4000-8000-'+
 String(++n).padStart(12,'0');};
const start=opts=>run({mockProvider:provider,callIdFactory:ids(),...opts});

describe('C08-V first pilot offline rehearsal (always paid HOLD)',()=>{
 it('admits only exact unique first manual main run; rejects rerun, stale main, history ambiguity',()=>{
  expect(admit(ctx,hist,sha)).toMatchObject({
   paidDispatchEnabled:false,scope:'OFFLINE_ONLY'});
  const denied=[
   [{...ctx,attempt:'2'},hist,sha],
   [{...ctx,event:'push'},hist,sha],
   [{...ctx,ref:'refs/heads/other'},hist,sha],
   [{...ctx,repository:'evil/repo'},hist,sha],
   [ctx,{...hist,total_count:2},sha],
   [ctx,{...hist,workflow_runs:[]},sha],
   [ctx,{...hist,workflow_runs:[{...hist.workflow_runs[0],id:801}]},sha],
   [ctx,{...hist,workflow_runs:[{...hist.workflow_runs[0],run_attempt:2}]},sha],
   [ctx,hist,'f'.repeat(40)],
   [ctx,null,sha],
  ];
  for(const input of denied)expect(()=>admit(...input)).toThrow();
 });
 it('simulates six approved slots, reserving and journaling before each mock',async()=>{
  const journal=vi.fn(async()=>{});
  const mock=vi.fn(provider);
  const result=await start({mockProvider:mock,journal});
  expect(result).toMatchObject({status:'PAID_DISPATCH_HOLD',
   scope:'SYNTHETIC_MOCK_ONLY',mockComplete:true,mockMatches:6,
   mockAttempted:6,reservedMicroUsd:19662,stopReason:null,
   actualBilledKrw:null,invoiceReconciled:false,
   projectIdentityVerified:false,providerHardLimitVerified:false,
   modelQualityVerified:false,productionPromotionPermitted:false,
   paidDispatchEnabled:false});
  expect(mock).toHaveBeenCalledTimes(6);
  expect(mock.mock.calls.map(([x])=>x.caseId+':'+x.variant)).toEqual(
   POLICY.caseIds.flatMap(id=>POLICY.variants.map(v=>id+':'+v)));
  expect(journal.mock.calls.map(([x])=>x.kind)).toEqual(
   Array.from({length:6},()=>['mock_reservation','mock_observation']).flat());
  expect(JSON.stringify(journal.mock.calls)).not.toContain('syntheticText');
  expect(result.estimatedMicroUsd).toBeGreaterThan(0);
 });
 it('cannot call mock if a reservation or ledger write fails',async()=>{
  const mock=vi.fn(provider);
  const result=await start({mockProvider:mock,
   journal:async()=>{throw Error('disk failed')}});
  expect(mock).toHaveBeenCalledTimes(0);
  expect(result.stopReason).toBe('PRE_DISPATCH_OR_JOURNAL_HOLD');
  expect(result.paidDispatchEnabled).toBe(false);
 });
 it('halts on unknown provider result, does not retry or attempt later slots',async()=>{
  const mock=vi.fn().mockRejectedValue(Error('network unknown'));
  const result=await start({mockProvider:mock});
  expect(mock).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({mockComplete:false,
   stopReason:'UNKNOWN_MOCK_OUTCOME_HOLD',mockMatches:0});
 });
 it('rejects absent/over-limit usage and stops before second slot',async()=>{
  for(const value of [
   {outcome:'response_received',inputTokens:null,outputTokens:1},
   {outcome:'response_received',inputTokens:8193,outputTokens:1},
   {outcome:'response_received',inputTokens:10,outputTokens:1025},
   {outcome:'network_error',inputTokens:10,outputTokens:1},
  ]){
   const mock=vi.fn(async()=>value);
   const result=await start({mockProvider:mock});
   expect(mock).toHaveBeenCalledTimes(1);
   expect(result.stopReason).toBe('UNKNOWN_USAGE_HOLD');
  }
 });
 it('rejects forged classification, malformed payload and post-dispatch journal loss',async()=>{
  for(const mismatch of [
   {topicKey:null,claimKinds:[]},
   {topicKey:'incorrect',claimKinds:[]},
   {topicKey:null,claimKinds:null},
  ]){
   const mock=vi.fn(async()=>({outcome:'response_received',
    inputTokens:100,outputTokens:10,...mismatch}));
   const result=await start({mockProvider:mock});
   expect(mock).toHaveBeenCalledTimes(1);
   expect(result.mockComplete).toBe(false);
   expect(result.stopReason).toMatch(/HOLD$/);
  }
  const mock=vi.fn(provider);
  const lost=await start({mockProvider:mock,journal:async x=>{
   if(x.kind==='mock_observation')throw Error('disk full');
  }});
  expect(mock).toHaveBeenCalledTimes(1);
  expect(lost.stopReason).toBe('OUTCOME_JOURNAL_HOLD');
 });
 it('prohibits Production and paid API entrypoints even when all mock slots pass',()=>{
  const workflow=readFileSync(new URL(
   '../.github/workflows/seyeon-c08v-offline-once-pilot-v1.yml',
   import.meta.url),'utf8');
  const runner=readFileSync(new URL(
   '../scripts/seyeon-cost-c08v-offline-once-pilot-v1.mjs',
   import.meta.url),'utf8');
  expect(workflow).toContain('workflow_dispatch:');
  expect(workflow).not.toContain('push:');
  expect(workflow).toContain('actions: read');
  expect(workflow).not.toContain('secrets.OPENAI_');
  expect(workflow).not.toContain('environment: production');
  expect(runner).not.toContain('api.openai.com');
  expect(runner).not.toContain('process.env.OPENAI_');
  expect(runner).not.toContain('fetch(');
  expect(POLICY.paidDispatchEnabled).toBe(false);
 });
});
