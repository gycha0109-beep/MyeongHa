import test from 'node:test';
import assert from 'node:assert/strict';
import { createOptimizationRun, digest, validateCandidate } from './contracts-v1.mjs';
import { buildGepaResearchPayload, DIMENSIONS } from './evaluation-v1.mjs';
import { inspectFrozenSyntheticFamilyEvidence as inspect } from './gepa-synthetic-family-evidence-v1.mjs';

const ids=['yeoul','seyeon'], ctx=digest('synthetic-ctx'), seed='Respond clearly.';
const profile=characterId=>({
  characterId,
  source:{canonRef:'synthetic/canon',runtimeRef:'synthetic/runtime',
    contentBundleSha256:ctx,authorityVersion:'DRAFT',authorityState:'DRAFT'},
  student:{provider:'openrouter',modelId:'synthetic/no-model',
    parametersSha256:ctx,routingPolicySha256:ctx},
  evalSuite:{developmentRef:'synthetic/dev',validationRef:'synthetic/val',
    holdoutRef:'synthetic/not-readable',rubricVersion:'synthetic-v1',
    splitManifestSha256:ctx},
  mutableSlots:['shared_expression'],reviewRequired:true,
  privacyPolicyRef:'synthetic/none',
});
function fixture(){
  const manifest=createOptimizationRun({
    track:'shared',profiles:ids.map(profile),immutableSourcesSha256:ctx,
    baselinePromptSha256:digest(seed),optimizerVersion:'pinned-synthetic',
    evaluatorVersion:'synthetic-evaluator',
  });
  const selected='Respond clearly. Use concise answers.';
  const candidate=validateCandidate({shared_expression:selected},
    {slot:'shared_expression',pinnedContextSha256:ctx});
  const envelope=buildGepaResearchPayload({
    manifest,
    candidate:validateCandidate({shared_expression:seed},
      {slot:'shared_expression',pinnedContextSha256:ctx}),
    corpus:ids.flatMap(characterId=>['development','optimizer_validation'].map(split=>({
      characterId,split,id:characterId+'-'+split, familyId:characterId+'-'+split+'-f',
      contentSha256:digest(characterId+split),sourceType:'synthetic',
    }))),
  });
  const packet={
    schemaVersion:'character-gepa-frozen-result-v1', optimizer:'gepa',
    runManifestSha256:manifest.manifestSha256,
    sourceSeedSha256:envelope.candidateSha256,proposal:candidate,
    researchEvidence:{
      bestScoreSyntheticOnly:0.6,totalEvals:4,sourceAuthenticated:false,
      independentQualityGainEstablished:false,ownerReviewGranted:false,
      heldoutPassed:false,releaseApproved:false,
    },
    externalCallsAuthorized:false,externalCalls:0,productionEligible:false,
  };
  const familyScores=envelope.dataset.map(row=>{
    const base=row.characterId==='yeoul'
      ? [.2,.4,.5,.3,.4,.5,.3,.4] : Array(8).fill(.62);
    const selected=row.characterId==='yeoul'
      ? [.65,.69,.75,.65,.68,.76,.64,.80]
      : [.72,.72,.72,.40,.72,.72,.72,.72];
    const mapped=nums=>Object.fromEntries(DIMENSIONS.map((dim,i)=>[dim,nums[i]]));
    return {
      characterId:row.characterId,split:row.split,familyId:row.familyId,
      baselineScores:mapped(base),candidateScores:mapped(selected),
      failureCodes:[],uncertain:false,
    };
  });
  const evidence={
    schemaVersion:'character-gepa-synthetic-family-evidence-v2',
    runManifestSha256:manifest.manifestSha256,
    sourceSeedSha256:envelope.candidateSha256,
    candidateTextSha256:candidate.textSha256,
    sourceType:'actual_bounded_gepa_evaluator_synthetic_only',
    scalarRepeatedAcrossDimensions:false,
    independentEvaluation:false,
    familyScores,externalCalls:0,productionEligible:false,
  };
  return{manifest,envelope,packet,evidence};
}
const verify=x=>inspect(x);

