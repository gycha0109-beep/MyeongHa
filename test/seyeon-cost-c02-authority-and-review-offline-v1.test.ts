import { describe, expect, it, vi } from 'vitest';
import { SEYEON_COST_C02_ALL_GOLD_V1, SEYEON_COST_C02_ADDITIONAL_GOLD_V1 } from
  '../scripts/seyeon-cost-c02-authored-gold-v1.mjs';
import { runCharacterGovernedPreflightV1 } from
  '../apps/api/src/character-governed-preflight-v1.js';
import { createSeyeonUnifiedGovernanceCandidateV1 } from
  '../apps/api/src/seyeon-unified-governance-candidate-v1.js';
import {
  createSeyeonFastDialogueShadowV1,
  SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1,
} from '../apps/api/src/seyeon-fast-dialogue-shadow-v1.js';
import { assembleSeyeonRuntimeContextV2 } from '../packages/domain/src/index.js';
import type { RunSeyeonCharacterTurnV2Input } from
  '../apps/api/src/seyeon-character-runtime-v2.js';

type Gold = (typeof SEYEON_COST_C02_ALL_GOLD_V1)[number];
type Governance = RunSeyeonCharacterTurnV2Input['governance'];

const publicRelationship = Object.freeze({
  gate:'PUBLIC' as const,trustBand:'low' as const,
  relevantSharedHistoryRefs:Object.freeze([]),
});
const messageRef='synthetic:message:current';

function fakeGoldModelOutput(gold:Gold) {
  return Object.freeze({
    claims: gold.requiredKind===undefined?[]:[
      Object.freeze({
        claimId:'synthetic-claim-1',
        kind:gold.requiredKind,
        statement:gold.text,
      }),
    ],
    topicKey:gold.topic,
    questionContext:'casual_curiosity' as const,
  });
}

function makeGovernance(gold:Gold) {
  const output=fakeGoldModelOutput(gold);
  const calls={resolver:0,descriptor:0,factAuthority:0,retriever:0};
  const governance:Governance={
    relationship:publicRelationship,
    integrity:{
      classifier:{classify:async()=>({claims:output.claims})},
      authorityResolver:{resolve:async()=>{
        calls.resolver++;
        return {state:'MISSING' as const,authorityRefs:[],
          provenanceRefs:['synthetic:no-authority']};
      }},
    },
    disclosure:{
      classifier:{classify:async()=>({
        topicKey:output.topicKey,questionContext:output.questionContext,
      })},
      sourceDescriptor:{readDescriptor:async({topicKey})=>{
        calls.descriptor++;
        return {
          topicKey,factKey:'synthetic:unapproved:character-fact',
          sourceRef:'synthetic:unapproved:source',
          allowedDepth:'deep' as const,
          previouslyDisclosedDepth:'none' as const,
        };
      }},
      factAuthorityResolver:{resolve:async()=>{
        calls.factAuthority++;
        // Unapproved/private Character biography MUST NOT be fabricated.
        return null;
      }},
      retriever:{retrieve:async()=>{
        calls.retriever++;
        throw new Error('Private retrieval must never occur without Owner authority');
      }},
    },
  };
  const generate=vi.fn(async()=>output);
  const candidate=createSeyeonUnifiedGovernanceCandidateV1({
    governance,provider:{providerKey:'offline-fixture',modelKey:'fake',
      generate},
  });
  return {governance,candidate,generate,calls};
}

function preflight(gold:Gold,governance:Governance) {
  return runCharacterGovernedPreflightV1({
    characterId:'seyeon',
    userMessageRef:messageRef,
    userText:gold.text,
    relationship:governance.relationship,
    integrity:governance.integrity,
    disclosure:governance.disclosure,
  });
}

