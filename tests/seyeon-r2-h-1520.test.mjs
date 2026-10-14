import { describe,expect,it } from 'vitest';
import { verifyR2H1520Sequence,validateR2H1520Snapshot } from '../scripts/operations/verify-seyeon-r2-h-1520.mjs';
const base=()=>({schemaVersion:'seyeon-r2-h-1520-isolated-v1',postgresMajor:17,
 functionCount:1,functionDdlSha256:'a'.repeat(64),functionOwnerSha256:'b'.repeat(64),
 functionRawAclSha256:'c'.repeat(64),securityDefiner:true,searchPathHardened:true,
 anonExecute:false,authenticatedExecute:false,serviceRoleExecute:false,
 apiExecutorExecute:false,later1530ObjectExists:false,reviewUnit:'deletion',
 authorizedForProduction:false,drReady:false});
const sequence=()=>{
 const before=base(),applied=base(),restored=base();
 applied.functionDdlSha256='d'.repeat(64);
 return [before,applied,restored];
};
describe('R2-H first Owner review unit: 1520, not Production authority',()=>{
 it('accepts one function replacement and exact rollback without privilege change',()=>{
  expect(verifyR2H1520Sequence(...sequence())).toMatchObject({
   status:'PASS_R2_H_1520_ISOLATED_REPLACE_AND_ROLLBACK',
   rollbackClean:true,productionWrites:0,ownerApprovalEstablished:false,drReady:false
  });
 });
 it('rejects no-op replacement',()=>{
  const x=sequence();x[1].functionDdlSha256=x[0].functionDdlSha256;
  expect(()=>verifyR2H1520Sequence(...x)).toThrow('HOLD_R2_H_1520_BODY_NOT_REPLACED');
 });
 it('rejects owner changes and ACL drift',()=>{
  for(const [field,error] of [
   ['functionOwnerSha256','OWNER_DRIFT'],['functionRawAclSha256','ACL_DRIFT']]){
   const x=sequence();x[1][field]='e'.repeat(64);
   expect(()=>verifyR2H1520Sequence(...x)).toThrow('HOLD_R2_H_1520_'+error);
  }
 });
 it('rejects effective EXECUTE to browser, API or service roles',()=>{
  for(const key of ['anonExecute','authenticatedExecute','apiExecutorExecute','serviceRoleExecute']){
   const x=sequence();x[1][key]=true;
   expect(()=>verifyR2H1520Sequence(...x)).toThrow('HOLD_R2_H_1520_CATALOG_OR_PRIVILEGE_VIOLATION');
  }
 });
 it('rejects altered function-security attributes or preapplied 1530',()=>{
  for(const [key,value] of [['securityDefiner',false],['searchPathHardened',false],['later1530ObjectExists',true]]){
   const x=sequence();x[1][key]=value;
   expect(()=>verifyR2H1520Sequence(...x)).toThrow('HOLD_R2_H_1520_CATALOG_OR_PRIVILEGE_VIOLATION');
  }
 });
 it('rejects failed rollback or remaining changed function body',()=>{
  const x=sequence();x[2].functionDdlSha256=x[1].functionDdlSha256;
  expect(()=>verifyR2H1520Sequence(...x)).toThrow('HOLD_R2_H_1520_ROLLBACK_DRIFT');
 });
 it('rejects unauthorized promotion and malformed evidence',()=>{
  const x=sequence();x[0].drReady=true;
  expect(()=>verifyR2H1520Sequence(...x)).toThrow('HOLD_R2_H_1520_CATALOG_OR_PRIVILEGE_VIOLATION');
  const y=base();y.roleGraph='privileged';
  expect(()=>validateR2H1520Snapshot(y)).toThrow('HOLD_R2_H_1520_CATALOG_OR_PRIVILEGE_VIOLATION');
 });
});
