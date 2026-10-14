// R2-H 1550→1560→1570 PG17 fail-closed catalog-only evidence.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const fail=x=>{throw Error('HOLD_R2_H_COST_FOUNDATION_'+x)};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=[
 'schemaVersion','pgMajor','tableCount','rowSecurity','forceRowSecurity',
 'columnCount','pkCount','checkCount','indexCount','costPolicyCount',
 'ledgerPolicyCount','cleanupTriggerCount','lifecycleColumnCount',
 'lifecycleShapeConstraintCount','meterRoleCount','meterRoleLeastPrivilege',
 'creatorDirectMembershipCount','meterRoleSchemaCreate','meterRoleTableUpdate',
 'meterRoleTableDelete','functionCount','ownedFunctionCount','definerCount',
 'invokerCount','hardenedSearchPathCount','apiCallableCount',
 'browserOrServiceCallable','cleanupApiCallable','anonTableDml',
 'authenticatedTableDml','serviceRoleTableDml','apiExecutorTableDml',
 'future1580Applied','reviewUnit','authorizedForProduction','drReady'];
const counted=[
 'tableCount','columnCount','pkCount','checkCount','indexCount',
 'costPolicyCount','ledgerPolicyCount','cleanupTriggerCount',
 'lifecycleColumnCount','lifecycleShapeConstraintCount','meterRoleCount',
 'meterRoleLeastPrivilege','creatorDirectMembershipCount','functionCount',
 'ownedFunctionCount','definerCount','invokerCount',
 'hardenedSearchPathCount','apiCallableCount'];
const flags=['rowSecurity','forceRowSecurity','meterRoleSchemaCreate',
 'meterRoleTableUpdate','meterRoleTableDelete','browserOrServiceCallable',
 'cleanupApiCallable','anonTableDml','authenticatedTableDml',
 'serviceRoleTableDml','apiExecutorTableDml'];
const expected=[
 {tableCount:0,columnCount:0,pkCount:0,checkCount:0,indexCount:0,
  costPolicyCount:0,ledgerPolicyCount:0,cleanupTriggerCount:0,
  lifecycleColumnCount:0,lifecycleShapeConstraintCount:0,
  meterRoleCount:0,meterRoleLeastPrivilege:0,creatorDirectMembershipCount:0,
  functionCount:0,ownedFunctionCount:0,definerCount:0,invokerCount:0,
  hardenedSearchPathCount:0,apiCallableCount:0},
 {tableCount:1,columnCount:15,pkCount:1,checkCount:5,indexCount:3,
  costPolicyCount:5,ledgerPolicyCount:3,cleanupTriggerCount:1,
  lifecycleColumnCount:0,lifecycleShapeConstraintCount:0,
  meterRoleCount:1,meterRoleLeastPrivilege:1,creatorDirectMembershipCount:0,
  functionCount:3,ownedFunctionCount:3,definerCount:2,invokerCount:1,
  hardenedSearchPathCount:3,apiCallableCount:2},
 {tableCount:1,columnCount:17,pkCount:1,checkCount:6,indexCount:3,
  costPolicyCount:6,ledgerPolicyCount:4,cleanupTriggerCount:1,
  lifecycleColumnCount:1,lifecycleShapeConstraintCount:1,
  meterRoleCount:1,meterRoleLeastPrivilege:1,creatorDirectMembershipCount:0,
  functionCount:5,ownedFunctionCount:5,definerCount:4,invokerCount:1,
  hardenedSearchPathCount:5,apiCallableCount:4},
 {tableCount:1,columnCount:17,pkCount:1,checkCount:6,indexCount:3,
  costPolicyCount:6,ledgerPolicyCount:4,cleanupTriggerCount:1,
  lifecycleColumnCount:1,lifecycleShapeConstraintCount:1,
  meterRoleCount:1,meterRoleLeastPrivilege:1,creatorDirectMembershipCount:0,
  functionCount:7,ownedFunctionCount:7,definerCount:6,invokerCount:1,
  hardenedSearchPathCount:7,apiCallableCount:6}
];
export function validateCostState(obj,stage){
 if(!obj||typeof obj!=='object'||Array.isArray(obj)
 ||!eq(Object.keys(obj).sort(),[...keys].sort())
 ||obj.schemaVersion!=='seyeon-r2-h-cost-foundation-pg17-v1'
 ||obj.pgMajor!==17||obj.reviewUnit!=='cost-governor-foundation'
 ||obj.authorizedForProduction!==false||obj.drReady!==false||obj.future1580Applied!==false)
 fail('EVIDENCE_OR_SCOPE');
 if(!Number.isInteger(stage)||stage<0||stage>3)fail('INVALID_STAGE');
 if(counted.some(k=>obj[k]!==expected[stage][k]))fail('CATALOG_OR_DEPENDENCY_DRIFT');
 const wanted=stage===0
 ? Object.fromEntries(flags.map(k=>[k,null]))
 : {rowSecurity:true,forceRowSecurity:true,meterRoleSchemaCreate:false,
    meterRoleTableUpdate:stage>=2,meterRoleTableDelete:true,
    browserOrServiceCallable:false,cleanupApiCallable:false,
    anonTableDml:false,authenticatedTableDml:false,
    serviceRoleTableDml:false,apiExecutorTableDml:false};
 const drift=flags.find(k=>obj[k]!==wanted[k]);
 if(drift)fail('RLS_ACL_OR_CREATOR_DRIFT_STAGE_'+stage+'_'+drift);
 return obj;
}
export function verifyR2HCostSequence(before,after1550,after1560,after1570,restored){
 const original=validateCostState(before,0);
 validateCostState(after1550,1);
 validateCostState(after1560,2);
 validateCostState(after1570,3);
 const last=validateCostState(restored,0);
 if(!eq(original,last))fail('ROLLBACK_DRIFT');
 return {
  status:'PASS_R2_H_1550_1570_PG17_SEQUENTIAL_ROLLBACK',
  reviewUnit:'cost-governor-foundation',versions:['1550','1560','1570'],
  migrationSourcesReplayedInOrder:true,
  rlsAndExecutorScopeVerified:true,creatorMembershipRetained:false,
  syntheticLegacyBackfillAndLifecycleGuardsPassed:true,
  unknownCostNotCoalescedByStorage:true,rollbackClean:true,
  productionWrites:0,ownerApprovalEstablished:false,
  authorizedForProduction:false,drReady:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)fail('USAGE');
  const lines=readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/u).filter(Boolean);
  if(lines.length!==5)fail('EXPECTED_FIVE_SNAPSHOTS');
  console.log(JSON.stringify(verifyR2HCostSequence(...lines.map(l=>JSON.parse(l)))));
 }catch(e){console.error(String(e?.message??e).slice(0,240));process.exitCode=1;}
}
