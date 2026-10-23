import {describe,it,expect,vi} from 'vitest';
import {createOpenAiSeyeonStructuredProviderV1}
  from '../apps/api/src/openai-seyeon-structured-provider-v1.js';
import {createOpenRouterSeyeonEvaluationProviderV1}
  from '../apps/api/src/openrouter-seyeon-evaluation-provider-v1.js';
import {runSeyeonCensusFirstThreeCallShadowV1}
  from '../apps/api/src/seyeon-census-first-three-call-shadow-v1.js';
import {createSeyeonQualityTrioSyntheticCensusV1}
  from '../scripts/seyeon-terra-glm-quality-trio-census-v1.mjs';
import {
  assertN06Cap500ReservationV1,
  N06_MAX_REQUEST_BODY_BYTES,
  N06_TERRA_RESERVE_MICRO_USD,
} from '../scripts/seyeon-terra-glm-quality-cap500-admission-v1.mjs';
import {requireSeyeonTrioOpenAiStageV1}
  from '../scripts/seyeon-terra-glm-quality-trio-admission-v1.mjs';

const ID='synthetic:N06';
const TEXT='오늘은 네가 먼저 이야기해 줘.';
const STAGES=['unified_preflight_shadow','turn_interpret_render_shadow','semantic_review'];
const STRUCTURED={
  schemaVersion:'seyeon-turn-interpretation-v2',
  userMove:'neutral_or_other',
  notice:{summary:'사용자가 세연에게 먼저 이야기해 달라고 했다.',evidenceRefs:[ID]},
  immediateWant:{key:'break_awkwardness',summary:'먼저 대화의 물꼬를 트고 싶다.'},
  tension:{key:'none_material',summary:'갈등 없음.'},
  chosenAction:{key:'approach',rationale:'세연이 먼저 가벼운 화제를 꺼낸다.'},
  expressionState:'baseline',
  reveal:{level:'public',triggerRef:null,supportingHistoryRefs:[]},
  memoryRefsUsed:[],
};
const DRAFT={
  schemaVersion:'seyeon-renderer-draft-v2',
  utterance:'오늘은 제가 먼저 이야기할게요. 갑자기 조용한 밤거리를 산책하는 장면이 떠올랐어요.',
  expressionState:'baseline',revealLevel:'public',
  memoryRefsMentioned:[],privateSourceRefsMentioned:[],disclosureSliceIds:[],
};
const PREFLIGHT={claims:[],topicKey:null,questionContext:'casual_curiosity'};
const fakeResponse=request=>{
  if(request.purpose==='unified_preflight_shadow')return PREFLIGHT;
  if(request.purpose==='turn_interpret_render_shadow')return {
    interpretation:STRUCTURED,draft:DRAFT,
  };
  if(request.purpose==='semantic_review')return {
    schemaVersion:'seyeon-semantic-review-v2',
    reviewedUtteranceHash:request.input.expectedUtteranceHash,
    failureCodes:[],evidence:[],
  };
  throw Error('UNAPPROVED_STAGE');
};
const governance=()=>({
  relationship:{gate:'PUBLIC',trustBand:'low',relevantSharedHistoryRefs:[]},
  integrity:{
    classifier:{classify:vi.fn(()=>{throw Error('LEGACY_CLASSIFIER_CALLED');})},
    authorityResolver:{resolve:()=>({
      state:'MISSING',authorityRefs:[],provenanceRefs:['synthetic:unverified'],
    })},
  },
  disclosure:{
    classifier:{classify:vi.fn(()=>{throw Error('LEGACY_DISCLOSURE_CALLED');})},
    sourceDescriptor:{readDescriptor(){throw Error('PRIVATE_SOURCE_FORBIDDEN');}},
    factAuthorityResolver:{resolve(){throw Error('PRIVATE_FACT_FORBIDDEN');}},
    retriever:{retrieve(){throw Error('PRIVATE_RETRIEVAL_FORBIDDEN');}},
  },
});
const contextInput={
  relationship:null,recentMessages:[{messageId:ID,role:'user',text:TEXT}],
  retrievedMemories:[],
};
describe('N06 second one-shot: complete six-stage offline serialization, zero paid dispatch',()=>{
 it('serializes and bills exact six requests with real adapters and synthetic model fixtures',async()=>{
  const reservations={luna:0,terra:0,glm:0};
  const observed=[];
  const openai=requestedModel=>createOpenAiSeyeonStructuredProviderV1({
    apiKey:'offline-test-only-openai-no-actual-credential-0000000',
    model:requestedModel,maxOutputTokens:1536,timeoutMs:30000,
    meteredBeforeDispatch:async(metadata,body)=>{
      const request=JSON.parse(body);
      const stage=requireSeyeonTrioOpenAiStageV1(
        request?.text?.format?.name,metadata.purpose);
      const route=requestedModel==='gpt-5.6-luna'?'luna':'terra';
      const limit=route==='luna'?20000:N06_TERRA_RESERVE_MICRO_USD;
      const bytes=Buffer.byteLength(body,'utf8');
      expect(metadata.requestBodyBytes).toBe(bytes);
      expect(request.max_output_tokens).toBe(1536);
      expect(request.model).toBe(requestedModel);
      assertN06Cap500ReservationV1(reservations,limit,route,bytes,1536);
      reservations[route]+=1;
      observed.push({route,stage,bytes,admitted:true});
    },
    fetchImpl:async(_url,init)=>{
      const request=JSON.parse(String(init.body));
      const stage=request.text.format.name.slice('myeongha_'.length,-3);
      const response=fakeResponse({
        purpose:stage,input:JSON.parse(request.input[0].content[0].text),
      });
      return Response.json({
        status:'completed',
        output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(response)}]}],
        usage:{input_tokens:1024,output_tokens:200,
          input_tokens_details:{cached_tokens:0},
          output_tokens_details:{reasoning_tokens:0}},
      });
    },
  });
  const glm=createOpenRouterSeyeonEvaluationProviderV1({
    apiKey:'sk-or-synthetic-fake-credential-do-not-use-0000000000',
    model:'z-ai/glm-5.3-flash',maxCompletionTokens:1536,
    providerOnlyTag:'open-inference/fp4',timeoutMs:30000,
    beforeDispatch:async metadata=>{
      expect(metadata.modelKey).toBe('z-ai/glm-5.3-flash');
      const limit=20000;
      assertN06Cap500ReservationV1(
        reservations,limit,'glm',metadata.requestBodyBytes,1536);
      reservations.glm+=1;
      observed.push({route:'glm',stage:metadata.purpose,
        bytes:metadata.requestBodyBytes,admitted:true});
    },
    afterOutcome:async metric=>{
      expect(metric.outcome).toBe('response_received');
      expect(metric.httpStatus).toBe(200);
    },
    fetchImpl:async(_url,init)=>{
      const request=JSON.parse(String(init.body));
      const stage=request.response_format.json_schema.name.slice('myeongha_'.length,-3);
      const payload=fakeResponse({
        purpose:stage,input:JSON.parse(request.messages[1].content),
      });
      return Response.json({
        model:'z-ai/glm-5.3-flash',
        choices:[{index:0,finish_reason:'stop',message:{
          role:'assistant',content:JSON.stringify(payload)}}],
        usage:{prompt_tokens:1000,completion_tokens:200,
          prompt_tokens_details:{cached_tokens:0},
          completion_tokens_details:{reasoning_tokens:0}},
      });
    },
  });
  const candidateCensus=createSeyeonQualityTrioSyntheticCensusV1('N06',ID);
  const candidate=await runSeyeonCensusFirstThreeCallShadowV1({
    userMessageRef:ID,userText:TEXT,contextInput,governance:governance(),
    fullThreadCensus:candidateCensus.port,
    unifiedPreflightProvider:openai('gpt-5.6-luna'),
    candidateDialogueProvider:openai('gpt-5.6-terra'),
    independentSemanticReviewer:openai('gpt-5.6-terra'),
  });
  const glmCensus=createSeyeonQualityTrioSyntheticCensusV1('N06',ID);
  const control=await runSeyeonCensusFirstThreeCallShadowV1({
    userMessageRef:ID,userText:TEXT,contextInput,governance:governance(),
    fullThreadCensus:glmCensus.port,
    unifiedPreflightProvider:glm,candidateDialogueProvider:glm,
    independentSemanticReviewer:glm,
  });
  expect(candidate.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
  expect(control.scope).toBe('SHADOW_ONLY_NOT_PRODUCTION');
  expect(candidateCensus.readCount).toBe(4);
  expect(glmCensus.readCount).toBe(4);
  expect(reservations).toEqual({luna:1,terra:2,glm:3});
  expect(observed).toHaveLength(6);
  expect(observed.map(x=>x.stage)).toEqual([...STAGES,...STAGES]);
  expect(observed.every(x=>x.bytes<=N06_MAX_REQUEST_BODY_BYTES)).toBe(true);
  expect(candidate.envelope.revealLevel).toBe('public');
  expect(control.envelope.revealLevel).toBe('public');
  console.info('SEYEON_N06_SECOND_TRIAL_SIX_STAGE_OFFLINE '+JSON.stringify({
    stages:observed,byteCap:N06_MAX_REQUEST_BODY_BYTES,
    reserveUpperKrw:485,actualModelCalls:0,
    eligibleForPaidComparison:true,
    humanDialogueQualityVerified:false,
  }));
 });
});
