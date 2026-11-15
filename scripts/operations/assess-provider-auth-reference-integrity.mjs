// Aggregate-only local Provider Auth restoration integrity; no identifiers, rows,
// refresh token material, or secrets leave the disposable database.
// Watchtower-Track: ops
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const expectKeys = (value, keys, label) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), label);
  assert.deepEqual(Object.keys(value).sort(), keys.slice().sort(), label);
};
const count = (value, label) =>
  assert.ok(Number.isSafeInteger(value) && value >= 0, label + ' must be nonnegative');

export function assessLocalAuthReferences(snapshot, replay) {
  expectKeys(snapshot, ['schemaVersion','target','relationRowsReadAsPayload',
    'rowCounts','orphanCounts','constraints'], 'snapshot');
  assert.equal(snapshot.schemaVersion,'ops-provider-local-auth-reference-snapshot-v1');
  assert.equal(snapshot.target,'disposable-supabase-cli-3.1.0-postgresql17');
  assert.equal(snapshot.relationRowsReadAsPayload,false);
  expectKeys(snapshot.rowCounts,
    ['users','identities','sessions','refreshTokens','mfaAmrClaims'], 'rowCounts');
  expectKeys(snapshot.orphanCounts,
    ['identityWithoutUser','sessionWithoutUser','refreshTokenWithoutSession',
      'mfaClaimWithoutSession'], 'orphanCounts');
  expectKeys(snapshot.constraints,
    ['providerForeignKeys','unvalidatedProviderForeignKeys',
      'disabledInternalProviderTriggers'], 'constraints');
  for(const [key,val] of Object.entries(snapshot.rowCounts)) count(val,'rowCounts.'+key);
  for(const [key,val] of Object.entries(snapshot.orphanCounts)) count(val,'orphanCounts.'+key);
  for(const [key,val] of Object.entries(snapshot.constraints)) count(val,'constraints.'+key);
  assert.equal(replay?.schemaVersion,'ops-provider-sealed-copy-isolated-row-restore-v1');
  assert.equal(replay.sourceBackupRunId,42752268638);
  assert.equal(replay.copiedSourceRows,93);
  assert.equal(replay.isolatedTargetRowDelta,93);
  assert.equal(replay.rowsCountVerified,true);
  assert.equal(replay.constraintsEnforcedOnCopy,true);
  assert.equal(replay.drReady,false);
  assert.equal(replay.serviceResumptionAllowed,false);
  const expected={users:4,identities:4,sessions:16,refreshTokens:23,mfaAmrClaims:16};
  // This exact workflow provisions a new empty local target on each run.
  // Extra seeded/missing rows must be investigated, never silently accepted.
  const rowCountsMatch=Object.keys(expected).every(k=>snapshot.rowCounts[k]===expected[k]);
  const orphanCount=Object.values(snapshot.orphanCounts).reduce((sum,val)=>sum+val,0);
  const fkValidated=snapshot.constraints.providerForeignKeys>0 &&
    snapshot.constraints.unvalidatedProviderForeignKeys===0 &&
    snapshot.constraints.disabledInternalProviderTriggers===0;
  const passed=rowCountsMatch && orphanCount===0 && fkValidated;
  return {
    schemaVersion:'ops-provider-sealed-local-auth-reference-integrity-v1',
    sourceBackupRunId:42752268638,
    sourceProviderReplayRunId:43136341133,
    target:'disposable-supabase-cli-3.1.0-postgresql17',
    expectedSourceRowCounts:expected,
    observedRowCounts:snapshot.rowCounts,
    observedOrphanCounts:snapshot.orphanCounts,
    observedConstraintCounts:snapshot.constraints,
    rowCountsMatchSealedBackup:rowCountsMatch,
    orphanCount,
    allProviderForeignKeysValidated:fkValidated,
    localAuthReferenceIntegrityObserved:passed,
    identifierOrTokenValuesExposed:false,
    actualProductionAccountLoginVerified:false,
    authRefreshRevocationSemanticsVerified:false,
    hostedProviderRecoveryEquivalent:false,
    providerMigrationLedgerEquivalent:false,
    independentPrivacyContinuityProven:false,
    wholeServiceRpoRtoProven:false,
    drReady:false,serviceResumptionAllowed:false,gate:'BLOCKED',
    verdict:passed?'LOCAL_AUTH_REFERENCE_INTEGRITY_ONLY__HOSTED_DR_HOLD':
      'HOLD_ISOLATED_PROVIDER_AUTH_REFERENCE_INTEGRITY',
  };
}
async function main() {
  assert.equal(process.env.GITHUB_ACTIONS,'true');
  assert.equal(process.env.GITHUB_REF,'refs/heads/main');
  assert.equal(process.env.MH_OPS_PROVIDER_DATA_REPLAY,'true');
  assert.ok(process.env.RUNNER_TEMP);
  const args=process.argv.slice(2);
  const get=flag=>{
    const i=args.indexOf(flag);
    assert.ok(i>=0 && args[i+1] && !args[i+1].startsWith('--'));
    const file=resolve(args[i+1]);
    const root=resolve(process.env.RUNNER_TEMP);
    assert.ok(file.startsWith(root+'/') || file.startsWith(root+'\\'));
    return file;
  };
  const raw=await readFile(get('--snapshot'),'utf8');
  const lines=raw.trim().split(/\r?\n/u);
  assert.equal(lines.length,1,'Only a single JSON aggregate row permitted');
  const snapshot=JSON.parse(lines[0]);
  const replay=JSON.parse(await readFile(get('--replay'),'utf8'));
  const report=assessLocalAuthReferences(snapshot,replay);
  await writeFile(get('--output'),JSON.stringify(report,null,2)+'\n',
    {flag:'wx',mode:0o600});
  console.log('ISOLATED_AUTH_REFERENCE_INTEGRITY_RESULT '+report.verdict+
    ' orphans='+report.orphanCount+' DR_BLOCKED');
  if(!report.localAuthReferenceIntegrityObserved) process.exitCode=1;
}
if(process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(()=>{console.error('HOLD_ISOLATED_PROVIDER_AUTH_REFERENCE_INTEGRITY');process.exitCode=1;});
}
