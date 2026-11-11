import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareExactProviderCopy,buildProviderRowCountSql,verifyProviderRowCounts } from './replay-sealed-provider-data-isolated.mjs';

const gaps=JSON.parse(await readFile(
  new URL('../../docs/operations/POSTGRES_PROVIDER_COPY_SOURCE_GAP_20261111.json',import.meta.url),'utf8'));
const preflight={
  sourceBackupRunId:42752268638,actualSourceCopyBlocks:33,
  actualSourceCopyRows:93,allProviderCopyBlocksExact:true,
  historicalSkippedRelationsNowExact:29,historicalProjectedRelationsNowExact:3,
  actualProviderRowsInserted:0,drReady:false,
};
async function buildFixture(){
  const root=await mkdtemp(join(tmpdir(),'myeongha-private-provider-replay-'));
  const input=join(root,'input.sql'),output=join(root,'provider-only.sql');
  const target=[];
  const all=[...gaps.skippedTables,...gaps.projectedTables];
  // One extra baseline provider block belongs to the original backup.
  all.push({schema:'auth',table:'synthetic_baseline',sourceRowCount:0});
  const texts=['COPY "public"."synthetic_app" ("id") FROM stdin;\nprivate-public-only\n\\.\n'];
  for(const entry of all){
    const columns=['id',...(entry.previouslyDroppedSourceColumns??[])];
    texts.push('COPY "'+entry.schema+'"."'+entry.table+'" ('+
      columns.map(x=>'"'+x+'"').join(', ')+') FROM stdin;\n');
    for(let i=0;i<entry.sourceRowCount;i++){
      texts.push(columns.map(()=>'synthetic-only-value').join('\t')+'\n');
    }
    texts.push('\\.\n');
    for(const column of columns){
      target.push({table_schema:entry.schema,table_name:entry.table,column_name:column,
        not_null:false,has_default:false,is_identity:false,is_generated:false});
    }
  }
  await writeFile(input,texts.join(''));
  return {root,input,output,target};
}
test('extracts exactly 93 synthetic Provider rows but no app data',async()=>{
  const f=await buildFixture();
  try{
    const list=await prepareExactProviderCopy({
      inputPath:f.input,outputPath:f.output,
      targetCatalog:f.target,preflight,sourceGaps:gaps,
    });
    const content=await readFile(f.output,'utf8');
    assert.equal(list.length,33);
    assert.equal(list.reduce((n,v)=>n+v.sourceRows,0),93);
    assert.equal(content.includes('synthetic_app'),false);
    assert.equal(content.includes('private-public-only'),false);
    assert.equal(content.includes('synthetic-only-value'),true);
    const sql=buildProviderRowCountSql(list);
    assert.equal((sql.match(/UNION ALL/g)??[]).length,32);
    const before=Object.fromEntries(list.map(x=>[x.schema+'.'+x.table,0]));
    const after=Object.fromEntries(list.map(x=>[x.schema+'.'+x.table,x.sourceRows]));
    const proof=verifyProviderRowCounts(list,before,after);
    assert.equal(proof.copiedSourceRows,93);
    assert.equal(proof.isolatedTargetRowDelta,93);
    assert.equal(proof.drReady,false);
    assert.equal(proof.serviceResumptionAllowed,false);
  }finally{await rm(f.root,{recursive:true,force:true})}
});
test('before-and-after row count drift rejects recovered claim',async()=>{
  const f=await buildFixture();
  try{
    const list=await prepareExactProviderCopy({
      inputPath:f.input,outputPath:f.output,
      targetCatalog:f.target,preflight,sourceGaps:gaps,
    });
    const before=Object.fromEntries(list.map(x=>[x.schema+'.'+x.table,0]));
    const after=Object.fromEntries(list.map(x=>[x.schema+'.'+x.table,x.sourceRows]));
    after['auth.synthetic_baseline']=1;
    assert.throws(()=>verifyProviderRowCounts(list,before,after));
  }finally{await rm(f.root,{recursive:true,force:true})}
});
test('missing target/provider exact COPY incompatibility stops private export',async()=>{
  const f=await buildFixture();
  try{
    const altered=f.target.filter(x=>!(x.table_name===gaps.skippedTables[0].table && x.table_schema===gaps.skippedTables[0].schema));
    await assert.rejects(()=>prepareExactProviderCopy({
      inputPath:f.input,outputPath:f.output,
      targetCatalog:altered,preflight,sourceGaps:gaps,
    }));
  }finally{await rm(f.root,{recursive:true,force:true})}
});
