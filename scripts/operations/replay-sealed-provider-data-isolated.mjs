// Exact-governed Provider-only COPY extraction, private temp files only.
// No user data may be written to stdout, stderr, or published evidence.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { finished } from 'node:stream/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCopyHeader, buildCatalog, assessCompatibility } from '../build-postgres-portable-data-replay.mjs';

const provider = new Set(['auth','storage']);
const safeName=/^[a-z_][a-z0-9_]{0,127}$/u;
const q=x=>'"'+x+'"';
const n=x=>x.schema+'.'+x.table;

export async function prepareExactProviderCopy({
  inputPath, outputPath, targetCatalog, preflight, sourceGaps,
}) {
  assert.equal(preflight?.sourceBackupRunId,42752268638);
  assert.equal(preflight.actualSourceCopyBlocks,33);
  assert.equal(preflight.actualSourceCopyRows,93);
  assert.equal(preflight.allProviderCopyBlocksExact,true);
  assert.equal(preflight.historicalSkippedRelationsNowExact,29);
  assert.equal(preflight.historicalProjectedRelationsNowExact,3);
  assert.equal(preflight.actualProviderRowsInserted,0);
  assert.equal(preflight.drReady,false);
  assert.equal(sourceGaps.sourceBackupRunId,42752268638);
  const target=buildCatalog(targetCatalog);
  const seen=new Map();
  const writer=createWriteStream(outputPath,{encoding:'utf8',flags:'wx',mode:0o600});
  const reader=createInterface({
    input:createReadStream(inputPath,{encoding:'utf8'}),crlfDelay:Infinity,
  });
  let block=null;
  try {
    writer.write("SET statement_timeout = '90s';\nSET lock_timeout = '15s';\n");
    for await(const line of reader){
      if(block){
        if(line==='\\.'){
          if(block.provider){
            writer.write('\\.\n');
            assert.ok(!seen.has(n(block)), 'Duplicate Provider COPY block');
            seen.set(n(block),{
              schema:block.schema,table:block.table,sourceRows:block.rows,
            });
          }
          block=null;
        }else{
          if(block.rows===Number.MAX_SAFE_INTEGER) throw Error('COPY row overflow');
          block.rows++;
          if(block.provider)writer.write(line+'\n');
        }
        continue;
      }
      const copy=parseCopyHeader(line);
      if(!copy)continue;
      const isProvider=provider.has(copy.schema);
      if(isProvider){
        assert.match(copy.schema,safeName);
        assert.match(copy.table,safeName);
        for(const col of copy.columns)assert.match(col,safeName);
        const cmp=assessCompatibility(copy,target);
        assert.equal(cmp.mode,'exact','Provider COPY has unsupported/required columns');
        writer.write(
          'COPY '+q(copy.schema)+'.'+q(copy.table)+' ('+
          copy.columns.map(q).join(', ')+') FROM stdin;\n');
      }
      block={schema:copy.schema,table:copy.table,provider:isProvider,rows:0};
    }
    assert.equal(block,null,'Truncated source COPY block');
    const all=[...seen.values()];
    assert.equal(all.length,33,'Provider COPY block count changed');
    assert.equal(all.reduce((sum,x)=>sum+x.sourceRows,0),93,
      'Provider source row count changed');
    const historic=[...sourceGaps.skippedTables,...sourceGaps.projectedTables];
    assert.equal(historic.length,32);
    for(const item of historic){
      const row=seen.get(n(item));
      assert.ok(row,'Missing historical provider relation');
      assert.equal(row.sourceRows,item.sourceRowCount,'Source row drift');
    }
    writer.end();
    await finished(writer);
    return all;
  }catch(error){
    writer.destroy();
    await finished(writer).catch(()=>{});
    throw error;
  }
}

export function buildProviderRowCountSql(tables){
  assert.equal(tables.length,33);
  const lines=tables.map(x=>{
    assert.ok(provider.has(x.schema));
    assert.match(x.table,safeName);
    return "SELECT '"+n(x)+"'::text AS relation_name, count(*)::bigint AS row_count FROM "+
      q(x.schema)+'.'+q(x.table);
  });
  return "SELECT coalesce(jsonb_object_agg(relation_name,row_count), '{}'::jsonb) FROM (\n"+
    lines.join('\nUNION ALL\n')+"\n) counts;\n";
}

