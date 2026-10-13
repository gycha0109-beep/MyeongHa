import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  assembleSeyeonRuntimeContextV2,
  canonicalJson,
  type SeyeonRuntimeContextV2,
  type SeyeonRendererPacketV2,
} from '../packages/domain/src/index.js';
import {
  runCharacterGovernedPreflightV1,
  type CharacterGovernedPreflightResultV1,
} from '../apps/api/src/character-governed-preflight-v1.js';
import {
  buildSeyeonTurnInterpreterRequestV2,
  buildSeyeonRendererRequestV2,
  buildSeyeonSemanticReviewRequestV2,
  type SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import { selectSeyeonExactModelPersonalSourcesV1 } from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';
import type { SeyeonOfflineS0ContextCandidateV1 } from '../apps/api/src/seyeon-offline-s0-context-admission-v1.js';
import {
  observeSeyeonOfflineR2PostPreflightClosureV1,
  createSeyeonOfflineR2PostPreflightSyntheticProviderV1,
  createSeyeonOfflineR2PostPreflightSealedChainV1,
} from '../apps/api/src/seyeon-offline-r2-post-preflight-closure-v1.js';

const SUBJECT = 'a1000000-0000-4000-8000-000000000031';
const THREAD = 'a2000000-0000-4000-8000-000000000031';
const TURN = 'a3000000-0000-4000-8000-000000000031';
const ATTEMPT = 'a4000000-0000-4000-8000-000000000031';
const MESSAGE = 'a5000000-0000-4000-8000-000000000031';
const RECORD = 'a6000000-0000-4000-8000-000000000031';
const GRANT = 'a7000000-0000-4000-8000-000000000031';

const sha = (value: unknown) =>
  'sha256:v1:' + createHash('sha256')
    .update(canonicalJson(value)).digest('hex');

function fixture() {
  const message = { messageId: MESSAGE, text: '합성 현재 사용자 발화' };
  const memories = [{
    kind: 'memory' as const,
    memoryId: 'memory:' + RECORD,
    claimKind: 'fact' as const,
    sourceRef: 'memory:' + RECORD + ':grant:' + GRANT,
    summary: 'synthetic directly approved one-memory-only',
    relevance: .8,
    salience: .5,
  }];
  const candidateSource = {
    recordKind: 'memory' as const,
    recordId: RECORD,
    grantId: GRANT,
    recordType: 'synthetic-only-r2',
    schemaVersion: 'synthetic-v1',
    projectedMemoryId: memories[0]!.memoryId,
    rawRecordDigest: sha({kind:'offline',record:RECORD,grant:GRANT}),
    projectedMemoryDigest: sha(memories[0]),
    permitsAtomicCommit: false as const,
    permitsHttpReveal: false as const,
  };
  const recent = [{...message,role:'user' as const}];
  const candidate: SeyeonOfflineS0ContextCandidateV1 = {
    identity: {
      subjectId:SUBJECT,threadId:THREAD,turnId:TURN,
      attemptId:ATTEMPT,characterId:'seyeon',
    },
    currentUserMessage: message,
    productionContext: {
      version:'seyeon-production-context-v1',
      relationshipRevisionUsedForTurn:null,historyThroughRevision:0,
      recentMessages:[],retrievedMemories:memories,
      personalRecordAdmissions:[{
        recordId:RECORD,recordKind:'memory',
        recordType:'synthetic-only-r2',schemaVersion:'synthetic-v1',
        reason:'ADMITTED',
      }],
      personalRecordProjectionCandidates:[candidateSource],
      relationshipHistoryRecords:[],activeRelationshipEventCount:0,
    },
    finalContext:{
      relationship:null,recentMessages:recent,retrievedMemories:memories,
    },
    selection:selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories:memories,sourceCandidates:[candidateSource],
    }),
    syntheticApprovedSchema:{
      recordType:'synthetic-only-r2',schemaVersion:'synthetic-v1',
    },
    simulatedOtherIngress:{
      preflight:[],reader:[],disclosure:[],peer:[],external:[],
    },
  };
  return {candidate,recent,memories};
}

function context(candidate: SeyeonOfflineS0ContextCandidateV1) {
  return assembleSeyeonRuntimeContextV2({
    relationship:null,relationshipSemantics:null,
    recentMessages:candidate.finalContext.recentMessages,
    retrievedMemories:candidate.finalContext.retrievedMemories,
    integrityDecisions:[],governedPreflightApplied:true,
    disclosure:{decision:null,retrievedSources:[]},
  });
}

