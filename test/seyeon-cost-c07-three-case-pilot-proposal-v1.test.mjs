import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {describe,expect,it} from 'vitest';
import {SEYEON_C07_PILOT_PROPOSAL_V1 as P}
 from '../scripts/seyeon-cost-c07-three-case-pilot-proposal-v1.mjs';
import {SEYEON_C07_BOUNDARY_MATRIX_V1 as MATRIX}
 from '../scripts/seyeon-cost-c07-cross-topic-boundary-v1.mjs';

describe('C07 5 previous calls + proposed 6 new calls: OWNER forecast not spend authority',()=>{
 it('pins 3+2 real prior calls and their cost estimates without claiming invoice',()=>{
  const f=JSON.parse(readFileSync(new URL(
   './fixtures/seyeon-c06-f01-v2-run-38854937049-sanitized-v1.json',
   import.meta.url),'utf8'));
  expect(f).toMatchObject({
   sourceRunId:38854937049,sourceArtifactId:12026239456,
   sourceRunAttempt:1,providerInvoiceReconciled:false,
   actualBilledKrw:null,completeF01Pair:true,stopReason:null,
  });
  expect(f.results).toHaveLength(2);
  expect(f.results.map(x=>x.verdict)).toEqual([
   'MATCHED_GOLD_SCREEN','MATCHED_GOLD_SCREEN',
  ]);
  expect(f.results.map(x=>x.claimKinds)).toEqual([[],[]]);
  expect(f.results.reduce((n,x)=>n+x.estimatedCostMicroUsd,0)).toBe(586);
  expect(P.sourceRuns).toEqual([38845185681,38854937049]);
  expect(P.priorAttemptedCalls).toBe(5);
  expect(P.priorMeasuredEstimateMicroUsd).toBe(1622);
 });
 it('uses only 3 existing boundary cases and never re-runs the earlier F01',()=>{
  expect(P.pilotIds).toEqual(['F02','R01','H02']);
  expect(P.variants).toEqual(['original','compact']);
  expect(P.requestedNewCalls).toBe(6);
  expect(P.pilotIds).not.toContain('F01');
  const chosen=P.pilotIds.map(id=>MATRIX.find(x=>x.id===id));
  expect(chosen).not.toContain(undefined);
  expect(chosen.map(x=>x.topic)).toEqual([
   'family_emotional_history','past_romance_surface',null,
  ]);
  expect(chosen.map(x=>x.expectedKinds)).toEqual([
   [],[],['SHARED_EVENT_CLAIM'],
  ]);
 });
 it('conservatively reserves all 5 previous requests plus all proposed 6',()=>{
  expect(P).toMatchObject({
   perCallConservativeReserveMicroUsd:3277,
   priorConservativeReservedMicroUsd:16385,
   proposedNewReserveMicroUsd:19662,
   cumulativeReserveMicroUsd:36047,
   conservativeFxKrwPerUsd:2500,
   cumulativeStressKrw:90.1175,
   ownerBudgetKrw:100,
  });
  expect(P.cumulativeStressKrw).toBeLessThan(P.ownerBudgetKrw);
  expect(P.ownerBudgetKrw-P.cumulativeStressKrw).toBeCloseTo(9.8825,5);
 });
 it('keeps actual-billing uncertainty, paid dispatch and Production promotion on HOLD',()=>{
  expect(P).toMatchObject({
   kind:'OFFLINE_FORECAST_NOT_PAID_APPROVAL',
   actualBilledKrw:null,providerInvoiceReconciled:false,
   externalProviderHardLimitVerified:false,
   paidDispatchEnabled:false,
   productionPromotionPermitted:false,
  });
  const legacy=readFileSync(new URL(
   '../.github/workflows/seyeon-model-eval-v1.yml',import.meta.url),'utf8');
  expect(legacy).toContain('if: $'+'{{ false }}');
  const retry=readFileSync(new URL(
   '../scripts/seyeon-cost-c06-f01-v2-once-admission-v1.mjs',
   import.meta.url),'utf8');
  expect(retry).toContain("GITHUB_RUN_ATTEMPT!=='1'");
 });
 it('offline CLI has no network, secret use or provider execution',()=>{
  const output=execFileSync(process.execPath,[
   'scripts/run-seyeon-cost-c07-cross-topic-offline-v1.mjs',
  ],{encoding:'utf8',env:{PATH:process.env.PATH}});
  const payload=JSON.parse(output);
  expect(payload.report).toMatchObject({
   observedPairs:0,expectedVariantPairs:72,
   reason:'INCOMPLETE_REAL_MODEL_EVIDENCE',
   verdict:'HOLD',modelQualityVerified:false,
  });
  expect(payload.paidPilot).toMatchObject({
   paidDispatchEnabled:false,requestedNewCalls:6,
  });
  expect(output).not.toContain('OPENAI_API_KEY');
  expect(output).not.toContain('sk-proj');
 });
});
