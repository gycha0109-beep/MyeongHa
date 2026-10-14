import {describe,it,expect} from 'vitest';
import {validateR2H16201630,verifyR2H16201630} from '../scripts/operations/verify-seyeon-r2-h-1620-1630.mjs';
const zero=()=>({
 schema:'r2-h-1620-1630-governed-private-v1',pgMajor:17,
 costLedgerPresent:false,costMeterRoleCount:0,exposedCount:0,
 privateSettleCount:0,privateStartCount:0,
 privateStartSecure:null,privateStartApiExecute:null,privateStartClientExecute:null,
 privateSettleSecure:null,privateSettleApiExecute:null,privateSettleClientExecute:null,
 exposedOwnedSecureCount:0,apiExposedExecuteCount:0,clientExposedExecuteCount:0,
 legacyStartDdlSha:null,governedStartDdlSha:null,legacyStartAclSha:null,
 governedStartAclSha:null,legacySettleAclSha:null,governedSettleAclSha:null,
 governedRoleCount:0,governedRoleLeastPrivilegeCount:0,governedRoleMembershipEdgeCount:0,
 governedRoleSchemaUsage:null,governedRoleSchemaCreate:null,
 governedContextFunctions:0,governedCostFunctions:0,governedLegacyFunctions:0,
 governedPrivateFunctions:0,governedDirectTableDml:false,meterCreatorMembership:0,
 future1640Present:0,reviewUnit:'cost-governor-foundation',
 authorizedForProduction:false,credentialProvisioned:false,drReady:false
});
const seq=()=>{
 const a=zero(),b=zero();
 Object.assign(b,{costLedgerPresent:true,costMeterRoleCount:1,exposedCount:4,
  privateSettleCount:1,privateSettleSecure:true,privateSettleApiExecute:false,
  privateSettleClientExecute:false,exposedOwnedSecureCount:4,apiExposedExecuteCount:4,
  legacyStartDdlSha:'a'.repeat(64),governedStartDdlSha:'b'.repeat(64),
  legacyStartAclSha:'c'.repeat(64),governedStartAclSha:'d'.repeat(64),
  legacySettleAclSha:'e'.repeat(64),governedSettleAclSha:'f'.repeat(64)});
 const c=structuredClone(b);
 Object.assign(c,{privateStartCount:1,privateStartSecure:true,
  privateStartApiExecute:false,privateStartClientExecute:false,
  legacyStartDdlSha:'1'.repeat(64),governedStartDdlSha:'2'.repeat(64)});
 const d=structuredClone(c);
 Object.assign(d,{governedRoleCount:1,governedRoleLeastPrivilegeCount:1,
  governedRoleSchemaUsage:true,governedRoleSchemaCreate:false,
  governedContextFunctions:4,governedCostFunctions:2,
  governedStartAclSha:'3'.repeat(64),governedSettleAclSha:'4'.repeat(64)});
 return [a,b,c,d,zero()];
};
describe('R2-H 1620/1630 governed private start and dormant execution role',()=>{
 it('accepts narrow catalog and rollback, refuses to turn CI into production approval',()=>{
  expect(verifyR2H16201630(...seq())).toMatchObject({
   status:'PASS_R2_H_1620_1630_PG17_PRIVATE_GOVERNED_ROLE_ROLLBACK',
   credentialsProvisioned:false,productionWrites:0,drReady:false});
 });
 it('rejects absent dependencies and premature 1640 preapplication',()=>{
  for(const [stage,k,v] of [[1,'costLedgerPresent',false],[1,'privateSettleCount',0],
   [2,'future1640Present',1]]){const s=seq();s[stage][k]=v;
   expect(()=>verifyR2H16201630(...s)).toThrow();}
 });
 it('rejects private start public/API execution, Owner drift and definer loss',()=>{
  for(const [k,v] of [['privateStartApiExecute',true],['privateStartClientExecute',true],
    ['privateStartSecure',false]]){const s=seq();s[2][k]=v;
    expect(()=>verifyR2H16201630(...s)).toThrow('AUTHORITY_STAGE_2_'+k);}
 });
 it('rejects LOGIN, BYPASSRLS, or user role member/legacy edges',()=>{
  for(const [k,v] of [['governedRoleLeastPrivilegeCount',0],
   ['governedRoleMembershipEdgeCount',1],['governedLegacyFunctions',1],
   ['governedPrivateFunctions',1],['governedDirectTableDml',true],
   ['meterCreatorMembership',1]]){const s=seq();s[3][k]=v;
   expect(()=>verifyR2H16201630(...s)).toThrow();}
 });
 it('rejects missing context functions/governed RPC or unauthorized schema CREATE',()=>{
  for(const [k,v] of [['governedContextFunctions',3],
   ['governedCostFunctions',1],['governedRoleSchemaCreate',true]]){
   const s=seq();s[3][k]=v;expect(()=>verifyR2H16201630(...s)).toThrow();}
 });
 it('rejects changed legacy RPC ACL or missing governed role grants',()=>{
  let s=seq();s[2].legacyStartAclSha='1'.repeat(64);
  expect(()=>verifyR2H16201630(...s)).toThrow('1620_WIDENED_API_ACL');
  s=seq();s[3].legacySettleAclSha='1'.repeat(64);
  expect(()=>verifyR2H16201630(...s)).toThrow('1630_WIDENED_LEGACY_ACL');
  s=seq();s[3].governedStartAclSha=s[2].governedStartAclSha;
  expect(()=>verifyR2H16201630(...s)).toThrow('1630_GOVERNED_EXEC_GRANT_MISSING');
 });
 it('rejects no-op private start rewrite and rollback artifacts',()=>{
  let s=seq();s[2].legacyStartDdlSha=s[1].legacyStartDdlSha;
  expect(()=>verifyR2H16201630(...s)).toThrow('1620_PRIVATE_START_NOT_INSTALLED');
  s=seq();s[4].governedRoleCount=1;
  expect(()=>verifyR2H16201630(...s)).toThrow('AUTHORITY_STAGE_0_governedRoleCount');
 });
 it('rejects false security approval and unexpected raw sensitive evidence',()=>{
  let s=seq();s[3].credentialProvisioned=true;
  expect(()=>verifyR2H16201630(...s)).toThrow('ENVELOPE_OR_FUTURE');
  const v=seq()[3];v.rawRoleGraph='not allowed';
  expect(()=>validateR2H16201630(v,3)).toThrow('ENVELOPE_OR_FUTURE');
 });
});
