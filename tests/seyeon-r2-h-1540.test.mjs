import {describe,it,expect} from 'vitest';
import {verifyR2H1540Sequence} from '../scripts/operations/verify-seyeon-r2-h-1540.mjs';
const blank=()=>({
 schemaVersion:'seyeon-r2-h-1540-saju-nonce-v1',pgMajor:17,
 tableCount:0,rlsEnabled:null,forceRls:null,columnCount:0,columnShapeCount:0,
 primaryKeyCount:0,checkCount:0,indexCount:0,policyCount:0,policyScopeCount:0,
 roleCount:0,leastPrivilegeRoles:0,creatorMembershipCount:0,
 browserAnonDml:null,browserAuthenticatedDml:null,serviceRoleDml:null,apiExecutorDml:null,
 runtimeDigestSelect:null,runtimeRetainedSelect:null,runtimeCreatedSelect:null,
 runtimeDigestInsert:null,runtimeRetainedInsert:null,runtimeCreatedInsert:null,
 runtimeTableUpdateDelete:null,gcDigestSelect:null,gcRetainedSelect:null,
 gcCreatedSelect:null,gcTableDelete:null,gcTableInsertUpdate:null,
 gcDigestInsert:null,later1550Exists:false,reviewUnit:'saju-proof',
 authorizedForProduction:false,drReady:false
});
const seq=()=>{
 const a=blank(),b=structuredClone(a),c=structuredClone(a);
 Object.assign(b,{tableCount:1,rlsEnabled:true,forceRls:true,columnCount:3,columnShapeCount:3,
  primaryKeyCount:1,checkCount:2,indexCount:2,policyCount:4,policyScopeCount:4,
  roleCount:2,leastPrivilegeRoles:2,runtimeDigestSelect:true,
  runtimeDigestInsert:true,runtimeRetainedInsert:true,gcDigestSelect:true,
  gcRetainedSelect:true,gcTableDelete:true});
 for(const k of Object.keys(b))if(b[k]===null)b[k]=false;
 return [a,b,c];
};
describe('R2-H 1540 independent Saju Proof PG17 replay',()=>{
 it('accepts exact standalone catalog and complete rollback, without release authorization',()=>{
  expect(verifyR2H1540Sequence(...seq())).toMatchObject({
   status:'PASS_R2_H_1540_ISOLATED_NONCE_REGISTRY_ROLLBACK',
   productionWrites:0,activatedHttpTransport:false,drReady:false});
 });
 it('rejects pre-existing table, roles, or later 1550',()=>{
  for(const [field,value] of [['tableCount',1],['roleCount',1],['later1550Exists',true]]){
   const s=seq();s[0][field]=value;
   expect(()=>verifyR2H1540Sequence(...s)).toThrow();
  }
 });
 it('rejects missing FORCE RLS or unapproved direct browser/server access',()=>{
  for(const [field,value] of [
   ['forceRls',false],['rlsEnabled',false],['browserAnonDml',true],
   ['browserAuthenticatedDml',true],['serviceRoleDml',true],['apiExecutorDml',true]]){
   const s=seq();s[1][field]=value;
   expect(()=>verifyR2H1540Sequence(...s)).toThrow('RLS_OR_ROLE_ACL_DRIFT');
  }
 });
 it('rejects privileges outside two role-specific column access contracts',()=>{
  for(const [field,value] of [
   ['runtimeRetainedSelect',true],['runtimeCreatedSelect',true],['runtimeCreatedInsert',true],
   ['runtimeTableUpdateDelete',true],['gcCreatedSelect',true],['gcDigestInsert',true],
   ['gcTableInsertUpdate',true],['runtimeDigestSelect',false],['gcTableDelete',false]]){
   const s=seq();s[1][field]=value;
   expect(()=>verifyR2H1540Sequence(...s)).toThrow('RLS_OR_ROLE_ACL_DRIFT');
  }
 });
 it('rejects policy misrouting, unsafe role traits and hidden executor memberships',()=>{
  for(const [field,value] of [['policyScopeCount',3],['policyCount',3],
   ['leastPrivilegeRoles',1],['creatorMembershipCount',1]]){
   const s=seq();s[1][field]=value;
   expect(()=>verifyR2H1540Sequence(...s)).toThrow('CATALOG_SHAPE_DRIFT');
  }
 });
 it('rejects missing digest check, constraints or expiration index',()=>{
  for(const [field,value] of [
   ['columnShapeCount',2],['checkCount',1],['primaryKeyCount',0],['indexCount',1]]){
   const s=seq();s[1][field]=value;
   expect(()=>verifyR2H1540Sequence(...s)).toThrow('CATALOG_SHAPE_DRIFT');
  }
 });
 it('rejects incomplete rollback and synthetic approval promotion',()=>{
  const s=seq();s[2].roleCount=2;
  expect(()=>verifyR2H1540Sequence(...s)).toThrow('BASELINE_NOT_ABSENT');
  const t=seq();t[1].drReady=true;
  expect(()=>verifyR2H1540Sequence(...t)).toThrow('INVALID_EVIDENCE');
 });
 it('rejects unexpected extra metadata and false evidence',()=>{
  const s=seq();s[1].roleGraph='unexpected';
  expect(()=>verifyR2H1540Sequence(...s)).toThrow('INVALID_EVIDENCE');
 });
});
