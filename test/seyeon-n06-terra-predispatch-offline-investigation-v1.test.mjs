import {describe,it,expect,vi} from 'vitest';
import {runSeyeonCensusFirstThreeCallShadowV1}
  from '../apps/api/src/seyeon-census-first-three-call-shadow-v1.js';
import {createOpenAiSeyeonStructuredProviderV1}
  from '../apps/api/src/openai-seyeon-structured-provider-v1.js';
import {createSeyeonQualityTrioSyntheticCensusV1}
  from '../scripts/seyeon-terra-glm-quality-trio-census-v1.mjs';
import {assertN06Cap500ReservationV1,N06_MAX_REQUEST_BODY_BYTES}
  from '../scripts/seyeon-terra-glm-quality-cap500-admission-v1.mjs';
import {requireSeyeonTrioOpenAiStageV1}
  from '../scripts/seyeon-terra-glm-quality-trio-admission-v1.mjs';

const CASE_ID='N06';
const USER_MESSAGE_ID='synthetic:N06';
const TEXT='오늘은 네가 먼저 이야기해 줘.';
function governance() {
  const denied=()=>{throw Error('OFFLINE_NO_PRIVATE_READ');};
  return {
    relationship:{gate:'PUBLIC',trustBand:'low',relevantSharedHistoryRefs:[]},
    integrity:{
      classifier:{classify:denied},
      authorityResolver:{resolve:()=>({
        state:'MISSING',authorityRefs:[],provenanceRefs:['synthetic:no-authority'],
      })},
    },
    disclosure:{
      classifier:{classify:denied},
      sourceDescriptor:{readDescriptor:denied},
      factAuthorityResolver:{resolve:denied},
      retriever:{retrieve:denied},
    },
  };
}

describe('N06 2026-10-22 real run #39751436405: reproduce Terra pre-dispatch without API access',()=>{
  it('records actual model-2 JSON request byte size, exact fixed stage and cap verdict',async()=>{
    const record={
      preDispatchCount:0,actualRequestBytes:null,reportedRequestBytes:null,
      stageSchema:null,stageMatch:null,reservationOutcome:null,
      providerCalls:0,networkDispatches:0,actualDataPrivate:false,
    };
    const fakeLuna={
      providerKey:'test-luna',modelKey:'gpt-5.6-luna',
      generate:vi.fn(async request=>{
        record.providerCalls++;
        expect(request.purpose).toBe('unified_preflight_shadow');
        return {claims:[],topicKey:null,questionContext:'casual_curiosity'};
      }),
    };
    const fakeTerra=createOpenAiSeyeonStructuredProviderV1({
      apiKey:'test-key-not-real-provider-0000000000000000',
      model:'gpt-5.6-terra',maxOutputTokens:1536,timeoutMs:30000,
      meteredBeforeDispatch:async(meta,body)=>{
        record.preDispatchCount++;
        record.reportedRequestBytes=meta.requestBodyBytes;
        record.actualRequestBytes=Buffer.byteLength(body,'utf8');
        const req=JSON.parse(body);
        record.stageSchema=req.text?.format?.name??null;
        try{
          requireSeyeonTrioOpenAiStageV1(record.stageSchema,'turn_interpret_render_shadow');
          record.stageMatch=true;
        }catch{record.stageMatch=false}
        try{
          assertN06Cap500ReservationV1(
            {luna:1,terra:0,glm:0},50000,'terra',meta.requestBodyBytes,1536,
          );
          record.reservationOutcome='ADMITTED';
        }catch(err){
          const allow=new Set([
            'N06_CAP500_REQUEST_BOUND_HOLD','N06_CAP500_BUDGET_HOLD',
            'N06_CAP500_CALL_TOPOLOGY_HOLD',
          ]);
          record.reservationOutcome=allow.has(err?.message)?err.message:'UNKNOWN_HOLD';
        }
        // Exactly model-2's real JSON, no POST and no content output.
        throw Error('OFFLINE_INTENTIONAL_NETWORK_ABORT');
      },
      fetchImpl:async()=>{record.networkDispatches++;throw Error('NO_NETWORK_ALLOWED');},
    });
    const fakeReviewer={
      providerKey:'test-reviewer',modelKey:'gpt-5.6-terra',
      generate:vi.fn(async()=>{throw Error('REVIEWER_MUST_NOT_BE_CALLED');}),
    };
    const census=createSeyeonQualityTrioSyntheticCensusV1(CASE_ID,USER_MESSAGE_ID);
    await expect(runSeyeonCensusFirstThreeCallShadowV1({
      userMessageRef:USER_MESSAGE_ID,userText:TEXT,
      contextInput:{
        relationship:null,
        recentMessages:[{messageId:USER_MESSAGE_ID,role:'user',text:TEXT}],
        retrievedMemories:[],
      },
      governance:governance(),
      fullThreadCensus:census.port,
      unifiedPreflightProvider:fakeLuna,
      candidateDialogueProvider:fakeTerra,
      independentSemanticReviewer:fakeReviewer,
    })).rejects.toMatchObject({code:'PRE_DISPATCH_REJECTED'});
    expect(fakeLuna.generate).toHaveBeenCalledOnce();
    expect(fakeReviewer.generate).not.toHaveBeenCalled();
    expect(record.preDispatchCount).toBe(1);
    expect(record.networkDispatches).toBe(0);
    expect(record.actualRequestBytes).toBe(record.reportedRequestBytes);
    expect(record.stageMatch).toBe(true);
    expect(record.actualRequestBytes).toBeGreaterThan(0);
    // Safe numeric output; NO full body, prompt, character canon, secrets.
    console.info('SEYEON_N06_TERRA_OFFLINE_ADMISSION_DIAGNOSTIC '+JSON.stringify({
      code:'PRE_DISPATCH_REJECTED',
      actualRequestBytes:record.actualRequestBytes,
      configuredMaxRequestBytes:N06_MAX_REQUEST_BODY_BYTES,
      schemaNameExact:record.stageMatch,
      reservationOutcome:record.reservationOutcome,
      exceededRequestByteCap:record.actualRequestBytes>N06_MAX_REQUEST_BODY_BYTES,
      networkDispatches:record.networkDispatches,
      paidCalls:0,
      privateSourcesRead:false,
    }));
  });
});
