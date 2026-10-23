import {describe,it,expect} from 'vitest';
import {normalized1650,pinnedBlob} from '../scripts/operations/prepare-seyeon-r2-h-1650.mjs';
import {validate1650State,verify1650} from '../scripts/operations/verify-seyeon-r2-h-1650.mjs';
const baseline=()=>({
 schemaVersion:'seyeon-r2-h-1650-active-subject-pg17-v1',pgMajor:17,
 meterCount:0,governedRoleCount:0,subjectTableExists:true,admissionCount:0,
 admissionDdlSha:null,admissionOwnerSha:null,admissionAclSha:null,
 helperCount:0,helperSecurityDefiner:null,helperSearchPathHardened:null,
 helperOwnedByCostMeter:null,helperOwnedByMigrationUser:null,helperOwnerSuperuser:null,
 meterExecHelper:null,runnerExecHelper:null,apiExecHelper:null,
 browserOrServiceExecHelper:null,ownerMembershipCount:0,
 later1670GuestResolverExists:false,reviewUnit:'governor-subject-lock',
 authorizedForProduction:false,actualOriginalCommitVerified:false,drReady:false
});
const ss=()=>{
 const a=baseline(),b=baseline(),c=baseline(),d=baseline();
 Object.assign(b,{meterCount:1,governedRoleCount:1,admissionCount:1,
  admissionDdlSha:'a'.repeat(64),admissionOwnerSha:'b'.repeat(64),
  admissionAclSha:'c'.repeat(64)});
 Object.assign(c,b,{admissionDdlSha:'d'.repeat(64),helperCount:1,
  helperSecurityDefiner:true,helperSearchPathHardened:true,
  helperOwnedByCostMeter:false,helperOwnedByMigrationUser:true,
  helperOwnerSuperuser:true,meterExecHelper:true,
  runnerExecHelper:false,apiExecHelper:false,browserOrServiceExecHelper:false});
 return [a,b,c,d];
};
describe('R2-H 1650 source-locked isolated active Subject guard',()=>{
 it('records verified rollback but flags migration-user SECURITY DEFINER owner review',()=>{
  expect(verify1650(...ss())).toMatchObject({
   status:'HOLD_R2_H_1650_HELPER_SECURITY_DEFINER_OWNER_REVIEW',
   rollbackClean:true,authorizedForProduction:false,originalCommitAtomicityVerified:false});
 });
 it('rejects unchecked source and missing transaction fences without claiming a replay',()=>{
  expect(()=>normalized1650('begin;\nselect 1;\ncommit;')).toThrow('GIT_BLOB_DRIFT');
  expect(pinnedBlob).toMatch(/^[0-9a-f]{40}$/);
 });
 it('rejects missing 1620/1630 and absent Subject',()=>{
  for(const [step,k,v] of [[1,'meterCount',0],[1,'governedRoleCount',0],[1,'subjectTableExists',false]]){
   const s=ss();s[step][k]=v;expect(()=>verify1650(...s)).toThrow();
  }
 });
 it('rejects client, API and governed-executor direct helper access',()=>{
  for(const k of ['runnerExecHelper','apiExecHelper','browserOrServiceExecHelper']){
   const s=ss();s[2][k]=true;expect(()=>verify1650(...s)).toThrow('HELPER_AUTHORITY_OR_PRIVILEGE_DRIFT');
  }
 });
 it('rejects incorrect helper owner, security definer, search path and grant',()=>{
  for(const [k,v] of [['helperOwnedByCostMeter',true],['helperOwnedByMigrationUser',false],
   ['helperSecurityDefiner',false],['helperSearchPathHardened',false],['meterExecHelper',false]]){
   const s=ss();s[2][k]=v;expect(()=>verify1650(...s)).toThrow('HELPER_AUTHORITY_OR_PRIVILEGE_DRIFT');
  }
 });
 it('rejects altered start Owner/ACL and absent DDL replacement',()=>{
  for(const [k,v] of [['admissionDdlSha','a'.repeat(64)],['admissionOwnerSha','e'.repeat(64)],
   ['admissionAclSha','e'.repeat(64)]]){
   const s=ss();s[2][k]=v;expect(()=>verify1650(...s)).toThrow();
  }
 });
 it('rejects residual role membership, 1670 preapplication and broken rollback',()=>{
  for(const [stage,k,v] of [[2,'ownerMembershipCount',1],[2,'later1670GuestResolverExists',true],
   [3,'meterCount',1]]){
   const s=ss();s[stage][k]=v;expect(()=>verify1650(...s)).toThrow();
  }
 });
 it('rejects unexpected raw data, approval and original-COMMIT claims',()=>{
  let s=ss();s[2].rawRoleGraph='not allowed';
  expect(()=>verify1650(...s)).toThrow('ENVELOPE');
  s=ss();s[2].actualOriginalCommitVerified=true;
  expect(()=>verify1650(...s)).toThrow('ENVELOPE');
  expect(()=>validate1650State(ss()[1],4)).toThrow('STAGE');
 });
});
