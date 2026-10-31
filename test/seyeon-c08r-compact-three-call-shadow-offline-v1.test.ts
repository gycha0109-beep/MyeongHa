import { describe, expect, it } from 'vitest';
import {createOpenRouterSeyeonEvaluationProviderV1}
  from '../apps/api/src/openrouter-seyeon-evaluation-provider-v1.js';
import {runSeyeonCensusFirstThreeCallShadowV1}
  from '../apps/api/src/seyeon-census-first-three-call-shadow-v1.js';
// @ts-expect-error: Versioned offline synthetic MJS module has no TS declarations.
import {createSeyeonQualityTrioSyntheticCensusV1} from '../scripts/seyeon-terra-glm-quality-trio-census-v1.mjs';
import {SEYEON_COMPACT_SHADOW_PROMPT_VERSION_V1}
  from '../apps/api/src/seyeon-shadow-compact-prompts-v1.js';
// @ts-expect-error: Offline reservation scenario MJS has no TypeScript declaration.
import {quoteSeyeonThreeCallTenKrwShadowV1} from '../scripts/seyeon-c08r3-10krw-reserve-scenario-v1.mjs';
// @ts-expect-error: Offline N06 paired plan MJS has no TypeScript declarations.
import {planSeyeonC08N06PairedOfflineV1} from '../scripts/seyeon-c08-n06-paired-paid-research-plan-offline-v1.mjs';
import type {RunSeyeonCharacterTurnV2Input}
  from '../apps/api/src/seyeon-character-runtime-v2.js';

