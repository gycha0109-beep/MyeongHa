// Strict 5-stage R2-H 1580/1590 PG17 governor role, budget and rollback evidence.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const fail=(s)=>{throw Error('HOLD_R2_H_1580_1590_'+s);};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=['version','pgMajor','ledgerCount','meterRoleCount',
 'legacyStartPresent','governorTables','governorRlsCount',
 'governorTableOwnerCount','governorPolicyCount','governorScopedPolicyCount',
 'governorLedgerColumns','ledgerQuoteCheck','ledgerGovernorIndex',
 'activePolicyUniqueIndex','ledgerEffectiveStored',
 'governedStartCount','governedSettleCount','governedStartDdlSha',
 'governedStartOwnerValid','governedSettleOwnerValid',
 'governedStartOnlyApi','governedSettleOnlyApi','browserGovernorDml',
 'creatorMeterMembershipCount','meterRoleSchemaCreate',
 'pending1600ObjectExists','reviewUnit','authorizedForProduction','drReady'];
const countKeys=['ledgerCount','meterRoleCount','governorTables','governorRlsCount',
 'governorTableOwnerCount','governorPolicyCount','governorScopedPolicyCount',
 'governorLedgerColumns','ledgerQuoteCheck','ledgerGovernorIndex',
 'activePolicyUniqueIndex','governedStartCount','governedSettleCount',
 'creatorMeterMembershipCount'];
const tableStage={
 governorTables:2,governorRlsCount:2,governorTableOwnerCount:2,
 governorPolicyCount:3,governorScopedPolicyCount:3,
 governorLedgerColumns:6,ledgerQuoteCheck:1,ledgerGovernorIndex:1,
 activePolicyUniqueIndex:1,governedStartCount:1};
export function validateGovernorState(x,stage){
 if(!x||typeof x!=='object'||Array.isArray(x)
 ||!eq(Object.keys(x).sort(),[...keys].sort())
 ||x.version!=='r2-h-1580-1590-pg17-v1'||x.pgMajor!==17
 ||x.reviewUnit!=='cost-governor-foundation'
 ||x.authorizedForProduction!==false||x.drReady!==false
 ||x.pending1600ObjectExists!==false)fail('ENVELOPE_OR_SCOPE');
 if(!Number.isInteger(stage)||stage<0||stage>3)fail('UNKNOWN_STAGE');
 const expected=stage===0?{ledgerCount:0,meterRoleCount:0,governedSettleCount:0}:
  stage===1?{ledgerCount:1,meterRoleCount:1,governedSettleCount:0}:
  {...tableStage,ledgerCount:1,meterRoleCount:1,governedSettleCount:stage===3?1:0};
 for(const k of countKeys){
  const desired=k in expected?expected[k]:0;
  if(x[k]!==desired)fail('CATALOG_STAGE_'+stage+'_'+k);
 }
 if(x.legacyStartPresent!==(stage!==0))fail('PREREQUISITE_LIFECYCLE');
 if(stage<2){
  for(const k of ['governedStartDdlSha','governedStartOwnerValid',
   'governedSettleOwnerValid','governedStartOnlyApi','governedSettleOnlyApi','ledgerEffectiveStored']){
   if(x[k]!==null)fail('PREMATURE_FUNCTION_'+k);
  }
 }else{
  if(typeof x.governedStartDdlSha!=='string'||!/^[a-f0-9]{64}$/.test(x.governedStartDdlSha)
   ||x.governedStartOwnerValid!==true||x.governedStartOnlyApi!==true)
    fail('GOVERNED_START_OWNER_ACL');
  if(stage===2){
    if(x.ledgerEffectiveStored!==null||x.governedSettleOwnerValid!==null||x.governedSettleOnlyApi!==null)
     fail('PREMATURE_SETTLEMENT');
  }else{
    if(x.ledgerEffectiveStored!==true||x.governedSettleOwnerValid!==true
      ||x.governedSettleOnlyApi!==true)fail('GOVERNED_SETTLEMENT_AUTHORITY');
  }
 }
 if(x.browserGovernorDml!==false)fail('DIRECT_CLIENT_TABLE_DML');
 if(x.meterRoleSchemaCreate!==(stage===0?null:false))fail('ROLE_SCHEMA_CREATE_LEFT_ON');
 return x;
}
export function verifyR2H15801590Sequence(before,prereqs,after1580,after1590,restored){
 const a=validateGovernorState(before,0);
 validateGovernorState(prereqs,1);
 const c=validateGovernorState(after1580,2);
 const d=validateGovernorState(after1590,3);
 const e=validateGovernorState(restored,0);
 if(!eq(a,e))fail('ROLLBACK_DRIFT');
 if(c.governedStartDdlSha===d.governedStartDdlSha)fail('ADMISSION_NOT_REPLACED_BY_SETTLEMENT');
 return {status:'PASS_R2_H_1580_1590_PG17_ATOMIC_GOVERNOR_ROLLBACK',
  versions:['1580','1590'],prerequisites:['1550','1560','1570'],
  budgetTables:2,forceRls:true,scopedPolicies:3,
  singleActiveModelSyntheticConstraint:true,conservativeCostProof:true,
  startAndSettleOwnerAclVerified:true,
  admissionReplaced:true,rollbackClean:true,productionWrites:0,
  ownerApprovalEstablished:false,authorizedForProduction:false,drReady:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)fail('USAGE');
  const lines=readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/u).filter(Boolean);
  if(lines.length!==5)fail('EXPECTED_FIVE_CATALOG_STATES');
  console.log(JSON.stringify(verifyR2H15801590Sequence(...lines.map(x=>JSON.parse(x)))));
 }catch(e){console.error(String(e?.message??e).slice(0,230));process.exitCode=1;}
}
