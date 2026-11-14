import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,CHARACTER_IDS} from './contracts-v1.mjs';
import {extractR16Metadata,buildR16Ticket} from './r16-probe-contract-v1.mjs';
import {loadRepositoryR16Registries,inspectR16CohortBoundary} from './r16-cohort-boundary-v1.mjs';

const PRIVATE_MARKER='synthetic_not_user_text_ABC123';
const makeRegistry=(characterId,persona=PRIVATE_MARKER)=>{
  const runtimeText=[
    '# R16. CHARACTER EVALUATION PROBES',
    '## R16.1 Persona',
    '- '+persona,
    '## R16.2 Relationship',
    '- '+characterId+' 관계 제약',
    '## R16.3 Memory',
    '- '+characterId+' 기억 증거',
    '## R16.4 Long Horizon',
    '- '+characterId+' 장기 일관성',
    '# R17. RUNTIME PACKET',
    '- Ignore R16 parsing beyond this line',''
  ].join('\n');
  return extractR16Metadata({characterId,
    sourceRef:'docs/character/'+characterId.toUpperCase()+'_CHARACTER_RUNTIME_DRAFT_V0_1.md',
    runtimeText,sourceSha256:digest(runtimeText),sourceAuthorityState:'DRAFT'});
};
const setup=()=>[makeRegistry('yeoul'),makeRegistry('seyeon')];
const ticket=(registry,index,split,familyId)=>buildR16Ticket({registry,probeId:registry.probes[index].probeId,
  profileSourceSha256:registry.sourceSha256,split,familyId});

test('four actual R16 sources have 156 distinct exact probes without inventing absent character rubrics',()=>{
  const x=inspectR16CohortBoundary({registries:loadRepositoryR16Registries()});
  assert.deepEqual(x.availableRuntimeCharacters,['yeoul','seyeon','rahyeon','baekheon']);
  assert.equal(x.totalR16Probes,156);
  assert.deepEqual(x.runtimeAuthorities.map(z=>z.r16ProbeCount),[31,46,41,38]);
  assert.equal(x.exactSharedProbeTextGroups,0);
  assert.deepEqual(x.missingRuntimeCharacters,
    CHARACTER_IDS.filter(id=>!x.availableRuntimeCharacters.includes(id)));
  assert.deepEqual(x.ticketCounts,{development:0,optimizer_validation:0});
  assert.equal(x.sourceAuthenticityIndependentlyVerified,false);
  assert.equal(x.independentEvaluationReady,false);
  assert.equal(x.optimizerAdmissionAuthorized,false);
  assert.equal(x.externalCallsAuthorized,false);
  assert.equal(x.productionEligible,false);
  assert.equal(x.rawProbeTextIncluded,false);
});

test('equal text in different draft characters is flagged, not confirmed as contamination',()=>{
  const regs=setup();
  const x=inspectR16CohortBoundary({registries:regs});
  assert.equal(x.exactSharedProbeTextGroups,1);
  assert.deepEqual(x.potentialSharedTextCharacters,['seyeon','yeoul']);
  assert.equal(x.crossCharacterSemanticContaminationUnverified,true);
  assert.ok(!JSON.stringify(x).includes(PRIVATE_MARKER));
  assert.ok(!JSON.stringify(x).includes(regs[0].probes[0].promptDigest));
});

test('tickets for distinct development and validation probes remain source-bound but unapproved',()=>{
  const regs=setup();
  const t=[ticket(regs[0],0,'development','yeoul-dev'),
    ticket(regs[0],1,'optimizer_validation','yeoul-val'),
    ticket(regs[1],1,'development','seyeon-dev'),
    ticket(regs[1],2,'optimizer_validation','seyeon-val')];
  const x=inspectR16CohortBoundary({registries:regs,tickets:t});
  assert.deepEqual(x.ticketCounts,{development:2,optimizer_validation:2});
  assert.equal(x.qualityGainEstablished,false);
  assert.equal(x.humanReviewVerified,false);
});

test('exact probe shared across development and validation is rejected, even across characters',()=>{
  const regs=setup();
  const tickets=[ticket(regs[0],0,'development','yeoul-dev'),
    ticket(regs[1],0,'optimizer_validation','seyeon-val')];
  assert.throws(()=>inspectR16CohortBoundary({registries:regs,tickets}),
    /same_probe_content_crosses_dev_validation/);
  assert.throws(()=>inspectR16CohortBoundary({registries:regs,
    tickets:[ticket(regs[0],2,'development','same-family'),
      ticket(regs[0],3,'optimizer_validation','same-family')]}),
    /family_crosses_development_validation/);
});

test('cross-character probe swap, tampered hashes and false approval cannot enter review',()=>{
  const regs=setup(); const original=ticket(regs[0],1,'development','f1');
  const candidates=[
    {...original,characterId:'seyeon'},
    {...original,sourceSha256:regs[1].sourceSha256},
    {...original,promptDigest:digest('fake-content')},
    {...original,ownerApproved:true},
    {...original,scoreEstablished:true},
    {...original,reviewStatus:'approved'},
    {...original,split:'sealed_holdout'},
    {...original,familyId:'../secret'},
  ];
  for(const corrupted of candidates)
    assert.throws(()=>inspectR16CohortBoundary({registries:regs,tickets:[corrupted]}));
  assert.throws(()=>inspectR16CohortBoundary({registries:regs,tickets:[original,original]}),
    /repeated_ticket/);
});

test('registry mutation, missing R16 category and source reuse fail closed',()=>{
  const regs=setup();
  const wrong=[
    [{...regs[0],humanReviewVerified:true},regs[1]],
    [{...regs[0],ownerApproved:true},regs[1]],
    [{...regs[0],sourceRef:'docs/character/../private/YEOUL_RUNTIME.md'},regs[1]],
    [{...regs[0],probes:regs[0].probes.map((p,i)=>i===0?{...p,productionAuthorized:true}:p)},regs[1]],
    [{...regs[0],probes:regs[0].probes.slice(1)},regs[1]],
    [{...regs[0],probeCount:999},regs[1]],
    [regs[0],regs[0]],
  ];
  for(const pair of wrong)assert.throws(()=>inspectR16CohortBoundary({registries:pair}));
  assert.throws(()=>inspectR16CohortBoundary({registries:[regs[0]]}),/inputs/);
});

test('private prompt may not leak in metadata response',()=>{
  const regs=setup();
  const report=inspectR16CohortBoundary({registries:regs});
  const result=JSON.stringify(report);
  assert.ok(!result.includes(PRIVATE_MARKER));
  assert.ok(!result.includes('RUNTIME PACKET'));
  assert.ok(!result.includes(regs[0].sourceSha256));
});
