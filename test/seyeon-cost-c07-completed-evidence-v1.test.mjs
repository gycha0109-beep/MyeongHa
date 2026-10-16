import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {SEYEON_C07_COMPLETED_EVIDENCE_V1 as RESULT,
 loadSeyeonC07CompletedEvidenceV1 as load,
 verifySeyeonC07CompletedEvidenceV1 as verify}
 from '../scripts/seyeon-cost-c07-completed-evidence-v1.mjs';

const mutate=(edit)=>{
 const e=structuredClone(load());
 edit(e);
 return e;
};

describe('C07 exact-run six-call evidence, offline and non-promotable',()=>{
 it('pins the published source artifact and precisely six matched model outputs',()=>{
  expect(RESULT).toMatchObject({
   sourceRunId:38859692050,sourceArtifactId:12028787181,
   screenedCases:3,screenedPairs:6,matchedPilotPairs:6,
   totalMatrixPairs:72,unmeasuredPairs:66,
   originalEstimatedMicroUsd:1175,compactEstimatedMicroUsd:973,
   pilotEstimatedMicroUsd:2148,
   cumulativeAttemptedCalls:11,cumulativeEstimatedMicroUsd:3770,
   cumulativeReservedMicroUsd:36047,stressReservedKrw:90.1175,
   actualBilledKrw:null,providerInvoiceReconciled:false,
   providerHardLimitVerified:false,furtherPaidCallsPermitted:false,
   widerRealModelEvidence:'INCOMPLETE_REAL_MODEL_EVIDENCE',
   endToEndFiveToThreeVerified:false,productionPromotionPermitted:false,
  });
  expect(RESULT.compactPilotSavingsPercent).toBeCloseTo(17.191489,4);
  expect(verify(load())).toEqual(RESULT);
 });
 it('fails closed on missing/extra/duplicated or reordered model observations',()=>{
  const edits=[
   x=>x.results.pop(),
   x=>x.results.push(structuredClone(x.results[0])),
   x=>x.results[1]=structuredClone(x.results[0]),
   x=>x.results.reverse(),
   x=>x.results[0].caseId='F01',
   x=>x.results[0].variant='compact',
  ];
  for(const edit of edits)
   expect(()=>verify(mutate(edit))).toThrow(/C07 evidence HOLD/u);
 });
 it('rejects claim drift, missing topic, fabricated tokens or changed metering',()=>{
  const edits=[
   x=>x.results[0].claimKinds=['CHARACTER_FACT_CLAIM'],
   x=>x.results[2].topicKey=null,
   x=>x.results[4].claimKinds=[],
   x=>x.results[1].inputTokens=0,
   x=>x.results[0].outputTokens=null,
   x=>x.results[5].estimatedCostMicroUsd=0,
  ];
  for(const edit of edits)
   expect(()=>verify(mutate(edit))).toThrow(/C07 evidence HOLD/u);
 });
 it('rejects altered run provenance, false invoice and budget reset',()=>{
  const edits=[
   x=>x.source.runAttempt=2,
   x=>x.source.runId=38859692051,
   x=>x.source.artifactZipSha256='unknown',
   x=>x.historical.attemptedCalls=0,
   x=>x.historical.reservedMicroUsd=0,
   x=>x.budget.cumulativeReservedMicroUsd=19662,
   x=>x.budget.actualBilledKrw=0,
   x=>x.budget.invoiceReconciled=true,
   x=>x.budget.providerHardLimitVerified=true,
   x=>x.productionPromotionPermitted=true,
   x=>x.modelQualityVerified=true,
  ];
  for(const edit of edits)
   expect(()=>verify(mutate(edit))).toThrow(/C07 evidence HOLD/u);
 });
 it('does not import provider, API credentials, real conversation or production DB',()=>{
  const source=readFileSync(new URL(
   '../scripts/seyeon-cost-c07-completed-evidence-v1.mjs',import.meta.url),'utf8');
  const fixture=readFileSync(new URL(
   '../test/fixtures/seyeon-c07-real-six-call-run-38859692050-sanitized-v1.json',
   import.meta.url),'utf8');
  expect(source).not.toContain('OPENAI_API_KEY');
  expect(source).not.toContain('fetch(');
  expect(source).not.toContain('process.env');
  expect(fixture).not.toMatch(/(email|userText|rawResponse|apiKey|secret)/iu);
 });
});
