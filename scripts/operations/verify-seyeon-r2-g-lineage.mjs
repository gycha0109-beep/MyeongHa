// R2-G bounded metadata controls, no 104KB SQL, DDL or ACL raw export.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hold=code=>{throw new Error('HOLD_R2_G_'+code);};
const sha=/^[a-f0-9]{64}$/u;
const equals=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const expectedTokens=Object.freeze({
 guestPromotionCreate:0,helperCreate:1,helperDirectGrant:0,helperOwnerAlter:1,
 manifestCreate:0,manifestGrant:1,manifestReference:8,manifestRevoke:2
});
const keyEq=(actual,expected)=>equals(Object.keys(actual).sort(),[...expected].sort());
function envelope(input,kind){
 if(!input||typeof input!=='object'||Array.isArray(input)
  ||!keyEq(input,['schemaVersion','source','snapshot','approval'])
  ||input.schemaVersion!=='seyeon-r2-g-protected-metadata-v1'
  ||input.source!=='2026-10-14-production-readonly'
  ||input.approval!=='HOLD_OWNER_PRIVATE_SOURCE_AUDIT')hold('EVIDENCE_ENVELOPE_INVALID');
 return kind==='remote'?validateRemote(input.snapshot):validateManifest(input.snapshot);
}
function zeroApproval(x){
 return x.originEstablished===false&&x.authorizedForProduction===false&&x.drReady===false;
}
export function validateRemote(x){
 if(!x||typeof x!=='object'||Array.isArray(x)||!keyEq(x,[
 'schemaVersion','postgresMajor','remoteRows','remoteBytes','remoteSqlSha256',
 'earlyMarkerRows','timestampedExactRows','lexicalIndicators',
 'timestampedVersionSortBeforeRemote','actualExecutionChronologyEstablished',
 'originEstablished','authorizedForProduction','drReady'
 ])||x.schemaVersion!=='seyeon-r2-g-remote-timestamped-v1'||x.postgresMajor!==17
 ||x.remoteRows!==1||x.remoteBytes!==104021
 ||x.remoteSqlSha256!=='4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894'
 ||x.earlyMarkerRows!==6||x.timestampedExactRows!==2
 ||x.timestampedVersionSortBeforeRemote!==true
 ||x.actualExecutionChronologyEstablished!==false||!zeroApproval(x)
 ||!x.lexicalIndicators||!keyEq(x.lexicalIndicators,Object.keys(expectedTokens))
 ||Object.entries(expectedTokens).some(([key,value])=>x.lexicalIndicators[key]!==value))
 hold('REMOTE_METADATA_DRIFT_OR_SOURCE_UNVERIFIED');
 return x;
}
export function validateManifest(x){
 const expected=['schemaVersion','postgresMajor','functionCount','ownerSha256','ddlSha256',
 'rawAclSha256','canonicalGrantsSha256','grantEdges','securityInvoker',
 'apiExecutorExecute','serviceRoleExecute','anonExecute','authenticatedExecute',
 'originEstablished','authorizedForProduction','drReady'];
 if(!x||typeof x!=='object'||Array.isArray(x)||!keyEq(x,expected)
 ||x.schemaVersion!=='seyeon-r2-g-manifest-rpc-parity-v1'||x.postgresMajor!==17
 ||x.functionCount!==1||x.grantEdges!==2
 ||!['ownerSha256','ddlSha256','rawAclSha256','canonicalGrantsSha256'].every(k=>typeof x[k]==='string'&&sha.test(x[k]))
 ||x.securityInvoker!==true||x.apiExecutorExecute!==true
 ||x.serviceRoleExecute!==false||x.anonExecute!==false
 ||x.authenticatedExecute!==false||!zeroApproval(x))
 hold('MANIFEST_METADATA_OR_EXECUTE_DRIFT');
 return x;
}
export function verifyR2GManifestLocalAgainstProduction(local,productionEvidence,remoteEvidence){
 const a=validateManifest(local);
 const b=envelope(productionEvidence,'manifest');
 envelope(remoteEvidence,'remote');
 const exact=['ownerSha256','ddlSha256','canonicalGrantsSha256'];
 if(exact.some(k=>a[k]!==b[k]))hold('MANIFEST_OWNER_DDL_OR_EFFECTIVE_GRANT_GRAPH_MISMATCH');
 const rawAclExact=a.rawAclSha256===b.rawAclSha256;
 return {
  status:rawAclExact?'PASS_R2_G_MANIFEST_FINAL_CATALOG_PARITY_ORIGIN_UNVERIFIED':
   'HOLD_R2_G_MANIFEST_RAW_ACL_EXPRESSION_DIFFERENCE',
  finalManifestOwnerDdlCanonicalGrantMatch:true,rawAclExact,
  timestampedAndRemoteHistoricalOrderingProven:false,originalSqlSourceProven:false,
  actualActorToolOrTimestampProven:false,productionWrites:0,
  originEstablished:false,authorizedForProduction:false,drReady:false
 };
}
export function verifyR2GRemoteObservation(remoteEvidence){
 const x=envelope(remoteEvidence,'remote');
 return {
  status:'HOLD_R2_G_REMOTE_LEXICAL_OVERLAP_ORIGIN_UNVERIFIED',
  remoteSqlSha256:x.remoteSqlSha256,remoteBytes:x.remoteBytes,
  manifestRevokeTokens:x.lexicalIndicators.manifestRevoke,
  manifestGrantTokens:x.lexicalIndicators.manifestGrant,
  timestampedHistoryRows:x.timestampedExactRows,
  actualExecutionChronologyEstablished:false,originEstablished:false,
  authorizedForProduction:false,drReady:false
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==5)hold('USAGE');
  const read=i=>JSON.parse(readFileSync(process.argv[i],'utf8'));
  const local=read(2),prod=read(3),remote=read(4);
  console.log(JSON.stringify(verifyR2GRemoteObservation(remote)));
  console.log(JSON.stringify(verifyR2GManifestLocalAgainstProduction(local,prod,remote)));
 }catch(e){console.error(String(e?.message??e).slice(0,210));process.exitCode=1;}
}
