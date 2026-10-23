import {describe,it,expect} from 'vitest';
import {validateR2H1530,verifyR2H1530Sequence} from '../scripts/operations/verify-seyeon-r2-h-1530.mjs';
const pre=()=>({
 schemaVersion:'seyeon-r2-h-1530-artifact-isolated-v1',postgresMajor:17,
 parentFunctionCount:1,parentDdlSha256:'a'.repeat(64),
 parentOwnerSha256:'b'.repeat(64),parentRawAclSha256:'c'.repeat(64),
 tableCount:0,tableRls:null,tableForceRls:null,primaryKeyCount:0,
 uniqueCount:0,foreignKeyCount:0,checkCount:0,indexCount:0,
 triggerCount:0,triggerBeforeUpdateDelete:null,policyCount:0,
 narrowPolicies:0,ownerRoleCount:0,ownerRoleLeastPrivilege:null,
 creatorRoleMembership:false,ownerRoleSchemaCreate:false,writerFunctionCount:0,
 writerSecurityDefiner:null,writerSearchPathHardened:null,
 writerOwnedByNarrowRole:null,apiWriterExecute:null,anonWriterExecute:null,
 authenticatedWriterExecute:null,serviceWriterExecute:null,anonTableDml:null,
 authenticatedTableDml:null,serviceTableDml:null,apiTableDml:null,
 reviewUnit:'character-artifact',authorizedForProduction:false,drReady:false
});
const clone=x=>structuredClone(x);
const seq=()=>{
 const a=pre(),b=pre();b.parentDdlSha256='d'.repeat(64);
 const c=clone(b);
 Object.assign(c,{tableCount:1,tableRls:true,tableForceRls:false,primaryKeyCount:1,
  uniqueCount:2,foreignKeyCount:2,checkCount:4,indexCount:4,
  triggerCount:1,triggerBeforeUpdateDelete:true,policyCount:2,narrowPolicies:2,
  ownerRoleCount:1,ownerRoleLeastPrivilege:true,creatorRoleMembership:true,
  ownerRoleSchemaCreate:false,writerFunctionCount:1,writerSecurityDefiner:true,
  writerSearchPathHardened:true,writerOwnedByNarrowRole:true,apiWriterExecute:true,
  anonWriterExecute:false,authenticatedWriterExecute:false,serviceWriterExecute:false,
  anonTableDml:false,authenticatedTableDml:false,serviceTableDml:false,apiTableDml:false});
 return [a,b,c,clone(b),clone(a)];
};
describe('R2-H 1530 isolated table/owner/grant/rollback, never deployment approval',()=>{
 it('records exact synthetic replay and flags retained executor role membership',()=>{
  expect(verifyR2H1530Sequence(...seq())).toMatchObject({
   status:'HOLD_R2_H_1530_CREATOR_ROLE_MEMBERSHIP_RETAINED_OWNER_REVIEW',
   isolatedRehearsalPassed:true,creatorRoleMembershipRetainedAfterMigration:true,
   authorizedForProduction:false,drReady:false
  });
 });
 it('rejects 1520 not applied or changed owner/ACL',()=>{
  let s=seq();s[1].parentDdlSha256=s[0].parentDdlSha256;
  expect(()=>verifyR2H1530Sequence(...s)).toThrow('DEPENDENCY_1520_NOT_APPLIED');
  s=seq();s[1].parentRawAclSha256='e'.repeat(64);
  expect(()=>verifyR2H1530Sequence(...s)).toThrow('DEPENDENCY_OWNER_OR_ACL_DRIFT');
 });
 it('rejects artifact integrity, FK/unique/check/index/trigger or policy drift',()=>{
  for(const key of ['primaryKeyCount','uniqueCount','foreignKeyCount',
   'checkCount','indexCount','triggerCount','policyCount','narrowPolicies']){
   const s=seq();s[2][key]=0;
   expect(()=>verifyR2H1530Sequence(...s)).toThrow('ARTIFACT_CATALOG_MISMATCH');
  }
 });
 it('rejects browser, api table, or managed service privilege escalation',()=>{
  for(const key of ['anonWriterExecute','authenticatedWriterExecute','serviceWriterExecute',
   'anonTableDml','authenticatedTableDml','serviceTableDml','apiTableDml']){
   const s=seq();s[2][key]=true;
   expect(()=>verifyR2H1530Sequence(...s)).toThrow('PRIVILEGE_RLS_OR_CREATOR_MEMBERSHIP_DRIFT');
  }
 });
 it('rejects RLS, immutable trigger, function security, narrowed owner or creator role membership drift',()=>{
  for(const key of ['tableRls','triggerBeforeUpdateDelete','ownerRoleLeastPrivilege',
   'creatorRoleMembership','writerSecurityDefiner','writerSearchPathHardened',
   'writerOwnedByNarrowRole','apiWriterExecute']){
   const s=seq();s[2][key]=false;
   expect(()=>verifyR2H1530Sequence(...s)).toThrow('PRIVILEGE_RLS_OR_CREATOR_MEMBERSHIP_DRIFT');
  }
 });
 it('rejects changed parent function, incomplete nested or final rollback',()=>{
  let s=seq();s[2].parentDdlSha256='e'.repeat(64);
  expect(()=>verifyR2H1530Sequence(...s)).toThrow('1530_MUTATED_1520_PARENT');
  s=seq();s[3].tableCount=1;
  expect(()=>verifyR2H1530Sequence(...s)).toThrow('UNEXPECTED_PREEXISTING_ARTIFACT');
  s=seq();s[4].parentDdlSha256='d'.repeat(64);
  expect(()=>verifyR2H1530Sequence(...s)).toThrow('FULL_ROLLBACK_DRIFT');
 });
 it('rejects approving or leaking unreviewed role evidence fields',()=>{
  let s=seq();s[2].drReady=true;
  expect(()=>verifyR2H1530Sequence(...s)).toThrow('INVALID_ENVELOPE');
  const x=seq()[2];x.roleGraph='PUBLIC=EXECUTE';
  expect(()=>validateR2H1530(x,'applied')).toThrow('INVALID_ENVELOPE');
 });
});
