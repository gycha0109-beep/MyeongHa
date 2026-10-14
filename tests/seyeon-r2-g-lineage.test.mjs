import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 validateRemote,validateManifest,verifyR2GRemoteObservation,
 verifyR2GManifestLocalAgainstProduction
} from '../scripts/operations/verify-seyeon-r2-g-lineage.mjs';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const prod=read('../scripts/operations/seyeon-r2-g-production-manifest-20261014.json');
const remote=read('../scripts/operations/seyeon-r2-g-production-remote-20261014.json');
const copy=x=>structuredClone(x);
describe('R2-G immutable, non-authorizing remote provenance and manifest parity',()=>{
 it('pins actual Production hash+timestamped overlap without lineage promotion',()=>{
  const x=verifyR2GRemoteObservation(remote);
  expect(x).toMatchObject({
   status:'HOLD_R2_G_REMOTE_LEXICAL_OVERLAP_ORIGIN_UNVERIFIED',
   remoteBytes:104021,manifestRevokeTokens:2,manifestGrantTokens:1,
   timestampedHistoryRows:2,originEstablished:false,drReady:false
  });
 });
 it('compares final manifest catalog to a strict protected Production envelope',()=>{
  const x=verifyR2GManifestLocalAgainstProduction(copy(prod.snapshot),prod,remote);
  expect(x).toMatchObject({
   status:'PASS_R2_G_MANIFEST_FINAL_CATALOG_PARITY_ORIGIN_UNVERIFIED',
   rawAclExact:true,originalSqlSourceProven:false,authorizedForProduction:false
  });
 });
 it('rejects unexpected migration bytes, exact history or token pattern drift',()=>{
  for(const [key,value] of [['remoteBytes',104022],['remoteSqlSha256','f'.repeat(64)],
   ['timestampedExactRows',1],['actualExecutionChronologyEstablished',true]]){
   const x=copy(remote.snapshot);x[key]=value;
   expect(()=>validateRemote(x)).toThrow('HOLD_R2_G_REMOTE_METADATA_DRIFT_OR_SOURCE_UNVERIFIED');
  }
  const x=copy(remote.snapshot);x.lexicalIndicators.manifestGrant=2;
  expect(()=>validateRemote(x)).toThrow('HOLD_R2_G_REMOTE_METADATA_DRIFT_OR_SOURCE_UNVERIFIED');
 });
 it('rejects invalid evidence or newly claimed authority',()=>{
  const x=copy(remote);x.approval='APPROVED';
  expect(()=>verifyR2GRemoteObservation(x)).toThrow('HOLD_R2_G_EVIDENCE_ENVELOPE_INVALID');
  const y=copy(prod.snapshot);y.drReady=true;
  expect(()=>validateManifest(y)).toThrow('HOLD_R2_G_MANIFEST_METADATA_OR_EXECUTE_DRIFT');
 });
 it('fails closed on browser/service privilege or caller permission escalation',()=>{
  for(const [k,v] of [['serviceRoleExecute',true],['anonExecute',true],
    ['authenticatedExecute',true],['apiExecutorExecute',false],['securityInvoker',false]]){
   const x=copy(prod.snapshot);x[k]=v;
   expect(()=>validateManifest(x)).toThrow('HOLD_R2_G_MANIFEST_METADATA_OR_EXECUTE_DRIFT');
  }
 });
 it('fails closed on function owner/DDL or canonical ACL drift',()=>{
  for(const k of ['ownerSha256','ddlSha256','canonicalGrantsSha256']){
   const x=copy(prod.snapshot);x[k]='e'.repeat(64);
   expect(()=>verifyR2GManifestLocalAgainstProduction(x,prod,remote))
    .toThrow('HOLD_R2_G_MANIFEST_OWNER_DDL_OR_EFFECTIVE_GRANT_GRAPH_MISMATCH');
  }
 });
 it('reports raw-ACL-only drift as HOLD, not final parity',()=>{
  const x=copy(prod.snapshot);x.rawAclSha256='e'.repeat(64);
  expect(verifyR2GManifestLocalAgainstProduction(x,prod,remote)).toMatchObject({
   status:'HOLD_R2_G_MANIFEST_RAW_ACL_EXPRESSION_DIFFERENCE',
   rawAclExact:false,originEstablished:false
  });
 });
 it('rejects role-graph snapshot exposure via unexpected metadata keys',()=>{
  const x=copy(prod.snapshot);x.rawAcl='PUBLIC=X/abc';
  expect(()=>validateManifest(x)).toThrow('HOLD_R2_G_MANIFEST_METADATA_OR_EXECUTE_DRIFT');
 });
});
