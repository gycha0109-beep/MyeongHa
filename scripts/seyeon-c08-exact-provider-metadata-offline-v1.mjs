/**
 * C08 §7.3-6: GET-only provider metadata screen. Never paid admission.
 * OpenRouter /endpoints/zdr and /models/:author/:slug/endpoints are both
 * required. A response_format listing does NOT attest strict JSON runtime.
 * Advertised prices are NOT per-turn billing hard limits.
 */
import {
  SEYEON_C08R3_STAGES_V1,
  SEYEON_C08R3_MAX_RATES_V1,
  quoteSeyeonThreeCallTenKrwShadowV1,
} from './seyeon-c08r3-10krw-reserve-scenario-v1.mjs';
import {
  SEYEON_C08_ALT_MODEL_SNAPSHOT_V1,
  SEYEON_C08_ALT_N06_GLM_REQUEST_BYTES_V1,
} from './seyeon-c08-alternative-provider-price-screen-offline-v1.mjs';

export const SEYEON_C08_PROVIDER_MODELS_V1=Object.freeze(
  SEYEON_C08_ALT_MODEL_SNAPSHOT_V1.map(m=>m.model));
const tagPattern=/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)?$/u;
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const hasResponseFormat=x=>Array.isArray(x.supported_parameters)&&
  x.supported_parameters.includes('response_format');
const posInt=n=>Number.isSafeInteger(n)&&n>=1;
const pricePerMillion=x=>{
  if(!(typeof x==='number'||(typeof x==='string'&&x.trim()!=='')))return null;
  const value=Number(x);
  if(!Number.isFinite(value)||value<=0||value>0.001)return null;
  // USD per token -> USD per million with upward 6-decimal rounding.
  return Math.ceil(value*1e12-1e-8)/1e6;
};
const zeroRequestFee=x=>{
  if(!(typeof x==='number'||(typeof x==='string'&&x.trim()!=='')))return false;
  return Number.isFinite(Number(x))&&Number(x)===0;
};
const HOLD_FIELDS=Object.freeze({
  metadataOnlyNotRequestAttestation:true,
  alternativeModelTokenizationVerified:false,
  strictJsonSchemaRuntimeVerified:false,
  requestLevelZdrAndDenyRuntimeVerified:false,
  accountProviderRouteVerified:false,
  hardTurnBillingCapVerified:false,
  guardedFiveSecondLatencyVerified:false,
  c07GoldAndCanonParityVerified:false,
  paidInferenceAuthorized:false,
  productionRouteAuthorized:false,
});

