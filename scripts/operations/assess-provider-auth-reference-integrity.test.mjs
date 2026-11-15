import { test } from 'vitest';
import assert from 'node:assert/strict';
import { assessLocalAuthReferences } from './assess-provider-auth-reference-integrity.mjs';

const snapshot=()=>({
  schemaVersion:'ops-provider-local-auth-reference-snapshot-v1',
  target:'disposable-supabase-cli-3.1.0-postgresql17',
  relationRowsReadAsPayload:false,
  rowCounts:{users:4,identities:4,sessions:16,refreshTokens:23,mfaAmrClaims:16},
  orphanCounts:{identityWithoutUser:0,sessionWithoutUser:0,refreshTokenWithoutSession:0,mfaClaimWithoutSession:0},
  constraints:{providerForeignKeys:12,unvalidatedProviderForeignKeys:0,disabledInternalProviderTriggers:0},
});
const replay={schemaVersion:'ops-provider-sealed-copy-isolated-row-restore-v1',
  sourceBackupRunId:42752268638,copiedSourceRows:93,isolatedTargetRowDelta:93,
  rowsCountVerified:true,constraintsEnforcedOnCopy:true,drReady:false,
  serviceResumptionAllowed:false};
test('recovered 93-row Auth reference graph has no Hosted admission',()=>{
  const report=assessLocalAuthReferences(snapshot(),replay);
  assert.equal(report.localAuthReferenceIntegrityObserved,true);
  assert.equal(report.orphanCount,0);
  assert.equal(report.drReady,false);
  assert.equal(report.serviceResumptionAllowed,false);
  assert.equal(report.actualProductionAccountLoginVerified,false);
});
test('orphaned refresh token is explicit HOLD',()=>{
  const input=snapshot();
  input.orphanCounts.refreshTokenWithoutSession=1;
  const result=assessLocalAuthReferences(input,replay);
  assert.equal(result.localAuthReferenceIntegrityObserved,false);
  assert.equal(result.orphanCount,1);
});
test('unvalidated FK and disabled internal trigger force HOLD',()=>{
  for(const field of ['unvalidatedProviderForeignKeys','disabledInternalProviderTriggers']){
    const input=snapshot();
    input.constraints[field]=1;
    assert.equal(assessLocalAuthReferences(input,replay).localAuthReferenceIntegrityObserved,false);
  }
});
test('source row count drift is not accepted',()=>{
  const input=snapshot();input.rowCounts.sessions=15;
  assert.equal(assessLocalAuthReferences(input,replay).rowCountsMatchSealedBackup,false);
});
test('raw identifiers in the snapshot are rejected',()=>{
  const input=snapshot();input.userId='test';
  assert.throws(()=>assessLocalAuthReferences(input,replay));
});
test('restoration readiness promotion is rejected',()=>{
  assert.throws(()=>assessLocalAuthReferences(snapshot(),{...replay,drReady:true}));
});
