// Verify exact read-only Provider migration history before sealing it.
// Source contains historical SQL and operator provenance; never log it.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const hex=/^[0-9a-f]{64}$/u;
const numeric=/^[0-9]+$/u;
const sha256=data=>createHash('sha256').update(data).digest('hex');
const exact=(value,fields,label)=>{
  assert.ok(value && typeof value==='object' && !Array.isArray(value),label);
  assert.deepEqual(Object.keys(value).sort(),[...fields].sort(),label);
};
const valueString=(v,label)=>{
  assert.ok(v===null || typeof v==='string',label);
  return v;
};
const nullableStringArray=(v,label)=>{
  assert.ok(v===null || (Array.isArray(v)&&v.every(s=>s===null||typeof s==='string')),label);
  return v;
};
function pgJsonbArray(elements){
  return '['+elements.map(v=>Array.isArray(v)?pgJsonbArray(v):JSON.stringify(v)).join(', ')+']';
}

export function assessSealedProviderMigrationSource(packet,{expectedCount,expectedFrontier,expectedCatalogSha256}){
  exact(packet,['schemaVersion','allVersionCount','numericVersionCount',
    'migrationFrontier','catalogSha256','entries'],'sourcePacket');
  assert.equal(packet.schemaVersion,'ops-provider-migration-sealed-source-v1');
  assert.ok(Number.isSafeInteger(expectedCount)&&expectedCount>0);
  assert.ok(Number.isSafeInteger(expectedFrontier)&&expectedFrontier>0);
  assert.match(expectedCatalogSha256,hex);
  assert.ok(Number.isSafeInteger(packet.allVersionCount)&&packet.allVersionCount>=0);
  assert.ok(Number.isSafeInteger(packet.numericVersionCount)&&packet.numericVersionCount>=0);
  assert.ok(Array.isArray(packet.entries));
  assert.equal(packet.allVersionCount,packet.entries.length);
  assert.equal(packet.allVersionCount,packet.numericVersionCount,
    'Non-numeric migration history requires separate source disposition');
  assert.equal(packet.numericVersionCount,expectedCount);
  assert.equal(packet.migrationFrontier,expectedFrontier);
  assert.equal(packet.catalogSha256,expectedCatalogSha256);
  const seen=new Set();
  let statementBodiesMissingCount=0;
  let createdByFieldPopulatedRows=0;
  let lastVersion=null;
  const hashed=[];
  let frontier=null;
  for(const entry of packet.entries){
    exact(entry,['version','name','statements','createdBy','idempotencyKey',
      'rollbackStatements'],'migrationEntry');
    assert.ok(typeof entry.version==='string'&&numeric.test(entry.version),
      'Invalid migration version');
    assert.ok(!seen.has(entry.version),'Duplicate migration version');
    assert.ok(lastVersion===null || lastVersion<entry.version,
      'Migration source must use PostgreSQL ordered version strings');
    seen.add(entry.version);
    lastVersion=entry.version;
    valueString(entry.name,'migrationName');
    valueString(entry.createdBy,'migrationProvenance');
    valueString(entry.idempotencyKey,'migrationIdempotency');
    nullableStringArray(entry.statements,'migrationStatements');
    nullableStringArray(entry.rollbackStatements,'rollbackStatements');
    if(entry.statements===null || entry.statements.length===0) statementBodiesMissingCount++;
    if(entry.createdBy!==null) createdByFieldPopulatedRows++;
    const statementHashes=entry.statements?.map(s=>s===null?null:sha256(s))??[];
    hashed.push([entry.version,entry.name,statementHashes]);
    const version=BigInt(entry.version);
    if(frontier===null || version>frontier) frontier=version;
  }
  assert.equal(frontier?.toString(),String(expectedFrontier));
  const computedCatalogSha256=sha256(pgJsonbArray(hashed));
  assert.equal(computedCatalogSha256,expectedCatalogSha256,
    'Exact original statement fingerprint mismatch');
  return {
    schemaVersion:'ops-provider-migration-sealed-source-verification-v1',
    migrationCount:expectedCount,
    migrationFrontier:expectedFrontier,
    migrationCatalogSha256:computedCatalogSha256,
    sourceLedgerHistoryCaptured:true,
    sourceStatementBodiesMissingCount:statementBodiesMissingCount,
    sourceStatementBodiesComplete:statementBodiesMissingCount===0,
    createdByFieldPopulatedRows,
    historicalExecutorAuthenticated:false,
    sourceLedgerRowsRestored:false,
    providerMigrationLedgerRestored:false,
    hostedProviderRecoveryProven:false,
    drReady:false,
    serviceResumptionAllowed:false,
    verdict:'SOURCE_HISTORY_READY_FOR_ENCRYPTION_ONLY__HOSTED_DR_HOLD',
  };
}

async function main(){
  assert.equal(process.env.GITHUB_ACTIONS,'true');
  assert.equal(process.env.GITHUB_REF,'refs/heads/main');
  assert.equal(process.env.MH_OPS_CAPTURE_PROVIDER_LEDGER,'true');
  const args=process.argv.slice(2);
  const value=name=>{
    const idx=args.indexOf(name);
    assert.ok(idx>=0&&args[idx+1]&&!args[idx+1].startsWith('--'));
    return args[idx+1];
  };
  const privateRoot=resolve(process.env.RUNNER_TEMP??'.');
  assert.notEqual(privateRoot,resolve('.'));
  const safePath=name=>{
    const file=resolve(value(name));
    assert.ok(file.startsWith(privateRoot+'/')||file.startsWith(privateRoot+'\\'));
    return file;
  };
  const source=safePath('--source');
  const report=safePath('--report');
  const expectedCount=Number(value('--expected-count'));
  const expectedFrontier=Number(value('--expected-frontier'));
  const expectedCatalogSha256=value('--expected-sha256');
  const sourceBytes=await readFile(source);
  assert.ok(sourceBytes.length>0&&sourceBytes.length<=64*1024*1024,
    'Source ledger exceeds bounded encrypted archive admission');
  const lines=sourceBytes.toString('utf8').trim().split(/\r?\n/u);
  assert.equal(lines.length,1);
  const result=assessSealedProviderMigrationSource(JSON.parse(lines[0]),{
    expectedCount,expectedFrontier,expectedCatalogSha256
  });
  await writeFile(report,JSON.stringify({...result,sourcePacketSha256:sha256(sourceBytes)},null,2)+'\n',
    {flag:'wx',mode:0o600});
  console.log('PROVIDER_LEDGER_SOURCE_ENCRYPTION_PREFLIGHT_PASS DR_BLOCKED');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(()=>{console.error('HOLD_PROVIDER_LEDGER_SOURCE_INVALID');process.exitCode=1;});
}