async function realPreflight(options?: Readonly<{
  classificationClaims?: readonly Readonly<{
    claimId:string;kind:'USER_SELF_REPORT';statement:string;
  }>[];
  rejectClassifier?: boolean;
}>) {
  const classify = vi.fn(async () => {
    if(options?.rejectClassifier) throw new Error('synthetic classification failure');
    return {claims:options?.classificationClaims??[]};
  });
  const disclosureClassify = vi.fn(async () => ({
    topicKey:null,questionContext:'casual_curiosity',
  }));
  const retrieval = vi.fn(async () => []);
  const authorityResolver = vi.fn(async () => ({
    state:'MISSING' as const,
    authorityRefs:[],
    provenanceRefs:['synthetic-no-authority'],
  }));
  const result = await runCharacterGovernedPreflightV1({
    characterId:'seyeon',
    userMessageRef:MESSAGE,
    userText:'합성 현재 사용자 발화',
    relationship:{gate:'PUBLIC',trustBand:'low',relevantSharedHistoryRefs:[]},
    integrity:{
      classifier:{classify},
      authorityResolver:{resolve:authorityResolver},
    },
    disclosure:{
      classifier:{classify:disclosureClassify},
      sourceDescriptor:{readDescriptor:async()=>{throw new Error('unexpected source descriptor');}},
      factAuthorityResolver:{resolve:async()=>null},
      retriever:{retrieve:retrieval},
    },
  });
  return {result,classify,disclosureClassify,retrieval};
}

const asPreflight = (x:unknown) => x as CharacterGovernedPreflightResultV1;
const asContext = (x:unknown) => x as SeyeonRuntimeContextV2;

