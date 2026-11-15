import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyRemoteOnlyCurrentObjectMetadata as validate } from
  './verify-remote-only-current-object-metadata.mjs';

const [report, manifest, presence, sql] = await Promise.all([
  readFile('docs/operations/POSTGRES_REMOTE_ONLY_CURRENT_OBJECT_METADATA_20261108.json','utf8').then(JSON.parse),
  readFile('docs/operations/POSTGRES_REMOTE_ONLY_MIGRATION_DISPOSITION_20261107.json','utf8').then(JSON.parse),
  readFile('docs/operations/POSTGRES_REMOTE_ONLY_OBJECT_PRESENCE_20261107.json','utf8').then(JSON.parse),
  readFile('scripts/operations/production-remote-only-current-object-metadata-readonly.sql','utf8'),
]);
const original = () => structuredClone(report);
const inspect = (newReport,query=sql) =>
  validate({report:newReport,manifest,presence,sql:query});
const expectReject = (report,query) =>
  assert.throws(() => inspect(report,query), /REMOTE_ONLY_METADATA_INVALID/u);

test('41 applied remote-only versions and all 180 current declaration indicators',()=>{
  const out = inspect(original());
  assert.equal(out.transactionReadOnly,true);
  assert.equal(out.historicalParityApproved,false);
  assert.equal(out.functionIndicators,82);
  assert.equal(out.policyIndicators,82);
  assert.equal(out.tableIndicators,16);
  assert.equal(out.policiesOnRlsDisabledTables,20);
});

test('refuses forged DR or restored target authority',()=>{
  const doc=original();
  doc.authorization.drReady=true;
  expectReject(doc);
  const restore=original();
  restore.authorization.isolatedRestoreEquivalenceProven=true;
  expectReject(restore);
});

test('rejects source witness drift and missing version',()=>{
  const doc=original();
  doc.catalogueEvidence.perVersion.pop();
  expectReject(doc);
  expectReject(original(),sql.replace("('20261008090417')","('99999999999999')"));
});

test('rejects invalid current reconstructed function fingerprint',()=>{
  const doc=original();
  const routine=doc.catalogueEvidence.perVersion.find(row=>row.routines.length)?.routines[0]?.overloads[0];
  assert.ok(routine);
  routine.definitionSha256='not-a-hash';
  expectReject(doc);
});

test('rejects current ACL / policy expression fingerprint drift',()=>{
  const doc=original();
  const policy=doc.catalogueEvidence.perVersion.find(row=>row.policies.length)?.policies[0];
  assert.ok(policy);
  policy.catalog.qualSha256='unverified';
  expectReject(doc);
  const x=original();
  const fn=x.catalogueEvidence.perVersion.find(row=>row.routines.length)?.routines[0]?.overloads[0];
  assert.ok(fn);
  fn.aclSha256='unverified';
  expectReject(x);
});

test('rejects read-only authority removal or unsafe unknown fields',()=>{
  const doc=original();doc.catalogueEvidence.transactionReadOnly=false;expectReject(doc);
  const doc2=original();doc2.catalogueEvidence.perVersion[0].privateUserRows=[];expectReject(doc2);
  expectReject(original(),sql.replace('BEGIN TRANSACTION READ ONLY;', 'BEGIN;'));
});

test('rejects totals inconsistencies and false source counts',()=>{
  const doc=original();doc.summary.policyNames++;expectReject(doc);
  const doc2=original();doc2.catalogueEvidence.liveMigrationLedgerCount=242;expectReject(doc2);
});

test('does not leak policy expression, SQL source or application data in catalogue',()=>{
  const doc=original();
  const row=doc.catalogueEvidence.perVersion[0];
  for (const policy of row.policies) {
    assert.ok(policy.catalog.qualSha256);
    assert.equal('qual' in policy.catalog,false);
    assert.equal('with_check' in policy.catalog,false);
  }
  const txt=JSON.stringify(doc.catalogueEvidence);
  assert.equal(txt.includes('source_body'),false);
  assert.equal(txt.includes('user_email'),false);
});
