// Watchtower-Track: security
// W76: real governed Preflight -> exact G1 context -> durable S0 seal -> HOLD.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {canonicalJson} from '../packages/domain/src/index.js';
import {
  runSeyeonCharacterTurnV2,
  type SeyeonStructuredProviderPortV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import type {SeyeonG1HistoricalSourceAdmissionRequestV1,SeyeonG1HistoricalSourceAdmissionReceiptV1}
  from '../apps/api/src/postgres-seyeon-g1-historical-source-admission-port-v1.js';
import {createIntegrityClassifier,createDisclosureClassifier}
  from '../apps/api/src/seyeon-production-governance-v1.js';
import {
  selectSeyeonExactModelPersonalSourcesV1,
} from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';
import {
  buildSeyeonG1HistoricalFinalContextCandidateSealV1,
  buildSeyeonG1HistoricalModelWindowCensusV1,
} from '../apps/api/src/seyeon-g1-historical-model-window-census-v1.js';
import {
  createSeyeonG1HistoricalPostPreflightSealHoldV1,
} from '../apps/api/src/seyeon-g1-historical-after-preflight-seal-hold-v1.js';
import {
  SeyeonG1HistoricalPostPreflightContextHoldV1,
} from '../apps/api/src/seyeon-g1-historical-final-context-proof-v1.js';

const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const hash=(v:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(v)).digest('hex');
const wire=(v:string)=>'sha256:wire-utf8:v1:'+
  createHash('sha256').update(v,'utf8').digest('hex');
const recent=[
  {messageId:id(8),role:'user' as const,text:'Historical user source'},
  {messageId:id(9),role:'assistant' as const,text:'Historical assistant source'},
  {messageId:id(5),role:'user' as const,text:'Current user source'},
];
const memory={
  memoryId:'memory:'+id(6),kind:'memory' as const,
  claimKind:'fact' as const,summary:'approved synthetic memory',
  sourceRef:'memory:'+id(6)+':grant:'+id(7),
  relevance:0.5,salience:0.7,
};
const candidate={
  recordKind:'memory' as const,recordId:id(6),grantId:id(7),
  recordType:'conversation_recall',schemaVersion:'v1',
  projectedMemoryId:memory.memoryId,
  rawRecordDigest:hash({memory:'synthetic'}),
  rawRecordPgDigest:'sha256:pg-jsonb:v1:'+'a'.repeat(64),
  projectedMemoryDigest:hash(memory),
  projectorVersion:'seyeon-conversation-recall-projector-v1',
  permitsAtomicCommit:false as const,permitsHttpReveal:false as const,
};
const contextInput={
  relationship:null,recentMessages:recent,retrievedMemories:[memory],
};
const census=buildSeyeonG1HistoricalModelWindowCensusV1({
  currentUserMessageId:id(5),currentUserText:recent[2]!.text,
  maxRecentMessages:12,exactModelRecentMessages:recent,
  dbVerifiedWindow:recent.map((m,index)=>({
    messageId:m.messageId,sequenceNo:index+1,
    senderType:m.role==='assistant'?'character':'user',
    characterId:m.role==='assistant'?'seyeon':null,
    text:m.text,createdAt:'2026-11-05T00:00:00Z',
  })),
});
const selection=selectSeyeonExactModelPersonalSourcesV1({
  retrievedMemories:contextInput.retrievedMemories,
  recentMessages:contextInput.recentMessages,
  currentUserMessageId:id(5),sourceCandidates:[candidate],
});
const candidateSeal=buildSeyeonG1HistoricalFinalContextCandidateSealV1({
  contextInput,currentUserMessageId:id(5),currentUserText:recent[2]!.text,
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
  historicalSourceCensusDigest:'sha256:pg-jsonb:v1:'+'c'.repeat(64),
  historicalAssistantOriginalSourcesDigest:'sha256:pg-jsonb:v1:'+'d'.repeat(64),
  recordKind:'memory',recordId:id(6),originalGrantId:id(7),
  recordType:candidate.recordType,recordSchemaVersion:candidate.schemaVersion,
  projectorVersion:candidate.projectorVersion,
  originalPgJsonbDigest:candidate.rawRecordPgDigest,
  selectedSourcesDigest:selection.selectedSourcesDigest,
  projectedMemoryDigest:candidate.projectedMemoryDigest,
  preModelContextDigest:candidateSeal.preModelContextDigest,
  expectedFinalModelContextDigest:candidateSeal.expectedFinalModelContextDigest,
};

function offline(injectClaim=false,failedSeal=false,originalProof:Readonly<Record<string,unknown>>=proof,failedAdmission=false){
  const called:string[]=[];
  const generate=vi.fn(async(req:{purpose:string}):Promise<unknown>=>{
    called.push(req.purpose);
    if(req.purpose==='integrity_classification')return {
      claims:injectClaim?[{
        claimId:'synthetic-claim',kind:'SHARED_EVENT_CLAIM',
        statement:'unapproved synthetic assertion',
      }]:[],
    };
    if(req.purpose==='disclosure_classification')return {
      topicKey:null,questionContext:'casual_curiosity',
    };
    throw Error('MODEL_PROVIDER_MUST_NOT_RUN');
  });
  const provider:SeyeonStructuredProviderPortV2={
    providerKey:'offline-g1',modelKey:'synthetic',generate,
  };
  const sealAfterContextVerification=vi.fn(async(input:{
    subjectId:string;threadId:string;turnId:string;attemptId:string;
    actualFinalModelContextDigest:string;preModelContextDigest:string;
    historicalSourceCount:number;
  })=>{
    if(failedSeal)throw Error('SIMULATED_ORIGINAL_GRANT_REVOKED');
    return {
      schemaVersion:'seyeon-g1-historical-final-context-seal-s0-v1' as const,
      subjectId:input.subjectId,threadId:input.threadId,turnId:input.turnId,
      attemptId:input.attemptId,
      candidatePgJsonbDigest:'sha256:pg-jsonb:v1:'+'b'.repeat(64),
      finalModelContextDigest:input.actualFinalModelContextDigest,
      preModelContextDigest:input.preModelContextDigest,
      historicalSourceCount:input.historicalSourceCount,
      originalsCurrentAtSeal:true as const,authorizesModel:false as const,
      permitsAtomicCommit:false as const,permitsHttpReveal:false as const,
    };
  });
  const admitExactSources=vi.fn(async (
    request:SeyeonG1HistoricalSourceAdmissionRequestV1,
  ):Promise<SeyeonG1HistoricalSourceAdmissionReceiptV1>=>{
    if(failedAdmission)throw Error('SIMULATED_REGISTRY_OR_ORIGINAL_GRANT_REJECTED');
    return {
      schemaVersion:'seyeon-g1-historical-source-admission-s0-v1',
      subjectId:request.subjectId,threadId:request.threadId,
      turnId:request.turnId,attemptId:request.attemptId,
      characterId:'seyeon',recordKind:'memory',
      recordId:request.originalRecordId,
      originalGrantId:request.originalGrantId,
      recordType:'conversation_recall',recordSchemaVersion:'v1',
      projectorVersion:'seyeon-conversation-recall-projector-v1',
      originalPgJsonbDigest:'sha256:pg-jsonb:v1:'+'a'.repeat(64),
      selectedSourcesDigest:selection.selectedSourcesDigest,
      projectedMemoryDigest:candidate.projectedMemoryDigest,
      historicalSourceCensusDigest:request.historicalSourceCensusDigest,
      historicalAssistantOriginalSourcesDigest:'sha256:pg-jsonb:v1:'+'d'.repeat(64),
      historicalSourceCount:request.historicalSourceCount,
      candidatePgJsonbDigest:request.candidatePgJsonbDigest,
      finalModelContextDigest:request.finalModelContextDigest,
      originalsCurrentAtAdmission:true,authorizesSourceSelection:true,
      permitsModelDispatch:false,permitsAtomicCommit:false,
      permitsHttpReveal:false,
    };
  });
  const callback=createSeyeonG1HistoricalPostPreflightSealHoldV1({
    subjectId:id(1),threadId:id(2),turnId:id(3),attemptId:id(4),
    pinnedContextInput:contextInput,currentUserMessageId:id(5),
    currentUserText:recent[2]!.text,
    sourceCandidates:[candidate],census,
    persistedHistoricalCandidateProof:originalProof,
    sealPort:{sealAfterContextVerification},
    sourceAdmissionPort:{admitExactSources},
  });
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
      sourceDescriptor:{readDescriptor(){throw Error('UNEXPECTED_PRIVATE_READ');}},
      factAuthorityResolver:{resolve(){throw Error('UNEXPECTED_PRIVATE_AUTHORITY');}},
      retriever:{retrieve(){throw Error('UNEXPECTED_PRIVATE_RETRIEVAL');}},
    },
  };
  const run=runSeyeonCharacterTurnV2({
    userMessageRef:id(5),userText:recent[2]!.text,
    contextInput,governance,
    assertGovernedPreflightSourceClosure:verified=>{
      if(verified.retrievedPrivateSources.length!==0)
        throw Error('UNPINNED_PRIVATE_SOURCE');
    },
    assertBeforeModelContext:callback,
    interpreterProvider:provider,rendererProvider:provider,
    semanticReviewerProvider:provider,
  });
  return {run,called,generate,sealAfterContextVerification,admitExactSources};
}