test('synthetic mean improvements cannot mask one character persona dimension regression',()=>{
  const x=fixture();const result=verify(x);
  assert.equal(result.hasSyntheticRegressions,true);
  assert.equal(result.byCharacter.find(v=>v.characterId==='yeoul').regressionFamilies,0);
  assert.equal(result.byCharacter.find(v=>v.characterId==='seyeon').regressionFamilies,2);
  assert.equal(result.byCharacter.find(v=>v.characterId==='seyeon')
    .regressionByDimension.persona_fidelity,2);
  assert.equal(result.byCharacter.find(v=>v.characterId==='seyeon')
    .regressionByDimension.continuity,0);
  const seyeonScores=x.evidence.familyScores.find(x=>x.characterId==='seyeon');
  const avg=s=>DIMENSIONS.reduce((n,k)=>n+s[k],0)/DIMENSIONS.length;
  assert.ok(avg(seyeonScores.candidateScores)>avg(seyeonScores.baselineScores));
  assert.equal(result.scalarRepeatedAcrossDimensions,false);
  assert.equal(result.scenarioFamiliesChecked,4);
  assert.equal(result.independentEvaluation,false);
  assert.equal(result.independentHumanQualityProven,false);
  assert.equal(result.candidateRegistryStage,'proposed');
  assert.equal(result.productionEligible,false);
  assert.equal(JSON.stringify(result).includes('Respond clearly'),false);
});

test('a score file for another selected candidate cannot be substituted',()=>{
  const a=fixture();
  for(const changed of [
    {...a.evidence,runManifestSha256:digest('wrong')},
    {...a.evidence,candidateTextSha256:digest('other candidate')},
    {...a.evidence,sourceSeedSha256:digest('other baseline')},
    {...a.evidence,sourceType:'trusted_human_review'},
    {...a.evidence,independentEvaluation:true},
    {...a.evidence,scalarRepeatedAcrossDimensions:true},
    {...a.evidence,productionEligible:true},
    {...a.evidence,approvalRef:'signed'},
  ]) assert.throws(()=>verify({...a,evidence:changed}));
});

test('reject missing, duplicate, foreign, nonfinite and raw-text family evidence',()=>{
  const a=fixture(), rows=a.evidence.familyScores;
  for(const familyScores of [
    rows.slice(1), [...rows,rows[0]],
    rows.map((v,i)=>i===0?{...v,familyId:'foreign'}:v),
    rows.map((v,i)=>i===0?{...v,baselineScores:{...v.baselineScores,agency:NaN}}:v),
    rows.map((v,i)=>i===0?{...v,candidateScores:{...v.candidateScores,persona_fidelity:1.01}}:v),
    rows.map((v,i)=>i===0?{...v,candidateScores:{...v.candidateScores,agency:undefined}}:v),
    rows.map((v,i)=>i===0?{...v,candidateScores:{...v.candidateScores,unexpected:0.5}}:v),
    rows.map((v,i)=>i===0?{...v,candidateScores:0.75}:v),
    rows.map((v,i)=>i===0?{...v,uncertain:true}:v),
    rows.map((v,i)=>i===0?{...v,failureCodes:['fabricated_memory']}:v),
    rows.map((v,i)=>i===0?{...v,privateReply:'PERSONAL_USER_MESSAGE'}:v),
  ]) assert.throws(()=>verify({...a,evidence:{...a.evidence,familyScores}}));
});

test('perfect scores still never become proof of independent quality or release',()=>{
  const x=fixture();
  x.evidence.familyScores=x.evidence.familyScores.map(v=>({
    ...v,candidateScores:Object.fromEntries(DIMENSIONS.map(dim=>[dim,1])),
  }));
  const z=verify(x);
  assert.equal(z.hasSyntheticRegressions,false);
  assert.equal(z.ownerReviewGranted,false);
  assert.equal(z.independentHumanQualityProven,false);
  assert.equal(z.heldoutPassed,false);
  assert.equal(z.releaseApproved,false);
  assert.equal(z.productionEligible,false);
  assert.equal(z.externalCalls,0);
});