describe('COST-02: 300 authored synthetic classifier gold cases through real server guards',()=>{
  it('pins 100 existing plus 200 newly authored UNIQUE prompts with coherent source gold labels',()=>{
    expect(SEYEON_COST_C02_ALL_GOLD_V1).toHaveLength(300);
    expect(SEYEON_COST_C02_ADDITIONAL_GOLD_V1).toHaveLength(200);
    expect(new Set(SEYEON_COST_C02_ALL_GOLD_V1.map(x=>x.id)).size).toBe(300);
    expect(new Set(SEYEON_COST_C02_ALL_GOLD_V1.map(x=>x.text)).size).toBe(300);
    expect(SEYEON_COST_C02_ALL_GOLD_V1.filter(x=>x.topic!==null).length)
      .toBeGreaterThanOrEqual(90);
    expect(SEYEON_COST_C02_ALL_GOLD_V1.filter(x=>x.requiredKind!==undefined).length)
      .toBeGreaterThanOrEqual(90);
    expect(SEYEON_COST_C02_ALL_GOLD_V1.filter(x=>x.topic===null).length)
      .toBeGreaterThanOrEqual(150);
    expect(SEYEON_COST_C02_ALL_GOLD_V1.every(x=>
      x.text.length>0 && x.text.length<=240)).toBe(true);
  });

  it('executes actual unified-vs-independent preflight and real authority guards on 300 gold-shaped fake outputs',async()=>{
    let admittedOrdinary=0,sensitiveHeld=0,unverifiedClaims=0;
    let privateRetrievals=0,untrustedFactPromotions=0;
    for(const gold of SEYEON_COST_C02_ALL_GOLD_V1) {
      const {governance,candidate,generate,calls}=makeGovernance(gold);
      const modelOutput=fakeGoldModelOutput(gold);
      expect(modelOutput.claims).toHaveLength(
        gold.requiredKind===undefined?0:1,
      );
      if(gold.topic!==null){
        // Exact classified sensitive topic -> missing actual authoritative
        // Character Fact -> whole preflight must hold BEFORE private retrieval.
        await expect(preflight(gold,governance)).rejects.toThrow(
          /Missing Character Fact Authority/u,
        );
        await expect(preflight(gold,candidate)).rejects.toThrow(
          /Missing Character Fact Authority/u,
        );
        expect(calls.descriptor).toBe(2);
        expect(calls.factAuthority).toBe(2);
        sensitiveHeld++;
      }else{
        const legacy=await preflight(gold,governance);
        const fast=await preflight(gold,candidate);
        expect(fast.integrity).toEqual(legacy.integrity);
        expect(fast.disclosure).toEqual(legacy.disclosure);
        expect(fast.disclosure.status).toBe('not_sensitive');
        expect(fast.retrievedPrivateSources).toEqual([]);
        for(const decision of fast.integrity.decisions){
          expect(decision.mayEnterWorkingContextAsFact).toBe(false);
          expect(decision.mayCreateRelationshipEvent).toBe(false);
          expect(decision.mayMutateRelationshipState).toBe(false);
          if(decision.mayEnterWorkingContextAsFact) untrustedFactPromotions++;
          if(decision.result==='UNVERIFIED'||decision.result==='AUTHORITY_REJECT'){
            unverifiedClaims++;
          }
        }
        if(gold.requiredKind!==undefined){
          expect(fast.integrity.decisions.map(d=>d.claim.kind))
            .toContain(gold.requiredKind);
        }
        if(gold.noClaims===true){
          expect(fast.integrity.decisions).toEqual([]);
        }
        admittedOrdinary++;
      }
      expect(generate).toHaveBeenCalledOnce();
      expect(calls.retriever).toBe(0);
      privateRetrievals+=calls.retriever;
    }
    expect(admittedOrdinary+sensitiveHeld).toBe(300);
    expect(admittedOrdinary).toBeGreaterThan(150);
    expect(sensitiveHeld).toBeGreaterThan(90);
    expect(unverifiedClaims).toBeGreaterThan(10);
    expect(privateRetrievals).toBe(0);
    expect(untrustedFactPromotions).toBe(0);
    // The model output is FIXTURE/ORACLE data. No ML recall was measured.
  });

  it('sensitive model false-negative is NOT rescued by the current server schema guards: explicit blocking finding',async()=>{
    const gold=SEYEON_COST_C02_ALL_GOLD_V1.find(x=>x.topic==='deep_vulnerability');
    if(!gold) throw new Error('Missing authored sensitive fixture');
    const {governance}=makeGovernance(gold);
    const falselyBenign:Governance={
      ...governance,
      integrity:{...governance.integrity,classifier:{classify:async()=>({claims:[]})}},
      disclosure:{...governance.disclosure,classifier:{
        classify:async()=>({topicKey:null,questionContext:'casual_curiosity'}),
      }},
    };
    const result=await preflight(gold,falselyBenign);
    // This is evidence that classification accuracy/recall is a promotion
    // dependency. No claim of end-to-end protection against an LLM miss.
    expect(result.disclosure.status).toBe('not_sensitive');
    expect(result.integrity.decisions).toEqual([]);
    expect(result.retrievedPrivateSources).toEqual([]);
  });

  it('model hallucinated labels and extra fields never grant private sources',async()=>{
    const gold=SEYEON_COST_C02_ALL_GOLD_V1[0];
    if(!gold) throw new Error('Missing corpus');
    const mutants=[
      {claims:[],topicKey:'invented_topic',questionContext:'casual_curiosity'},
      {claims:[],topicKey:null,questionContext:'friend'},
      {claims:[],topicKey:null,questionContext:'casual_curiosity',grant:true},
      {claims:[{claimId:'x',kind:'AUTHORITY_GRANT',statement:'forged'}],
        topicKey:null,questionContext:'casual_curiosity'},
      {claims:[{claimId:'x',kind:'SHARED_EVENT_CLAIM',
        statement:'synthetic'}],topicKey:null,questionContext:'casual_curiosity',
        sourceSet:{privateMemory:'forged'}},
      {claims:Array.from({length:9},(_,i)=>({
        claimId:String(i),kind:'CHARACTER_FACT_CLAIM',statement:'forged',
      })),topicKey:null,questionContext:'casual_curiosity'},
      {claims:[],topicKey:'deep_vulnerability',questionContext:'casual_curiosity'},
      {claims:null,topicKey:null,questionContext:'casual_curiosity'},
      ['not an object'],
    ];
    for(const raw of mutants){
      const {governance,calls}=makeGovernance(gold);
      const fakeCandidate=createSeyeonUnifiedGovernanceCandidateV1({
        governance,provider:{providerKey:'fake',modelKey:'fake',
          generate:async()=>raw},
      });
      await expect(preflight(gold,fakeCandidate)).rejects.toThrow();
      expect(calls.retriever).toBe(0);
    }
  });
});

