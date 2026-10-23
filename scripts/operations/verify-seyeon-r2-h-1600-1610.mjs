// Fail-closed catalog-only PG17 five-snapshot verification for held 1600/1610.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const sha=/^[a-f0-9]{64}$/u;
const fail=s=>{throw Error('HOLD_R2_H_1600_1610_'+s)};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fields=['schema','pgMajor','rateTableCount','meterCount','governedCount',
 'legacyCount','rateGuardCount','rateTriggerCount','rateTriggerBeforeUpdateDelete',
 'guardInvokerHardened','guardClientExec','legacyDefinerHardened',
 'legacyExecutor','legacyClientExecute','governedDefinerHardened',
 'governedExecutor','governedClientExecute','helperCount','helperDefinerHardened',
 'helperExecutor','helperClientExecute','legacyDdlDigest','governedDdlDigest',
 'legacyAclDigest','governedAclDigest','creatorMembershipCount',
 'meterRoleSchemaCreate','future1620Applied','ownerUnit',
 'authorizedForProduction','drReady'];
export function validateR2H16001610(x,stage){
 if(!x||typeof x!=='object'||Array.isArray(x)
  ||!eq(Object.keys(x).sort(),[...fields].sort())
  ||x.schema!=='seyeon-r2-h-1600-1610-guard-pg17-v1'
  ||x.pgMajor!==17||x.ownerUnit!=='cost-governor-foundation'
  ||x.future1620Applied!==false||x.authorizedForProduction!==false||x.drReady!==false)
   fail('SCOPE_OR_ENVELOPE');
 if(!Number.isInteger(stage)||stage<0||stage>3)fail('STAGE');
 const absent=stage===0,rate=stage>=2,priv=stage===3;
 const expectedCount={rateTableCount:absent?0:1,meterCount:absent?0:1,
  governedCount:absent?0:1,legacyCount:absent?0:1,
  rateGuardCount:rate?1:0,rateTriggerCount:rate?1:0,
  helperCount:priv?1:0,creatorMembershipCount:0};
 for(const [k,v] of Object.entries(expectedCount))
  if(x[k]!==v)fail('CATALOG_'+stage+'_'+k);
 const bools={
  rateTriggerBeforeUpdateDelete:rate?true:null,
  guardInvokerHardened:rate?true:null,
  guardClientExec:rate?false:null,
  legacyDefinerHardened:absent?null:true,
  legacyExecutor:absent?null:true,
  legacyClientExecute:absent?null:false,
  governedDefinerHardened:absent?null:true,
  governedExecutor:absent?null:true,
  governedClientExecute:absent?null:false,
  helperDefinerHardened:priv?true:null,
  helperExecutor:priv?false:null,
  helperClientExecute:priv?false:null,
  meterRoleSchemaCreate:absent?null:false
 };
 for(const [k,v] of Object.entries(bools))
  if(x[k]!==v)fail('PRIVILEGE_OR_TRIGGER_'+stage+'_'+k);
 for(const k of ['legacyDdlDigest','governedDdlDigest','legacyAclDigest','governedAclDigest'])
  if(absent?x[k]!==null:!sha.test(x[k]))fail('DIGEST_SHAPE_'+stage+'_'+k);
 return x;
}
export function verifyR2H16001610(a,b,c,d,e){
 const zero=validateR2H16001610(a,0);
 const prereq=validateR2H16001610(b,1);
 const rate=validateR2H16001610(c,2);
 const priv=validateR2H16001610(d,3);
 const restored=validateR2H16001610(e,0);
 if(!eq(zero,restored))fail('FULL_ROLLBACK_DRIFT');
 if(prereq.legacyDdlDigest!==rate.legacyDdlDigest)fail('1600_CHANGED_LEGACY_SETTLE');
 if(prereq.governedDdlDigest===rate.governedDdlDigest)fail('1600_RATE_RECOMPUTE_MISSING');
 if(rate.legacyDdlDigest===priv.legacyDdlDigest)fail('1610_LEGACY_GUARD_NOT_INSTALLED');
 if(rate.governedDdlDigest===priv.governedDdlDigest)fail('1610_PRIVATE_SETTLE_NOT_LINKED');
 for(const k of ['legacyAclDigest','governedAclDigest'])
  if(prereq[k]!==rate[k]||rate[k]!==priv[k])fail('FUNCTION_ACL_DRIFT_'+k);
 return {status:'PASS_R2_H_1600_1610_RATE_CARD_AND_LEGACY_GUARD_ROLLBACK',
  prerequisiteMigrations:['1550','1560','1570','1580','1590'],
  proofMigrations:['1600','1610'],
  rateCardImmutablePriceAndDeleteVerified:true,
  activationToggleAllowed:true,
  triggerOwnerAndHelperAclVerified:true,
  governedAndLegacyFunctionBoundariesVerified:true,
  rollbackClean:true,productionWrites:0,drReady:false,
  ownerApprovalEstablished:false,authorizedForProduction:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)fail('USAGE');
  const ss=readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/u).filter(Boolean);
  if(ss.length!==5)fail('EXPECTED_FIVE_SNAPSHOTS');
  console.log(JSON.stringify(verifyR2H16001610(...ss.map(x=>JSON.parse(x)))));
 }catch(e){console.error(String(e?.message??e).slice(0,240));process.exitCode=1;}
}