describe('R2 post-Preflight closure through ACTUAL governed Preflight (offline only)',()=>{
  it('uses actual clean governed Preflight and actual assembled S0 context to admit ONLY synthetic observation',async()=>{
    const {candidate}=fixture();
    const {result,retrieval,disclosureClassify,classify}=await realPreflight();
    expect(classify).toHaveBeenCalledOnce();
    expect(disclosureClassify).toHaveBeenCalledOnce();
    expect(retrieval).not.toHaveBeenCalled();
    const actualContext=context(candidate);
    const verdict=observeSeyeonOfflineR2PostPreflightClosureV1({
      candidate,preflight:result,actualContext,
    });
    expect(verdict).toEqual({
      state:'post_preflight_context_observed_synthetic_only',
      contextDigest:expect.stringMatching(/^sha256:v1:[a-f0-9]{64}$/),
      interpreterRequestDigest:expect.stringMatching(/^sha256:v1:[a-f0-9]{64}$/),
      permitsProductionProvider:false,
      permitsProductionReveal:false,
    });
    const delegate=vi.fn(async ()=>({synthetic:true}));
    const wrapper=createSeyeonOfflineR2PostPreflightSyntheticProviderV1({
      candidate,preflight:result,actualContext,
      delegate:{providerKey:'synthetic',modelKey:'not-paid',generate:delegate},
    });
    const request=buildSeyeonTurnInterpreterRequestV2(actualContext);
    await expect(wrapper.generate(request)).resolves.toEqual({synthetic:true});
    await expect(Promise.resolve().then(()=>wrapper.generate(request)))
      .rejects.toThrow('post-Preflight source closure held');
    expect(delegate).toHaveBeenCalledTimes(1);
  });

  it('rejects actual governed Preflight claim after Pin, even if it is only user-asserted',async()=>{
    const {candidate}=fixture();
    const {result}=await realPreflight({
      classificationClaims:[{
        claimId:'synthetic-claim',
        kind:'USER_SELF_REPORT',
        statement:'a new claim appeared after Pin',
      }],
    });
    expect(result.integrity.decisions).toHaveLength(1);
    const actualContext=assembleSeyeonRuntimeContextV2({
      relationship:null,relationshipSemantics:null,
      recentMessages:candidate.finalContext.recentMessages,
      retrievedMemories:candidate.finalContext.retrievedMemories,
      integrityDecisions:result.integrity.decisions,
      governedPreflightApplied:true,
      disclosure:{decision:null,retrievedSources:[]},
    });
    expect(observeSeyeonOfflineR2PostPreflightClosureV1({
      candidate,preflight:result,actualContext,
    }).state).toBe('held');
    const delegate=vi.fn(async()=>null);
    const wrapper=createSeyeonOfflineR2PostPreflightSyntheticProviderV1({
      candidate,preflight:result,actualContext,
      delegate:{providerKey:'synthetic',modelKey:'not-paid',generate:delegate},
    });
    await expect(Promise.resolve().then(()=>
      wrapper.generate(buildSeyeonTurnInterpreterRequestV2(actualContext)),
    )).rejects.toThrow('post-Preflight source closure held');
    expect(delegate).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown source retrieval', (p:CharacterGovernedPreflightResultV1) => ({
      ...p,retrievedPrivateSources:[{sourceRef:'private:late'}],
    })],
    ['claim classification without resolved decisions', (p:CharacterGovernedPreflightResultV1) => ({
      ...p,integrity:{...p.integrity,classification:{
        claims:[{claimId:'forged',kind:'USER_SELF_REPORT',statement:'derived late'}],
      }},
    })],
    ['claim decision injected', (p:CharacterGovernedPreflightResultV1) => ({
      ...p,integrity:{...p.integrity,decisions:[{state:'VERIFIED'}]},
    })],
    ['identity mismatch', (p:CharacterGovernedPreflightResultV1) => ({
      ...p,integrity:{...p.integrity,userMessageRef:'different-message'},
    })],
    ['disclosure became sensitive', (p:CharacterGovernedPreflightResultV1) => ({
      ...p,disclosure:{...p.disclosure,status:'sensitive',decision:{result:'ALLOW'}},
    })],
    ['disclosure source added', (p:CharacterGovernedPreflightResultV1) => ({
      ...p,disclosure:{...p.disclosure,source:{sourceRef:'new-private-source'}},
    })],
    ['missing status', (p:CharacterGovernedPreflightResultV1) => ({
      ...p,disclosure:{...p.disclosure,status:undefined},
    })],
  ] as const)('holds on %s after a legitimate clean Preflight', async (_,tamper)=>{
    const {candidate}=fixture();
    const {result}=await realPreflight();
    expect(observeSeyeonOfflineR2PostPreflightClosureV1({
      candidate,preflight:asPreflight(tamper(result)),actualContext:context(candidate),
    }).state).toBe('held');
  });

  it.each([
    ['old assistant transcript', (c:SeyeonRuntimeContextV2)=>({
      ...c,recentConversation:[
        {messageId:'old',role:'assistant',text:'unknown private parent'},...c.recentConversation,
      ],
    })],
    ['a second Memory', (c:SeyeonRuntimeContextV2)=>({
      ...c,retrievedMemories:[
        ...c.retrievedMemories,{...c.retrievedMemories[0],memoryId:'memory:unapproved'},
      ],
    })],
    ['relationship overlay', (c:SeyeonRuntimeContextV2)=>({
      ...c,relationshipSemantics:{source:'opaque-unattributed'},
    })],
    ['post-preflight resolved fact', (c:SeyeonRuntimeContextV2)=>({
      ...c,integrity:{...c.integrity,decisions:[{decision:'VERIFIED'}]},
    })],
    ['governed flag lost', (c:SeyeonRuntimeContextV2)=>({
      ...c,integrity:{...c.integrity,governedPreflightApplied:false},
    })],
    ['new Disclosure source', (c:SeyeonRuntimeContextV2)=>({
      ...c,disclosure:{...c.disclosure,retrievedSources:[{sourceRef:'unknown:reader'}]},
    })],
    ['Bible version drift', (c:SeyeonRuntimeContextV2)=>({
      ...c,character:{...c.character,sourceBibleBlobSha:'UNSIGNED_BIBLE_CHANGED'},
    })],
    ['behavior policy drift', (c:SeyeonRuntimeContextV2)=>({
      ...c,behaviorPolicy:{...c.behaviorPolicy,initiativeMode:'unapproved'},
    })],
  ] as const)('holds on assembled context drift: %s',async(_,change)=>{
    const {candidate}=fixture();
    const {result}=await realPreflight();
    const mutated=asContext(change(context(candidate)));
    expect(observeSeyeonOfflineR2PostPreflightClosureV1({
      candidate,preflight:result,actualContext:mutated,
    }).state).toBe('held');
  });

  it('checks mutable post-Preflight context AGAIN before dispatch and fails closed',async()=>{
    const {candidate}=fixture();
    const {result}=await realPreflight();
    const original=context(candidate);
    // Simulate a mutable adapter-owned copy of native Context (the original
    // context builder may freeze its character metadata).
    const actualContext=asContext({
      ...original,character:{...original.character},
    });
    const delegate=vi.fn(async()=>({synthetic:true}));
    const wrapper=createSeyeonOfflineR2PostPreflightSyntheticProviderV1({
      candidate,preflight:result,actualContext,
      delegate:{providerKey:'synthetic',modelKey:'not-paid',generate:delegate},
    });
    // Mutation between wrapper construction and synthetic Provider dispatch
    // MUST NOT reuse the earlier context authorization observation.
    (actualContext.character as {sourceBibleBlobSha:string}).sourceBibleBlobSha =
      'changed-after-initial-attestation';
    await expect(Promise.resolve().then(()=>
      wrapper.generate(buildSeyeonTurnInterpreterRequestV2(actualContext)),
    )).rejects.toThrow('post-Preflight source closure held');
    expect(delegate).not.toHaveBeenCalled();
  });

  it('rejects post-Preflight malformed/unknown; classification failure performs no Interpreter dispatch',async()=>{
    const {candidate}=fixture();
    await expect(realPreflight({rejectClassifier:true}))
      .rejects.toThrow('synthetic classification failure');
    expect(observeSeyeonOfflineR2PostPreflightClosureV1({
      candidate,preflight:asPreflight(null),actualContext:context(candidate),
    }).state).toBe('held');
  });
});

