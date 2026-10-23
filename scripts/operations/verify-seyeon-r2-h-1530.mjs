// R2-H 1530 isolated nested replay: five exact metadata snapshots, fail closed.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const sha=/^[0-9a-f]{64}$/u;
const hold=s=>{throw new Error('HOLD_R2_H_1530_'+s);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=['schemaVersion','postgresMajor','parentFunctionCount','parentDdlSha256',
 'parentOwnerSha256','parentRawAclSha256','tableCount','tableRls','tableForceRls',
 'primaryKeyCount','uniqueCount','foreignKeyCount','checkCount','indexCount',
 'triggerCount','triggerBeforeUpdateDelete','policyCount','narrowPolicies',
 'ownerRoleCount','ownerRoleLeastPrivilege','creatorRoleMembership',
 'ownerRoleSchemaCreate','writerFunctionCount','writerSecurityDefiner',
 'writerSearchPathHardened','writerOwnedByNarrowRole','apiWriterExecute',
 'anonWriterExecute','authenticatedWriterExecute','serviceWriterExecute',
 'anonTableDml','authenticatedTableDml','serviceTableDml','apiTableDml',
 'reviewUnit','authorizedForProduction','drReady'];
const counts=['tableCount','primaryKeyCount','uniqueCount','foreignKeyCount',
 'checkCount','indexCount','triggerCount','policyCount','narrowPolicies',
 'ownerRoleCount','writerFunctionCount'];
const props=['tableRls','tableForceRls','triggerBeforeUpdateDelete',
 'ownerRoleLeastPrivilege','creatorRoleMembership','ownerRoleSchemaCreate',
 'writerSecurityDefiner','writerSearchPathHardened','writerOwnedByNarrowRole',
 'apiWriterExecute','anonWriterExecute','authenticatedWriterExecute',
 'serviceWriterExecute','anonTableDml','authenticatedTableDml',
 'serviceTableDml','apiTableDml'];
export function validateR2H1530(x,stage){
 if(!x||typeof x!=='object'||Array.isArray(x)||!same(Object.keys(x).sort(),[...keys].sort())
 ||x.schemaVersion!=='seyeon-r2-h-1530-artifact-isolated-v1'
 ||x.postgresMajor!==17||x.parentFunctionCount!==1
 ||!['parentDdlSha256','parentOwnerSha256','parentRawAclSha256'].every(k=>sha.test(x[k]))
 ||x.reviewUnit!=='character-artifact'
 ||x.authorizedForProduction!==false||x.drReady!==false)hold('INVALID_ENVELOPE');
 if(!['absent','applied'].includes(stage))hold('INVALID_STAGE');
 if(stage==='absent'){
  if(counts.some(k=>x[k]!==0)
   ||props.some(k=>x[k]!==false&&x[k]!==null))hold('UNEXPECTED_PREEXISTING_ARTIFACT');
 }else{
  const expected={tableCount:1,primaryKeyCount:1,uniqueCount:2,foreignKeyCount:2,
   checkCount:4,indexCount:4,triggerCount:1,policyCount:2,narrowPolicies:2,
   ownerRoleCount:1,writerFunctionCount:1};
  if(counts.some(k=>x[k]!==expected[k]))hold('ARTIFACT_CATALOG_MISMATCH');
  const truth=['tableRls','triggerBeforeUpdateDelete','ownerRoleLeastPrivilege',
   'creatorRoleMembership','writerSecurityDefiner','writerSearchPathHardened',
   'writerOwnedByNarrowRole','apiWriterExecute'];
  const falsity=['tableForceRls','ownerRoleSchemaCreate','anonWriterExecute',
   'authenticatedWriterExecute','serviceWriterExecute','anonTableDml',
   'authenticatedTableDml','serviceTableDml','apiTableDml'];
  if(truth.some(k=>x[k]!==true)||falsity.some(k=>x[k]!==false))
   hold('PRIVILEGE_RLS_OR_CREATOR_MEMBERSHIP_DRIFT');
 }
 return x;
}
export function verifyR2H1530Sequence(before,after1520,applied,afterSavepointRollback,afterFullRollback){
 const a=validateR2H1530(before,'absent');
 const b=validateR2H1530(after1520,'absent');
 const c=validateR2H1530(applied,'applied');
 const d=validateR2H1530(afterSavepointRollback,'absent');
 const e=validateR2H1530(afterFullRollback,'absent');
 if(same(a.parentDdlSha256,b.parentDdlSha256))hold('DEPENDENCY_1520_NOT_APPLIED');
 if(!same(a.parentOwnerSha256,b.parentOwnerSha256)
  ||!same(a.parentRawAclSha256,b.parentRawAclSha256))hold('DEPENDENCY_OWNER_OR_ACL_DRIFT');
 if(['parentDdlSha256','parentOwnerSha256','parentRawAclSha256']
  .some(k=>b[k]!==c[k]))hold('1530_MUTATED_1520_PARENT');
 if(!same(b,d))hold('1530_SAVEPOINT_ROLLBACK_DRIFT');
 if(!same(a,e))hold('FULL_ROLLBACK_DRIFT');
 return {
  status:'HOLD_R2_H_1530_CREATOR_ROLE_MEMBERSHIP_RETAINED_OWNER_REVIEW',
  isolatedRehearsalPassed:true,version:'1530',dependency1520Replayed:true,
  artifactTableCreated:true,rlsAndNarrowWriterChecked:true,
  immutableTriggerChecked:true,foreignKeysVerified:2,
  ownerRoleSafelyConfigured:true,
  creatorRoleMembershipRetainedAfterMigration:true,
  finalSavepointRollbackClean:true,finalFullRollbackClean:true,
  originEstablished:false,ownerApprovalEstablished:false,
  authorizedForProduction:false,drReady:false,productionWrites:0
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)hold('USAGE');
  const a=readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/u).filter(Boolean);
  if(a.length!==5)hold('EXPECTED_FIVE_SNAPSHOTS');
  console.log(JSON.stringify(verifyR2H1530Sequence(...a.map(v=>JSON.parse(v)))));
 }catch(e){console.error(String(e?.message??e).slice(0,250));process.exitCode=1;}
}
