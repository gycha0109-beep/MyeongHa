import {describe,it,expect,vi} from 'vitest';
import {selectGlm53FlashProviderV1,checkPaidCreditAdmissionV1,
 getPaidGlm53FlashAdmissionV1,getOpenRouterAccountUsageV1,
 GLM53FLASH_MODEL_V1} from '../scripts/seyeon-openrouter-glm53flash-paid-preflight-v1.mjs';
const row={model_id:GLM53FLASH_MODEL_V1,tag:'open-inference/fp4',status:0,
 pricing:{prompt:'0.000000047076',completion:'0.00000016',request:'0'},
 supported_parameters:['response_format']};
const model={id:GLM53FLASH_MODEL_V1,endpoints:[{tag:'open-inference/fp4',status:0,
 pricing:{prompt:'0.000000047076',completion:'0.00000016',request:'0'},
 supported_parameters:['response_format']}]};
describe('Paid GLM Flash strictly funded route',()=>{
 it('requires same healthy ZDR and response_format tag within per-token price caps',()=>{
  expect(selectGlm53FlashProviderV1([row],model)).toMatchObject({
   providerTag:'open-inference/fp4',inputUsdPerMTokens:0.047076,outputUsdPerMTokens:0.16,
   strictJsonSchemaRuntimeVerified:false,dataCollectionDenyRuntimeVerified:false});
  expect(selectGlm53FlashProviderV1([row],{...model,endpoints:[{...model.endpoints[0],tag:'other'}]})).toBeNull();
  expect(selectGlm53FlashProviderV1([{...row,status:1}],model)).toBeNull();
  expect(selectGlm53FlashProviderV1([{...row,tag:'io-net'}],{...model,endpoints:[{...model.endpoints[0],tag:'io-net'}]})).toBeNull();
  expect(selectGlm53FlashProviderV1([row],{...model,endpoints:[{...model.endpoints[0],supported_parameters:[]}]})).toBeNull();
  expect(selectGlm53FlashProviderV1([row],{...model,endpoints:[{...model.endpoints[0],pricing:{prompt:'.00001',completion:'.00001'}}]})).toBeNull();
 });
 it('requires purchased credits minus usage and never confuses key spending cap with balance',()=>{
  const key={usage:0.000469,limit_remaining:49,is_free_tier:false};
  expect(checkPaidCreditAdmissionV1(key,{total_credits:0,total_usage:.196407})).toBeNull();
  expect(checkPaidCreditAdmissionV1(key,{total_credits:.20,total_usage:.196407})).toBeNull();
  expect(checkPaidCreditAdmissionV1(key,{total_credits:5,total_usage:.196407})).toMatchObject({
   availableMicroUsd:4803593,fundingRequirementMicroUsd:60000,purchasedMicroUsd:5000000});
  expect(checkPaidCreditAdmissionV1({...key,limit_remaining:.01},{total_credits:5,total_usage:.196407})).toBeNull();
  expect(checkPaidCreditAdmissionV1({...key,is_management_key:true},{total_credits:5,total_usage:.196407})).toBeNull();
 });
 it('only issues four allowlisted GETs without exposing private values or starting inference',async()=>{
  const key='sk-or-fake-nonprod-test-credential-000000000';
  const getter=vi.fn(async(url,init)=>{
   expect(init.method).toBe('GET');
   const path=String(url).replace('https://openrouter.ai','');
   expect(['/api/v1/key','/api/v1/credits','/api/v1/endpoints/zdr',
    '/api/v1/models/z-ai/glm-5.3-flash/endpoints']).toContain(path);
   if(path==='/api/v1/key')return Response.json({data:{is_free_tier:true,usage:.000469,limit_remaining:49,secret:'PRIVATE'}});
   if(path==='/api/v1/credits')return Response.json({data:{total_credits:5,total_usage:.196407}});
   return Response.json({data:path==='/api/v1/endpoints/zdr'?[row]:model});
  });
  const admitted=await getPaidGlm53FlashAdmissionV1(key,getter);
  expect(admitted).toMatchObject({ok:true,metadataGetCount:4,inferencePosts:0,
   funding:{availableMicroUsd:4803593},route:{providerTag:'open-inference/fp4'}});
  expect(getter).toHaveBeenCalledTimes(4);
  expect(JSON.stringify(admitted)).not.toContain('PRIVATE');
  const hold=await getPaidGlm53FlashAdmissionV1(key,vi.fn(async()=>Response.json({error:'PRIVATE'},{status:403})));
  expect(hold).toMatchObject({ok:false,reason:'CREDIT_NOT_VERIFIED'});
 });
 it('reads aggregate account usage but never treats it as a verified individual invoice',async()=>{
  const key='sk-or-fake-nonprod-test-credential-000000000';
  await expect(getOpenRouterAccountUsageV1(key,vi.fn(async()=>Response.json({data:{total_usage:.201407,secret:'PRIVATE'}})))).resolves.toBe(201407);
  await expect(getOpenRouterAccountUsageV1(key,vi.fn(async()=>Response.json({error:'PRIVATE'},{status:403})))).resolves.toBeNull();
 });
});