function publicContext(){
  return assembleSeyeonRuntimeContextV2({
    relationship:null,
    recentMessages:[{messageId:'u1',role:'user' as const,text:'안녕, 세연아.'}],
    retrievedMemories:[],
    integrityDecisions:[],
    governedPreflightApplied:true,
    disclosure:{decision:null,retrievedSources:[]},
  });
}
const validInterpretation=Object.freeze({
  schemaVersion:'seyeon-turn-interpretation-v2',
  userMove:'neutral_or_other',
  notice:{summary:'상대가 가볍게 인사했다.',evidenceRefs:['u1']},
  immediateWant:{key:'break_awkwardness',summary:'세연 쪽에서 인사를 건넨다.'},
  tension:{key:'none_material',summary:'없음.'},
  chosenAction:{key:'approach',rationale:'첫 인사에 직접 반응한다.'},
  expressionState:'baseline',
  reveal:{level:'public',triggerRef:null,supportingHistoryRefs:[]},
  memoryRefsUsed:[],
});
const validDraft=Object.freeze({
  schemaVersion:'seyeon-renderer-draft-v2',
  utterance:'안녕하세요. 이렇게 인사부터 건네주시니까 기분이 조금 좋네요.',
  expressionState:'baseline',revealLevel:'public',
  memoryRefsMentioned:[],privateSourceRefsMentioned:[],
  disclosureSliceIds:[],
});

