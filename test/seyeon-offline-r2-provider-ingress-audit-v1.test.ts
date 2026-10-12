import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  assembleSeyeonRuntimeContextV2,
  canonicalJson,
  type SeyeonRendererPacketV2,
} from '../packages/domain/src/index.js';
import {
  buildSeyeonRendererRequestV2,
  buildSeyeonSemanticReviewRequestV2,
  buildSeyeonTurnInterpreterRequestV2,
  type SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import { selectSeyeonExactModelPersonalSourcesV1 } from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';
import type { SeyeonOfflineS0ContextCandidateV1 } from '../apps/api/src/seyeon-offline-s0-context-admission-v1.js';
import {
  auditSeyeonOfflineR2ProviderRequestV1,
  createSeyeonOfflineR2AuditedSyntheticProviderV1,
} from '../apps/api/src/seyeon-offline-r2-provider-ingress-audit-v1.js';

const SUBJECT='a1000000-0000-4000-8000-000000000021';
const THREAD='a2000000-0000-4000-8000-000000000021';
const TURN='a3000000-0000-4000-8000-000000000021';
const ATTEMPT='a4000000-0000-4000-8000-000000000021';
const MESSAGE='a5000000-0000-4000-8000-000000000021';
const RECORD='a6000000-0000-4000-8000-000000000021';
const GRANT='a7000000-0000-4000-8000-000000000021';
const sha=(value:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(value)).digest('hex');
const current={messageId:MESSAGE,text:'합성 사용자 현재 메시지'};
const memory={
  kind:'memory' as const,memoryId:'memory:'+RECORD,
  claimKind:'fact' as const,summary:'synthetic S0 personal memory',
  sourceRef:'memory:'+RECORD+':grant:'+GRANT,
  relevance:.8,salience:.5,
};
const candidateSource={
  recordKind:'memory' as const,recordId:RECORD,grantId:GRANT,
  recordType:'synthetic-s0-only',schemaVersion:'synthetic-v1',
  projectedMemoryId:memory.memoryId,
  rawRecordDigest:sha({origin:'synthetic-db-owner'}),
  projectedMemoryDigest:sha(memory),
  permitsAtomicCommit:false as const,permitsHttpReveal:false as const,
};
function fixture(){
  const recent=[{...current,role:'user' as const}];
  const candidate:SeyeonOfflineS0ContextCandidateV1={
    identity:{subjectId:SUBJECT,threadId:THREAD,turnId:TURN,
      attemptId:ATTEMPT,characterId:'seyeon'},
    currentUserMessage:current,
    productionContext:{
      version:'seyeon-production-context-v1',
      relationshipRevisionUsedForTurn:null,historyThroughRevision:0,
      recentMessages:[],retrievedMemories:[memory],
      personalRecordAdmissions:[{
        recordId:RECORD,recordKind:'memory',
        recordType:'synthetic-s0-only',schemaVersion:'synthetic-v1',
        reason:'ADMITTED',
      }],
      personalRecordProjectionCandidates:[candidateSource],
      activeRelationshipEventCount:0,relationshipHistoryRecords:[],
    },
    finalContext:{
      relationship:null,recentMessages:recent,retrievedMemories:[memory],
    },
    selection:selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories:[memory],sourceCandidates:[candidateSource],
    }),
    syntheticApprovedSchema:{
      recordType:'synthetic-s0-only',schemaVersion:'synthetic-v1',
    },
    simulatedOtherIngress:{
      preflight:[],reader:[],disclosure:[],peer:[],external:[],
    },
  };
  const context=assembleSeyeonRuntimeContextV2({
    relationship:null,relationshipSemantics:null,
    recentMessages:recent,retrievedMemories:[memory],
    integrityDecisions:[],governedPreflightApplied:true,
    disclosure:{decision:null,retrievedSources:[]},
  });
  const packet={
    ...context,
    schemaVersion:'seyeon-renderer-packet-v2',
    recentConversation:context.recentConversation,
    memoryEvidence:context.retrievedMemories,
    integrity:context.integrity,
    disclosure:context.disclosure,
    interpretation:{
      chosenAction:{key:'approach'},
      notice:{evidenceRefs:[]},
      memoryRefsUsed:[],
      reveal:{level:'public',supportingHistoryRefs:[],triggerRef:null},
    },
  } as unknown as SeyeonRendererPacketV2;
  return {candidate,context,packet};
}
const providerRequest=(purpose:'integrity_classification'|'disclosure_classification')=>({
  contractVersion:'seyeon-structured-provider-v2' as const,
  purpose,
  instructions:'offline current input classification',
  responseSchema:{type:'object'},
  input:purpose==='integrity_classification'
    ?{characterId:'seyeon',userText:current.text}
    :{characterId:'seyeon',userQuestion:current.text},
});

