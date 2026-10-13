// R2: ACL lexical-vs-canonical grant comparison on 19 expected Se-yeon RPCs.
// Watchtower-Track: ops. Never print source ACL/role graph, only names and category.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedOwners } from './verify-seyeon-r2-rpc-catalog.mjs';

const digest=/^[a-f0-9]{64}$/u;
const fields=['name','rawAclSha256','canonicalGrantSha256','explicitAcl',
  'grantEdges','anonExecute','authenticatedExecute'];
export function validateR2AclSnapshot(data) {
  if (!data || typeof data!=='object' || Array.isArray(data)
    || Object.keys(data).length!==3
    || data.schemaVersion!=='seyeon-r2-acl-per-function-v1'
    || data.postgresMajor!==17 || !Array.isArray(data.functions)
    || data.functions.length!==19) throw Error('HOLD_R2_ACL_SNAPSHOT_INVALID');
  const seen=new Set();
  for (const f of data.functions) {
    if (!f || typeof f!=='object' || Array.isArray(f)
      || Object.keys(f).length!==fields.length
      || fields.some(key=>!Object.hasOwn(f,key))
      || !Object.hasOwn(expectedOwners,f.name) || seen.has(f.name)
      || typeof f.rawAclSha256!=='string'||!digest.test(f.rawAclSha256)
      || typeof f.canonicalGrantSha256!=='string'||!digest.test(f.canonicalGrantSha256)
      || typeof f.explicitAcl!=='boolean'
      || !Number.isInteger(f.grantEdges)||f.grantEdges<0||f.grantEdges>50
      || f.anonExecute!==false||f.authenticatedExecute!==false)
      throw Error('HOLD_R2_ACL_METADATA_OR_BROWSER_PRIVILEGE');
    seen.add(f.name);
  }
  return new Map(data.functions.map(f=>[f.name,f]));
}
export function validateR2ProductionAclEnvelope(obj) {
  if (!obj || typeof obj!=='object' || Array.isArray(obj)
    || Object.keys(obj).length!==7
    || obj.observation!=='production-readonly-2026-10-13'
    || obj.source!=='Supabase Production pg_catalog SELECT ONLY'
    || obj.readOnly!==true || obj.authorizedForProduction!==false
    || obj.containsRawAcl!==false || obj.containsPII!==false)
    throw Error('HOLD_R2_ACL_PROVENANCE_OR_SCOPE_INVALID');
  return validateR2AclSnapshot(obj.snapshot);
}
export function compareR2AclSnapshots(isolated,production) {
  const a=validateR2AclSnapshot(isolated);
  const b=validateR2AclSnapshot(production);
  const rawOnly=[],canonicalGrantDifferences=[],edgeCountDifferences=[],explicitAclDifferences=[];
  for (const [name,local] of a) {
    const remote=b.get(name);
    if (local.rawAclSha256!==remote.rawAclSha256
      && local.canonicalGrantSha256===remote.canonicalGrantSha256)
      rawOnly.push(name);
    if (local.canonicalGrantSha256!==remote.canonicalGrantSha256)
      canonicalGrantDifferences.push(name);
    if (local.grantEdges!==remote.grantEdges) edgeCountDifferences.push(name);
    if (local.explicitAcl!==remote.explicitAcl) explicitAclDifferences.push(name);
  }
  for(const list of [rawOnly,canonicalGrantDifferences,edgeCountDifferences,explicitAclDifferences])
    list.sort();
  const match=rawOnly.length===0&&canonicalGrantDifferences.length===0
    && edgeCountDifferences.length===0&&explicitAclDifferences.length===0;
  return {
    status:match?'R2_ACL_METADATA_MATCH_NOT_LINEAGE_APPROVAL'
      :'HOLD_R2_ACL_METADATA_NOT_EQUIVALENT',
    functions:19,rawOnly,canonicalGrantDifferences,edgeCountDifferences,
    explicitAclDifferences,
    normalizedGrantGraphMatch:canonicalGrantDifferences.length===0,
    authorizedForProduction:false,drReady:false,
  };
}
if (process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.length!==4)throw Error('HOLD_R2_ACL_USAGE');
    const isolated=JSON.parse(readFileSync(process.argv[2],'utf8'));
    const prodEnvelope=JSON.parse(readFileSync(process.argv[3],'utf8'));
    validateR2ProductionAclEnvelope(prodEnvelope);
    console.log(JSON.stringify(compareR2AclSnapshots(isolated,prodEnvelope.snapshot)));
  } catch(e){
    console.error(String(e?.message??e).slice(0,250));
    process.exitCode=1;
  }
}