/** All five native request shapes, but synthetic expectations only. */
function fiveStageRequests(context: SeyeonRuntimeContextV2):
  readonly SeyeonStructuredProviderRequestV2[] {
  const packet = {
    ...context,
    schemaVersion: 'seyeon-renderer-packet-v2',
    recentConversation: context.recentConversation,
    memoryEvidence: context.retrievedMemories,
    interpretation: {
      chosenAction: {key: 'approach'},
      expressionState: 'baseline',
      notice: {evidenceRefs: []},
      memoryRefsUsed: [],
      reveal: {level: 'public', supportingHistoryRefs: [], triggerRef: null},
    },
  } as unknown as SeyeonRendererPacketV2;
  return [
    {
      contractVersion: 'seyeon-structured-provider-v2',
      purpose: 'integrity_classification',
      instructions: 'synthetic current user classifier',
      responseSchema: {type: 'object'},
      input: {characterId: 'seyeon', userText: '합성 현재 사용자 발화'},
    },
    {
      contractVersion: 'seyeon-structured-provider-v2',
      purpose: 'disclosure_classification',
      instructions: 'synthetic current user classifier',
      responseSchema: {type: 'object'},
      input: {characterId: 'seyeon', userQuestion: '합성 현재 사용자 발화'},
    },
    buildSeyeonTurnInterpreterRequestV2(context),
    buildSeyeonRendererRequestV2(packet),
    buildSeyeonSemanticReviewRequestV2({
      packet,
      rendererDraft: {
        utterance: '합성 렌더링 결과',
        memoryRefsMentioned: [], privateSourceRefsMentioned: [],
        disclosureSliceIds: [],
      },
      utteranceHash: 'sha256:v1:' + 'a'.repeat(64),
    }),
  ];
}