describe('R2 offline full native Provider request source observations (NO AUTHORIZATION)',()=>{
  it('accepts current-user-only integrity and disclosure classification shapes',()=>{
    const {candidate}=fixture();
    for(const purpose of ['integrity_classification','disclosure_classification'] as const){
      const r=auditSeyeonOfflineR2ProviderRequestV1({
        candidate,request:providerRequest(purpose),
      });
      expect(r).toEqual({
        state:'observed_synthetic_only',
        requestDigest:expect.stringMatching(/^sha256:v1:[a-f0-9]{64}$/),
        permitsProductionProvider:false,permitsProductionReveal:false,
      });
    }
  });
  it('inspects REAL native interpreter request builder output against selected Memory',()=>{
    const {candidate,context}=fixture();
    const request=buildSeyeonTurnInterpreterRequestV2(context);
    expect(auditSeyeonOfflineR2ProviderRequestV1({candidate,request}).state)
      .toBe('observed_synthetic_only');
  });
  it('inspects REAL renderer and semantic reviewer request builders',()=>{
    const {candidate,packet}=fixture();
    const renderer=buildSeyeonRendererRequestV2(packet);
    const reviewer=buildSeyeonSemanticReviewRequestV2({
      packet,
      rendererDraft:{
        schemaVersion:'synthetic-only',
        utterance:'synthetic renderer output',
        memoryRefsMentioned:[],privateSourceRefsMentioned:[],disclosureSliceIds:[],
      },
      utteranceHash:'sha256:v1:'+'a'.repeat(64),
    });
    expect(auditSeyeonOfflineR2ProviderRequestV1({
      candidate,request:renderer,
    }).state).toBe('observed_synthetic_only');
    expect(auditSeyeonOfflineR2ProviderRequestV1({
      candidate,request:reviewer,
    }).state).toBe('observed_synthetic_only');
  });
  it('rejects older assistant/User transcript injected AFTER original pre-model Pin',()=>{
    const {candidate,context}=fixture();
    const request=buildSeyeonTurnInterpreterRequestV2({
      ...context,recentConversation:[
        {messageId:'old-unattributed',role:'assistant',text:'PRIVATE_OLD_CHAT'},
        ...context.recentConversation,
      ],
    });
    expect(auditSeyeonOfflineR2ProviderRequestV1({candidate,request})).toEqual({
      state:'held',permitsProductionProvider:false,
    });
  });
  it('rejects private Disclosure/Reader sources added by governed preflight after Pin',()=>{
    const {candidate,context}=fixture();
    const request=buildSeyeonTurnInterpreterRequestV2({
      ...context,disclosure:{
        ...context.disclosure,
        retrievedSources:[{sourceRef:'unauthorized-reader-proof'} as never],
      },
    });
    expect(auditSeyeonOfflineR2ProviderRequestV1({candidate,request}).state)
      .toBe('held');
  });
  it('rejects relationship semantics and newly verified preflight facts after original Pin',()=>{
    const {candidate,context}=fixture();
    const variants=[
      {...context,relationshipSemantics:{some:'unknown_relationship_overlay'} as never},
      {...context,integrity:{...context.integrity,decisions:[{claim:'unknown'} as never]}},
    ];
    for(const variant of variants){
      const request=buildSeyeonTurnInterpreterRequestV2(variant);
      expect(auditSeyeonOfflineR2ProviderRequestV1({candidate,request}).state)
        .toBe('held');
    }
  });
  it('rejects late extra Memory, swapped Grant, forged allowed reference vocabulary',()=>{
    const {candidate,context}=fixture();
    const request=buildSeyeonTurnInterpreterRequestV2(context);
    const input=request.input as Record<string,unknown>;
    for(const modified of [
      {...context,retrievedMemories:[...context.retrievedMemories,{...memory,memoryId:'memory:NEW'}]},
      {...context,retrievedMemories:[{...memory,sourceRef:'memory:'+RECORD+':grant:FORGED'}]},
    ]){
      expect(auditSeyeonOfflineR2ProviderRequestV1({
        candidate,request:buildSeyeonTurnInterpreterRequestV2(modified),
      }).state).toBe('held');
    }
    const ref=input.allowedReferenceVocabulary as Record<string,unknown>;
    const forged={...request,input:{
      ...input,allowedReferenceVocabulary:{...ref,historySourceRefs:['RELATIONSHIP_LEAK']},
    }};
    expect(auditSeyeonOfflineR2ProviderRequestV1({candidate,request:forged}).state)
      .toBe('held');
  });
  it('rejects renderer/reviewer private Source refs and new historical message',()=>{
    const {candidate,packet}=fixture();
    const altered={
      ...packet,
      recentConversation:[
        {messageId:'OLD',role:'assistant' as const,text:'OLD_SECRET'},
        ...packet.recentConversation,
      ],
    };
    expect(auditSeyeonOfflineR2ProviderRequestV1({
      candidate,request:buildSeyeonRendererRequestV2(altered),
    }).state).toBe('held');
    const review=buildSeyeonSemanticReviewRequestV2({
      packet,
      rendererDraft:{utterance:'private',privateSourceRefsMentioned:['unknown']},
      utteranceHash:'abc',
    });
    expect(auditSeyeonOfflineR2ProviderRequestV1({candidate,request:review}).state)
      .toBe('held');
  });
  it('rejects unknown Provider purposes / extra fields at classification boundary',()=>{
    const {candidate}=fixture();
    const request=providerRequest('integrity_classification');
    const modified=[
      {...request,purpose:'event_extraction' as const},
      {...request,input:{...request.input,readerContext:'injected'}},
      {...request,contractVersion:'wrong' as never},
    ];
    for(const entry of modified){
      expect(auditSeyeonOfflineR2ProviderRequestV1({
        candidate,request:entry as SeyeonStructuredProviderRequestV2,
      }).state).toBe('held');
    }
  });
  it('synthetic Provider wrapper dispatches allowed request, blocks drift BEFORE delegation', async ()=>{
    const {candidate,context}=fixture();
    const calls=vi.fn(async ()=>({synthetic:true}));
    const provider=createSeyeonOfflineR2AuditedSyntheticProviderV1({
      candidate,delegate:{
        providerKey:'synthetic-only',modelKey:'not-paid',
        generate:calls,
      },
    });
    await expect(provider.generate(
      buildSeyeonTurnInterpreterRequestV2(context),
    )).resolves.toEqual({synthetic:true});
    expect(calls).toHaveBeenCalledTimes(1);
    const bad=buildSeyeonTurnInterpreterRequestV2({
      ...context,retrievedMemories:[],
    });
    await expect(Promise.resolve().then(()=>provider.generate(bad)))
      .rejects.toThrow('offline R2 Provider ingress source closure held');
    expect(calls).toHaveBeenCalledTimes(1);
  });
});
