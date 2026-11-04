// Watchtower-Track: security
// Post-Preflight G1 historical source closure; no Provider admission.
import {createHash} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {runSeyeonCharacterTurnV2,type SeyeonStructuredProviderPortV2} from '../apps/api/src/seyeon-character-runtime-v2.js';
import {createIntegrityClassifier,createDisclosureClassifier} from '../apps/api/src/seyeon-production-governance-v1.js';
import {canonicalJson} from '../packages/domain/src/index.js';
import {assembleSeyeonRuntimeContextV2} from '../packages/domain/src/seyeon-runtime-context-v2.js';
import {
  selectSeyeonExactModelPersonalSourcesV1,
} from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';
import {
  buildSeyeonG1HistoricalFinalContextCandidateSealV1,
  buildSeyeonG1HistoricalModelWindowCensusV1,
} from '../apps/api/src/seyeon-g1-historical-model-window-census-v1.js';
import {
  assertSeyeonG1HistoricalPostPreflightContextCandidateV1,
  SeyeonG1HistoricalPostPreflightContextHoldV1,
} from '../apps/api/src/seyeon-g1-historical-final-context-proof-v1.js';

const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const hash=(v:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(v)).digest('hex');
const wire=(v:string)=>'sha256:wire-utf8:v1:'+
  createHash('sha256').update(v,'utf8').digest('hex');
const recent=[
  {messageId:id(8),role:'user' as const,text:'Original synthetic User'},
  {messageId:id(9),role:'assistant' as const,text:'Original synthetic Se-yeon'},
  {messageId:id(5),role:'user' as const,text:'Current synthetic User'},
];
const memory={
  memoryId:'memory:'+id(6),kind:'memory' as const,
  claimKind:'fact' as const,summary:'approved private summary',
  sourceRef:'memory:'+id(6)+':grant:'+id(7),
  relevance:0.6,salience:0.7,
};
const candidate={
  recordKind:'memory' as const,recordId:id(6),grantId:id(7),
  recordType:'conversation_recall',schemaVersion:'v1',
  projectedMemoryId:memory.memoryId,
  rawRecordDigest:hash({raw:'synthetic source'}),
  projectedMemoryDigest:hash(memory),
  rawRecordPgDigest:'sha256:pg-jsonb:v1:'+'a'.repeat(64),
  projectorVersion:'seyeon-conversation-recall-projector-v1',
  permitsAtomicCommit:false as const,permitsHttpReveal:false as const,
};
const c={
  relationship:null,
  recentMessages:recent,
  retrievedMemories:[memory],
};
const census=buildSeyeonG1HistoricalModelWindowCensusV1({
  currentUserMessageId:id(5),currentUserText:recent[2]!.text,
  maxRecentMessages:12,
  exactModelRecentMessages:recent,
  dbVerifiedWindow:recent.map((m,index)=>({
    messageId:m.messageId,sequenceNo:index+1,
    senderType:m.role==='assistant'?'character':'user',
    characterId:m.role==='assistant'?'seyeon':null,
    text:m.text,createdAt:'2026-11-05T00:00:00Z',
  })),
});
const selection=selectSeyeonExactModelPersonalSourcesV1({
  retrievedMemories:c.retrievedMemories,recentMessages:c.recentMessages,
  currentUserMessageId:id(5),sourceCandidates:[candidate],
});
const seal=buildSeyeonG1HistoricalFinalContextCandidateSealV1({
  contextInput:c,currentUserMessageId:id(5),currentUserText:recent[2]!.text,
  census,originalMemory:{recordId:id(6),grantId:id(7)},
  selectedSourcesDigest:selection.selectedSourcesDigest,
  selectedModelSourceCensusDigest:selection.selectedModelSourceCensusDigest,
});
const proof={
  schemaVersion:'seyeon-g1-historical-source-candidate-v4',
  authorizesModel:false,permitsAtomicCommit:false,permitsHttpReveal:false,
  characterId:'seyeon',currentUserMessageId:id(5),
  currentUserTextDigest:wire(recent[2]!.text),
  historicalSourceCount:census.historicalSourceCount,
  historicalSources:census.historicalSources,
  recordKind:'memory',recordId:id(6),originalGrantId:id(7),
  recordType:candidate.recordType,recordSchemaVersion:candidate.schemaVersion,
  projectorVersion:candidate.projectorVersion,
  originalPgJsonbDigest:candidate.rawRecordPgDigest,
  selectedSourcesDigest:selection.selectedSourcesDigest,
  projectedMemoryDigest:candidate.projectedMemoryDigest,
  preModelContextDigest:seal.preModelContextDigest,
  expectedFinalModelContextDigest:seal.expectedFinalModelContextDigest,
};
const assembled=assembleSeyeonRuntimeContextV2({
  ...c,relationship:null,relationshipSemantics:null,
  integrityDecisions:[],governedPreflightApplied:true,
  disclosure:{decision:null,retrievedSources:[]},
});
const base={
  pinnedContextInput:c,currentUserMessageId:id(5),
  currentUserText:recent[2]!.text,sourceCandidates:[candidate],
  census,persistedHistoricalCandidateProof:proof,assembledContext:assembled,
};
describe('S0 G1 historical post-Preflight Interpreter context closure (HOLD)',()=>{
  it('matches every selected historical original, Memory and entire final packet without granting Provider permission',()=>{
    expect(()=>assertSeyeonG1HistoricalPostPreflightContextCandidateV1(base)).not.toThrow();
    expect(proof.authorizesModel).toBe(false);
    expect(proof.permitsAtomicCommit).toBe(false);
    expect(proof.permitsHttpReveal).toBe(false);
  });
  it.each([
    ['changed historical Assistant',{...assembled,recentConversation:[
      assembled.recentConversation[0]!,
      {...assembled.recentConversation[1]!,text:'substituted'},
      assembled.recentConversation[2]!,
    ]}],
    ['changed private Memory',{...assembled,retrievedMemories:[
      {...assembled.retrievedMemories[0]!,summary:'unapproved memory text'},
    ]}],
    ['injected policy slices',{...assembled,bibleSlices:[]}],
    ['changed integrity verdict',{...assembled,integrity:{
      ...assembled.integrity,governedPreflightApplied:false as const,
    }}],
  ] as const)('blocks %s from the final Interpreter input',(_name,mutated)=>{
    expect(()=>assertSeyeonG1HistoricalPostPreflightContextCandidateV1({
      ...base,assembledContext:mutated,
    })).toThrow(SeyeonG1HistoricalPostPreflightContextHoldV1);
  });
  it('blocks a substituted source census and revoked/replaced Grant identity',()=>{
    expect(()=>assertSeyeonG1HistoricalPostPreflightContextCandidateV1({
      ...base,persistedHistoricalCandidateProof:{...proof,originalGrantId:id(10)},
    })).toThrow(SeyeonG1HistoricalPostPreflightContextHoldV1);
    expect(()=>assertSeyeonG1HistoricalPostPreflightContextCandidateV1({
      ...base,persistedHistoricalCandidateProof:{
        ...proof,historicalSources:[census.historicalSources[0]],
      },
    })).toThrow(SeyeonG1HistoricalPostPreflightContextHoldV1);
    expect(()=>assertSeyeonG1HistoricalPostPreflightContextCandidateV1({
      ...base,persistedHistoricalCandidateProof:{...proof,authorizesModel:true},
    })).toThrow(SeyeonG1HistoricalPostPreflightContextHoldV1);
  });
});


