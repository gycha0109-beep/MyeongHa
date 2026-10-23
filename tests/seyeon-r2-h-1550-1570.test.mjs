import {describe,it,expect} from 'vitest';
import {validateCostState,verifyR2HCostSequence} from '../scripts/operations/verify-seyeon-r2-h-1550-1570.mjs';
const proto={
 schemaVersion:'seyeon-r2-h-cost-foundation-pg17-v1',pgMajor:17,
 reviewUnit:'cost-governor-foundation',authorizedForProduction:false,
 drReady:false,future1580Applied:false};
const counts={
 tableCount:0,columnCount:0,pkCount:0,checkCount:0,indexCount:0,
 costPolicyCount:0,ledgerPolicyCount:0,cleanupTriggerCount:0,
 lifecycleColumnCount:0,lifecycleShapeConstraintCount:0,meterRoleCount:0,
 meterRoleLeastPrivilege:0,creatorDirectMembershipCount:0,
 functionCount:0,ownedFunctionCount:0,definerCount:0,invokerCount:0,
 hardenedSearchPathCount:0,apiCallableCount:0};
const flags=['rowSecurity','forceRowSecurity','meterRoleSchemaCreate','meterRoleTableUpdate',
 'meterRoleTableDelete','browserOrServiceCallable','cleanupApiCallable',
 'anonTableDml','authenticatedTableDml','serviceRoleTableDml','apiExecutorTableDml'];
const original=()=>({...proto,...counts,...Object.fromEntries(flags.map(k=>[k,(k==='browserOrServiceCallable'||k==='cleanupApiCallable')?false:null]))});
const states=()=>{
 const a=original(),b=structuredClone(a),c=structuredClone(a),d=structuredClone(a);
 Object.assign(b,{tableCount:1,columnCount:15,pkCount:1,checkCount:5,indexCount:3,
  costPolicyCount:5,ledgerPolicyCount:3,cleanupTriggerCount:1,
  meterRoleCount:1,meterRoleLeastPrivilege:1,functionCount:3,ownedFunctionCount:3,
  definerCount:2,invokerCount:1,hardenedSearchPathCount:3,apiCallableCount:2});
 for(const key of flags)b[key]=false;
 b.rowSecurity=true;b.forceRowSecurity=true;b.meterRoleTableDelete=true;
 Object.assign(c,b,{columnCount:17,checkCount:6,costPolicyCount:6,
  ledgerPolicyCount:4,lifecycleColumnCount:1,lifecycleShapeConstraintCount:1,
  meterRoleTableUpdate:true,functionCount:5,ownedFunctionCount:5,
  definerCount:4,hardenedSearchPathCount:5,apiCallableCount:4});
 Object.assign(d,c,{functionCount:7,ownedFunctionCount:7,definerCount:6,
  hardenedSearchPathCount:7,apiCallableCount:6});
 return [a,b,c,d,original()];
};
describe('R2-H Cost Foundation 1550→1560→1570 PG17 replay',()=>{
 it('accepts sequential schema/role/ACL and full rollback without deployment authorization',()=>{
  expect(verifyR2HCostSequence(...states())).toMatchObject({
   status:'PASS_R2_H_1550_1570_PG17_SEQUENTIAL_ROLLBACK',
   productionWrites:0,drReady:false,rollbackClean:true});
 });
 it('rejects missing 1550 or function drift',()=>{
  for(const [step,key,value] of [[1,'tableCount',0],[1,'functionCount',2],[2,'functionCount',4],[3,'functionCount',6]]){
   const s=states();s[step][key]=value;
   expect(()=>verifyR2HCostSequence(...s)).toThrow('CATALOG_OR_DEPENDENCY_DRIFT');
  }
 });
 it('rejects bad lifecycle shape, absence of backfill-bound columns, premature 1580',()=>{
  for(const [step,key,value] of [[2,'lifecycleColumnCount',0],[2,'lifecycleShapeConstraintCount',0],
   [3,'lifecycleShapeConstraintCount',0],[3,'future1580Applied',true]]){
   const s=states();s[step][key]=value;
   expect(()=>verifyR2HCostSequence(...s)).toThrow();
  }
 });
 it('rejects missing FORCE RLS, direct client access, or helper privilege escalation',()=>{
  for(const field of ['forceRowSecurity','rowSecurity','browserOrServiceCallable',
   'cleanupApiCallable','anonTableDml','authenticatedTableDml',
   'serviceRoleTableDml','apiExecutorTableDml']){
   const s=states();s[3][field]=field==='rowSecurity'||field==='forceRowSecurity'?false:true;
   expect(()=>verifyR2HCostSequence(...s)).toThrow('RLS_ACL_OR_CREATOR_DRIFT');
  }
 });
 it('rejects narrow Owner privileges and creator role membership leaks',()=>{
  for(const [field,value] of [['meterRoleLeastPrivilege',0],['creatorDirectMembershipCount',1],
   ['meterRoleSchemaCreate',true],['meterRoleTableUpdate',false],
   ['ownedFunctionCount',6]]){
   const s=states();s[3][field]=value;
   expect(()=>verifyR2HCostSequence(...s)).toThrow();
  }
 });
 it('rejects missing append-only phase, RLS policy, trigger or schema index',()=>{
  for(const [field,value] of [['checkCount',4],['costPolicyCount',4],
   ['ledgerPolicyCount',2],['cleanupTriggerCount',0],['indexCount',2]]){
   const s=states();s[1][field]=value;
   expect(()=>verifyR2HCostSequence(...s)).toThrow('CATALOG_OR_DEPENDENCY_DRIFT');
  }
 });
 it('rejects rollback drift and false Owner readiness claims',()=>{
  const s=states();s[4].tableCount=1;
  expect(()=>verifyR2HCostSequence(...s)).toThrow('CATALOG_OR_DEPENDENCY_DRIFT');
  const t=states();t[2].authorizedForProduction=true;
  expect(()=>verifyR2HCostSequence(...t)).toThrow('EVIDENCE_OR_SCOPE');
 });
 it('rejects extra source payload and invalid snapshot stage',()=>{
  const x=states()[3];x.roleGraph='not allowed';
  expect(()=>validateCostState(x,3)).toThrow('EVIDENCE_OR_SCOPE');
  expect(()=>validateCostState(states()[0],4)).toThrow('INVALID_STAGE');
 });
});
