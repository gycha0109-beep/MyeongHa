import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {digest} from './contracts-v1.mjs';
import {extractR16Metadata,buildR16Ticket} from './r16-probe-contract-v1.mjs';

const sourceRef='docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md';
const text=`# R16. CHARACTER EVALUATION PROBES
## R16.1 Persona Probes
- 여울의 원칙을 지키는가
## R16.2 Relationship Probes
- 관계 권한을 존중하는가
## R16.3 Memory Probes
- 허위 기억을 만들지 않는가
## R16.4 Long-Horizon / Drift Probes
- 장기 반복을 피하는가
# R17. RUNTIME PACKET EXAMPLE
- 이 항목은 R16 아님
`;
const options={characterId:'yeoul',sourceRef,sourceSha256:digest(text),
  runtimeText:text,sourceAuthorityState:'DRAFT'};

test('R16 metadata binds source, excludes raw questions and does not approve',()=>{
  const x=extractR16Metadata(options);
  assert.equal(x.probeCount,4);
  assert.deepEqual(x.categories,['R16.1','R16.2','R16.3','R16.4']);
  assert.equal(x.humanReviewVerified,false);
  assert.equal(JSON.stringify(x).includes('허위 기억'),false);
  const ticket=buildR16Ticket({registry:x,probeId:x.probes[2].probeId,
    split:'development',familyId:'local-f2',profileSourceSha256:x.sourceSha256});
  assert.equal(ticket.externalCallsAuthorized,false);
  assert.equal(ticket.promptContentExported,false);
});

test('R16 rejects tampered, swapped, unapproved and sealed optimizer inputs',()=>{
  const x=extractR16Metadata(options);
  assert.throws(()=>extractR16Metadata({...options,characterId:'seyeon'}),/source_binding/);
  assert.throws(()=>extractR16Metadata({...options,runtimeText:text+'changed'}),/source_binding/);
  assert.throws(()=>extractR16Metadata({...options,sourceAuthorityState:'production'}),/source_binding/);
  assert.throws(()=>buildR16Ticket({registry:x,probeId:x.probes[0].probeId,
    split:'sealed_holdout',familyId:'f',profileSourceSha256:x.sourceSha256}),/split_or_family/);
  assert.throws(()=>buildR16Ticket({registry:x,probeId:'seyeon:R16.1:wrong',
    split:'development',familyId:'f',profileSourceSha256:x.sourceSha256}),/cross_character/);
});

test('R16 numbered character-specific probes are retained without creating new examples',()=>{
  const numbered=text.replace('- 여울의 원칙을 지키는가','1. 여울의 원칙을 지키는가')
    .replace('- 관계 권한을 존중하는가','2. 관계 권한을 존중하는가');
  const x=extractR16Metadata({...options,runtimeText:numbered,
    sourceSha256:digest(numbered)});
  assert.equal(x.probeCount,4);
});

test('existing character Runtime R16 source is parsed without inventing missing rubrics',()=>{
  const sources=[
    ['yeoul','YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md'],
    ['seyeon','SEYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md'],
    ['rahyeon','RAHYEON_CHARACTER_RUNTIME_DRAFT_V0_2.md'],
    ['baekheon','BAEKHEON_CHARACTER_RUNTIME_DRAFT_V0_1.md']
  ];
  const inventories=sources.map(([characterId,name])=>{
    const runtimeText=readFileSync(new URL('../../docs/character/'+name,import.meta.url),'utf8');
    const registry=extractR16Metadata({characterId,sourceRef:'docs/character/'+name,
      sourceSha256:digest(runtimeText),runtimeText,sourceAuthorityState:'DRAFT'});
    assert.ok(registry.probeCount>=4);
    assert.equal(registry.humanReviewVerified,false);
    return registry;
  });
  assert.equal(new Set(inventories.map(x=>x.characterId)).size,4);
  assert.notEqual(inventories[0].sourceSha256,inventories[1].sourceSha256);
  assert.equal(inventories.every(x=>x.promptContentExported===false),true);
});
