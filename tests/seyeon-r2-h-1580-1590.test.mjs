import {describe,it,expect} from 'vitest';
import {verifyR2H15801590Sequence} from '../scripts/operations/verify-seyeon-r2-h-1580-1590.mjs';
const original=()=>({
 version:'r2-h-1580-1590-pg17-v1',pgMajor:17,ledgerCount:0,meterRoleCount:0,
 legacyStartPresent:false,governorTables:0,governorRlsCount:0,
 governorTableOwnerCount:0,governorPolicyCount:0,governorScopedPolicyCount:0,
 governorLedgerColumns:0,ledgerQuoteCheck:0,ledgerGovernorIndex:0,
 activePolicyUniqueIndex:0,ledgerEffectiveStored:null,
 governedStartCount:0,governedSettleCount:0,governedStartDdlSha:null,
 governedStartOwnerValid:null,governedSettleOwnerValid:null,
 governedStartOnlyApi:null,governedSettleOnlyApi:null,browserGovernorDml:false,
 creatorMeterMembershipCount:0,meterRoleSchemaCreate:null,
 pending1600ObjectExists:false,reviewUnit:'cost-governor-foundation',
 authorizedForProduction:false,drReady:false});
const sequence=()=>{
 const a=original(),b=structuredClone(a);
 b.ledgerCount=1;b.meterRoleCount=1;b.legacyStartPresent=true;
 b.meterRoleSchemaCreate=false;
 const c=structuredClone(b);
 Object.assign(c,{governorTables:2,governorRlsCount:2,governorTableOwnerCount:2,
  governorPolicyCount:3,governorScopedPolicyCount:3,governorLedgerColumns:6,
  ledgerQuoteCheck:1,ledgerGovernorIndex:1,activePolicyUniqueIndex:1,
  governedStartCount:1,governedStartDdlSha:'a'.repeat(64),
  governedStartOwnerValid:true,governedStartOnlyApi:true});
 const d=structuredClone(c);
 Object.assign(d,{governedSettleCount:1,ledgerEffectiveStored:true,
  governedStartDdlSha:'b'.repeat(64),
  governedSettleOwnerValid:true,governedSettleOnlyApi:true});
 return [a,b,c,d,original()];
};
describe('R2-H 1580/1590 budget governor PG17 isolated audit',()=>{
 it('accepts exact prerequisites, admission, settlement, rollback with deployment HOLD',()=>{
  expect(verifyR2H15801590Sequence(...sequence())).toMatchObject({
   status:'PASS_R2_H_1580_1590_PG17_ATOMIC_GOVERNOR_ROLLBACK',
   productionWrites:0,rollbackClean:true,drReady:false});
 });
 it('rejects missing 1550/1560 prerequisites',()=>{
  for(const [key,value] of [['ledgerCount',0],['meterRoleCount',0],['legacyStartPresent',false]]){
   const s=sequence();s[1][key]=value;
   expect(()=>verifyR2H15801590Sequence(...s)).toThrow();
  }
 });
 it('rejects governor table/RLS/policy/index and ledger quote changes',()=>{
  for(const k of ['governorTables','governorRlsCount','governorTableOwnerCount',
   'governorPolicyCount','governorScopedPolicyCount','governorLedgerColumns',
   'ledgerQuoteCheck','ledgerGovernorIndex','activePolicyUniqueIndex']){
   const s=sequence();s[2][k]=0;
   expect(()=>verifyR2H15801590Sequence(...s)).toThrow('CATALOG_STAGE_2_'+k);
  }
 });
 it('rejects browser/Service table DML, role grants and call ACL escalation',()=>{
  for(const [key,value] of [['browserGovernorDml',true],
   ['creatorMeterMembershipCount',1],['meterRoleSchemaCreate',true],
   ['governedStartOnlyApi',false]]){
   const s=sequence();s[2][key]=value;
   expect(()=>verifyR2H15801590Sequence(...s)).toThrow();
  }
 });
 it('rejects unowned settle command or premature effective accounting',()=>{
  let s=sequence();s[3].governedSettleOwnerValid=false;
  expect(()=>verifyR2H15801590Sequence(...s)).toThrow('GOVERNED_SETTLEMENT_AUTHORITY');
  s=sequence();s[2].ledgerEffectiveStored=true;
  expect(()=>verifyR2H15801590Sequence(...s)).toThrow('PREMATURE_SETTLEMENT');
 });
 it('rejects no-op governing admission or disallowed 1600 pre-application',()=>{
  let s=sequence();s[3].governedStartDdlSha=s[2].governedStartDdlSha;
  expect(()=>verifyR2H15801590Sequence(...s)).toThrow('ADMISSION_NOT_REPLACED');
  s=sequence();s[3].pending1600ObjectExists=true;
  expect(()=>verifyR2H15801590Sequence(...s)).toThrow('ENVELOPE_OR_SCOPE');
 });
 it('rejects rollback/false Production approval and unexpected data fields',()=>{
  let s=sequence();s[4].ledgerCount=1;
  expect(()=>verifyR2H15801590Sequence(...s)).toThrow('CATALOG_STAGE_0_ledgerCount');
  s=sequence();s[2].drReady=true;
  expect(()=>verifyR2H15801590Sequence(...s)).toThrow('ENVELOPE_OR_SCOPE');
  s=sequence();s[2].personalData='unexpected';
  expect(()=>verifyR2H15801590Sequence(...s)).toThrow('ENVELOPE_OR_SCOPE');
 });
});
