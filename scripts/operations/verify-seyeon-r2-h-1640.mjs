// R2-H 1640: bounded three-stage PG17 + real trigger/temporary rows diagnostic.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const sha=/^[a-f0-9]{64}$/u;
const fail=s=>{throw Error('HOLD_R2_H_1640_'+s);};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fields=['schemaVersion','pgMajor','attemptTableCount','pinColumnCount',
 'pinColumnsCorrectTypes','pinShapeCheckCount','pinTriggerCount',
 'pinTriggerBeforeUpdate','pinTriggerInvokerHardened','pinnedFunctionCount',
 'pinnedOwnerAndDefiner','pinnedApiExecutor','pinnedBrowserServiceExecutor',
 'legacyFunctionCount','legacyApiExecutor','legacyBrowserServiceExecutor',
 'legacyDdlSha256','legacyOwnerSha256','legacyAclSha256','ownerRoleCount',
 'ownerRoleNonLoginNonBypass','creatorDirectMembershipCount','ownerSchemaCreate',
 'reviewUnit','authorizedForProduction','g1PositiveAdmissionAllowed','drReady'];
const flags=['pinTriggerBeforeUpdate','pinTriggerInvokerHardened','pinnedOwnerAndDefiner',
 'pinnedApiExecutor','pinnedBrowserServiceExecutor'];
const counts=['pinColumnCount','pinColumnsCorrectTypes','pinShapeCheckCount',
 'pinTriggerCount','pinnedFunctionCount'];
export function validateG1PinState(x,stage){
 if(!x||typeof x!=='object'||Array.isArray(x)
 ||!eq(Object.keys(x).sort(),[...fields].sort())
 ||x.schemaVersion!=='seyeon-r2-h-1640-zero-source-pg17-v1'
 ||x.pgMajor!==17||x.reviewUnit!=='g1-memory-pin'
 ||x.authorizedForProduction!==false||x.g1PositiveAdmissionAllowed!==false||x.drReady!==false)
 fail('EVIDENCE_SCOPE');
 if(stage!=='before'&&stage!=='after')fail('BAD_STAGE');
 if(x.attemptTableCount!==1||x.legacyFunctionCount!==1||x.ownerRoleCount!==1
 ||x.ownerRoleNonLoginNonBypass!==true||x.creatorDirectMembershipCount!==0
 ||x.ownerSchemaCreate!==false||x.legacyBrowserServiceExecutor!==false
 ||!['legacyDdlSha256','legacyOwnerSha256','legacyAclSha256'].every(k=>sha.test(x[k])))
 fail('BASELINE_AUTHORITY_DRIFT');
 if(stage==='before'){
  if(counts.some(k=>x[k]!==0)
  ||flags.some(k=>x[k]!==null)
  ||x.legacyApiExecutor!==true)fail('1640_ALREADY_APPLIED');
 } else {
  const expected={pinColumnCount:2,pinColumnsCorrectTypes:2,pinShapeCheckCount:1,
   pinTriggerCount:1,pinnedFunctionCount:1};
  if(counts.some(k=>x[k]!==expected[k]))fail('1640_CATALOG_SHAPE');
  const trueFields=['pinTriggerBeforeUpdate','pinTriggerInvokerHardened',
   'pinnedOwnerAndDefiner','pinnedApiExecutor'];
  if(trueFields.some(k=>x[k]!==true)||x.pinnedBrowserServiceExecutor!==false
   ||x.legacyApiExecutor!==false)fail('1640_ACL_OR_IMMUTABILITY');
 }
 return x;
}
export function verifyG1PinSequence(before,applied,synthetic,restored){
 const a=validateG1PinState(before,'before');
 const b=validateG1PinState(applied,'after');
 const c=validateG1PinState(restored,'before');
 if(!eq(a,c))fail('ROLLBACK_DRIFT');
 if(a.legacyDdlSha256!==b.legacyDdlSha256||a.legacyOwnerSha256!==b.legacyOwnerSha256
  ||a.legacyAclSha256===b.legacyAclSha256)fail('LEGACY_REVOKE_DDL_OR_OWNER_DRIFT');
 const sFields=['schemaVersion','runningPinAccepted','unPinnedCommitBlocked',
  'nonRunningPinBlocked','provenanceMismatchBlocked','validZeroCommitAccepted',
  'malformedMissingRecordsCommitAccepted','productionWrites'];
 if(!synthetic||typeof synthetic!=='object'||Array.isArray(synthetic)
  ||!eq(Object.keys(synthetic).sort(),[...sFields].sort())
  ||synthetic.schemaVersion!=='seyeon-r2-h-1640-trigger-synthetic-v1'
  ||synthetic.productionWrites!==0
  ||['runningPinAccepted','unPinnedCommitBlocked','nonRunningPinBlocked',
    'provenanceMismatchBlocked','validZeroCommitAccepted'].some(k=>synthetic[k]!==true)
  ||typeof synthetic.malformedMissingRecordsCommitAccepted!=='boolean')
  fail('TRIGGER_SYNTHETIC_DRIFT');
 // Known trigger three-valued SQL edge is an explicit Owner HOLD, never a security PASS.
 return {status:synthetic.malformedMissingRecordsCommitAccepted
   ? 'HOLD_R2_H_1640_TRIGGER_NULL_RECORDS_COMMIT_GAP_REPRODUCED'
   : 'HOLD_R2_H_1640_SOURCE_AND_OWNER_RELEASE_REVIEW',
  unit:'g1-memory-pin',migration:'1640',
  functionAndPrivilegeBoundariesReplayed:true,
  triggerNegativeAndPositiveProbesPassed:true,
  malformedMissingRecordsCommitAccepted:synthetic.malformedMissingRecordsCommitAccepted,
  rollbackClean:true,productionWrites:0,
  g1PositiveAdmissionAllowed:false,ownerApprovalEstablished:false,
  authorizedForProduction:false,drReady:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)fail('USAGE');
  const a=readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/u).filter(Boolean);
  if(a.length!==4)fail('EXPECTED_FOUR_METADATA_SNAPSHOTS');
  console.log(JSON.stringify(verifyG1PinSequence(...a.map(x=>JSON.parse(x)))));
 }catch(e){console.error(String(e?.message??e).slice(0,240));process.exitCode=1;}
}