export function verifyProviderRowCounts(tables,before,after){
  assert.equal(tables.length,33);
  assert.equal(Object.keys(before).length,33);
  assert.equal(Object.keys(after).length,33);
  let source=0;
  let recovered=0;
  for(const table of tables){
    const key=n(table);
    const start=before[key],end=after[key];
    assert.ok(Number.isSafeInteger(start)&&start>=0);
    assert.ok(Number.isSafeInteger(end)&&end>=0);
    assert.equal(end-start,table.sourceRows,'Mismatch in isolated recovered row count');
    source+=table.sourceRows;
    recovered+=end-start;
  }
  assert.equal(source,93);
  assert.equal(recovered,93);
  return {
    schemaVersion:'ops-provider-sealed-copy-isolated-row-restore-v1',
    sourceBackupRunId:42752268638,
    preflightRunId:42987584238,
    localOnly:true,
    target:'disposable-supabase-cli-3.1.0-postgres17',
    copyBlocksAttempted:33,
    copiedSourceRows:source,
    isolatedTargetRowDelta:recovered,
    rowsCountVerified:true,
    constraintsEnforcedOnCopy:true,
    applicationSchemaReplayed:false,
    providerMigrationLedgerEquivalent:false,
    sourceTargetSchemaFullyEquivalent:false,
    hostedAuthSessionsRecovered:false,
    hostedStorageObjectBytesRecovered:false,
    independentPrivacyContinuityProven:false,
    wholeServiceRpoRtoProven:false,
    providerManagedFullRestoreProven:false,
    drReady:false,
    serviceResumptionAllowed:false,
    gate:'BLOCKED',
    verdict:'ISOLATED_PROVIDER_ROW_COUNTS_VERIFIED__FULL_DR_HOLD',
  };
}

async function main(){
  assert.equal(process.env.GITHUB_ACTIONS,'true');
  assert.equal(process.env.GITHUB_REF,'refs/heads/main');
  assert.equal(process.env.MH_OPS_PROVIDER_DATA_REPLAY,'true');
  const args=process.argv.slice(2);
  const value=flag=>{
    const i=args.indexOf(flag);
    assert.ok(i>=0&&args[i+1]&&!args[i+1].startsWith('--'));
    return resolve(args[i+1]);
  };
  const mode=args[args.indexOf('--mode')+1];
  const root=resolve(process.env.RUNNER_TEMP??'.');
  assert.notEqual(root,resolve('.'));
  const privateFile=path=>{
    assert.ok(path.startsWith(root+'/')||path.startsWith(root+'\\'));
    return path;
  };
  if(mode==='prepare'){
    const input=privateFile(value('--source'));
    const catalog=privateFile(value('--catalog'));
    const preflight=privateFile(value('--preflight'));
    const output=privateFile(value('--sql'));
    const counts=privateFile(value('--counts'));
    const countSql=privateFile(value('--count-sql'));
    const gapFile=value('--gaps');
    const tableList=await prepareExactProviderCopy({
      inputPath:input,outputPath:output,
      targetCatalog:JSON.parse(await readFile(catalog,'utf8')),
      preflight:JSON.parse(await readFile(preflight,'utf8')),
      sourceGaps:JSON.parse(await readFile(gapFile,'utf8')),
    });
    await writeFile(counts,JSON.stringify(tableList),{mode:0o600,flag:'wx'});
    await writeFile(countSql,buildProviderRowCountSql(tableList),
      {mode:0o600,flag:'wx'});
    console.log('SEALED_PROVIDER_REPLAY_PREPARED_PRIVATE_ONLY blocks=33 rows=93');
  }else if(mode==='verify'){
    const counts=privateFile(value('--counts'));
    const before=privateFile(value('--before'));
    const after=privateFile(value('--after'));
    const out=privateFile(value('--output'));
    const verified=verifyProviderRowCounts(
      JSON.parse(await readFile(counts,'utf8')),
      JSON.parse(await readFile(before,'utf8')),
      JSON.parse(await readFile(after,'utf8')),
    );
    await writeFile(out,JSON.stringify(verified,null,2)+'\n',{mode:0o600,flag:'wx'});
    console.log('SEALED_PROVIDER_REPLAY_VERIFIED isolated_rows=93 DR_BLOCKED');
  }else throw Error('Unsupported exact replay mode');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(()=>{
    console.error('HOLD_SEALED_PROVIDER_DATA_REPLAY');
    process.exitCode=1;
  });
}