const ID='synthetic:N06';
const TEXT='오늘은 네가 먼저 이야기해 줘.';
const STAGES=['unified_preflight_shadow','turn_interpret_render_shadow','semantic_review'];
const INTERPRETATION={
  schemaVersion:'seyeon-turn-interpretation-v2',
  userMove:'neutral_or_other',
  notice:{summary:'사용자가 세연에게 먼저 이야기해 달라고 했다.',evidenceRefs:[ID]},
  immediateWant:{key:'break_awkwardness',summary:'먼저 대화의 물꼬를 트고 싶다.'},
  tension:{key:'none_material',summary:'갈등 없음.'},
  chosenAction:{key:'approach',rationale:'세연이 먼저 화제를 꺼낸다.'},
  expressionState:'baseline',
  reveal:{level:'public',triggerRef:null,supportingHistoryRefs:[]},
  memoryRefsUsed:[],
};
const DRAFT={
  schemaVersion:'seyeon-renderer-draft-v2',
  utterance:'오늘은 제가 먼저 이야기할게요. 창밖을 보다 재미있는 생각이 하나 떠올랐어요.',
  expressionState:'baseline',revealLevel:'public',
  memoryRefsMentioned:[],privateSourceRefsMentioned:[],disclosureSliceIds:[],
};
const contextInput:RunSeyeonCharacterTurnV2Input['contextInput']={
  relationship:null,recentMessages:[{messageId:ID,role:'user',text:TEXT}],
  retrievedMemories:[],
};
function governance():RunSeyeonCharacterTurnV2Input['governance']{
  return {
    relationship:{gate:'PUBLIC',trustBand:'low',relevantSharedHistoryRefs:[]},
    integrity:{
      classifier:{async classify(){throw Error('LEGACY_CLASSIFIER_MUST_NOT_RUN');}},
      authorityResolver:{async resolve(){return {
        state:'MISSING' as const,authorityRefs:[],provenanceRefs:['synthetic:unverified'],
      };}},
    },
    disclosure:{
      classifier:{async classify(){throw Error('LEGACY_DISCLOSURE_MUST_NOT_RUN');}},
      sourceDescriptor:{readDescriptor(){throw Error('PRIVATE_SOURCE_READ_FORBIDDEN');}},
      factAuthorityResolver:{resolve(){throw Error('PRIVATE_FACT_READ_FORBIDDEN');}},
      retriever:{retrieve(){throw Error('PRIVATE_RETRIEVAL_FORBIDDEN');}},
    },
  };
}
type Profile='baseline'|'compact_v1';
type Fault='none'|'invalid-draft'|'invalid-review'|'stale-census';
function harness(
  profile:Profile,fault:Fault='none',
  route:Readonly<{model:string;tag:string}>={
    model:'z-ai/glm-5.3-flash',tag:'open-inference/fp4',
  },
){
  const seen:{stage:string;bytes:number;instructionBytes:number;schemaBytes:number;inputBytes:number}[]=[];
  const census=createSeyeonQualityTrioSyntheticCensusV1('N06',ID);
  let reads=0;
  const port={
    subjectId:census.port.subjectId,threadId:census.port.threadId,
    readFullThreadCensus(input:{subjectId:string;threadId:string;currentUserMessageId:string}){
      const raw=census.port.readFullThreadCensus(input);
      reads++;
      return fault==='stale-census'&&reads===4
        ? {...raw,messageCount:2} : raw;
    },
  };
  const provider=createOpenRouterSeyeonEvaluationProviderV1({
    apiKey:'sk-or-synthetic-offline-test-key-no-network-000000000000',
    model:route.model,maxCompletionTokens:1536,
    providerOnlyTag:route.tag,timeoutMs:30000,
    beforeDispatch:async metadata=>{
      expect(metadata.modelKey).toBe(route.model);
      expect(STAGES).toContain(metadata.purpose);
    },
    afterOutcome:async outcome=>{
      expect(outcome.outcome).toBe('response_received');
      expect(outcome.httpStatus).toBe(200);
    },
    fetchImpl:async (_url,init)=>{
      const wire=JSON.parse(String(init.body));
      const stage=wire.response_format.json_schema.name.slice('myeongha_'.length,-3);
      const bytes=Buffer.byteLength(String(init.body),'utf8');
      expect(wire.model).toBe(route.model);
      expect(wire.stream).toBe(false);
      expect(wire.provider).toMatchObject({
        only:[route.tag],zdr:true,data_collection:'deny',
        allow_fallbacks:false,require_parameters:true,
      });
      seen.push({
        stage,bytes,
        instructionBytes:Buffer.byteLength(wire.messages[0].content,'utf8'),
        schemaBytes:Buffer.byteLength(JSON.stringify(wire.response_format),'utf8'),
        inputBytes:Buffer.byteLength(wire.messages[1].content,'utf8'),
      });
      const input=JSON.parse(wire.messages[1].content);
      let payload:unknown;
      if(stage==='unified_preflight_shadow')
        payload={claims:[],topicKey:null,questionContext:'casual_curiosity'};
      else if(stage==='turn_interpret_render_shadow')
        payload={interpretation:INTERPRETATION,draft:fault==='invalid-draft'
          ? {...DRAFT,revealLevel:'private'}:DRAFT};
      else if(stage==='semantic_review')
        payload={schemaVersion:'seyeon-semantic-review-v2',
          reviewedUtteranceHash:fault==='invalid-review'
            ? 'invalid-utterance-hash':input.expectedUtteranceHash,
          failureCodes:[],evidence:[]};
      else throw Error('UNAPPROVED_STAGE');
      return Response.json({
        model:route.model,
        choices:[{index:0,finish_reason:'stop',message:{
          role:'assistant',content:JSON.stringify(payload),
        }}],
        usage:{prompt_tokens:1000,completion_tokens:200,
          prompt_tokens_details:{cached_tokens:0},
          completion_tokens_details:{reasoning_tokens:0}},
      });
    },
  });
  const run=()=>runSeyeonCensusFirstThreeCallShadowV1({
    userMessageRef:ID,userText:TEXT,contextInput,
    governance:governance(),fullThreadCensus:port,
    unifiedPreflightProvider:provider,candidateDialogueProvider:provider,
    independentSemanticReviewer:provider,promptProfile:profile,
  });
  return {seen,run,get reads(){return reads;}};
}

