import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { verifyR2TransientGrantCausality } from '../scripts/operations/verify-seyeon-r2-helper-grant-causality.mjs';

const envelope=JSON.parse(readFileSync(new URL('../scripts/operations/seyeon-r2-production-acl-grants-20261013.json',import.meta.url),'utf8'));
const helper='assert_seyeon_chat_thread_runtime_v1';
const snapshot=()=>structuredClone(envelope.snapshot);
const baseline=()=>{
 const b=snapshot(),target=b.functions.find(x=>x.name===helper);
 target.grantEdges=1;
 target.rawAclSha256='a'.repeat(64);
 target.canonicalGrantSha256='b'.repeat(64);
 return b;
};
describe('R2 isolated default-ACL hypothesis: one edge, no Production promotion',()=>{
 it('proves the bounded edge effect with a perfectly cleaned rollback',()=>{
  const result=verifyR2TransientGrantCausality(baseline(),snapshot(),baseline(),envelope);
  expect(result).toMatchObject({
   status:'PASS_R2_ONE_EDGE_ACL_EFFECT_REPRODUCED_ORIGIN_UNVERIFIED',
   exactRawAclMatch:true,normalizedGrantGraphMatch:true,changedFunction:helper,
   authorizedForProduction:false,drReady:false,originEstablished:false,
  });
 });
 it('distinguishes canonical graph equality from only raw ACL formatting drift',()=>{
  const s=snapshot();
  s.functions.find(x=>x.name===helper).rawAclSha256='c'.repeat(64);
  const result=verifyR2TransientGrantCausality(baseline(),s,baseline(),envelope);
  expect(result.normalizedGrantGraphMatch).toBe(true);
  expect(result.rawAclRemainingDifferences).toEqual([helper]);
  expect(result.authorizedForProduction).toBe(false);
 });
 it('rejects an extra mutation to any unrelated RPC',()=>{
  const s=snapshot();s.functions[1].grantEdges++;
  expect(()=>verifyR2TransientGrantCausality(baseline(),s,baseline(),envelope))
   .toThrow('HOLD_R2_CAUSAL_FIXTURE_UNRELATED_RPC_MUTATED');
 });
 it('rejects a failed rollback, including persisted privilege grants',()=>{
  expect(()=>verifyR2TransientGrantCausality(baseline(),snapshot(),snapshot(),envelope))
   .toThrow('HOLD_R2_CAUSAL_FIXTURE_ROLLBACK_NOT_CLEAN');
 });
 it('rejects one-edge insufficiency and browser privilege escalation',()=>{
  const s=snapshot();s.functions.find(x=>x.name===helper).canonicalGrantSha256='d'.repeat(64);
  expect(()=>verifyR2TransientGrantCausality(baseline(),s,baseline(),envelope))
   .toThrow('HOLD_R2_CAUSAL_FIXTURE_ONE_EDGE_NOT_SUFFICIENT');
  const elevated=snapshot();elevated.functions[0].anonExecute=true;
  expect(()=>verifyR2TransientGrantCausality(baseline(),elevated,baseline(),envelope))
   .toThrow('HOLD_R2_ACL_METADATA_OR_BROWSER_PRIVILEGE');
 });
 it('rejects an unexpected second grant or unsupported baseline',()=>{
  const s=snapshot();s.functions.find(x=>x.name===helper).grantEdges=3;
  expect(()=>verifyR2TransientGrantCausality(baseline(),s,baseline(),envelope))
   .toThrow('HOLD_R2_CAUSAL_FIXTURE_GRANT_CARDINALITY');
  expect(()=>verifyR2TransientGrantCausality(snapshot(),snapshot(),snapshot(),envelope))
   .toThrow('HOLD_R2_CAUSAL_FIXTURE_BASELINE_NOT_SINGLE_PRIVILEGED_EDGE');
 });
});
