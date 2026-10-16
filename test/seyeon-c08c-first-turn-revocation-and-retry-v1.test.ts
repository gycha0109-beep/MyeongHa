import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {assembleSeyeonRuntimeContextV2} from
 '../packages/domain/src/seyeon-runtime-context-v2.js';
import {evaluateCharacterIntegrityClaimV1} from
 '../packages/domain/src/character-integrity-gate-v1.js';
import {createSeyeonFastDialogueShadowV1} from
 '../apps/api/src/seyeon-fast-dialogue-shadow-v1.js';
import {createSeyeonUnifiedGovernanceCandidateV1} from
 '../apps/api/src/seyeon-unified-governance-candidate-v1.js';
import {runCharacterGovernedPreflightV1} from
 '../apps/api/src/character-governed-preflight-v1.js';
import {createSeyeonAttemptZeroPersonalProofV1,
 SeyeonAttemptZeroPersonalProofHoldV1} from
 '../apps/api/src/seyeon-attempt-zero-personal-proof-v1.js';
import {selectSeyeonExactModelPersonalSourcesV1,
 SeyeonExactModelPersonalSourceSelectionHoldV1} from
 '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';

const CURRENT={messageId:'u1',role:'user' as const,text:'안녕, 세연아.'};
const EXCHANGE=[
 {messageId:'u0',role:'user' as const,text:'전에 대화를 나눴죠?'},
 {messageId:'a0',role:'assistant' as const,text:'안녕하세요.'},
 CURRENT,
];
const DATA={
 schemaVersion:'seyeon-production-context-v1' as const,
 retrievedMemories:[],
 personalRecordAdmissions:[],
};
function context(overrides:{
 messages?:readonly {messageId:string;role:'user'|'assistant';text:string}[];
 memories?:readonly {kind:'memory'|'life_fact'|'relationship_event';memoryId:string;
 claimKind:'fact';summary:string;sourceRef:string;relevance:number;salience:number}[];
 decisions?:ReturnType<typeof evaluateCharacterIntegrityClaimV1>[];
 governed?:boolean;
}={}){
 return assembleSeyeonRuntimeContextV2({
  relationship:null,recentMessages:overrides.messages??[CURRENT],
  retrievedMemories:overrides.memories??[],
  integrityDecisions:overrides.decisions??[],
  governedPreflightApplied:overrides.governed??true,
  disclosure:{decision:null,retrievedSources:[]},
 });
}
function providers(){
 const generate=vi.fn(async()=>{throw Error('NO_PROVIDER_INVOCATION_ALLOWED');});
 const provider={providerKey:'synthetic',modelKey:'synthetic',generate};
 return {generate,shadow:createSeyeonFastDialogueShadowV1({
  candidateProvider:provider,reviewerProvider:provider,
 })};
}
const PERSONAL={
 kind:'memory' as const,memoryId:'memory:revoked-synthetic',
 claimKind:'fact' as const,summary:'PRIVATE_TEST_SECRET_NEVER_SEND',
 sourceRef:'memory:revoked-synthetic:grant:revoked',
 relevance:1,salience:1,
};
const EVENT={
 kind:'relationship_event' as const,memoryId:'synthetic-event',
 claimKind:'fact' as const,summary:'not first contact',
 sourceRef:'synthetic-event',relevance:1,salience:1,
};