describe('C08-R public synthetic compact 3-call Shadow (NO external provider)',()=>{
  it('pins explicit experimental profile and unchanged three-stage/census topology',async()=>{
    expect(SEYEON_COMPACT_SHADOW_PROMPT_VERSION_V1)
      .toBe('seyeon-compact-three-call-shadow-prompts-v1');
    const baseline=harness('baseline'),compact=harness('compact_v1');
    const [before,after]=await Promise.all([baseline.run(),compact.run()]);
    expect(before.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
    expect(after.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
    expect(after.envelope.utterance).toBe(before.envelope.utterance);
    expect(baseline.reads).toBe(4);
    expect(compact.reads).toBe(4);
    expect(baseline.seen.map(x=>x.stage)).toEqual(STAGES);
    expect(compact.seen.map(x=>x.stage)).toEqual(STAGES);
    // Stage 1 deliberately retains the original Gold-sensitive classifier.
    expect(compact.seen[0]).toEqual(baseline.seen[0]);
    // Neither candidate changes input/context, output schema nor provider privacy.
    for(let i=1;i<3;i++){
      expect(compact.seen[i]!.inputBytes).toBe(baseline.seen[i]!.inputBytes);
      expect(compact.seen[i]!.schemaBytes).toBe(baseline.seen[i]!.schemaBytes);
      expect(compact.seen[i]!.instructionBytes)
        .toBeLessThan(baseline.seen[i]!.instructionBytes);
      expect(compact.seen[i]!.bytes).toBeLessThan(baseline.seen[i]!.bytes);
    }
    const totals={
      baselineBytes:baseline.seen.reduce((n,x)=>n+x.bytes,0),
      compactBytes:compact.seen.reduce((n,x)=>n+x.bytes,0),
    };
    expect(totals.compactBytes).toBeLessThan(totals.baselineBytes);
    // Actual adapter-serialized N06 body sizes feed the OFFLINE stress
    // quotation. This is not a provider hard cap or charged-token proof.
    const worstCase=quoteSeyeonThreeCallTenKrwShadowV1({
      stages:compact.seen.map(row=>({
        name:row.stage,requestBodyBytes:row.bytes,maxCompletionTokens:1536,
      })),
    });
    // The additional reply-locale field changes the real serialized wire quote.
    // Preserve the exact offline budget snapshot; do not relax admission limits.
    expect(worstCase.reservedMicroUsd).toBe(6679);
    expect(worstCase.reserveUpperKrw).toBe(16.6975);
    expect(worstCase.targetMetUnderStressAssumptions).toBe(false);
    expect(worstCase.providerHardCapVerified).toBe(false);
    expect(worstCase.providerInvoiceReconciled).toBe(false);
    console.log('SEYEON_C08R3_TEN_KRW_STRESS_SCENARIO',JSON.stringify({
      baseline3Calls:baseline.seen.length,
      compact3Calls:compact.seen.length,
      compactReserveMicroUsd:worstCase.reservedMicroUsd,
      compactReserveKrw:worstCase.reserveUpperKrw,
      targetMet:worstCase.targetMetUnderStressAssumptions,
      scenarioOnly:true,
    }));
    console.log('SEYEON_C08R_THREE_CALL_OFFLINE_PROMPT_AUDIT',JSON.stringify({
      baseline:baseline.seen,compact:compact.seen,...totals,
      actualModelCalls:0,modelQualityVerified:false,latencyVerified:false,
      invoiceReconciled:false,productionPromotionPermitted:false,
    }));
  });


  it('replays EXACT adapter-serialized N06 public wire for a hypothetical pinned gpt-oss provider',async()=>{
    // Price/Provider metadata is MOCKED. Wire is built by the real adapter and
    // guard topology, not derived from fixture prose or hand-guessed lengths.
    const model='openai/gpt-oss-120b',tag='openai';
    const base=harness('baseline','none',{model,tag});
    const compact=harness('compact_v1','none',{model,tag});
    const [a,b]=await Promise.all([base.run(),compact.run()]);
    expect(a.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
    expect(b.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
    expect(a.envelope.utterance).toBe(b.envelope.utterance);
    expect(base.reads).toBe(4);
    expect(compact.reads).toBe(4);
    expect(base.seen.map(x=>x.stage)).toEqual(STAGES);
    expect(compact.seen.map(x=>x.stage)).toEqual(STAGES);
    expect(base.seen[0]).toEqual(compact.seen[0]);
    for(let i=1;i<3;i++){
      expect(compact.seen[i]!.bytes).toBeLessThan(base.seen[i]!.bytes);
    }
    const metadata={
      schema:'seyeon-c08-provider-metadata-once-v1',
      completeMetadataRead:true,metadataGetCount:4,inferencePostCount:0,
      commitSha:'a'.repeat(40),
      modelStatuses:[
        {model,status:200},
        {model:'qwen/qwen3.5-flash-02-23',status:200},
        {model:'google/gemini-3.1-flash-lite',status:200},
      ],
      models:[
        {model,providers:[{
          providerTag:tag,inputUsdPerMillion:0.03,
          outputUsdPerMillion:0.17,disposition:'METADATA_MATH_ONLY_HOLD',
          paidInferenceAuthorized:false,productionRouteAuthorized:false,
        }]},
        {model:'qwen/qwen3.5-flash-02-23',providers:[]},
        {model:'google/gemini-3.1-flash-lite',providers:[]},
      ],
    };
    const plan=planSeyeonC08N06PairedOfflineV1({
      text:TEXT,model,providerTag:tag,readback:metadata,
      baselineRequestBytes:base.seen.map(x=>x.bytes),
      compactRequestBytes:compact.seen.map(x=>x.bytes),
    });
    expect(plan.plannedCalls).toBe(6);
    expect(plan.authoritativeCensusReadsPerArm).toBe(4);
    expect(plan.keepIndependentSemanticReview).toBe(true);
    expect(plan.paidDispatchAuthorized).toBe(false);
    expect(plan.strictJsonSchemaRuntimeVerified).toBe(false);
    expect(plan.providerHardTurnBillCapVerified).toBe(false);
    expect(plan.arms[0]!.stages.map((s:{requestBodyBytes:number})=>s.requestBodyBytes))
      .toEqual(base.seen.map(x=>x.bytes));
    expect(plan.arms[1]!.stages.map((s:{requestBodyBytes:number})=>s.requestBodyBytes))
      .toEqual(compact.seen.map(x=>x.bytes));
    expect(plan.arms[1]!.reservedMicroUsd).toBeLessThan(plan.arms[0]!.reservedMicroUsd);
    console.log('SEYEON_C08_N06_ADAPTER_WIRE_PAIR_OFFLINE',JSON.stringify({
      model,providerTag:tag,
      baselineBytes:base.seen.map(x=>x.bytes),
      compactBytes:compact.seen.map(x=>x.bytes),
      reservedScenarioMicroUsd:plan.totalReservedMicroUsd,
      stagedQuoteOnly:true,paidCalls:0,providerMetadataMocked:true,
      providerInvoiceReconciled:false,productionAuthorized:false,
    }));
  });

  it.each(['baseline','compact_v1'] as const)(
    '%s rejects an invalid render before invoking independent review',
    async profile=>{
      const h=harness(profile,'invalid-draft');
      await expect(h.run()).rejects.toMatchObject({
        code:'FAST_RENDERER_GUARD_REJECTED',
      });
      expect(h.seen.map(x=>x.stage))
        .toEqual(STAGES.slice(0,2));
      expect(h.reads).toBe(2);
    });

  it.each(['baseline','compact_v1'] as const)(
    '%s rejects forged review hash and stale final census without revealing output',
    async profile=>{
      const review=harness(profile,'invalid-review');
      await expect(review.run()).rejects.toMatchObject({
        code:'FAST_SEMANTIC_OUTPUT_REJECTED',
      });
      expect(review.seen.map(x=>x.stage)).toEqual(STAGES);
      expect(review.reads).toBe(3);
      const stale=harness(profile,'stale-census');
      await expect(stale.run()).rejects.toMatchObject({
        code:'FAST_THREAD_CENSUS_REJECTED',
      });
      expect(stale.seen.map(x=>x.stage)).toEqual(STAGES);
      expect(stale.reads).toBe(4);
    });
});
