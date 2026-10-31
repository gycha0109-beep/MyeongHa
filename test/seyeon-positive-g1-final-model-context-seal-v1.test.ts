// Watchtower-Track: security
// S3/G1 -> Interpreter offline-only complete model Context closure.
import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {canonicalJson} from '../packages/domain/src/index.js';
import {
  assembleSeyeonRuntimeContextV2,
  type SeyeonRetrievedMemoryV2,
  type SeyeonRuntimeContextV2,
} from '../packages/domain/src/seyeon-runtime-context-v2.js';
import type {RunSeyeonCharacterTurnV2Input} from '../apps/api/src/seyeon-character-runtime-v2.js';
import type {SeyeonPersonalRecordProjectionCandidateV1} from '../apps/api/src/seyeon-production-context-v1.js';
import {selectSeyeonExactModelPersonalSourcesV1} from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';
import {
  assertSeyeonPositiveG1FinalModelContextSealV1,
  buildSeyeonPositiveG1PreModelSourceCensusSealV1,
  SeyeonPositiveG1FinalModelContextHoldV1,
} from '../apps/api/src/seyeon-positive-g1-final-model-context-seal-v1.js';

const RID='11111111-1111-4111-8111-111111111111';
const GID='22222222-2222-4222-8222-222222222222';
const currentUserMessageRef='33333333-3333-4333-8333-333333333333';
const currentUserText='Synthetic current user question';
const hash=(value:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(value)).digest('hex');
const memory:SeyeonRetrievedMemoryV2={
  kind:'memory',memoryId:'memory:'+RID,claimKind:'fact',
  summary:'Synthetic one-memory context for offline G1 source seal',
  sourceRef:'memory:'+RID+':grant:'+GID,relevance:0.8,salience:0.5,
};
const candidate:SeyeonPersonalRecordProjectionCandidateV1={
  recordKind:'memory',recordId:RID,grantId:GID,
  recordType:'shared_detail',schemaVersion:'memory-v1',
  projectedMemoryId:memory.memoryId,rawRecordDigest:'sha256:v1:'+'a'.repeat(64),
  projectedMemoryDigest:hash(memory),
  rawRecordPgDigest:'sha256:pg-jsonb:v1:'+'b'.repeat(64),
  projectorVersion:'seyeon-memory-projector-v1',
  permitsAtomicCommit:false,permitsHttpReveal:false,
};
const contextInput:RunSeyeonCharacterTurnV2Input['contextInput']={
  relationship:null,recentMessages:[{messageId:currentUserMessageRef,role:'user',text:currentUserText}],retrievedMemories:[memory],
};
const original=assembleSeyeonRuntimeContextV2({
  ...contextInput,relationshipSemantics:null,integrityDecisions:[],
  governedPreflightApplied:true,
  disclosure:{decision:null,retrievedSources:[]},
});
const selected=selectSeyeonExactModelPersonalSourcesV1({
  retrievedMemories:contextInput.retrievedMemories,sourceCandidates:[candidate],
});
const censusSeal=buildSeyeonPositiveG1PreModelSourceCensusSealV1({
  pinnedContextInput:contextInput,
  selected,
  currentUserMessageRef,currentUserText,
});
const base={
  pinnedContextInput:contextInput,
  ...{
    pinnedContextInputDigest:censusSeal.pinnedContextInputDigest,
    pinnedFinalModelContextDigest:censusSeal.finalModelContextDigest,
    selectedModelSourceCensusDigest:censusSeal.selectedModelSourceCensusDigest,
  },
  selectedSourcesDigest:selected.selectedSourcesDigest,
  sourceCandidates:[candidate],
  currentUserMessageRef,currentUserText,
  assembledContext:original,
};