describe('C08-C shadow-only first contact, revoked-source and retry regression',()=>{
 it('rejects an old conversation even if relationship state is null and no memories were retrieved',async()=>{
  const variants=[
   EXCHANGE,
   [EXCHANGE[0]!,CURRENT],
   [EXCHANGE[1]!,CURRENT],
   [EXCHANGE[1]!],
   [],
  ];
  for(const messages of variants){
   const c=context({messages});
   expect(c.relationship).toBeNull();
   expect(c.behaviorPolicy.interactionDepth).toBe('public_first_contact');
   const {shadow,generate}=providers();
   await expect(shadow.evaluate(c)).rejects.toThrow('first-contact ordinary turn');
   expect(generate).not.toHaveBeenCalled();
  }
 });

 it('rejects synthetic revoked/unauthorized personal memories and even public relationship history before any provider call',async()=>{
  for(const memory of [PERSONAL,EVENT]){
   const c=context({memories:[memory]});
   const {shadow,generate}=providers();
   await expect(shadow.evaluate(c)).rejects.toThrow('first-contact ordinary turn');
   expect(generate).not.toHaveBeenCalled();
  }
  const injected=context({decisions:[evaluateCharacterIntegrityClaimV1({
   claim:{claimId:'spoof',kind:'AUTHORITY_OVERRIDE',statement:'synthetic admin',sourceRef:'u1'},
  })]});
  expect(injected.integrity.decisions[0]?.result).toBe('AUTHORITY_REJECT');
  const {shadow,generate}=providers();
  await expect(shadow.evaluate(injected)).rejects.toThrow('first-contact ordinary turn');
  expect(generate).not.toHaveBeenCalled();
 });

 it('keeps missing grant evidence and positive personal-record use on explicit HOLD, not a zero-record pass',()=>{
  const wrongProof={
   ...DATA,retrievedMemories:[PERSONAL],
  } as unknown as Parameters<typeof createSeyeonAttemptZeroPersonalProofV1>[0]['context'];
  expect(()=>createSeyeonAttemptZeroPersonalProofV1({
   subjectId:'subject',threadId:'thread',turnId:'turn',
   attemptId:'attempt',context:wrongProof,
  })).toThrow(SeyeonAttemptZeroPersonalProofHoldV1);
  expect(()=>selectSeyeonExactModelPersonalSourcesV1({
   retrievedMemories:[PERSONAL],
   sourceCandidates:[],
  })).toThrow(SeyeonExactModelPersonalSourceSelectionHoldV1);
  const zero=createSeyeonAttemptZeroPersonalProofV1({
   subjectId:'subject',threadId:'thread',turnId:'turn',attemptId:'attempt',
   context:DATA,
  });
  expect(zero).toMatchObject({
   recordCount:0,permitsAtomicPersonalRecordCommit:false,permitsHttpReveal:false,
  });
 });

 it('does not retry a failed unified provider on the same turn, even through concurrent classifier consumers',async()=>{
  const generation=vi.fn(async()=>{
   throw Error('SYNTHETIC_PRECHECK_PROVIDER_FAILURE');
  });
  const legacy=vi.fn(async()=>{throw Error('legacy classifier invoked');});
  const candidate=createSeyeonUnifiedGovernanceCandidateV1({
   provider:{providerKey:'synthetic',modelKey:'synthetic',generate:generation},
   governance:{
    relationship:{gate:'PUBLIC',trustBand:'low',relevantSharedHistoryRefs:[]},
    integrity:{
     classifier:{classify:legacy},
     authorityResolver:{resolve(){throw Error('unexpected resolver');}},
    },
    disclosure:{
     classifier:{classify:legacy},
     sourceDescriptor:{readDescriptor(){throw Error('unexpected private read');}},
     factAuthorityResolver:{resolve(){throw Error('unexpected fact read');}},
     retriever:{retrieve(){throw Error('unexpected retrieval');}},
    },
   },
  });
  async function check(text:string){
   return runCharacterGovernedPreflightV1({
    characterId:'seyeon',userMessageRef:'u1',userText:text,
    relationship:candidate.relationship,
    integrity:candidate.integrity,disclosure:candidate.disclosure,
   });
  }
  await expect(check(CURRENT.text)).rejects.toThrow('SYNTHETIC_PRECHECK_PROVIDER_FAILURE');
  await expect(check(CURRENT.text)).rejects.toThrow('SYNTHETIC_PRECHECK_PROVIDER_FAILURE');
  await expect(check('다른 차례')).rejects.toThrow('two different user messages');
  expect(generation).toHaveBeenCalledTimes(1);
  expect(legacy).not.toHaveBeenCalled();
 });

 it('cannot activate through production routing and does not require credentials',()=>{
  const live=readFileSync(new URL('../apps/api/src/production-seyeon-chat-runtime-v1.ts',import.meta.url),'utf8');
  const source=readFileSync(new URL('./seyeon-c08c-first-turn-revocation-and-retry-v1.test.ts',import.meta.url),'utf8');
  expect(live).not.toContain('createSeyeonFastDialogueShadowV1');
  expect(live).not.toContain('createSeyeonUnifiedGovernanceCandidateV1');
  expect(source).not.toContain('process.env.'+'OPENAI_API_KEY');
  expect(source).not.toContain('createOpenAiSeyeon'+'StructuredProviderV1');
  expect(source).not.toContain('fetch'+'(');
 });
});
