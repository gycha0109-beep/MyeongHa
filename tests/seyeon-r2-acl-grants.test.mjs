import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
 validateR2AclSnapshot, validateR2ProductionAclEnvelope, compareR2AclSnapshots,
} from '../scripts/operations/verify-seyeon-r2-acl-grants.mjs';

const prod=JSON.parse(readFileSync(new URL(
 '../scripts/operations/seyeon-r2-production-acl-grants-20261013.json',import.meta.url),'utf8'));
const mk=()=>structuredClone(prod.snapshot);

describe('R2 canonical ACL drift remains HOLD and never opens Production',()=>{
 it('enforces expected 19 actual Production rows, no browser EXECUTE and no raw grants',()=>{
  expect(validateR2ProductionAclEnvelope(prod).size).toBe(19);
  expect(validateR2AclSnapshot(mk()).size).toBe(19);
 });
 it('never promotes even identical catalogs into migration/DR approval',()=>{
  const res=compareR2AclSnapshots(mk(),mk());
  expect(res).toMatchObject({functions:19,status:'R2_ACL_METADATA_MATCH_NOT_LINEAGE_APPROVAL',
    normalizedGrantGraphMatch:true,authorizedForProduction:false,drReady:false});
 });
 it('separates raw ordering/formatting drift from normalized graph drift',()=>{
  const local=mk(), name=local.functions[0].name;
  local.functions[0].rawAclSha256='f'.repeat(64);
  const result=compareR2AclSnapshots(local,mk());
  expect(result.rawOnly).toEqual([name]);
  expect(result.canonicalGrantDifferences).toEqual([]);
  expect(result.normalizedGrantGraphMatch).toBe(true);
  expect(result.status).toBe('HOLD_R2_ACL_METADATA_NOT_EQUIVALENT');
 });
 it('flags a real normalized grant graph drift separately',()=>{
  const local=mk(),name=local.functions[0].name;
  local.functions[0].canonicalGrantSha256='f'.repeat(64);
  const result=compareR2AclSnapshots(local,mk());
  expect(result.canonicalGrantDifferences).toEqual([name]);
  expect(result.normalizedGrantGraphMatch).toBe(false);
  expect(result.authorizedForProduction).toBe(false);
 });
 it('detects grant edge and explicit ACL differences',()=>{
  const local=mk(),name=local.functions[1].name;
  local.functions[1].grantEdges+=1;
  local.functions[1].explicitAcl=false;
  const result=compareR2AclSnapshots(local,mk());
  expect(result.edgeCountDifferences).toEqual([name]);
  expect(result.explicitAclDifferences).toEqual([name]);
 });
 it('fails closed for missing/overloaded functions and elevated browser privilege',()=>{
  const a=mk();a.functions.pop();
  expect(()=>validateR2AclSnapshot(a)).toThrow('HOLD_R2_ACL_SNAPSHOT_INVALID');
  const b=mk();b.functions[1].name=b.functions[0].name;
  expect(()=>validateR2AclSnapshot(b)).toThrow('HOLD_R2_ACL_METADATA_OR_BROWSER_PRIVILEGE');
  const c=mk();c.functions[0].anonExecute=true;
  expect(()=>validateR2AclSnapshot(c)).toThrow('HOLD_R2_ACL_METADATA_OR_BROWSER_PRIVILEGE');
 });
 it('rejects raw grant fields, plaintext leaks, invalid digests or permission promotion',()=>{
  const a=mk();a.functions[0].aclText='unapproved';
  expect(()=>validateR2AclSnapshot(a)).toThrow('HOLD_R2_ACL_METADATA_OR_BROWSER_PRIVILEGE');
  const b=mk();b.functions[0].canonicalGrantSha256='bad';
  expect(()=>validateR2AclSnapshot(b)).toThrow('HOLD_R2_ACL_METADATA_OR_BROWSER_PRIVILEGE');
  const c=structuredClone(prod);c.authorizedForProduction=true;
  expect(()=>validateR2ProductionAclEnvelope(c)).toThrow('HOLD_R2_ACL_PROVENANCE_OR_SCOPE_INVALID');
 });
});
