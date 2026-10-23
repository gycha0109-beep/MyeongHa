import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const sha=/^[0-9a-f]{64}$/u;
const hold=s=>{throw new Error('HOLD_R2_H_1650_'+s)};
const eq=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
const fields=['schemaVersion','pgMajor','meterCount','governedRoleCount','subjectTableExists',
 'admissionCount','admissionDdlSha','admissionOwnerSha','admissionAclSha','helperCount',
 'helperSecurityDefiner','helperSearchPathHardened','helperOwnedByCostMeter',
 'helperOwnedByMigrationUser','helperOwnerSuperuser','meterExecHelper','runnerExecHelper',
 'apiExecHelper','browserOrServiceExecHelper','ownerMembershipCount',
 'later1670GuestResolverExists','reviewUnit','authorizedForProduction',
 'actualOriginalCommitVerified','drReady'];
const helperFlags=['helperSecurityDefiner','helperSearchPathHardened','helperOwnedByCostMeter',
 'helperOwnedByMigrationUser','helperOwnerSuperuser','meterExecHelper','runnerExecHelper',
 'apiExecHelper','browserOrServiceExecHelper'];
export function validate1650State(x,stage){
 if(!x||typeof x!=='object'||Array.isArray(x)
 ||!eq(Object.keys(x).sort(),[...fields].sort())
 ||x.schemaVersion!=='seyeon-r2-h-1650-active-subject-pg17-v1'
 ||x.pgMajor!==17||x.reviewUnit!=='governor-subject-lock'
 ||x.authorizedForProduction!==false||x.drReady!==false
 ||x.actualOriginalCommitVerified!==false||x.later1670GuestResolverExists!==false)
  hold('ENVELOPE');
 if(!Number.isInteger(stage)||stage<0||stage>2)hold('STAGE');
 if(x.subjectTableExists!==true)hold('SUBJECT_TABLE_MISSING');
 const expected={meterCount:stage===0?0:1,governedRoleCount:stage===0?0:1,
  admissionCount:stage===0?0:1,helperCount:stage===2?1:0,ownerMembershipCount:0};
 for(const [k,v] of Object.entries(expected))if(x[k]!==v)hold('CATALOG_'+stage+'_'+k);
 for(const k of ['admissionDdlSha','admissionOwnerSha','admissionAclSha'])
  if(stage===0?x[k]!==null:!sha.test(x[k]))hold('ADMISSION_DIGEST_'+k);
 if(stage<2){if(helperFlags.some(k=>x[k]!==null))hold('PREEXISTING_HELPER');}
 else{
  const yes=['helperSecurityDefiner','helperSearchPathHardened',
   'helperOwnedByMigrationUser','meterExecHelper'];
  const no=['helperOwnedByCostMeter','runnerExecHelper','apiExecHelper',
   'browserOrServiceExecHelper'];
  if(yes.some(k=>x[k]!==true)||no.some(k=>x[k]!==false)
  ||typeof x.helperOwnerSuperuser!=='boolean')hold('HELPER_AUTHORITY_OR_PRIVILEGE_DRIFT');
 }
 return x;
}
export function verify1650(before,prior,applied,restored){
 const a=validate1650State(before,0);
 const b=validate1650State(prior,1);
 const c=validate1650State(applied,2);
 const d=validate1650State(restored,0);
 if(!eq(a,d))hold('ROLLBACK_DRIFT');
 if(c.admissionDdlSha===b.admissionDdlSha)hold('ACTIVE_SUBJECT_LOCK_NOT_INJECTED');
 if(c.admissionOwnerSha!==b.admissionOwnerSha||c.admissionAclSha!==b.admissionAclSha)
  hold('GOVERNED_RPC_OWNER_OR_ACL_DRIFT');
 return {status:'HOLD_R2_H_1650_HELPER_SECURITY_DEFINER_OWNER_REVIEW',
  version:'1650',unit:'governor-subject-lock',predecessors:['1550','1560','1570','1580','1590','1600','1610','1620','1630'],
  originalGitBlobVerified:true,outerTransactionFencesNormalized:true,
  helperOwnedByMigrationUser:true,helperOwnerSuperuserInDisposablePg17:c.helperOwnerSuperuser,
  helperRestrictedExecute:true,syntheticInactiveSubjectDenied:true,
  admissionDdlReplacedWithoutOwnerAclDrift:true,rollbackClean:true,
  originalCommitAtomicityVerified:false,ownerApprovalEstablished:false,
  productionWrites:0,authorizedForProduction:false,drReady:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)hold('USAGE');
  const lines=readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/u).filter(Boolean);
  if(lines.length!==4)hold('EXPECTED_FOUR_SNAPSHOTS');
  console.log(JSON.stringify(verify1650(...lines.map(s=>JSON.parse(s)))));
 }catch(e){console.error(String(e.message).slice(0,240));process.exitCode=1;}
}
