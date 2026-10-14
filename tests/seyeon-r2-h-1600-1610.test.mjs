import {describe,it,expect} from 'vitest';
import {validateR2H16001610,verifyR2H16001610} from '../scripts/operations/verify-seyeon-r2-h-1600-1610.mjs';
const zeros=()=>({
 schema:'seyeon-r2-h-1600-1610-guard-pg17-v1',pgMajor:17,
 rateTableCount:0,meterCount:0,governedCount:0,legacyCount:0,
 rateGuardCount:0,rateTriggerCount:0,rateTriggerBeforeUpdateDelete:null,
 guardInvokerHardened:null,guardClientExec:null,
 legacyDefinerHardened:null,legacyExecutor:null,legacyClientExecute:null,
 governedDefinerHardened:null,governedExecutor:null,governedClientExecute:null,
 helperCount:0,helperDefinerHardened:null,helperExecutor:null,helperClientExecute:null,
 legacyDdlDigest:null,governedDdlDigest:null,legacyAclDigest:null,
 governedAclDigest:null,creatorMembershipCount:0,meterRoleSchemaCreate:null,
 future1620Applied:false,ownerUnit:'cost-governor-foundation',
 authorizedForProduction:false,drReady:false});
const all=()=>{
 const a=zeros(),b=structuredClone(a),c=structuredClone(a),d=structuredClone(a);
 Object.assign(b,{rateTableCount:1,meterCount:1,governedCount:1,legacyCount:1,
  legacyDefinerHardened:true,legacyExecutor:true,legacyClientExecute:false,
  governedDefinerHardened:true,governedExecutor:true,governedClientExecute:false,
  legacyDdlDigest:'a'.repeat(64),governedDdlDigest:'b'.repeat(64),
  legacyAclDigest:'c'.repeat(64),governedAclDigest:'d'.repeat(64),
  meterRoleSchemaCreate:false});
 Object.assign(c,b,{rateGuardCount:1,rateTriggerCount:1,
  rateTriggerBeforeUpdateDelete:true,guardInvokerHardened:true,guardClientExec:false,
  governedDdlDigest:'e'.repeat(64)});
 Object.assign(d,c,{helperCount:1,helperDefinerHardened:true,
  helperExecutor:false,helperClientExecute:false,
  legacyDdlDigest:'f'.repeat(64),governedDdlDigest:'0'.repeat(64)});
 return [a,b,c,d,zeros()];
};
describe('R2-H PG17 1600→1610 immutability and private settlement',()=>{
 it('accepts immutable rate-card, guarded RPC boundary and rollback without authorizing deployment',()=>{
  expect(verifyR2H16001610(...all())).toMatchObject({
   status:'PASS_R2_H_1600_1610_RATE_CARD_AND_LEGACY_GUARD_ROLLBACK',
   rollbackClean:true,productionWrites:0,drReady:false});
 });
 it('rejects any absent prerequisite or premature future 1620',()=>{
  for(const [stage,key,value] of [[1,'meterCount',0],[1,'governedCount',0],
   [1,'legacyCount',0],[3,'future1620Applied',true]]){
   const v=all();v[stage][key]=value;expect(()=>verifyR2H16001610(...v)).toThrow();
  }
 });
 it('rejects rate trigger, RLS guard or unexpected public access',()=>{
  for(const [key,value] of [['rateTriggerCount',0],['rateTriggerBeforeUpdateDelete',false],
   ['guardInvokerHardened',false],['guardClientExec',true]]){
   const v=all();v[2][key]=value;expect(()=>verifyR2H16001610(...v)).toThrow();
  }
 });
 it('rejects private helper grants and creator membership',()=>{
  for(const [key,value] of [['helperExecutor',true],['helperClientExecute',true],
   ['helperDefinerHardened',false],['creatorMembershipCount',1],
   ['meterRoleSchemaCreate',true]]){
   const v=all();v[3][key]=value;expect(()=>verifyR2H16001610(...v)).toThrow();
  }
 });
 it('rejects accidental widening of legacy/governed RPC or raw ACL changes',()=>{
  for(const key of ['legacyClientExecute','governedClientExecute']){
   const v=all();v[3][key]=true;expect(()=>verifyR2H16001610(...v)).toThrow();
  }
  const v=all();v[3].governedAclDigest='f'.repeat(64);
  expect(()=>verifyR2H16001610(...v)).toThrow('FUNCTION_ACL_DRIFT');
 });
 it('rejects no-op 1600 settle rewrite, no-op 1610 guard, or missing private routing',()=>{
  let v=all();v[2].governedDdlDigest=v[1].governedDdlDigest;
  expect(()=>verifyR2H16001610(...v)).toThrow('1600_RATE_RECOMPUTE_MISSING');
  v=all();v[3].legacyDdlDigest=v[2].legacyDdlDigest;
  expect(()=>verifyR2H16001610(...v)).toThrow('1610_LEGACY_GUARD_NOT_INSTALLED');
  v=all();v[3].governedDdlDigest=v[2].governedDdlDigest;
  expect(()=>verifyR2H16001610(...v)).toThrow('1610_PRIVATE_SETTLE_NOT_LINKED');
 });
 it('rejects rollback drift and false approval claim',()=>{
  let v=all();v[4].rateGuardCount=1;
  expect(()=>verifyR2H16001610(...v)).toThrow();
  v=all();v[3].authorizedForProduction=true;
  expect(()=>verifyR2H16001610(...v)).toThrow('SCOPE_OR_ENVELOPE');
 });
 it('rejects unauthorized evidence fields and invalid stages',()=>{
  const v=all()[2];v.rawAclText='leak';
  expect(()=>validateR2H16001610(v,2)).toThrow('SCOPE_OR_ENVELOPE');
  expect(()=>validateR2H16001610(all()[2],4)).toThrow('STAGE');
 });
});
