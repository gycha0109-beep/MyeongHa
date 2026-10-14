// Strict R2-H 1540 Saju Proof independent replay verifier.
// Only catalog metadata; neither a Production migration nor Saju release authority.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const hold=(x)=>{throw new Error('HOLD_R2_H_1540_'+x)};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=[
 'schemaVersion','pgMajor','tableCount','rlsEnabled','forceRls',
 'columnCount','columnShapeCount','primaryKeyCount','checkCount','indexCount',
 'policyCount','policyScopeCount','roleCount','leastPrivilegeRoles','creatorMembershipCount',
 'browserAnonDml','browserAuthenticatedDml','serviceRoleDml','apiExecutorDml',
 'runtimeDigestSelect','runtimeRetainedSelect','runtimeCreatedSelect',
 'runtimeDigestInsert','runtimeRetainedInsert','runtimeCreatedInsert','runtimeTableUpdateDelete',
 'gcDigestSelect','gcRetainedSelect','gcCreatedSelect','gcTableDelete',
 'gcTableInsertUpdate','gcDigestInsert','later1550Exists','reviewUnit',
 'authorizedForProduction','drReady'];
const counts=['tableCount','columnCount','columnShapeCount','primaryKeyCount',
 'checkCount','indexCount','policyCount','policyScopeCount','roleCount','leastPrivilegeRoles',
 'creatorMembershipCount'];
const tableBooleans=[
 'rlsEnabled','forceRls','browserAnonDml','browserAuthenticatedDml',
 'serviceRoleDml','apiExecutorDml','runtimeDigestSelect','runtimeRetainedSelect',
 'runtimeCreatedSelect','runtimeDigestInsert','runtimeRetainedInsert',
 'runtimeCreatedInsert','runtimeTableUpdateDelete','gcDigestSelect',
 'gcRetainedSelect','gcCreatedSelect','gcTableDelete','gcTableInsertUpdate','gcDigestInsert'];
export function validateR2H1540(snapshot,stage){
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)
 ||!same(Object.keys(snapshot).sort(),[...keys].sort())
 ||snapshot.schemaVersion!=='seyeon-r2-h-1540-saju-nonce-v1'
 ||snapshot.pgMajor!==17||snapshot.reviewUnit!=='saju-proof'
 ||snapshot.authorizedForProduction!==false||snapshot.drReady!==false
 ||snapshot.later1550Exists!==false)hold('INVALID_EVIDENCE');
 if(stage==='absent'){
  if(counts.some(k=>snapshot[k]!==0)
   ||tableBooleans.some(k=>snapshot[k]!==null))hold('BASELINE_NOT_ABSENT');
 } else if(stage==='applied'){
  const expected={tableCount:1,columnCount:3,columnShapeCount:3,
   primaryKeyCount:1,checkCount:2,indexCount:2,policyCount:4,
   policyScopeCount:4,roleCount:2,leastPrivilegeRoles:2,creatorMembershipCount:0};
  if(counts.some(k=>snapshot[k]!==expected[k]))hold('CATALOG_SHAPE_DRIFT');
  const on=['rlsEnabled','forceRls','runtimeDigestSelect','runtimeDigestInsert',
   'runtimeRetainedInsert','gcDigestSelect','gcRetainedSelect','gcTableDelete'];
  const off=tableBooleans.filter(k=>!on.includes(k));
  if(on.some(k=>snapshot[k]!==true)||off.some(k=>snapshot[k]!==false))
    hold('RLS_OR_ROLE_ACL_DRIFT');
 } else hold('INVALID_STAGE');
 return snapshot;
}
export function verifyR2H1540Sequence(before,applied,restored){
 const a=validateR2H1540(before,'absent');
 validateR2H1540(applied,'applied');
 const c=validateR2H1540(restored,'absent');
 if(!same(a,c))hold('ROLLBACK_DRIFT');
 return {status:'PASS_R2_H_1540_ISOLATED_NONCE_REGISTRY_ROLLBACK',
   version:'1540',unit:'saju-proof',
   replayedOnly1540:true,rlsForced:true,narrowRoles:2,policyCount:4,
   syntheticNonceFormatRetentionReplayProtected:true,rollbackClean:true,
   activatedHttpTransport:false,productionWrites:0,
   ownerApprovalEstablished:false,authorizedForProduction:false,drReady:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)hold('USAGE');
  const lines=readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/u).filter(Boolean);
  if(lines.length!==3)hold('EXPECTED_THREE_SNAPSHOTS');
  console.log(JSON.stringify(verifyR2H1540Sequence(...lines.map(v=>JSON.parse(v)))));
 }catch(e){console.error(String(e?.message??e).slice(0,220));process.exitCode=1;}
}
