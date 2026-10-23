// Fail-closed R2-F metadata-only synthetic PG17 privilege difference proof.
// No membership graph, ACL text, SQL body or customer records are printed.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const roles=['api_executor','browser_anon','browser_authenticated','function_owner','server_service'];
const props=['exists','directExecute','effectiveExecute','schemaUsage','inheritsOwner','canSetOwner'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hold=(key)=>{throw new Error('HOLD_R2_EFFECTIVE_HELPER_'+key);};
export function validateEffectiveSnapshot(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
  value.schemaVersion!=='seyeon-r2-effective-helper-v1'||value.postgresMajor!==17||
  value.functionCount!==1||value.originEstablished!==false||
  value.authorizedForProduction!==false||value.drReady!==false||
  !value.roleResults||typeof value.roleResults!=='object'||
  !same(Object.keys(value.roleResults).sort(),roles))hold('INVALID_METADATA');
 const clean={};
 for(const role of roles){
  const data=value.roleResults[role];
  if(!data||typeof data!=='object'||Array.isArray(data)||
    !same(Object.keys(data).sort(),[...props].sort())||
    props.some(k=>typeof data[k]!=='boolean')||!data.exists)
    hold('INVALID_ROLE_CATEGORY');
  clean[role]={...data};
 }
 return clean;
}
export function verifyEffectiveHelperSequence(before,withGrant,after){
 const a=validateEffectiveSnapshot(before);
 const b=validateEffectiveSnapshot(withGrant);
 const c=validateEffectiveSnapshot(after);
 if(!same(a,c))hold('ROLLBACK_DRIFT');
 for(const role of roles){
  if(!a[role].schemaUsage || !b[role].schemaUsage)hold('SCHEMA_NOT_ACCESSIBLE');
  if(role!=='server_service'&&!same(a[role],b[role]))hold('UNRELATED_ROLE_DRIFT');
 }
 if(a.server_service.directExecute||a.server_service.effectiveExecute)
   hold('BASELINE_ALREADY_EXECUTABLE');
 if(a.server_service.inheritsOwner||a.server_service.canSetOwner||
    b.server_service.inheritsOwner||b.server_service.canSetOwner)
   hold('UNEXPECTED_OWNER_MEMBERSHIP_PATH');
 if(!b.server_service.directExecute||!b.server_service.effectiveExecute)
   hold('GRANT_NOT_EFFECTIVE');
 if(!a.function_owner.effectiveExecute||!b.function_owner.effectiveExecute)
   hold('OWNER_NOT_EXECUTABLE');
 for(const role of ['api_executor','browser_anon','browser_authenticated']){
  if(a[role].directExecute||a[role].effectiveExecute||
    b[role].directExecute||b[role].effectiveExecute)
    hold('UNAUTHORIZED_EXECUTE');
 }
 return {
  status:'PASS_R2_EFFECTIVE_SERVICE_GRANT_DIFF_REPRODUCED',
  expectedProductionObservation:'service-direct-and-effective-only; browser-and-api-denied',
  observedDifferenceCount:1,unrelatedRoleDrift:0,rollbackClean:true,
  historicalActorEstablished:false,grantNecessityEstablished:false,
  originEstablished:false,authorizedForProduction:false,drReady:false
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)hold('USAGE');
  const lines=readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/u).filter(Boolean);
  if(lines.length!==3)hold('EXPECTED_THREE_STATES');
  const json=lines.map(x=>JSON.parse(x));
  console.log(JSON.stringify(verifyEffectiveHelperSequence(...json)));
 }catch(error){
  console.error(String(error?.message??error).slice(0,210));
  process.exitCode=1;
 }
}