describe('G1 post-Preflight runtime verification before historical Provider (offline)',()=>{
  function preflightHarness(injectClaim=false){
    const called:string[]=[];
    const generate=vi.fn(async(request:Readonly<{purpose:string}>):Promise<unknown>=>{
      called.push(request.purpose);
      if(request.purpose==='integrity_classification')return {
        claims:injectClaim?[{
          claimId:'synthetic-claim',kind:'SHARED_EVENT_CLAIM',
          statement:'synthetic unverified assertion',
        }]:[],
      };
      if(request.purpose==='disclosure_classification')return {
        topicKey:null,questionContext:'casual_curiosity',
      };
      throw Error('HISTORICAL_PROVIDER_MUST_NOT_RUN');
    });
    const provider:SeyeonStructuredProviderPortV2={
      providerKey:'offline-synthetic',modelKey:'no-external-ai',
      generate,
    };
    const checked={reached:false,matched:false,preflightClosed:false};
    const governance={
      relationship:{gate:'PUBLIC' as const,trustBand:'low' as const,
        relevantSharedHistoryRefs:[]},
      integrity:{
        classifier:createIntegrityClassifier(provider),
        authorityResolver:{resolve:async()=>({
          state:'MISSING' as const,authorityRefs:[],
          provenanceRefs:['synthetic:unverified'],
        })},
      },
      disclosure:{
        classifier:createDisclosureClassifier(provider),
        sourceDescriptor:{
          readDescriptor(){throw Error('PRIVATE_SOURCE_DESCRIPTOR_FORBIDDEN');},
        },
        factAuthorityResolver:{
          resolve(){throw Error('PRIVATE_SOURCE_AUTHORITY_FORBIDDEN');},
        },
        retriever:{retrieve(){throw Error('PRIVATE_SOURCE_RETRIEVAL_FORBIDDEN');}},
      },
    };
    const run=runSeyeonCharacterTurnV2({
      userMessageRef:id(5),userText:recent[2]!.text,
      contextInput:c,governance,
      assertGovernedPreflightSourceClosure:(checkedPreflight)=>{
        checked.preflightClosed=true;
        if(checkedPreflight.retrievedPrivateSources.length!==0)
          throw Error('UNPINNED_PRIVATE_SOURCE');
      },
      assertBeforeModelContext:(actual)=>{
        checked.reached=true;
        assertSeyeonG1HistoricalPostPreflightContextCandidateV1({
          ...base,assembledContext:actual,
        });
        checked.matched=true;
        // The real runtime has passed the exact final-context comparison,
        // but historical G1/G2 permission is not granted. Stop NOW.
        throw new SeyeonG1HistoricalPostPreflightContextHoldV1();
      },
      interpreterProvider:provider,rendererProvider:provider,
      semanticReviewerProvider:provider,
    });
    return {run,called,generate,checked};
  }
  it('compares the actual governed Preflight Interpreter input then HOLDs before any model dispatch',async()=>{
    const h=preflightHarness();
    await expect(h.run).rejects.toThrow(SeyeonG1HistoricalPostPreflightContextHoldV1);
    expect(h.checked.preflightClosed).toBe(true);
    expect(h.checked.reached).toBe(true);
    expect(h.checked.matched).toBe(true);
    expect(h.called).toEqual(['integrity_classification','disclosure_classification']);
    expect(h.generate).toHaveBeenCalledTimes(2);
  });
  it('rejects new Preflight integrity-derived authority that was not in the original G1 candidate',async()=>{
    const h=preflightHarness(true);
    await expect(h.run).rejects.toThrow(SeyeonG1HistoricalPostPreflightContextHoldV1);
    expect(h.checked.preflightClosed).toBe(true);
    expect(h.checked.reached).toBe(true);
    expect(h.checked.matched).toBe(false);
    expect(h.called).toEqual(['integrity_classification','disclosure_classification']);
  });
});
