// Fail-closed metadata-only R2-H 1520 first Owner review unit.
// No migration execution, no Production access, no source SQL or ACL text output.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha=/^[a-f0-9]{64}$/u;
const hold=(key)=>{throw new Error('HOLD_R2_H_1520_'+key);};
const keys=['schemaVersion','postgresMajor','functionCount','functionDdlSha256',
 'functionOwnerSha256','functionRawAclSha256','securityDefiner','searchPathHardened',
 'anonExecute','authenticatedExecute','serviceRoleExecute','apiExecutorExecute',
 'later1530ObjectExists','reviewUnit','authorizedForProduction','drReady'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validateR2H1520Snapshot(x){
 if(!x||typeof x!=='object'||Array.isArray(x)
  || !same(Object.keys(x).sort(),[...keys].sort())
  ||x.schemaVersion!=='seyeon-r2-h-1520-isolated-v1'||x.postgresMajor!==17
  ||x.functionCount!==1||x.reviewUnit!=='deletion'
  ||!['functionDdlSha256','functionOwnerSha256','functionRawAclSha256']
    .every(k=>typeof x[k]==='string'&&sha.test(x[k]))
  ||x.securityDefiner!==true||x.searchPathHardened!==true
  ||x.anonExecute!==false||x.authenticatedExecute!==false
  ||x.serviceRoleExecute!==false||x.apiExecutorExecute!==false
  ||x.later1530ObjectExists!==false
  ||x.authorizedForProduction!==false||x.drReady!==false)
  hold('CATALOG_OR_PRIVILEGE_VIOLATION');
 return x;
}
export function verifyR2H1520Sequence(before,applied,restored){
 const a=validateR2H1520Snapshot(before);
 const b=validateR2H1520Snapshot(applied);
 const c=validateR2H1520Snapshot(restored);
 if(!same(a,c))hold('ROLLBACK_DRIFT');
 if(a.functionDdlSha256===b.functionDdlSha256)hold('BODY_NOT_REPLACED');
 if(a.functionOwnerSha256!==b.functionOwnerSha256)hold('OWNER_DRIFT');
 if(a.functionRawAclSha256!==b.functionRawAclSha256)hold('ACL_DRIFT');
 return {status:'PASS_R2_H_1520_ISOLATED_REPLACE_AND_ROLLBACK',
  verifiedUnit:'deletion',version:'1520',functionReplaced:true,
  ownerPreserved:true,aclPreserved:true,
  browserOrServiceEscalation:false,laterMigrationPreapplied:false,
  rollbackClean:true,productionWrites:0,ownerApprovalEstablished:false,
  authorizedForProduction:false,drReady:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)hold('USAGE');
  const lines=readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/u).filter(Boolean);
  if(lines.length!==3)hold('EXPECTED_THREE_SNAPSHOTS');
  console.log(JSON.stringify(verifyR2H1520Sequence(...lines.map(l=>JSON.parse(l)))));
 }catch(e){console.error(String(e?.message??e).slice(0,260));process.exitCode=1;}
}
