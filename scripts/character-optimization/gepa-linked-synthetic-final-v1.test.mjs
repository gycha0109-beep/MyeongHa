import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createOptimizationRun, digest, validateCandidate } from './contracts-v1.mjs';
import { buildGepaResearchPayload } from './evaluation-v1.mjs';
import { makeSelectedSyntheticFinalCandidate as make, stageSyntheticFinalCandidate as stage }
  from './gepa-linked-synthetic-final-v1.mjs';

function fixture() {
  const context=digest('synthetic offline GEPA context; no real source');
  const seed='Respond clearly in natural Korean.';
  const characters=['yeoul','seyeon'];
  const profiles=characters.map(characterId=>({
    characterId,
    source:{canonRef:'synthetic/no-canon-read',runtimeRef:'synthetic/no-runtime-read',
      contentBundleSha256:context,authorityVersion:'DRAFT_ONLY',authorityState:'DRAFT'},
    student:{provider:'openrouter',modelId:'synthetic/no-external-model',
      parametersSha256:context,routingPolicySha256:context},
    evalSuite:{developmentRef:'synthetic/dev',validationRef:'synthetic/val',
      holdoutRef:'synthetic/not-mounted',rubricVersion:'synthetic-not-real-r16',
      splitManifestSha256:context},
    mutableSlots:['shared_expression'],reviewRequired:true,
    privacyPolicyRef:'synthetic/never-user-data',
  }));
  const manifest=createOptimizationRun({
    track:'shared',profiles,immutableSourcesSha256:context,
    baselinePromptSha256:digest(seed),
    optimizerVersion:'ce5b0d6e3d6af6c6dbec6de2c54536bbb961d309',
    evaluatorVersion:'synthetic-contract-not-approval',
  });
  const envelope=buildGepaResearchPayload({
    manifest,
    candidate:validateCandidate({shared_expression:seed},{
      slot:'shared_expression',pinnedContextSha256:context,
    }),
    corpus:characters.flatMap(characterId=>['dev','val'].map(kind=>({
      characterId,
      id:characterId+'-synthetic-'+kind,
      familyId:characterId+'-synthetic-'+kind+'-family',
      split:kind==='dev'?'development':'optimizer_validation',
      contentSha256:digest(characterId+'-'+kind+'-content-synthetic'),
      sourceType:'synthetic',
    }))),
  });
  const chosen='Respond clearly in natural Korean. Use concise answers.';
  const proposal=validateCandidate({shared_expression:chosen},{
    slot:'shared_expression',pinnedContextSha256:context,
  });
  const packet={
    schemaVersion:'character-gepa-frozen-result-v1',optimizer:'gepa',
    runManifestSha256:manifest.manifestSha256,
    sourceSeedSha256:envelope.candidateSha256,
    proposal,
    researchEvidence:{bestScoreSyntheticOnly:0.6,totalEvals:4,
      sourceAuthenticated:false,independentQualityGainEstablished:false,
      ownerReviewGranted:false,heldoutPassed:false,releaseApproved:false},
    externalCallsAuthorized:false,externalCalls:0,productionEligible:false,
  };
  return{manifest,envelope,packet};
}

test('chosen pinned GEPA candidate is linked only by hash to Yeoul isolated synthetic final',()=>{
  const a=fixture(),x=make(a);
  assert.equal(x.characterId,'yeoul');
  assert.equal(x.candidateSha256,a.packet.proposal.textSha256);
  assert.equal(x.runManifestSha256,a.manifest.manifestSha256);
  assert.deepEqual(x.optimizationFamilyIds,[
    'synthetic-yeoul-synthetic-dev-family',
    'synthetic-yeoul-synthetic-val-family',
  ]);
  assert.equal(x.productionEligible,false);
  assert.equal(x.externalCallsAuthorized,false);
  assert.equal(JSON.stringify(x).includes('Respond clearly'),false);
  assert.equal(JSON.stringify(x).includes('seyeon-synthetic-dev'),false);
});

test('foreign candidate, private text, changed family or forged approval is denied',()=>{
  const a=fixture();
  for(const modified of [
    {...a,packet:{...a.packet,sourceSeedSha256:digest('wrong')}},
    {...a,packet:{...a.packet,externalCalls:1}},
    {...a,manifest:{...a.manifest,evaluatorVersion:'real-model'}},
    {...a,envelope:{...a.envelope,test_set:['private']}},
    {...a,envelope:{...a.envelope,dataset:a.envelope.dataset.slice(1)}},
    {...a,envelope:{...a.envelope,dataset:a.envelope.dataset.map((v,i)=>i? v:{...v,familyId:'synthetic-holdout-leak'})}},
    {...a,envelope:{...a.envelope,dataset:a.envelope.dataset.map((v,i)=>i? v:{...v,privateText:'secret-user-message'})}},
  ])assert.throws(()=>make(modified));
});

test('staging writes only 0600 JSON outside repository and rejects duplicate outputs',()=>{
  const base=mkdtempSync(join(tmpdir(),'myeongha-linked-selected-'));
  try{
    const proof=join(base,'proof'),frozen=join(base,'frozen');
    mkdirSync(proof,{mode:0o700});mkdirSync(frozen,{mode:0o700});
    const a=fixture();
    for(const [name,value] of [['manifest.json',a.manifest],
      ['envelope.json',a.envelope],['frozen-result.json',a.packet]])
      writeFileSync(join(proof,name),JSON.stringify(value),{mode:0o600});
    const result=stage({proofDir:proof,frozenDir:frozen});
    const output=JSON.parse(readFileSync(join(frozen,'candidate.json'),'utf8'));
    assert.equal(output.candidateSha256,a.packet.proposal.textSha256);
    assert.equal(result.approved,false);
    assert.equal(result.externalCalls,0);
    assert.throws(()=>stage({proofDir:proof,frozenDir:frozen}));
  }finally{rmSync(base,{recursive:true,force:true})}
});
