import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCurrentRlsDisabledGrants as validate } from './verify-current-rls-disabled-grants.mjs';

const [evidence, source, sql] = await Promise.all([
  readFile('docs/operations/POSTGRES_CURRENT_RLS_DISABLED_ROLE_GRANTS_20261108.json','utf8').then(JSON.parse),
  readFile('docs/operations/POSTGRES_REMOTE_ONLY_CURRENT_OBJECT_METADATA_20261108.json','utf8').then(JSON.parse),
  readFile('scripts/operations/production-rls-disabled-policy-role-grants-readonly.sql','utf8'),
]);
const copy=()=>structuredClone(evidence);
const check=(report=copy(),input=sql,prior=source)=>
  validate(report,prior,input);
const reject=(report,input=sql,prior=source)=>
  assert.throws(()=>check(report,input,prior),/RLS_DISABLED_GRANT_EVIDENCE_INVALID/u);

test('20 source policy indicators cover 18 current RLS-disabled tables with 24 total current policies',()=>{
  const result=check();
  assert.equal(result.distinctPolicyIndicatorCount,20);
  assert.equal(result.distinctTableCount,18);
  assert.equal(result.currentPolicyCount,24);
  assert.equal(result.rlsDisabledTableCount,18);
  assert.equal(result.databasePermissionChangeAllowed,false);
});

test('anon/authenticated/API executor have no direct table privileges; service role is retained',()=>{
  const result=check();
  for(const role of ['anon','authenticated','myeongha_api_executor']){
    assert.equal(result.effectiveRoleCounts[role].readGrantAndSchemaUsage,0);
    assert.equal(result.effectiveRoleCounts[role].anyWriteGrantAndSchemaUsage,0);
  }
  assert.equal(result.effectiveRoleCounts.service_role.readGrantAndSchemaUsage,18);
  assert.equal(result.effectiveRoleCounts.service_role.anyWriteGrantAndSchemaUsage,18);
});

test('rejects forged DR, app containment or restored parity authority',()=>{
  for(const key of ['drReady','serviceResumptionAllowed','restoredSchemaParityVerified',
    'appRouteContainmentVerified','indirectFunctionAccessVerified',
    'productionPermissionMutationAuthorized']){
    const mutated=copy();
    mutated.authority[key]=true;
    reject(mutated);
  }
});

test('fails closed on direct SELECT or write grant to unprivileged roles',()=>{
  for(const role of ['anon','authenticated','myeongha_api_executor']){
    for(const privilege of ['select','insert','update','delete','truncate','references','trigger']){
      const mutated=copy();
      mutated.evidence.tables[0].rolePrivileges[role][privilege]=true;
      reject(mutated);
    }
  }
});

test('rejects changed RLS state, missing table, duplicate target and raw application rows',()=>{
  for(const change of [
    doc=>{doc.evidence.tables[0].rowSecurityEnabled=true;},
    doc=>{doc.evidence.tables[0].tableExists=false;},
    doc=>{doc.evidence.tables[1].table=doc.evidence.tables[0].table;},
    doc=>{doc.evidence.tables[0].user_rows=[];},
  ]){
    const mutated=copy();
    change(mutated);
    reject(mutated);
  }
});

test('rejects source drift, bad transaction marker and unknown role',()=>{
  reject(copy(),sql.replace('BEGIN TRANSACTION READ ONLY;','BEGIN;'));
  reject(copy(),sql.replace("('public','chat_turn_attempts')","('public','not_a_target')"));
  const mutated=copy();
  mutated.evidence.tables[0].rolePrivileges.extra_role={};
  reject(mutated);
  const prior=structuredClone(source);
  prior.summary.policiesOnRlsDisabledTables=19;
  reject(copy(),sql,prior);
});

test('requires matching current policy counts and strict evidence summary',()=>{
  const mutated=copy();
  mutated.summary.currentPoliciesOnTheseTables++;
  reject(mutated);
  const mutated2=copy();
  mutated2.evidence.tables[0].currentPolicyCount=-1;
  reject(mutated2);
  const mutated3=copy();
  mutated3.summary.effectiveRoleCounts.service_role.readGrantAndSchemaUsage=17;
  reject(mutated3);
});

test('rejects source timestamps older than previous catalog and invented raw permission data',()=>{
  const mutated=copy();
  mutated.evidence.observedAtUtc='2000-01-01T00:00:00Z';
  reject(mutated);
  const mutated2=copy();
  mutated2.evidence.tables[0].rolePrivileges.anon.applicationRows=[];
  reject(mutated2);
});
