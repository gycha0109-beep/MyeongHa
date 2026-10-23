import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 createSeyeonC08XOfflineFakeRefStoreV1 as store,
 createSeyeonC08XOfflineRefGateV1 as gate,
} from '../scripts/seyeon-cost-c08x-cross-run-github-ref-offline-v1.mjs';
import {runSeyeonC08VOfflineMockBatchV1 as run}
 from '../scripts/seyeon-cost-c08v-offline-once-pilot-v1.mjs';

const sha='07c933e5c52911719de33ec064c039528e82aa68';
const admission=(runId='900')=>({
 scope:'OFFLINE_ONLY',runId,exactMainSha:sha,paidDispatchEnabled:false});
const ids=()=>{let n=0;return ()=>'00000000-0000-4000-8000-'+
 String(++n).padStart(12,'0');};
const mock=async x=>({outcome:'response_received',inputTokens:1000,
 outputTokens:100,topicKey:x.expectedTopic,claimKinds:[...x.expectedKinds]});
async function rehearse(g,mockProvider=mock){
 await g.claimBatch();
 return run({mockProvider,journal:x=>g.journal(x),callIdFactory:ids()});
}

describe('C08-X offline cross-run GitHub ref reservation simulation',()=>{
 it('records one batch and six exclusive slot markers before each mock',async()=>{
  const remote=store(),g=gate({backend:remote,admission:admission()});
  const events=[];
  const model=vi.fn(async x=>{
   const refs=remote.simulationInspect().refs;
   events.push(refs.length);
   return mock(x);
  });
  const result=await rehearse(g,model);
  expect(result.mockComplete).toBe(true);
  expect(model).toHaveBeenCalledTimes(6);
  expect(events).toEqual([2,3,4,5,6,7]);
  expect(remote.simulationInspect()).toMatchObject({requests:7});
  expect(g.snapshot()).toMatchObject({
   mockComplete:true,simulatedSlotsObserved:6,
   globalCrossRunReservationVerified:false,
   providerHardLimitVerified:false,paidDispatchEnabled:false});
 });
 it('only one of two independent runs wins the single batch ref',async()=>{
  const shared=store();
  const a=gate({backend:shared,admission:admission('900')});
  const b=gate({backend:shared,admission:admission('901')});
  const claims=await Promise.allSettled([a.claimBatch(),b.claimBatch()]);
  expect(claims.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect(claims.filter(x=>x.status==='rejected')).toHaveLength(1);
  expect(shared.simulationInspect()).toMatchObject({requests:2});
  expect(shared.simulationInspect().refs).toHaveLength(1);
 });
 it('a finished batch cannot be restarted by another run sharing the fake store',async()=>{
  const shared=store();
  await rehearse(gate({backend:shared,admission:admission()}));
  await expect(gate({backend:shared,admission:admission('901')})
   .claimBatch()).rejects.toThrow(/HOLD/);
  expect(shared.simulationInspect().refs).toHaveLength(7);
 });
 it('server accepted reservation but client lost ACK: no retry, no mock, future claim denied',async()=>{
  const remote=store({failure:{phase:'after_create'}});
  const g=gate({backend:remote,admission:admission()});
  const provider=vi.fn(mock);
  await expect(rehearse(g,provider)).rejects.toThrow(/HOLD/);
  expect(provider).not.toHaveBeenCalled();
  expect(remote.simulationInspect()).toMatchObject({requests:1});
  expect(remote.simulationInspect().refs).toHaveLength(1);
  await expect(gate({backend:remote,admission:admission('901')})
   .claimBatch()).rejects.toThrow(/HOLD/);
  expect(remote.simulationInspect().requests).toBe(2);
 });
 it('outage before reservation and failed readback permanently hold',async()=>{
  for(const phase of ['before_create','readback']){
   const remote=store({failure:{phase}});
   const g=gate({backend:remote,admission:admission()});
   const model=vi.fn(mock);
   await expect(rehearse(g,model)).rejects.toThrow(/HOLD/);
   expect(model).not.toHaveBeenCalled();
   expect(remote.simulationInspect().requests).toBe(1);
  }
 });
 it('rejected or missing admission and caller-created remote are fail closed',async()=>{
  expect(()=>gate({backend:{
   createReference:async()=>({status:201}),readReference:async()=>({status:200}),
  },admission:admission()})).toThrow(/HOLD/);
  for(const bad of [
   {...admission(),paidDispatchEnabled:true},
   {...admission(),scope:'PRODUCTION'},
   {...admission(),runId:'0'},
   {...admission(),exactMainSha:'main'},
   null,
  ])expect(()=>gate({backend:store(),admission:bad})).toThrow(/HOLD/);
 });
 it('rejects an unclaimed slot, wrong slot, observation-first and duplicate reservation',async()=>{
  const remote=store(),g=gate({backend:remote,admission:admission()});
  const event={kind:'mock_reservation',slotIndex:0,
   caseId:'A01',variant:'original',reservedMicroUsd:3277};
  await expect(g.journal(event)).rejects.toThrow(/HOLD/);
  await g.claimBatch();
  await expect(g.journal({...event,caseId:'H01'})).rejects.toThrow(/HOLD/);
  await expect(g.journal({...event,kind:'mock_observation'}))
   .rejects.toThrow(/HOLD/);
  await g.journal(event);
  await expect(g.journal(event)).rejects.toThrow(/HOLD/);
  expect(remote.simulationInspect().refs).toHaveLength(2);
 });
 it('unknown or unjournaled provider usage blocks all later reservations',async()=>{
  const remote=store(),g=gate({backend:remote,admission:admission()});
  const model=vi.fn(async()=>({outcome:'network_error',
   inputTokens:1,outputTokens:1}));
  const x=await rehearse(g,model);
  expect(x.stopReason).toBe('UNKNOWN_USAGE_HOLD');
  expect(model).toHaveBeenCalledTimes(1);
  expect(remote.simulationInspect().refs).toHaveLength(2);
  expect(g.snapshot()).toMatchObject({mockComplete:false,
   simulatedSlotsObserved:0,paidDispatchEnabled:false});
 });
 it('a changed or removed batch marker blocks all later mock calls',async()=>{
  for(const mutate of ['rewrite','remove']){
   const remote=store(),g=gate({backend:remote,admission:admission()});
   await g.claimBatch();
   const batch=remote.simulationInspect().refs[0];
   if(mutate==='rewrite')remote.simulationRewrite(batch,'f'.repeat(40));
   else remote.simulationRemove(batch);
   const model=vi.fn(mock);
   const summary=await run({mockProvider:model,
    journal:x=>g.journal(x),callIdFactory:ids()});
   expect(model).not.toHaveBeenCalled();
   expect(summary.stopReason).toBe('PRE_DISPATCH_OR_JOURNAL_HOLD');
  }
 });
 it('a changed slot marker prevents mock observation finalization and later calls',async()=>{
  const remote=store(),g=gate({backend:remote,admission:admission()});
  await g.claimBatch();
  const model=vi.fn(async x=>{
   const marker=remote.simulationInspect().refs[1];
   remote.simulationRewrite(marker,'f'.repeat(40));
   return mock(x);
  });
  const summary=await run({mockProvider:model,
   journal:x=>g.journal(x),callIdFactory:ids()});
  expect(model).toHaveBeenCalledTimes(1);
  expect(summary.stopReason).toBe('OUTCOME_JOURNAL_HOLD');
  expect(g.snapshot().mockComplete).toBe(false);
 });
 it('does not touch real GitHub or provider and does not assert immutable global refs',()=>{
  const script=readFileSync(new URL(
   '../scripts/seyeon-cost-c08x-cross-run-github-ref-offline-v1.mjs',
   import.meta.url),'utf8');
  expect(script).not.toMatch(/api\.github\.com|api\.openai\.com|secrets\.OPENAI_|fetch\(/);
  expect(script).toContain('globalCrossRunReservationVerified:false');
  expect(script).toContain('paidDispatchEnabled:false');
 });
});