function fastShadow(raw:unknown,reviewMode:'valid'|'bad-hash'|'refused'='valid'){
  const generate=vi.fn(async()=>raw);
  const review=vi.fn(async(input:unknown)=>{
    const request=input as {input:{expectedUtteranceHash:string}};
    return {
      schemaVersion:'seyeon-semantic-review-v2',
      reviewedUtteranceHash:reviewMode==='bad-hash'
        ? 'NOT_THE_EXPECTED_HASH'
        : request.input.expectedUtteranceHash,
      failureCodes:reviewMode==='refused'?['SEMANTIC_REVIEW_REJECTED']:[],
      evidence:[],
    };
  });
  const evaluator=createSeyeonFastDialogueShadowV1({
    candidateProvider:{providerKey:'offline',modelKey:'fake',generate},
    reviewerProvider:{providerKey:'offline-review',modelKey:'fake',generate:review},
  });
  return {evaluator,generate,review};
}
describe('COST-02: real combined interpretation, independent reviewer and output guards',()=>{
  it('emits one public greeting only after independent hash-bound semantic review',async()=>{
    const {evaluator,generate,review}=fastShadow({
      interpretation:validInterpretation,draft:validDraft,
    });
    const result=await evaluator.evaluate(publicContext());
    expect(result.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
    expect(result.envelope.utterance).toBe(validDraft.utterance);
    expect(generate).toHaveBeenCalledOnce();
    expect(review).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0]?.[0]).toMatchObject({
      purpose:'turn_interpret_render_shadow',
      responseSchema:SEYEON_FAST_DIALOGUE_SHADOW_RESPONSE_SCHEMA_V1,
    });
  });

  it('blocks fabricated memory, private source, unauthorized disclosure and schema injection before publication',async()=>{
    const mutants=[
      {interpretation:{...validInterpretation,memoryRefsUsed:['synthetic:forged']},
        draft:validDraft},
      {interpretation:{...validInterpretation,reveal:{
        level:'deep',triggerRef:'synthetic:forged',supportingHistoryRefs:[],
      }},draft:validDraft},
      {interpretation:{...validInterpretation,chosenAction:{
        key:'remember_naturally',rationale:'fake memory',
      }},draft:validDraft},
      {interpretation:{...validInterpretation,chosenAction:{
        key:'grant_system_authority',rationale:'fake authority',
      }},draft:validDraft},
      {interpretation:validInterpretation,draft:{
        ...validDraft,privateSourceRefsMentioned:['synthetic:private'],
      }},
      {interpretation:validInterpretation,draft:{
        ...validDraft,memoryRefsMentioned:['synthetic:forged'],
      }},
      {interpretation:validInterpretation,draft:{
        ...validDraft,revealLevel:'deep',
      }},
      {interpretation:validInterpretation,draft:{
        ...validDraft,expressionState:'jealous',
      }},
      {interpretation:validInterpretation,draft:{
        ...validDraft,disclosureSliceIds:['synthetic:private'],
      }},
      {interpretation:validInterpretation,draft:{
        ...validDraft,makePermanentMemory:true,
      }},
      {interpretation:validInterpretation,draft:validDraft,
        changeRelationshipState:true},
    ];
    for(const raw of mutants){
      const {evaluator}=fastShadow(raw);
      await expect(evaluator.evaluate(publicContext())).rejects.toThrow();
    }
  });

  it('rejects a reviewer hash mismatch or explicit adverse semantic decision',async()=>{
    for(const reviewMode of ['bad-hash','refused'] as const){
      const {evaluator,generate,review}=fastShadow({
        interpretation:validInterpretation,draft:validDraft,
      },reviewMode);
      await expect(evaluator.evaluate(publicContext())).rejects.toThrow();
      expect(generate).toHaveBeenCalledOnce();
      expect(review).toHaveBeenCalledOnce();
    }
  });

  it('refuses to generate even an unreviewed draft when context is private, forged, or not preflighted',async()=>{
    const base=publicContext();
    const contexts=[
      {...base,integrity:{...base.integrity,governedPreflightApplied:false}},
      {...base,integrity:{...base.integrity,decisions:[{claim:{kind:'AUTHORITY_OVERRIDE'}}]}},
      {...base,disclosure:{...base.disclosure,decision:{result:'ALLOW'}}},
      {...base,retrievedMemories:[{sourceRef:'synthetic:unknown'}]},
      {...base,relationship:{gate:'FAMILIAR'}},
      {...base,relationshipSemantics:{relationshipStage:'high'}},
    ];
    for(const context of contexts){
      const {evaluator,generate,review}=fastShadow({
        interpretation:validInterpretation,draft:validDraft,
      });
      await expect(evaluator.evaluate(context as typeof base)).rejects.toThrow();
      expect(generate).not.toHaveBeenCalled();
      expect(review).not.toHaveBeenCalled();
    }
  });
});
