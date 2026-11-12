import { test } from 'vitest';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assessSealedProviderMigrationSource} from './assess-production-provider-migration-ledger-source.mjs';

const sha=v=>createHash('sha256').update(v).digest('hex');
const statement='select 1;';
const expectedSha=sha('[["1", "one", ["'+sha(statement)+'"]]]');
const source=()=>({
  schemaVersion:'ops-provider-migration-sealed-source-v1',
  allVersionCount:1,
  numericVersionCount:1,
  migrationFrontier:1,
  catalogSha256:expectedSha,
  entries:[{
    version:'1',name:'one',statements:[statement],
    createdBy:null,idempotencyKey:null,rollbackStatements:null
  }]
});
const expected={expectedCount:1,expectedFrontier:1,expectedCatalogSha256:expectedSha};
const check=p=>assessSealedProviderMigrationSource(p,expected);

test('source packet exact original SQL fingerprint may be encrypted but is not a DR pass',()=>{
  const result=check(source());
  assert.equal(result.sourceLedgerHistoryCaptured,true);
  assert.equal(result.providerMigrationLedgerRestored,false);
  assert.equal(result.hostedProviderRecoveryProven,false);
  assert.equal(result.drReady,false);
  assert.equal(result.serviceResumptionAllowed,false);
});
test('changed statement source cannot pass by reusing public catalog hash',()=>{
  const p=source();
  p.entries[0].statements=['select 2;'];
  assert.throws(()=>check(p));
});
test('missing or duplicate entries and synthetic count promotion are rejected',()=>{
  const p=source();p.entries=[];
  assert.throws(()=>check(p));
  const q=source();q.entries.push({...q.entries[0]});
  assert.throws(()=>check(q));
  const s=source();s.numericVersionCount=0;
  assert.throws(()=>check(s));
});
test('source packet must retain all six migration history fields',()=>{
  const p=source();delete p.entries[0].createdBy;
  assert.throws(()=>check(p));
  const q=source();q.entries[0].customerEmail='forbidden';
  assert.throws(()=>check(q));
});
test('nonnumeric version or bad provenance field is fail closed',()=>{
  const p=source();p.entries[0].version='arbitrary';
  assert.throws(()=>check(p));
  const q=source();q.entries[0].rollbackStatements={unexpected:'row'};
  assert.throws(()=>check(q));
});
test('raw history and source statement hash mismatch must never be called restored',()=>{
  const p=source();p.catalogSha256='0'.repeat(64);
  assert.throws(()=>check(p));
  const q=source();q.entries[0].statements=null;
  assert.throws(()=>check(q));
});

test('missing historical SQL body is preserved as an unresolved source gap',()=>{
  const p=source();
  p.entries[0].statements=null;
  p.entries[0].createdBy='operator-metadata-not-authenticated';
  p.catalogSha256=sha('[["1", "one", []]]');
  const result=assessSealedProviderMigrationSource(p,{
    ...expected,expectedCatalogSha256:p.catalogSha256,
  });
  assert.equal(result.sourceLedgerHistoryCaptured,true);
  assert.equal(result.sourceStatementBodiesMissingCount,1);
  assert.equal(result.sourceStatementBodiesComplete,false);
  assert.equal(result.createdByFieldPopulatedRows,1);
  assert.equal(result.historicalExecutorAuthenticated,false);
  assert.equal(result.providerMigrationLedgerRestored,false);
});
