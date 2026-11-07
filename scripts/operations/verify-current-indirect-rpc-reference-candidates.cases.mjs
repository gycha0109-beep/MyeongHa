import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  verifyCurrentIndirectRpcReferences as verify,
  findStaticProductionApiCallHints,
} from './verify-current-indirect-rpc-reference-candidates.mjs';

const [original,grants,sql]=await Promise.all([
  readFile('docs/operations/POSTGRES_CURRENT_INDIRECT_RPC_REFERENCE_CANDIDATES_20261108.json','utf8').then(JSON.parse),
  readFile('docs/operations/POSTGRES_CURRENT_RLS_DISABLED_ROLE_GRANTS_20261108.json','utf8').then(JSON.parse),
  readFile('scripts/operations/production-rls-disabled-indirect-function-candidates-readonly.sql','utf8'),
]);
const copy=()=>structuredClone(original);
const validate=(x=copy(),text=sql,source=grants)=>verify(x,source,text);
const reject=(x,text=sql,source=grants)=>
  assert.throws(()=>validate(x,text,source),/INDIRECT_RPC_EVIDENCE_INVALID/u);

test('read-only catalog candidates explicitly deny proved indirect call rights',()=>{
  const v=validate();
  assert.deepEqual(v,{
    matchedFunctions:116,nameReferencePairs:228,definerCandidates:68,
    apiCallableDefinerCandidates:48,unprivilegedCallableCandidates:0,
    evidenceIsHeuristic:true,indirectAccessAuthorized:false,
  });
});

test('refuses forged DR, historical parity and proven caller authorization',()=>{
  for(const key of [
    'sourceTextMatchIsConfirmedCallEdge','callerContextAuthorizationVerified',
    'indirectRpcContainmentVerified','restoredSchemaParityVerified',
    'drReady','serviceResumptionAllowed','sourceDefinitionBodyExported',
  ]){
    const x=copy();x.authorization[key]=true;reject(x);
  }
});

test('refuses client EXECUTE on candidate functions or forged effective ACL summary',()=>{
  for(const key of ['anonCallable','authenticatedCallable']){
    const x=copy();x.evidence.functions[0][key]=true;reject(x);
  }
  const x=copy();x.evidence.summary.api_executor_callable_matches++;reject(x);
});

test('refuses changed target RLS grant evidence or unknown target names',()=>{
  const x=copy();x.evidence.functions[0].possibleTableReferences[0].name='unexpected_table';reject(x);
  const y=copy();y.evidence.targetDistinctTables=17;reject(y);
  const z=structuredClone(grants);z.summary.distinctRlsEnabledTables=1;reject(copy(),sql,z);
});

test('refuses missing hash, extra raw function body and duplicate overloaded functions',()=>{
  const x=copy();x.evidence.functions[0].definitionSha256='bad';reject(x);
  const y=copy();y.evidence.functions[0].sourceBody='unsafe source';reject(y);
  const z=copy();z.evidence.functions[1].name=z.evidence.functions[0].name;
  z.evidence.functions[1].signature=z.evidence.functions[0].signature;reject(z);
});

test('refuses changes to function type/search_path metadata or reference total',()=>{
  const x=copy();x.evidence.functions[0].searchPathKind='unvalidated';reject(x);
  const y=copy();y.evidence.summary.table_name_reference_pairs++;reject(y);
  const z=copy();z.evidence.functions[0].possibleTableReferences.push(
    structuredClone(z.evidence.functions[0].possibleTableReferences[0]));reject(z);
});

test('read-only SQL must retain catalog dependency and privilege inspection',()=>{
  reject(copy(),sql.replace('BEGIN TRANSACTION READ ONLY;','BEGIN;'));
  reject(copy(),sql.replace('pg_catalog.pg_depend','nonexistent_reference'));
  reject(copy(),sql.replace("('public','chat_turn_attempts')","('public','other_table')"));
});

test('source code name text hints remain explicitly non-authoritative',async()=>{
  const result=await findStaticProductionApiCallHints(copy().evidence.functions);
  assert.ok(result.productionApiFilesScanned>0);
  assert.ok(result.candidateNamesWithFunctionCallText>0);
  assert.equal(result.apiDefinerCandidateCount,48);
  assert.equal(result.staticReferenceIsVerifiedExecutionPath,false);
});