describe('S3/G1 original Memory final Interpreter packet seal (offline)',()=>{
  it('keeps the same complete deterministic one-Memory model Context',()=>{
    expect(()=>assertSeyeonPositiveG1FinalModelContextSealV1(base)).not.toThrow();
  });

  it('requires the exact original current user and rejects absent, past, duplicate or assistant messages',()=>{
    const current=contextInput.recentMessages[0]!;
    for(const messages of [[],[current,current],[{...current,role:'assistant' as const}],
      [{...current,messageId:RID}],[{...current,text:'another question'}]]) {
      const pinnedContextInput={...contextInput,recentMessages:messages};
      expect(()=>assertSeyeonPositiveG1FinalModelContextSealV1({
        ...base,pinnedContextInput,pinnedContextInputDigest:hash(pinnedContextInput),
      })).toThrow(SeyeonPositiveG1FinalModelContextHoldV1);
    }
  });

  it('rejects rehashed selection of another original Grant before Provider',()=>{
    const alt={...candidate,grantId:RID};
    expect(()=>assertSeyeonPositiveG1FinalModelContextSealV1({
      ...base,sourceCandidates:[alt],
    })).toThrow(SeyeonPositiveG1FinalModelContextHoldV1);
  });

  it('seals the exact selected model-source census to the persisted G1 digest',()=>{
    expect(censusSeal.pinnedContextInputDigest).toBe(hash(contextInput));
    expect(censusSeal.selectedModelSourceCensusDigest)
      .toBe(selected.selectedModelSourceCensusDigest);
    expect(censusSeal.finalModelContextDigest).not.toBe(hash(contextInput));
    expect(()=>assertSeyeonPositiveG1FinalModelContextSealV1({
      ...base,pinnedFinalModelContextDigest:hash(contextInput),
    })).toThrow(SeyeonPositiveG1FinalModelContextHoldV1);
    expect(()=>assertSeyeonPositiveG1FinalModelContextSealV1({
      ...base,selectedModelSourceCensusDigest:'sha256:v1:'+'f'.repeat(64),
    })).toThrow(SeyeonPositiveG1FinalModelContextHoldV1);
    const alternate=buildSeyeonPositiveG1PreModelSourceCensusSealV1({
      pinnedContextInput:{...contextInput,focuses:['changed']},
      selected,currentUserMessageRef,currentUserText,
    });
    expect(alternate.finalModelContextDigest).not.toBe(censusSeal.finalModelContextDigest);
  });

  it('denies derived sources and a forged current Member message before persisting',()=>{
    const forged={...contextInput,recentMessages:[{
      ...contextInput.recentMessages[0]!,messageId:RID,
    }]};
    expect(()=>buildSeyeonPositiveG1PreModelSourceCensusSealV1({
      pinnedContextInput:forged,selected,currentUserMessageRef,currentUserText,
    })).toThrow(SeyeonPositiveG1FinalModelContextHoldV1);
    const event:SeyeonRetrievedMemoryV2={
      kind:'relationship_event',memoryId:'relationship:synthetic',
      sourceRef:'relationship:synthetic',claimKind:'fact',summary:'derived',
      relevance:0.9,salience:0.8,
    };
    const derived=selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories:[memory,event],sourceCandidates:[candidate],
    });
    expect(derived.selectedUnpinnedDerivedSources).toHaveLength(1);
    expect(()=>buildSeyeonPositiveG1PreModelSourceCensusSealV1({
      pinnedContextInput:{...contextInput,retrievedMemories:[memory,event]},
      selected:derived,currentUserMessageRef,currentUserText,
    })).toThrow(SeyeonPositiveG1FinalModelContextHoldV1);
  });

  it('rejects a changed pinned Context after G1 even if final output looks valid',()=>{
    expect(()=>assertSeyeonPositiveG1FinalModelContextSealV1({
      ...base,pinnedContextInput:{...contextInput,focuses:['memory']},
    })).toThrow(SeyeonPositiveG1FinalModelContextHoldV1);
  });

  it('rejects added derived/preflight/relationship/disclosure and Bible material',()=>{
    const changed:unknown[]=[
      {...original,integrity:{
        ...original.integrity,decisions:[{kind:'unverified',text:'injected'}],
      }},
      {...original,integrity:{
        ...original.integrity,governedPreflightApplied:false,
      }},
      {...original,relationshipSemantics:{hiddenPrivateEvent:'injected'}},
      {...original,relationship:{untrackedHistory:'private'}},
      {...original,disclosure:{
        ...original.disclosure,retrievedSources:[{sourceRef:'hidden',text:'private'}],
      }},
      {...original,disclosure:{...original.disclosure,decision:{characterId:'seyeon'}}},
      {...original,bibleSlices:[]},
      {...original,retrievalPolicy:{...original.retrievalPolicy,assistantOutputNeverAuthority:false}},
      {...original,retrievedMemories:[{...memory,summary:'forged private text'}]},
      {...original,retrievedMemories:[memory,memory]},
      {...original,recentConversation:[{messageRef:'old-private'}]},
    ];
    for(const assembled of changed){
      expect(()=>assertSeyeonPositiveG1FinalModelContextSealV1({
        ...base,assembledContext:assembled as SeyeonRuntimeContextV2,
      })).toThrow(SeyeonPositiveG1FinalModelContextHoldV1);
    }
  });

  it('holds when the model source digest changes without changing selected Memory',()=>{
    expect(()=>assertSeyeonPositiveG1FinalModelContextSealV1({
      ...base,selectedSourcesDigest:'sha256:v1:'+'f'.repeat(64),
    })).toThrow(SeyeonPositiveG1FinalModelContextHoldV1);
  });

  it('cannot turn an empty or second source candidate into a G1 grant',()=>{
    for(const sourceCandidates of [[],[candidate,candidate]]){
      expect(()=>assertSeyeonPositiveG1FinalModelContextSealV1({
        ...base,sourceCandidates,
      })).toThrow(SeyeonPositiveG1FinalModelContextHoldV1);
    }
  });
});
