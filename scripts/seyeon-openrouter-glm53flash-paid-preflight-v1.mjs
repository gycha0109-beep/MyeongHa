// GET-only credit + provider intersection: public synthetic paid GLM 5.3 Flash only.
// OpenRouter endpoint prices are denominated in USD per token, not per 1M tokens.
export const GLM53FLASH_MODEL_V1='z-ai/glm-5.3-flash';
export const MAX_INPUT_USD_PER_M=0.15,MAX_OUTPUT_USD_PER_M=0.40;
export const MIN_AVAILABLE_CREDIT_MICRO_USD=60000; // three $0.02 maximum reservations
const tagRe=/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)?$/u;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const money=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1000000?Math.round(x*1e6):null;
const pricePerMillion=x=>{
 const n=typeof x==='string'&&x.trim()!==''?Number(x):typeof x==='number'?x:NaN;
 return Number.isFinite(n)&&n>=0&&n<=0.00001?Math.round(n*1e12)/1e6:null;
};
const paths=Object.freeze(['/api/v1/key','/api/v1/credits','/api/v1/endpoints/zdr',
 '/api/v1/models/z-ai/glm-5.3-flash/endpoints']);
async function get(path,key,fetchImpl){
 if(!paths.includes(path))throw Error('PAID_NEMOTRON_UNAPPROVED_GET');
 try {
  const r=await fetchImpl('https://openrouter.ai'+path,{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{authorization:'Bearer '+key,accept:'application/json'}});
  if(r.status!==200)return {status:r.status,data:null};
  if(!/^application\/json(?:;|$)/iu.test(r.headers.get('content-type')??''))return {status:200,data:null};
  if(Number(r.headers.get('content-length')??0)>4000000)return {status:200,data:null};
  const body=await r.text();
  if(Buffer.byteLength(body,'utf8')>4000000)return {status:200,data:null};
  const obj=JSON.parse(body);
  return {status:200,data:record(obj)?obj.data:null};
 }catch{return {status:null,data:null};}
}
export function selectGlm53FlashProviderV1(zdr,model){
 if(!Array.isArray(zdr)||!record(model)||model.id!==GLM53FLASH_MODEL_V1||
    !Array.isArray(model.endpoints))return null;
 const eligible=[];
 for(const row of zdr){
  if(!record(row)||row.model_id!==GLM53FLASH_MODEL_V1||row.tag==='io-net'||
     typeof row.tag!=='string'||!tagRe.test(row.tag)||
     row.status!==0||!Array.isArray(row.supported_parameters)||
     !row.supported_parameters.includes('response_format'))continue;
  for(const ep of model.endpoints){
   if(!record(ep)||ep.tag!==row.tag||ep.status!==0||
      !Array.isArray(ep.supported_parameters)||
      !ep.supported_parameters.includes('response_format'))continue;
   const a=pricePerMillion(row.pricing?.prompt),b=pricePerMillion(row.pricing?.completion);
   const c=pricePerMillion(ep.pricing?.prompt),d=pricePerMillion(ep.pricing?.completion);
   if([a,b,c,d].some(v=>v===null)||Math.max(a,c)>MAX_INPUT_USD_PER_M||
      Math.max(b,d)>MAX_OUTPUT_USD_PER_M||
      Math.max(a,c)===0||Math.max(b,d)===0)continue;
   if((row.pricing?.request!==undefined&&Number(row.pricing.request)!==0)||
      (ep.pricing?.request!==undefined&&Number(ep.pricing.request)!==0))continue;
   const inputUsdPerMTokens=Math.max(a,c),outputUsdPerMTokens=Math.max(b,d);
   eligible.push({providerTag:row.tag,inputUsdPerMTokens,outputUsdPerMTokens,
    score:inputUsdPerMTokens*.7+outputUsdPerMTokens*.3});
  }
 }
 const sorted=eligible.sort((a,b)=>a.score-b.score||a.providerTag.localeCompare(b.providerTag));
 return sorted.length?Object.freeze({
  providerTag:sorted[0].providerTag,inputUsdPerMTokens:sorted[0].inputUsdPerMTokens,
  outputUsdPerMTokens:sorted[0].outputUsdPerMTokens,
  matchedEligibleProviders:sorted.length,
  exactProviderZdrAndResponseFormatAdvertised:true,
  strictJsonSchemaRuntimeVerified:false,
  dataCollectionDenyRuntimeVerified:false,
 }):null;
}
export function checkPaidCreditAdmissionV1(keyInfo,creditInfo,required=MIN_AVAILABLE_CREDIT_MICRO_USD){
 if(!record(keyInfo)||!record(creditInfo))return null;
 const purchasedMicroUsd=money(creditInfo.total_credits);
 const accountUsageMicroUsd=money(creditInfo.total_usage);
 const keyLimitRemainingMicroUsd=keyInfo.limit_remaining===null?null:money(keyInfo.limit_remaining);
 if(purchasedMicroUsd===null||accountUsageMicroUsd===null||
    purchasedMicroUsd-accountUsageMicroUsd<required||
    (keyLimitRemainingMicroUsd!==null&&keyLimitRemainingMicroUsd<required)||
    keyInfo.is_management_key===true)return null;
 return Object.freeze({
  purchasedMicroUsd,accountUsageMicroUsd,
  availableMicroUsd:purchasedMicroUsd-accountUsageMicroUsd,
  keyLimitRemainingMicroUsd,
  apiKeyUsageMicroUsd:money(keyInfo.usage),
  keyFreeTier:typeof keyInfo.is_free_tier==='boolean'?keyInfo.is_free_tier:null,
  fundingRequirementMicroUsd:required,
  paymentInvoiceReconciled:false,
 });
}
export async function getPaidGlm53FlashAdmissionV1(key,fetchImpl=fetch){
 if(typeof key!=='string'||key.trim().length<20)return Object.freeze({ok:false,reason:'INVALID_KEY'});
 const [k,c,z,m]=await Promise.all(paths.map(p=>get(p,key.trim(),fetchImpl)));
 const statuses={keyStatus:k.status,creditsStatus:c.status,zdrStatus:z.status,modelEndpointsStatus:m.status};
 const funding=k.status===200&&c.status===200?checkPaidCreditAdmissionV1(k.data,c.data):null;
 if(!funding)return Object.freeze({ok:false,reason:'CREDIT_NOT_VERIFIED',...statuses,verifiedAvailableCreditMicroUsd:null});
 const route=z.status===200&&m.status===200?selectGlm53FlashProviderV1(z.data,m.data):null;
 if(!route)return Object.freeze({ok:false,reason:'NO_ZDR_JSON_BILLABLE_PROVIDER',...statuses,funding,route:null});
 return Object.freeze({ok:true,reason:'ADMITTED',...statuses,funding,route,
  restrictedToModel:GLM53FLASH_MODEL_V1,metadataGetCount:4,inferencePosts:0});
}
export async function getOpenRouterAccountUsageV1(key,fetchImpl=fetch){
 if(typeof key!=='string'||key.length<20)return null;
 const r=await get('/api/v1/credits',key.trim(),fetchImpl);
 return r.status===200&&record(r.data)?money(r.data.total_usage):null;
}
