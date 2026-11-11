// Offline, no-write source COPY preflight; only metadata and row counts escape.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCopyHeader, buildCatalog, assessCompatibility } from '../build-postgres-portable-data-replay.mjs';

const sourceBackupRunId = 42752268638;
const allowed = new Set(['auth', 'storage']);
const qualified = x => x.schema + '.' + x.table;

export async function inspectProviderCopyHeaders(inputPath, targetCatalog, recordedGaps) {
  assert.equal(recordedGaps.sourceBackupRunId, sourceBackupRunId);
  assert.equal(recordedGaps.sourceRestoreRunId, 42967203704);
  assert.equal(recordedGaps.sourceProviderSkippedBlocks, 29);
  assert.equal(recordedGaps.sourceProviderProjectedBlocks, 3);
  assert.equal(recordedGaps.sourceProviderSkippedRows, 66);
  assert.equal(recordedGaps.sourceProviderProjectedRows, 27);
  assert.equal(recordedGaps.containsRowPayloads, false);
  const catalog = buildCatalog(targetCatalog);
  const observed = new Map();
  let active = null;
  const stream = createInterface({input: createReadStream(inputPath,{encoding:'utf8'}),crlfDelay:Infinity});
  for await (const line of stream) {
    if (active) {
      if (line === '\\.') {
        if (active.provider) {
          assert.ok(!observed.has(active.relation), 'Duplicate Provider COPY block');
          observed.set(active.relation, {
            schema: active.copy.schema, table: active.copy.table,
            sourceRows: active.rows, mode: active.compatibility.mode,
            reason: active.compatibility.reason,
            missingOrGeneratedColumns: active.compatibility.unsupportedSourceColumns,
            requiredUnbackedTargetColumns: active.compatibility.requiredTargetColumns,
          });
        }
        active = null;
      } else {
        if (active.rows >= Number.MAX_SAFE_INTEGER) throw Error('COPY row count overflow');
        active.rows += 1;
      }
      continue;
    }
    const copy = parseCopyHeader(line);
    if (!copy) continue;
    active = {
      copy, rows: 0, provider: allowed.has(copy.schema),
      relation: qualified(copy),
      compatibility: allowed.has(copy.schema) ? assessCompatibility(copy,catalog) : null,
    };
  }
  assert.equal(active, null, 'Truncated COPY block');
  const validateGap = (entry, historicalMode) => {
    const r=observed.get(qualified(entry));
    assert.ok(r,'Previously recorded Provider COPY block disappeared');
    assert.equal(r.sourceRows,entry.sourceRowCount,'Historical source row count changed');
    assert.equal(entry.reason, historicalMode,'Historical Provider reason changed');
  };
  for(const entry of recordedGaps.skippedTables) validateGap(entry,'target_relation_missing');
  for(const entry of recordedGaps.projectedTables) validateGap(entry,'source_columns_projected_to_target');
  const all=[...observed.values()].sort((a,b)=>qualified(a).localeCompare(qualified(b)));
  const incompatible=all.filter(r=>r.mode!=='exact');
  const missing=recordedGaps.skippedTables.filter(e=>observed.get(qualified(e)).mode!=='exact');
  const projected=recordedGaps.projectedTables.filter(e=>observed.get(qualified(e)).mode!=='exact');
  return {
    schemaVersion:'ops-provider-sealed-copy-header-preflight-v1',
    sourceBackupRunId, sourceRestoreRunId:recordedGaps.sourceRestoreRunId,
    target:'fresh-disposable-supabase-cli-3.1.0-postgres17',
    actualSourceCopyBlocks:all.length,
    actualSourceCopyRows:all.reduce((n,x)=>n+x.sourceRows,0),
    historicalSkippedRelationCount:recordedGaps.skippedTables.length,
    historicalSkippedRelationsNowExact:recordedGaps.skippedTables.length-missing.length,
    historicalProjectedRelationCount:recordedGaps.projectedTables.length,
    historicalProjectedRelationsNowExact:recordedGaps.projectedTables.length-projected.length,
    allProviderCopyBlocksExact:incompatible.length===0,
    remainingIncompatibleRelations:incompatible.map(r=>({
      schema:r.schema,table:r.table,reason:r.reason,sourceRows:r.sourceRows,
      missingOrGeneratedColumns:r.missingOrGeneratedColumns,
      requiredUnbackedTargetColumns:r.requiredUnbackedTargetColumns,
    })),
    sourceRowPayloadsRetained:false,
    sourceRowPayloadsEmitted:false,
    actualProviderRowsInserted:0,
    backupLedgerRestored:false,
    sourceAndTargetSchemaEquivalent:false,
    authSessionRecoveryProven:false,
    storageObjectBytesRecovered:false,
    actualProviderDataRestoreProven:false,
    providerManagedDataFullRestore:false,
    drReady:false,serviceResumptionAllowed:false,gate:'BLOCKED',
    verdict:incompatible.length===0
      ? 'COPY_HEADER_COLUMN_CANDIDATE_ONLY__DATA_AND_CONSTRAINT_REPLAY_UNPROVEN'
      : 'HOLD_PROVIDER_SOURCE_COPY_COLUMN_INCOMPATIBILITY',
  };
}

async function main() {
  assert.equal(process.env.GITHUB_ACTIONS,'true');
  assert.equal(process.env.GITHUB_REF,'refs/heads/main');
  assert.equal(process.env.MH_OPS_PROTECTED_SOURCE_COPY_PREFLIGHT,'true');
  const args=process.argv.slice(2);
  const get=flag=>{const index=args.indexOf(flag);assert.ok(index>=0&&args[index+1]&&!args[index+1].startsWith('--'));return resolve(args[index+1]);};
  const input=get('--input'), target=get('--target'), evidence=get('--evidence'), output=get('--output');
  const root=resolve(process.env.RUNNER_TEMP ?? '.');
  assert.ok(root !== resolve('.'));
  assert.ok(input.startsWith(root+'/')||input.startsWith(root+'\\'));
  assert.ok(target.startsWith(root+'/')||target.startsWith(root+'\\'));
  assert.ok(output.startsWith(root+'/')||output.startsWith(root+'\\'));
  const catalog=JSON.parse(await readFile(target,'utf8'));
  const gaps=JSON.parse(await readFile(evidence,'utf8'));
  const report=await inspectProviderCopyHeaders(input,catalog,gaps);
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log('PROVIDER_COPY_HEADERS_VERIFIED: blocks='+report.actualSourceCopyBlocks+
    ' historicalPreviouslyMissingNowExact='+report.historicalSkippedRelationsNowExact+
    ' previousProjectionsNowExact='+report.historicalProjectedRelationsNowExact+
    ' actualRowsInserted=0 DR_BLOCKED');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  main().catch(()=>{console.error('HOLD_SEALED_PROVIDER_COPY_PREFLIGHT_FAILED');process.exitCode=1;});
