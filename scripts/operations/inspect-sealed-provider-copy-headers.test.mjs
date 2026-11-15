import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectProviderCopyHeaders } from './inspect-sealed-provider-copy-headers.mjs';

const gaps=JSON.parse(await readFile(
  new URL('../../docs/operations/POSTGRES_PROVIDER_COPY_SOURCE_GAP_20261111.json',import.meta.url),'utf8'));

async function fixture(withMissingTable=false){
  const root=await mkdtemp(join(tmpdir(),'myeongha-synthetic-copy-preflight-'));
  const path=join(root,'synthetic-only.sql');
  const columns=[];
  let content='';
  const all=[...gaps.skippedTables,...gaps.projectedTables];
  for(const entry of all){
    const sourceColumns=['id',...entry.previouslyDroppedSourceColumns??[]];
    const parts=sourceColumns.map(x=>'"'+x+'"').join(', ');
    content+='COPY "'+entry.schema+'"."'+entry.table+'" ('+parts+') FROM stdin;\n';
    for(let i=0;i<entry.sourceRowCount;i++) content+=sourceColumns.map(()=>'synthetic-only').join('\t')+'\n';
    content+='\\.\n';
    if(withMissingTable&&entry===all[0])continue;
    for(const name of sourceColumns){
      columns.push({table_schema:entry.schema,table_name:entry.table,column_name:name,
        not_null:false,has_default:false,is_identity:false,is_generated:false});
    }
  }
  await writeFile(path,content);
  return {root,path,columns};
}
test('all historical 29 skips and 3 projections become column exact, without replay',async()=>{
  const f=await fixture();
  try{
    const report=await inspectProviderCopyHeaders(f.path,f.columns,gaps);
    assert.equal(report.historicalSkippedRelationsNowExact,29);
    assert.equal(report.historicalProjectedRelationsNowExact,3);
    assert.equal(report.allProviderCopyBlocksExact,true);
    assert.equal(report.actualSourceCopyRows,93);
    assert.equal(report.sourceRowPayloadsEmitted,false);
    assert.equal(report.actualProviderRowsInserted,0);
    assert.equal(report.drReady,false);
    assert.equal(report.serviceResumptionAllowed,false);
  }finally{await rm(f.root,{recursive:true,force:true})}
});
test('missing target relation remains explicit HOLD',async()=>{
  const f=await fixture(true);
  try{
    const report=await inspectProviderCopyHeaders(f.path,f.columns,gaps);
    assert.equal(report.historicalSkippedRelationsNowExact,28);
    assert.equal(report.allProviderCopyBlocksExact,false);
    assert.equal(report.verdict,'HOLD_PROVIDER_SOURCE_COPY_COLUMN_INCOMPATIBILITY');
  }finally{await rm(f.root,{recursive:true,force:true})}
});
test('count drift in previously skipped rows stops preflight',async()=>{
  const f=await fixture();
  try{
    const changed=structuredClone(gaps);
    changed.skippedTables[0].sourceRowCount+=1;
    await assert.rejects(()=>inspectProviderCopyHeaders(f.path,f.columns,changed));
  }finally{await rm(f.root,{recursive:true,force:true})}
});