describe('R2 post-Preflight sealed five-stage continuity (offline only)', () => {
  it('allows the exact two classifier + native Interpreter/Renderer/Reviewer requests only once', async () => {
    const {candidate} = fixture();
    const {result} = await realPreflight();
    const actualContext = context(candidate);
    const expectedRequests = fiveStageRequests(actualContext);
    const delegate = vi.fn(async (request:SeyeonStructuredProviderRequestV2) => ({
      synthetic: true, stage: request.purpose,
    }));
    const chain = createSeyeonOfflineR2PostPreflightSealedChainV1({
      candidate,preflight:result,actualContext,expectedRequests,
      delegate:{providerKey:'offline',modelKey:'synthetic',generate:delegate},
    });
    expect(chain.snapshot().permitsProductionProvider).toBe(false);
    expect(chain.snapshot().permitsProductionReveal).toBe(false);
    for (const idx of [1,0,2,3,4]) {
      await expect(chain.provider.generate(expectedRequests[idx]!)).resolves.toEqual({
        synthetic:true,stage:expectedRequests[idx]!.purpose,
      });
    }
    expect(delegate).toHaveBeenCalledTimes(5);
    expect(chain.snapshot().completedPurposes).toHaveLength(5);
    await expect(Promise.resolve().then(() =>
      chain.provider.generate(expectedRequests[2]!),
    )).rejects.toThrow('held before dispatch');
    expect(delegate).toHaveBeenCalledTimes(5);
  });

  it('does not begin the chain with a sealed but different Interpreter input', async () => {
    const {candidate} = fixture();
    const {result} = await realPreflight();
    const actualContext = context(candidate);
    const requests = fiveStageRequests(actualContext).map(request =>
      request.purpose === 'turn_interpretation'
        ? {...request,instructions:request.instructions + ' injected'} : request);
    const delegate=vi.fn(async()=>null);
    expect(() => createSeyeonOfflineR2PostPreflightSealedChainV1({
      candidate,preflight:result,actualContext,expectedRequests:requests,
      delegate:{providerKey:'offline',modelKey:'synthetic',generate:delegate},
    })).toThrow('baseline held');
    expect(delegate).not.toHaveBeenCalled();
  });

  it('blocks a late Disclosure or Reader source after Interpreter but before Renderer', async () => {
    const {candidate} = fixture();
    const {result} = await realPreflight();
    // Mutable outer copy lets this test simulate an untrusted async adapter.
    const actualPreflight = asPreflight({
      ...result,retrievedPrivateSources:[...result.retrievedPrivateSources],
    });
    const actualContext = context(candidate);
    const requests=fiveStageRequests(actualContext);
    const delegate=vi.fn(async()=>null);
    const chain=createSeyeonOfflineR2PostPreflightSealedChainV1({
      candidate,preflight:actualPreflight,actualContext,expectedRequests:requests,
      delegate:{providerKey:'offline',modelKey:'synthetic',generate:delegate},
    });
    for(const idx of [0,1,2]) await chain.provider.generate(requests[idx]!);
    (actualPreflight.retrievedPrivateSources as unknown[])
      .push({sourceRef:'reader:unapproved-after-interpretation'});
    await expect(Promise.resolve().then(() =>
      chain.provider.generate(requests[3]!),
    )).rejects.toThrow('post-Preflight source closure held');
    expect(delegate).toHaveBeenCalledTimes(3);
    expect(chain.snapshot().completedPurposes).toEqual([
      'integrity_classification','disclosure_classification','turn_interpretation',
    ]);
  });

  it('blocks in-place Context/Bible drift after Renderer before Semantic Reviewer', async () => {
    const {candidate}=fixture();
    const {result}=await realPreflight();
    const original=context(candidate);
    const actualContext=asContext({
      ...original,character:{...original.character},
    });
    const requests=fiveStageRequests(actualContext);
    const delegate=vi.fn(async()=>null);
    const chain=createSeyeonOfflineR2PostPreflightSealedChainV1({
      candidate,preflight:result,actualContext,expectedRequests:requests,
      delegate:{providerKey:'offline',modelKey:'synthetic',generate:delegate},
    });
    for(const idx of [0,1,2,3]) await chain.provider.generate(requests[idx]!);
    (actualContext.character as {sourceBibleBlobSha:string}).sourceBibleBlobSha=
      'changed-after-renderer';
    await expect(Promise.resolve().then(() =>
      chain.provider.generate(requests[4]!),
    )).rejects.toThrow('post-Preflight source closure held');
    expect(delegate).toHaveBeenCalledTimes(4);
  });

  it('rejects altered Renderer packet even when post-Preflight source closure is unchanged', async () => {
    const {candidate}=fixture();
    const {result}=await realPreflight();
    const actualContext=context(candidate);
    const requests=fiveStageRequests(actualContext);
    const delegate=vi.fn(async()=>null);
    const chain=createSeyeonOfflineR2PostPreflightSealedChainV1({
      candidate,preflight:result,actualContext,expectedRequests:requests,
      delegate:{providerKey:'offline',modelKey:'synthetic',generate:delegate},
    });
    for(const idx of [0,1,2]) await chain.provider.generate(requests[idx]!);
    const renderer=requests[3]!;
    const input=renderer.input as Record<string,unknown>;
    const changed={...renderer,input:{...input,packet:{
      ...(input.packet as Record<string,unknown>),
      unapprovedDerivedSummary:'not present in original stage receipt',
    }}};
    await expect(Promise.resolve().then(() =>
      chain.provider.generate(changed),
    )).rejects.toThrow('full-request fingerprint mismatch');
    expect(delegate).toHaveBeenCalledTimes(3);
  });

  it('blocks a changed S0 original selection after Preflight before any Provider', async () => {
    const {candidate}=fixture();
    const {result}=await realPreflight();
    const actualContext=context(candidate);
    const requests=fiveStageRequests(actualContext);
    const delegate=vi.fn(async()=>null);
    const chain=createSeyeonOfflineR2PostPreflightSealedChainV1({
      candidate,preflight:result,actualContext,expectedRequests:requests,
      delegate:{providerKey:'offline',modelKey:'synthetic',generate:delegate},
    });
    (candidate.currentUserMessage as {text:string}).text='altered current input';
    await expect(Promise.resolve().then(() =>
      chain.provider.generate(requests[0]!),
    )).rejects.toThrow('post-Preflight source closure held');
    expect(delegate).not.toHaveBeenCalled();
  });
});