describe('W76 isolated G1 real Preflight -> database final seal -> unconditional HOLD',()=>{
  it('restricts direct SQL creation of the immutable seal to DB Owner',()=>{
    const source=readFileSync(new URL(
      '../scripts/operations/seyeon-security-s0/24-g1-historical-final-context-seal.sql',
      import.meta.url,
    ),'utf8');
    expect(source).toContain(
      "current_user is distinct from 'myeongha_seyeon_chat_runtime_owner'",
    );
    expect(source).toContain('seyeon_g1_historical_final_seal_requires_candidate');
    expect(source).toContain("'authorizesModel',false");
    expect(source).toContain("'permitsAtomicCommit',false");
    expect(source).toContain("'permitsHttpReveal',false");
    expect(source).not.toContain('grant execute on function seyeon_private.cmd_seal');
  });
  it('writes only the exact fully-verified model Context fingerprint then stops before Interpreter',async()=>{
    const h=offline();
    await expect(h.run).rejects.toThrow(SeyeonG1HistoricalPostPreflightContextHoldV1);
    expect(h.called).toEqual(['integrity_classification','disclosure_classification']);
    expect(h.sealAfterContextVerification).toHaveBeenCalledExactlyOnceWith({
      subjectId:id(1),threadId:id(2),turnId:id(3),attemptId:id(4),
      actualFinalModelContextDigest:proof.expectedFinalModelContextDigest,
      preModelContextDigest:proof.preModelContextDigest,
      historicalSourceCount:2,
    });
    expect(h.admitExactSources).toHaveBeenCalledExactlyOnceWith({
      subjectId:id(1),threadId:id(2),turnId:id(3),attemptId:id(4),
      finalModelContextDigest:proof.expectedFinalModelContextDigest,
      candidatePgJsonbDigest:'sha256:pg-jsonb:v1:'+'b'.repeat(64),
      originalRecordId:id(6),originalGrantId:id(7),
      historicalSourceCount:2,
      historicalSourceCensusDigest:proof.historicalSourceCensusDigest,
      historicalAssistantOriginalSourcesDigest:proof.historicalAssistantOriginalSourcesDigest,
      recordType:proof.recordType,
      recordSchemaVersion:proof.recordSchemaVersion,
      projectorVersion:proof.projectorVersion,
      originalPgJsonbDigest:proof.originalPgJsonbDigest,
      selectedSourcesDigest:proof.selectedSourcesDigest,
      projectedMemoryDigest:proof.projectedMemoryDigest,
    });
    expect(h.generate).toHaveBeenCalledTimes(2);
  });
  it('does not persist a seal when actual Preflight introduced unpinned integrity context',async()=>{
    const h=offline(true);
    await expect(h.run).rejects.toThrow(SeyeonG1HistoricalPostPreflightContextHoldV1);
    expect(h.sealAfterContextVerification).not.toHaveBeenCalled();
    expect(h.admitExactSources).not.toHaveBeenCalled();
    expect(h.called).toEqual(['integrity_classification','disclosure_classification']);
  });
  it('holds if DB Owner sees revoked originals after Preflight validation',async()=>{
    const h=offline(false,true);
    await expect(h.run).rejects.toThrow(SeyeonG1HistoricalPostPreflightContextHoldV1);
    expect(h.sealAfterContextVerification).toHaveBeenCalledTimes(1);
    expect(h.admitExactSources).not.toHaveBeenCalled();
    expect(h.called).toEqual(['integrity_classification','disclosure_classification']);
  });
  it('HOLDs on DB admission rejection after an exact seal, without dispatching any Interpreter',async()=>{
    const h=offline(false,false,proof,true);
    await expect(h.run).rejects.toThrow(SeyeonG1HistoricalPostPreflightContextHoldV1);
    expect(h.sealAfterContextVerification).toHaveBeenCalledTimes(1);
    expect(h.admitExactSources).toHaveBeenCalledTimes(1);
    expect(h.called).toEqual(['integrity_classification','disclosure_classification']);
    expect(h.generate).toHaveBeenCalledTimes(2);
  });
  it('does not persist or dispatch when historical original Grant changes after candidate Pin',async()=>{
    const h=offline(false,false,{...proof,originalGrantId:id(10)});
    await expect(h.run).rejects.toThrow(SeyeonG1HistoricalPostPreflightContextHoldV1);
    expect(h.sealAfterContextVerification).not.toHaveBeenCalled();
    expect(h.admitExactSources).not.toHaveBeenCalled();
    expect(h.called).toEqual(['integrity_classification','disclosure_classification']);
  });
});
