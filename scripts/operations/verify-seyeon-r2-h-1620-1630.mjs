// R2-H 1620/1630 five snapshots. PG17 only, metadata and role authority.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const sha=/^[a-f0-9]{64}$/u;
const fail=x=>{throw Error('HOLD_R2_H_1620_1630_'+x)};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const names=['schema','pgMajor','costLedgerPresent','costMeterRoleCount','exposedCount',
'privateSettleCount','privateStartCount','privateStartSecure','privateStartApiExecute',
'privateStartClientExecute','privateSettleSecure','privateSettleApiExecute',
'privateSettleClientExecute','exposedOwnedSecureCount','apiExposedExecuteCount',
'clientExposedExecuteCount','legacyStartDdlSha','governedStartDdlSha',
'legacyStartAclSha','governedStartAclSha','legacySettleAclSha','governedSettleAclSha',
'governedRoleCount','governedRoleLeastPrivilegeCount','governedRoleMembershipEdgeCount',
'governedRoleSchemaUsage','governedRoleSchemaCreate','governedContextFunctions',
'governedCostFunctions','governedLegacyFunctions','governedPrivateFunctions',
'governedDirectTableDml','meterCreatorMembership','future1640Present',
'reviewUnit','authorizedForProduction','credentialProvisioned','drReady'];
const governedNumbers=['governedRoleCount','governedRoleLeastPrivilegeCount',
 'governedRoleMembershipEdgeCount','governedContextFunctions','governedCostFunctions',
 'governedLegacyFunctions','governedPrivateFunctions'];
const governedBools=['governedRoleSchemaUsage','governedRoleSchemaCreate','governedDirectTableDml'];
const aclKeys=['legacyStartAclSha','governedStartAclSha','legacySettleAclSha','governedSettleAclSha'];
export function validateR2H16201630(x,stage){
 if(!x||typeof x!=='object'||Array.isArray(x)
 ||!eq(Object.keys(x).sort(),[...names].sort())
 ||x.schema!=='r2-h-1620-1630-governed-private-v1'
 ||x.pgMajor!==17||x.reviewUnit!=='cost-governor-foundation'
 ||x.authorizedForProduction!==false||x.credentialProvisioned!==false
 ||x.drReady!==false||x.future1640Present!==0)fail('ENVELOPE_OR_FUTURE');
 if(!Number.isInteger(stage)||stage<0||stage>3)fail('INVALID_STAGE');
 const noCost=stage===0,hasStart=stage>=2,hasRole=stage===3;
 const fields={costLedgerPresent:!noCost,costMeterRoleCount:noCost?0:1,
  exposedCount:noCost?0:4,privateSettleCount:noCost?0:1,
  privateStartCount:hasStart?1:0,privateSettleSecure:noCost?null:true,
  privateSettleApiExecute:noCost?null:false,
  privateSettleClientExecute:noCost?null:false,
  privateStartSecure:hasStart?true:null,
  privateStartApiExecute:hasStart?false:null,
  privateStartClientExecute:hasStart?false:null,
  exposedOwnedSecureCount:noCost?0:4,
  apiExposedExecuteCount:noCost?0:4,
  clientExposedExecuteCount:0,
  meterCreatorMembership:0,
  governedRoleCount:hasRole?1:0,
  governedRoleLeastPrivilegeCount:hasRole?1:0,
  governedRoleMembershipEdgeCount:0,
  governedContextFunctions:hasRole?4:0,
  governedCostFunctions:hasRole?2:0,
  governedLegacyFunctions:0,governedPrivateFunctions:0,
  governedRoleSchemaUsage:hasRole?true:null,
  governedRoleSchemaCreate:hasRole?false:null,
  governedDirectTableDml:false};
 for(const [k,v] of Object.entries(fields))if(x[k]!==v)fail('AUTHORITY_STAGE_'+stage+'_'+k);
 for(const k of ['legacyStartDdlSha','governedStartDdlSha',...aclKeys])
   if(noCost?x[k]!==null:!sha.test(x[k]))fail('SHA_STAGE_'+stage+'_'+k);
 return x;
}
export function verifyR2H16201630(before,prerequisites,privateStart,governedRole,restored){
 const a=validateR2H16201630(before,0);
 const b=validateR2H16201630(prerequisites,1);
 const c=validateR2H16201630(privateStart,2);
 const d=validateR2H16201630(governedRole,3);
 const e=validateR2H16201630(restored,0);
 if(!eq(a,e))fail('ROLLBACK_DRIFT');
 if(b.legacyStartDdlSha===c.legacyStartDdlSha
    ||b.governedStartDdlSha===c.governedStartDdlSha)fail('1620_PRIVATE_START_NOT_INSTALLED');
 if(c.legacyStartDdlSha!==d.legacyStartDdlSha
    ||c.governedStartDdlSha!==d.governedStartDdlSha)fail('1630_MUTATED_START_CODE');
 for(const k of aclKeys){
  if(b[k]!==c[k])fail('1620_WIDENED_API_ACL_'+k);
  if(k.startsWith('legacy')&&c[k]!==d[k])fail('1630_WIDENED_LEGACY_ACL_'+k);
  if(k.startsWith('governed')&&c[k]===d[k])fail('1630_GOVERNED_EXEC_GRANT_MISSING_'+k);
 }
 return {status:'PASS_R2_H_1620_1630_PG17_PRIVATE_GOVERNED_ROLE_ROLLBACK',
  prerequisiteMigrations:['1550','1560','1570','1580','1590','1600','1610'],
  testedMigrations:['1620','1630'],privateCoreOwnedAndBlocked:true,
  legacyApiBehaviorShapePreserved:true,roleNologinLeastPrivilege:true,
  governedRoleOnlyContextAndTwoCostFunctions:true,legacyAndDirectLedgerDenied:true,
  credentialsProvisioned:false,roleMemberEdges:0,rollbackClean:true,
  productionWrites:0,authorizedForProduction:false,ownerApprovalEstablished:false,drReady:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==3)fail('USAGE');
  const lines=readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/u).filter(Boolean);
  if(lines.length!==5)fail('FIVE_STATES_REQUIRED');
  console.log(JSON.stringify(verifyR2H16201630(...lines.map(x=>JSON.parse(x)))));
 }catch(e){console.error(String(e?.message??e).slice(0,240));process.exitCode=1;}
}