export function screenSeyeonC08ExactProviderEvidenceOfflineV1({
  zdrEndpoints,
  modelDetails,
  completionCaps=[1536,1536,1536],
}={}){
  if(!Array.isArray(zdrEndpoints)||!Array.isArray(modelDetails)||
    !Array.isArray(completionCaps)||completionCaps.length!==3||
    !completionCaps.every(n=>posInt(n)&&n<=1536))
    throw new TypeError('C08_PROVIDER_METADATA_INPUT_HOLD');
  const result=SEYEON_C08_PROVIDER_MODELS_V1.map(model=>{
    const data=modelDetails.filter(m=>isObject(m)&&m.id===model);
    const modelEndpoints=data.length===1&&Array.isArray(data[0].endpoints)
      ?data[0].endpoints:[];
    const zdrRows=zdrEndpoints.filter(z=>isObject(z)&&z.model_id===model);
    const pairs=[];
    if(data.length===1){
      for(const z of zdrRows){
        if(!isObject(z)||typeof z.tag!=='string'||!tagPattern.test(z.tag)||
           z.status!==0||!hasResponseFormat(z))continue;
        const matches=modelEndpoints.filter(ep=>isObject(ep)&&ep.tag===z.tag);
        // Repeated ZDR/endpoint tags produce ambiguous route authority.
        if(matches.length!==1||zdrRows.filter(x=>x.tag===z.tag).length!==1)continue;
        const ep=matches[0];
        if(ep.status!==0||!hasResponseFormat(ep)||
          !posInt(z.max_completion_tokens)||!posInt(ep.max_completion_tokens)||
          Math.min(z.max_completion_tokens,ep.max_completion_tokens)<
            Math.max(...completionCaps))continue;
        if(!isObject(z.pricing)||!isObject(ep.pricing)||
          !zeroRequestFee(z.pricing.request)||
          !zeroRequestFee(ep.pricing.request))continue;
        const prices=[
          pricePerMillion(z.pricing.prompt),pricePerMillion(z.pricing.completion),
          pricePerMillion(ep.pricing.prompt),pricePerMillion(ep.pricing.completion),
        ];
        if(prices.some(p=>p===null))continue;
        const inputUsdPerMillion=Math.max(prices[0],prices[2]);
        const outputUsdPerMillion=Math.max(prices[1],prices[3]);
        const insideCeiling=inputUsdPerMillion<=
          SEYEON_C08R3_MAX_RATES_V1.inputUsdPerMillion&&
          outputUsdPerMillion<=SEYEON_C08R3_MAX_RATES_V1.outputUsdPerMillion;
        const q=insideCeiling?quoteSeyeonThreeCallTenKrwShadowV1({
          stages:SEYEON_C08R3_STAGES_V1.map((name,i)=>({
            name,
            requestBodyBytes:SEYEON_C08_ALT_N06_GLM_REQUEST_BYTES_V1[i],
            maxCompletionTokens:completionCaps[i],
          })),
          rates:{inputUsdPerMillion,outputUsdPerMillion},
        }):null;
        pairs.push(Object.freeze({
          providerTag:z.tag,
          inputUsdPerMillion,outputUsdPerMillion,
          advertisedZdrAndResponseFormatIntersection:true,
          providerActiveInBothCatalogs:true,
          requestFeeZeroInBothCatalogs:true,
          inputBytesFromGlmNotThisModel:true,
          reservedScenarioMicroUsd:q?.reservedMicroUsd??null,
          reservedScenarioKrw:q?.reserveUpperKrw??null,
          tenKrwListedPriceScenario:q?.targetMetUnderStressAssumptions??false,
          disposition:!insideCeiling?'OUTSIDE_LEGACY_RATE_CEILING_HOLD':
            q.targetMetUnderStressAssumptions?'METADATA_MATH_ONLY_HOLD':
              'OVER_TURN_BUDGET_HOLD',
          ...HOLD_FIELDS,
        }));
      }
    }
    pairs.sort((a,b)=>(a.reservedScenarioMicroUsd??Infinity)-
      (b.reservedScenarioMicroUsd??Infinity)||
      a.providerTag.localeCompare(b.providerTag));
    return Object.freeze({
      model,
      modelEndpointRecordUnique:data.length===1,
      matchedEndpointCount:pairs.length,
      disposition:pairs.length?'PROVIDER_METADATA_ONLY_HOLD':
        'NO_EXACT_ACTIVE_ZDR_RESPONSE_FORMAT_PRICE_MATCH_HOLD',
      providers:Object.freeze(pairs),
      ...HOLD_FIELDS,
    });
  });
  return Object.freeze({
    version:'seyeon-c08-exact-provider-metadata-screen-offline-v1',
    scope:'GET_METADATA_INPUT_ONLY_NOT_ACCOUNT_OR_INFERENCE_ATTESTATION',
    metadataInputModels:SEYEON_C08_PROVIDER_MODELS_V1.length,
    models:Object.freeze(result),
    ...HOLD_FIELDS,
  });
}

/** All calls are allowlisted GET metadata, never inference or billing POST. */
export async function inspectSeyeonC08ProviderMetadataReadOnlyV1({
  apiKey,fetchImpl,timeoutMs=15000,
}={}){
  if(typeof apiKey!=='string'||apiKey.trim().length<20||
     typeof fetchImpl!=='function'||!posInt(timeoutMs)||timeoutMs>15000)
    throw new TypeError('C08_PROVIDER_READONLY_ADMISSION_HOLD');
  const paths=['/api/v1/endpoints/zdr',
    ...SEYEON_C08_PROVIDER_MODELS_V1.map(m=>'/api/v1/models/'+m+'/endpoints')];
  const get=async path=>{
    try{
      const response=await fetchImpl('https://openrouter.ai'+path,{
        method:'GET',redirect:'error',
        signal:AbortSignal.timeout(timeoutMs),
        headers:{authorization:'Bearer '+apiKey.trim(),accept:'application/json'},
      });
      if(response.status!==200||
         !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')||
         Number(response.headers.get('content-length')??0)>1000000)
        return {status:response.status,data:null};
      const text=await response.text();
      if(Buffer.byteLength(text,'utf8')>1000000)
        return {status:response.status,data:null};
      const parsed=JSON.parse(text);
      return {status:200,data:isObject(parsed)?parsed.data:null};
    }catch{return {status:null,data:null};}
  };
  const results=await Promise.all(paths.map(get));
  const report=screenSeyeonC08ExactProviderEvidenceOfflineV1({
    zdrEndpoints:Array.isArray(results[0].data)?results[0].data:[],
    modelDetails:results.slice(1).map(r=>r.data),
  });
  return Object.freeze({
    ...report,
    metadataGetCount:paths.length,
    inferencePostCount:0,
    zdrStatus:results[0].status,
    modelStatuses:SEYEON_C08_PROVIDER_MODELS_V1.map((model,i)=>Object.freeze({
      model,status:results[i+1].status,
    })),
    completeMetadataRead:results.every(r=>r.status===200&&r.data!==null),
    ...HOLD_FIELDS,
  });
}
